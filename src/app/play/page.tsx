"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where, updateDoc, increment, setDoc } from "firebase/firestore";
import { QuestionDoc, FoeDoc, EncounterDoc, Character, EquipmentSlot, GameItem, InventoryItem } from "@/types/game";
import { useSearchParams, useRouter } from "next/navigation";
import 'katex/dist/katex.min.css'; 
import { InlineMath, BlockMath } from 'react-katex';

function PlayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const encounterId = searchParams.get("id");
  const [user, setUser] = useState<User | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [gameItems, setGameItems] = useState<Record<string, GameItem>>({});

  // Game States
  const [mode, setMode] = useState<"lobby" | "loading" | "intro" | "battle" | "won" | "lost">("lobby");
  const [encounters, setEncounters] = useState<EncounterDoc[]>([]);
  
  // Battle Data
  const [activeEncounter, setActiveEncounter] = useState<EncounterDoc | null>(null);
  const [foe, setFoe] = useState<FoeDoc | null>(null);
  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  
  // Battle State
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [playerHp, setPlayerHp] = useState(20);
  const [foeHp, setFoeHp] = useState(0);
  const [msg, setMsg] = useState("");
  const loadAllEncounters = async () => {
    const q = query(collection(db, "encounters"));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as EncounterDoc));
    setEncounters(list);
  };
  const handleLoss = async (reason?: string) => {
    // 1. Visual Updates
    setMsg(reason || "💀 You were defeated!");
    setMode("lost");
    if (timerRef.current) clearInterval(timerRef.current);

    // 2. Calculate Death Penalty (20% of your CURRENT gold)
    // If you have 100g, you lose 20g. If you have 0g, you lose 0g.
    const currentGold = character?.gold || 0;
    const penalty = Math.ceil(currentGold * 0.20); 
    const newGold = Math.max(0, currentGold - penalty);

    // 3. Save to Database
    if (user && character) {
        const charRef = doc(db, "characters", user.uid);
        await updateDoc(charRef, {
            gold: newGold,       // Pay the death tax
            hp: character.maxHp || 20 // Respawn fully healed (Game Over reset)
        });
    }
  };

  // --- NEW: SKIP FUNCTION ---
  const skipQuestion = () => {
      // 1. Calculate Damage (Same as wrong answer)
      const dmg = foe?.attackDamage || 5;
      const newHp = Math.max(0, playerHp - dmg);
      
      // 2. Apply Damage
      setPlayerHp(newHp);
      setMsg(`Skipped! Took -${dmg} HP`);

      // 3. Check if dead, otherwise move next
      if (newHp <= 0) {
          handleLoss();
      } else {
          nextQuestion(); // Uses the function we fixed earlier
      }
  };

  // --- NEW: EXECUTE ESCAPE (Action only) ---
  const executeEscape = async () => {
      // 1. Close the modal immediately
      setShowEscapeConfirm(false);

      // 2. Save current injury to Database
      if (user) {
          const charRef = doc(db, "characters", user.uid);
          await updateDoc(charRef, {
              // We do NOT touch gold (Safe!)
              hp: playerHp  // IMPORTANT: We save 'hp' (not currentHp) so the injury sticks.
          });
      }
      
      // 3. Go back to map
      setMode("lobby"); 
      router.push("/map");
  };

  // Level Up & Loot State
  const [levelUpData, setLevelUpData] = useState<{ oldLvl: number, newLvl: number, hpGain: number } | null>(null);
  const [lootDrops, setLootDrops] = useState<string[]>([]); // New: Stores item names found

  const [showInventory, setShowInventory] = useState(false);
  const [showEscapeConfirm, setShowEscapeConfirm] = useState(false);

  // 🕒 TIMER STATES
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(30);
  const [maxTime, setMaxTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null); 
  const [isPaused, setIsPaused] = useState(false);

  // 👇 NEW HELPER: Renders text mixed with LaTeX (e.g. "Solve $x^2$ now")
  const renderMixedText = (text: string) => {
    if (!text) return null;
    // Split by '$' to separate text from math
    const parts = text.split('$');
    
    return (
      <span>
        {parts.map((part, index) => {
          // If index is ODD (1, 3, 5...), it was inside $$ -> Render as Math
          if (index % 2 === 1) {
             return <span key={index} onClick={(e) => e.stopPropagation()} className="inline-block mx-1"><InlineMath math={part} /></span>;
          }
          // If index is EVEN (0, 2, 4...), it is regular Text
          return <span key={index}>{part}</span>;
        })}
      </span>
    );
  };

  // ----------------------------------------------
  // 1. INIT & LOADING
  // ----------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        return;
      }
      setUser(u);

      // 1. Load Character & Store in a local variable
      let fetchedChar: Character | undefined = undefined;
      const charRef = doc(db, "characters", u.uid);
      const charSnap = await getDoc(charRef);
      
      if (charSnap.exists()) {
        fetchedChar = charSnap.data() as Character;
        setCharacter(fetchedChar); // Update State
      }

      // 2. Load Items
      const itemsSnap = await getDocs(collection(db, "items"));
      const itemsMap: Record<string, GameItem> = {};
      itemsSnap.forEach((d) => (itemsMap[d.id] = { id: d.id, ...d.data() } as GameItem));
      setGameItems(itemsMap);

      // 3. Logic: URL ID vs Lobby
      if (encounterId) {
        setMode("loading");
        const encRef = doc(db, "encounters", encounterId);
        const encSnap = await getDoc(encRef);
        
        if (encSnap.exists()) {
          const encData = { id: encSnap.id, ...encSnap.data() } as EncounterDoc;
          
          // 🟢 PASS FETCHED CHAR DIRECTLY HERE
          startEncounter(encData, fetchedChar); 
          
        } else {
          setMode("lobby");
          loadAllEncounters();
        }
      } else {
        setMode("lobby");
        loadAllEncounters();
      }
    });

    return () => unsubscribe();
  }, [encounterId]);

  // ----------------------------------------------
  // 2. TIMER LOGIC
  // ----------------------------------------------
  useEffect(() => {
    // Stop timer if not battling OR if game is paused (answered/timeout)
    if (mode !== "battle" || isPaused) return;

    if (timeLeft <= 0) {
      handleTimeout();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 0.1));
    }, 100);

    return () => clearInterval(timer);
  }, [mode, isPaused, timeLeft]);

  // --- 💀 HANDLE TIME UP ---
  const handleTimeout = () => {
    setIsPaused(true);       // 1. Pause the game
    setShowInventory(false); // 2. Close the backpack if open

    // 3. Calculate Damage (Use '??' to prevent crashes on old foes)
    const rawDamage = foe?.attackDamage ?? 5; 
    const finalDamage = calculateIncomingDamage(rawDamage);
    
    // 4. Set the message using your existing 'setMsg'
    setMsg(`⏰ Time's Up! You took ${finalDamage} damage!`);

    // 5. Hurt the player
    setPlayerHp((prevHp) => {
        const newHp = Math.max(0, prevHp - finalDamage);
        
        // Only lose if HP hits 0
        if (newHp <= 0) {
            setTimeout(() => setMode("lost"), 1000);
        }
        return newHp;
    });
    
    // 6. Optional: Damage armor
    degradation("armor", 1);
  };

  const resetTimer = (baseSeconds: number) => {
    const multiplier = getTimerMultiplier(); 
    const finalTime = Math.floor(baseSeconds * multiplier);
    setTimeLeft(finalTime);
    setMaxTime(finalTime);
  };

  // ----------------------------------------------
  // 3. GAMEPLAY ACTIONS
  // ----------------------------------------------
  const startEncounter = async (enc: EncounterDoc, specificChar?: Character) => {
    setActiveEncounter(enc);
    setMode("loading");

    try {
      // 1. Fetch Foe
      let currentFoe: FoeDoc | null = null;
      // @ts-ignore
      const targetId = (enc.foes && enc.foes.length > 0) ? enc.foes[0] : enc.foeId;

      if (targetId) {
        const foeSnap = await getDoc(doc(db, "foes", targetId));
        if (foeSnap.exists()) {
          currentFoe = { id: foeSnap.id, ...foeSnap.data() } as FoeDoc;
          setFoe(currentFoe);
        }
      }

      // 2. Fetch Questions
      // 👇 NEW LOGIC: Check for list of tags first, otherwise use single tag
      let qQuery;
      
      if (enc.questionTags && enc.questionTags.length > 0) {
          // New Way: Match ANY of the tags in the list
          qQuery = query(
              collection(db, "questions"), 
              where("tags", "array-contains-any", enc.questionTags)
          );
      } else {
          // Old Way: Single tag
          qQuery = query(
              collection(db, "questions"), 
              where("tags", "array-contains", enc.questionTag || "level1")
          );
      }

      const qSnap = await getDocs(qQuery);
      let qList = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionDoc));

      // ---------------------------------------------------------
      // 🧠 LOGIC: RANDOM VS ORDERED
      // ---------------------------------------------------------
      // We assume the Encounter doc has a boolean field 'shuffleQuestions'
      // If true: Randomize. If false: Sort by 'order' field.
      // @ts-ignore (We will add this field to the type later)
      if (enc.shuffleQuestions) {
        qList = shuffleArray(qList);
      } else {
        // Sort by 'order' property if it exists, otherwise keep DB order
        qList.sort((a, b) => (a.order || 999) - (b.order || 999));
      }
      
      setQuestions(qList);

      // 3. PREPARE BATTLE (But show Intro first!)
      setTimeout(() => {
        const charToUse = specificChar || character;
        const pMax = charToUse?.maxHp || 100;

        // 1. Calculate Total Max HP with Equipment (Same logic as Character Page)
        let totalMaxHp = charToUse?.maxHp || 20; // Base

        // Calculate bonuses from equipped items
        if (charToUse && charToUse.equipment) {
             Object.values(charToUse.equipment).forEach(equipId => {
                 // Find the item in inventory
                 const item = charToUse.inventory.find(i => i.instanceId === equipId);
                 if (item) {
                     // Find the item definition
                     const def = gameItems[item.itemId];
                     // Add HP bonus if it exists
                     if (def && def.stats?.maxHp?.flat) {
                         totalMaxHp += def.stats.maxHp.flat;
                     }
                 }
             });
        }

        // 2. Set HP
        // If 'hp' exists in DB, use it. If it's 0 (you died previously) or missing, reset to full Max HP.
        // We use 'hp' because that is what your Character Page uses.
        let current = (charToUse as any).hp;
        
        if (current === undefined || current === null || current <= 0) {
            current = totalMaxHp; // Start fresh if dead or new
             // OPTIONAL: Update DB immediately to reset their HP to full
             if (user) updateDoc(doc(db, "characters", user.uid), { hp: totalMaxHp });
        }

        setPlayerHp(current);
        setFoeHp(currentFoe?.maxHp || 50); 
        const firstTime = (qList[0]?.timeLimit || 30) * (enc.timeMultiplier || 1.0);
        setTimeLeft(firstTime);
        setTotalTime(firstTime);
        setCurrentQIndex(0);
        setIsPaused(false);

        // 🛑 SHOW INTRO FIRST (Story Mode)
        setMode("intro"); 
      }, 500);

    } catch (error) {
      console.error("Error starting game:", error);
      setMode("lobby");
    }
  };

  const handleNextQuestion = () => {
    setIsPaused(false); 
    setMsg(""); 
    if (playerHp <= 0) { setMode("lost"); return; }
    nextQuestion();
  };

  const handleAnswer = async (choiceIndex: number) => {
    if (!activeEncounter || !foe) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const currentQ = questions[currentQIndex];
    const isCorrect = choiceIndex === currentQ.correctIndex;

    if (isCorrect) {
      // 1. Damage Logic
      const rawDamage = calculatePlayerDamage(); 
      const foeDefense = foe.defense || 0; 
      const finalDamage = Math.max(0, rawDamage - foeDefense);

      const newFoeHp = foeHp - finalDamage;
      setFoeHp(newFoeHp);

      // 2. Degrade Weapon (AWAIT THIS)
      const { broken, newInv } = await degradation("mainHand", 1); 

      // 3. Message
      if (broken) {
        setMsg(`⚔️ Hit for ${finalDamage} dmg... but your weapon CRACKED and broke! 💥`);
      } else {
        setMsg(`⚔️ Hit for ${finalDamage} dmg!`);
      }

      if (newFoeHp <= 0) {
          // Pasa el inventario nuevo a handleWin para que no se pierda el daño
          handleWin(newInv);
      } else {
          nextQuestion();
      }

    } else {
      // Incorrect logic
      const incDmg = calculateIncomingDamage(foe.attackDamage); 
      const newPlayerHp = playerHp - incDmg;
      setPlayerHp(newPlayerHp);

      // Degrade Armor (AWAIT THIS)
      const { broken } = await degradation("armor", 1);

      if (newPlayerHp <= 0) {
        handleLoss();
      } else {
        if (broken) {
           setMsg("🛡️💥 Ouch! You took damage and your Armor SHATTERED!");
        } else {
           setMsg(choiceIndex === -1 ? "⏰ Time Out!" : "Wrong! You took damage.");
        }
        setIsPaused(true);       
        setShowInventory(false); 
      }
    }
  };

  const nextQuestion = () => {
    // Verificamos si quedan preguntas
    if (currentQIndex < questions.length - 1) {
      const nextIdx = currentQIndex + 1;
      setCurrentQIndex(nextIdx);

      // 1. Obtenemos la siguiente pregunta
      const nextQ = questions[nextIdx];

      // 2. Calculamos: Tiempo Base de Pregunta * Multiplicador del Encuentro
      const baseTime = (nextQ?.timeLimit || 30) * (activeEncounter?.timeMultiplier || 1.0);

      // 3. Reseteamos el Timer y la Barra Visual
      resetTimer(baseTime);
      setTotalTime(baseTime); // 👈 ¡Importante para que la barra se vea llena!
      
    } else {
      handleLoss("⌛ Ran out of turns! You weren't able to defeat the enemy in time. Retreating to camp.");
    }
  };

  // 🧪 POTION LOGIC (Fixed to include Equipment Bonuses)
  const usePotion = async (invItem: InventoryItem) => {
    if (!character || !user) return;
    const def = gameItems[invItem.itemId];
    if (!def) return;

    // 1. Calculate REAL Max HP (Base + Equipment)
    // We must repeat this math here because 'character.maxHp' is just the base stats.
    let totalMaxHp = character.maxHp || 20;

    if (character.equipment) {
         Object.values(character.equipment).forEach(equipId => {
             // Find the equipped item in inventory to ensure we have it
             const item = character.inventory.find(i => i.instanceId === equipId);
             if (item) {
                 const itemDef = gameItems[item.itemId];
                 // Add HP bonus if it exists
                 if (itemDef && itemDef.stats?.maxHp?.flat) {
                     totalMaxHp += itemDef.stats.maxHp.flat;
                 }
             }
         });
    }

    const healAmount = def.stats?.heal?.flat || 20;
    
    // 2. Heal relative to TOTAL Max HP
    const newHp = Math.min(totalMaxHp, playerHp + healAmount);
    setPlayerHp(newHp);

    // 3. Remove Potion from Inventory
    const newInventory = character.inventory.filter(i => i.instanceId !== invItem.instanceId);
    setCharacter({ ...character, inventory: newInventory });
    await updateDoc(doc(db, "characters", user.uid), { inventory: newInventory });

    setMsg(`🥤 Glug glug... Healed ${healAmount} HP!`);
    setShowInventory(false);
  };

  // 🏆 HANDLE WIN & LEVEL UP
  const handleWin = async (currentInventoryOverride?: InventoryItem[]) => {
    setMode("won");
    if (!user || !activeEncounter || !character) return;
    
    const xpReward = activeEncounter.winRewardXp || 0;
    const goldReward = activeEncounter.winRewardGold || 0;
    
    // Usamos el inventario más reciente (el que nos pasan o el del estado)
    const baseInv = currentInventoryOverride || character.inventory || [];

    // Logica de Nivel (Sin cambios)
    let currentXp = character.xp + xpReward;
    let currentLevel = character.level;
    let currentMaxHp = character.maxHp;
    let currentBaseDmg = character.baseDamage || 0;
    let currentBaseDef = character.baseDefense || 0;
    
    let leveledUp = false;
    let oldLevel = character.level;
    let hpGainedTotal = 0;
    let atkGainedTotal = 0;
    let defGainedTotal = 0;

    while (currentLevel < 100) {
        const xpNeeded = Math.floor(100 * Math.pow(1.1, currentLevel - 1));
        if (currentXp >= xpNeeded) {
            currentXp -= xpNeeded;
            currentLevel++;
            leveledUp = true;
            const isMilestone = currentLevel % 10 === 0;
            const tier = Math.floor(currentLevel / 10) + 1;
            const statBoost = isMilestone ? tier : 1;
            currentMaxHp += 5*statBoost;
            setPlayerHp(prev => prev + (5 * statBoost));
            currentBaseDmg += statBoost;
            currentBaseDef += isMilestone ? tier : 0;
            hpGainedTotal += 5*statBoost;
            atkGainedTotal += statBoost;
            defGainedTotal += isMilestone ? tier : 0;
        } else {
            break;
        }
    }

    // --- ITEM DROPS ---
    let newItems: InventoryItem[] = [];
    if (activeEncounter.winRewardItems && activeEncounter.winRewardItems.length > 0) {
        newItems = activeEncounter.winRewardItems.map(itemId => ({
            itemId: itemId,
            instanceId: crypto.randomUUID(),
            obtainedAt: Date.now(),
            durability: 100
        }));
        setLootDrops(newItems.map(i => gameItems[i.itemId]?.name || "Item"));
    } else {
        setLootDrops([]);
    }

    // --- SAVE TO DB ---
    const charRef = doc(db, "characters", user.uid);
    
    // Combina el inventario base (dañado) con el botín nuevo
    const finalInventory = [...baseInv, ...newItems];

    const updatePayload: any = {
      hp: playerHp + hpGainedTotal,
      xp: currentXp,
      level: currentLevel,
      maxHp: currentMaxHp,
      baseDamage: currentBaseDmg,
      baseDefense: currentBaseDef, 
      gold: increment(goldReward),
      inventory: finalInventory // Siempre guardamos el inventario final
    };

    await updateDoc(charRef, updatePayload);
    
    // Update Local State
    setCharacter(prev => prev ? ({ 
        ...prev, ...updatePayload
    }) : null);

    if (leveledUp) {
        setLevelUpData({ 
            oldLvl: oldLevel, 
            newLvl: currentLevel, 
            hpGain: hpGainedTotal,
            atkGain: atkGainedTotal,
            defGain: defGainedTotal
        } as any);
    }
  };

  // ----------------------------------------------
  // 4. STAT HELPERS
  // ----------------------------------------------
  const getTimerMultiplier = () => {
    if (!character?.equipment?.mainHand) return 1;
    const item = gameItems[character.equipment.mainHand];
    return item?.stats?.timeFactor || 1;
  };

  const calculatePlayerDamage = () => {
    // 1. BASE STATS (From Character Sheet)
    const charBase = character?.baseDamage ?? 1;
    
    // Default to base if no gear
    if (!character?.equipment) return charBase;

    let totalFlat = 0;
    let totalMult = 1;

    // 2. EQUIPMENT LOOP
    Object.values(character.equipment).forEach(itemId => {
      if (!itemId) return;
      // Find item in inventory to check durability
      const invItem = character?.inventory.find(i => i.itemId === itemId);
      
      // If broken, ignore it
      if (invItem && invItem.durability !== undefined && invItem.durability <= 0) return;

      const item = gameItems[itemId];
      // Add up Damage Stats
      if (item?.stats?.damage) {
        if (item.stats.damage.flat) totalFlat += item.stats.damage.flat;
        if (item.stats.damage.mult) totalMult *= item.stats.damage.mult;
      }
    });

    // Formula: (Base + ItemDamage) * Multipliers
    return Math.ceil((charBase + totalFlat) * totalMult);
  };

  const calculateIncomingDamage = (rawFoeDamage: number) => {
    // 1. BASE DEFENSE
    const charBaseDef = character?.baseDefense ?? 0;
    
    let totalFlatDef = 0;
    let totalMultDef = 1;

    // 2. EQUIPMENT LOOP
    if (character?.equipment) {
      Object.values(character.equipment).forEach(itemId => {
        if (!itemId) return;
        const invItem = character?.inventory.find(i => i.itemId === itemId);
        
        // If broken, ignore it
        if (invItem && invItem.durability !== undefined && invItem.durability <= 0) return;

        const item = gameItems[itemId];
        if (item?.stats?.defense) {
          if (item.stats.defense.flat) totalFlatDef += item.stats.defense.flat;
          if (item.stats.defense.mult) totalMultDef *= item.stats.defense.mult;
        }
      });
    }

    // 3. CALCULATE TOTAL DEFENSE
    const totalPlayerDefense = Math.floor((charBaseDef + totalFlatDef) * totalMultDef);

    // 4. FINAL DAMAGE (Attack - Defense), minimum 0
    return Math.max(0, rawFoeDamage - totalPlayerDefense);
  };

  const degradation = async (slot: EquipmentSlot, amount: number) => {
    if (!character?.equipment || !user) return { broken: false, newInv: character?.inventory || [] };
    
    const equippedId = character.equipment[slot];
    if (!equippedId) return { broken: false, newInv: character.inventory };

    let didJustBreak = false;

    // Calculamos el nuevo inventario
    const newInventory = character.inventory.map((item) => {
      if (item.instanceId === equippedId && item.durability !== undefined) {
        const newDur = Math.max(0, item.durability - amount);
        
        if (item.durability > 0 && newDur === 0) {
            didJustBreak = true;
        }
        return { ...item, durability: newDur };
      }
      return item;
    });

    // A. Actualizamos el Estado Visual
    setCharacter(prev => prev ? ({ ...prev, inventory: newInventory }) : null);

    // B. ¡IMPORTANTE! Guardamos en Firebase inmediatamente
    const charRef = doc(db, "characters", user.uid);
    await updateDoc(charRef, { inventory: newInventory });

    return { broken: didJustBreak, newInv: newInventory };
  };

  // ----------------------------------------------
  // 5. RENDER
  // ----------------------------------------------
  if (!user) return <div className="p-10">Please log in to play.</div>;
  
  if (mode === "lobby") return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-center mb-8">Choose Your Battle ⚔️</h1>
      
      {msg && <div className="p-4 bg-red-100 text-red-700 font-bold rounded-xl text-center animate-pulse">{msg}</div>}
      
      <div className="grid gap-4">
        {encounters.map(enc => (
          <div 
            key={enc.id} 
            // 👇 FLEXBOX MAGIC: Stacks vertically on mobile (flex-col), side-by-side on desktop (sm:flex-row)
            className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
          >
            {/* 1. INFO SECTION (Grows to fill space) */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg text-gray-800">{enc.title}</h3>
                  <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-500 font-bold uppercase tracking-wider">
                    {enc.questionTag}
                  </span>
              </div>
              <p className="text-sm text-gray-500">
                 Win: <span className="text-purple-600 font-bold">+{enc.winRewardXp} XP</span>
              </p>
            </div>

            {/* 2. ACTION BUTTON (Never shrinks) */}
            <button 
               onClick={() => startEncounter(enc)}
               className="shrink-0 w-full sm:w-auto bg-black text-white font-bold py-3 px-8 rounded-xl hover:bg-gray-800 transition-transform active:scale-95 flex items-center justify-center gap-2"
            >
               <span>FIGHT</span>
               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
               </svg>
            </button>
          </div>
        ))}
      </div>
    </main>
  );

  if (mode === "loading") return <div className="p-10 text-center animate-pulse">⚔️ Entering the Arena...</div>;
  
  // --- 🏆 VICTORY SCREEN & LEVEL UP CARD ---
  if (mode === "won") {
    const data = levelUpData as any;
    
    // Fallback defaults just in case, but data should exist if leveled up
    const hpGain = data?.hpGain || 0;
    const atkGain = data?.atkGain || 0;
    const defGain = data?.defGain || 0;

    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-yellow-50">
        <div className="bg-white p-8 rounded-3xl shadow-xl border-4 border-yellow-400 text-center max-w-sm w-full space-y-6 animate-in zoom-in duration-300">
          
          <div className="text-6xl animate-bounce">🎉</div>
          
          <div>
            <h1 className="text-4xl font-black text-yellow-600 uppercase tracking-widest">Victory!</h1>
            <p className="text-gray-400 font-bold mt-2">Level {character?.level}</p>
          </div>

          {/* LEVEL UP CARD */}
          {data?.newLvl > data?.oldLvl && (
            <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200 space-y-3">
                <div className="font-bold text-yellow-800 uppercase text-xs tracking-wider mb-2">Level Up Bonuses</div>
                
                {/* HP */}
                <div className="flex justify-between items-center px-4">
                  <span className="font-bold text-gray-600">Max Health</span>
                  <span className="font-black text-green-600 text-xl">+{hpGain} 💚</span>
                </div>

                {/* ATTACK */}
                <div className="flex justify-between items-center px-4">
                  <span className="font-bold text-gray-600">Base Attack</span>
                  <span className="font-black text-red-600 text-xl">+{atkGain} ⚔️</span>
                </div>

                {/* DEFENSE - Only show if > 0 */}
                {defGain > 0 ? (
                  <div className="flex justify-between items-center px-4">
                    <span className="font-bold text-gray-600">Base Defense</span>
                    <span className="font-black text-blue-600 text-xl">+{defGain} 🛡️</span>
                  </div>
                ) : (
                  // Optional: Show player that defense didn't go up this time
                  <div className="text-[10px] text-gray-400 italic">
                    (Extra rewards on Milestone levels)
                  </div>
                )}
            </div>
          )}
          
          {lootDrops.length > 0 && (
             <div className="text-sm font-bold text-gray-500 bg-gray-100 p-2 rounded">
                Found: {lootDrops.join(", ")}
             </div>
          )}

          <div className="pt-4">
            <button 
              onClick={() => router.push("/map")}
              className="w-full bg-black text-white py-4 rounded-xl font-bold text-xl hover:scale-105 transition-transform shadow-lg"
            >
              Collect Loot & Return ➡️
            </button>
          </div>

        </div>
      </main>
    );
  }

  // ==========================================
  // 💀 DEFEAT CARD (Matches your Victory style)
  // ==========================================
  if (mode === "lost") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-red-50">
        <div className="bg-white p-8 rounded-3xl shadow-xl border-4 border-red-500 text-center max-w-sm w-full space-y-6 animate-in zoom-in duration-300">
          
          <div className="text-6xl animate-pulse">💀</div>
          
          <div>
            <h1 className="text-4xl font-black text-red-600 uppercase tracking-widest">Defeat</h1>
            <p className="text-gray-400 font-bold mt-2">You have fallen...</p>
          </div>

          <div className="bg-gray-100 p-4 rounded-xl border border-gray-200">
             <p className="font-bold text-gray-500 text-xs uppercase mb-2">Outcome</p>
             <p className="font-bold text-gray-700">{msg || "HP Critical. Retreating to camp."}</p>
          </div>

          <div className="pt-4">
            <button 
              onClick={() => router.push("/map")}
              className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-xl hover:scale-105 transition-transform shadow-lg"
            >
              Return to Map 🗺️
            </button>
          </div>

        </div>
      </main>
    );
  }

  // ==========================================
  // 💨 ESCAPE CARD (Penalty Display)
  // ==========================================
  if ((mode as any) === "escaped") {
    // Calculate penalty for display
    const penalty = Math.ceil((activeEncounter?.winRewardGold || 0) / 2);

    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
        <div className="bg-white p-8 rounded-3xl shadow-xl border-4 border-gray-400 text-center max-w-sm w-full space-y-6 animate-in zoom-in duration-300">
          
          <div className="text-6xl">💨</div>
          
          <div>
            <h1 className="text-4xl font-black text-gray-600 uppercase tracking-widest">Escaped!</h1>
            <p className="text-gray-400 font-bold mt-2">Ran away safely</p>
          </div>

          {/* PENALTY INFO */}
          <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-2">
             <div>
                <p className="font-bold text-red-500 text-[10px] uppercase">Penalty Paid</p>
                <p className="font-black text-red-600 text-3xl">-{penalty} Gold</p>
             </div>
          </div>

          <div className="pt-4">
            <button 
              onClick={() => router.push("/map")}
              className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-xl hover:scale-105 transition-transform shadow-lg"
            >
              Return to Map 🗺️
            </button>
          </div>

        </div>
      </main>
    );
  }

  // --- VIEW: INTRO / STORY ---
  if (mode === "intro") {
    
    // 1. CONFIG: Determine Image or Emoji
    // (We look for imageUrl on the encounter, then the foe, then fallback to null)
    // @ts-ignore - Ignoring TS in case these fields aren't in your interface yet
    const heroImage = activeEncounter?.imageUrl || foe?.imageUrl;
    
    // 2. CONFIG: Your "Default Emoji" Choice
    // If specific emoji exists use it, otherwise use your default choice here (e.g., 👹, ⚔️, 🐉)
    // @ts-ignore
    const displayEmoji = activeEncounter?.emoji || "👹"; 

    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        
        {/* Card Container */}
        <div className="max-w-lg w-full bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-800">
          
          {/* --- HEADER (Image OR Emoji) --- */}
          <div className="relative h-64 w-full bg-gray-900">
            {heroImage ? (
              // OPTION A: Show the Image
              <img 
                src={heroImage} 
                alt="Enemy" 
                className="w-full h-full object-cover opacity-90 hover:scale-105 transition-transform duration-700 ease-in-out" 
              />
            ) : (
              // OPTION B: Show the Emoji (on a nice gradient)
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-black">
                {/* Decorative circles in background */}
                <div className="absolute opacity-20 w-48 h-48 bg-blue-500 blur-3xl rounded-full -top-10 -left-10"></div>
                <div className="absolute opacity-20 w-48 h-48 bg-purple-500 blur-3xl rounded-full bottom-0 right-0"></div>
                
                {/* The Emoji */}
                <span className="relative z-10 text-8xl filter drop-shadow-2xl animate-pulse-slow">
                  {displayEmoji}
                </span>
              </div>
            )}

            {/* Title Overlay (Gradient Fade at bottom) */}
            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 to-transparent pt-20 pb-6 px-8">
              <h1 className="text-3xl font-black text-white uppercase tracking-wider drop-shadow-md">
                {activeEncounter?.title || foe?.name || "Battle"}
              </h1>
              <p className="text-slate-300 text-sm font-bold flex items-center gap-2">
                <span className="bg-red-600 text-white px-2 py-0.5 rounded text-[10px]">ENEMY</span> 
                {foe?.name || "Unknown Foe"}
              </p>
            </div>
          </div>

          {/* --- BODY (Story & Stats) --- */}
          <div className="p-8 space-y-6 bg-white">
            
            {/* Description / Story */}
            <div className="relative pl-4 border-l-4 border-slate-300">
              <p className="text-gray-600 text-lg leading-relaxed italic">
                "{activeEncounter?.description || "A shadow moves in the darkness. Prepare yourself..."}"
              </p>
            </div>

            {/* Quick Stats Row (Grid) */}
            <div className="grid grid-cols-2 gap-4">
                {/* 1. FOE STATS */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enemy Stats</span>
                    <div className="text-sm font-bold text-slate-700 flex flex-wrap justify-center gap-x-2">
                       <span className="text-green-600">❤ {foe?.maxHp || 50}</span>
                       <span className="text-red-600">⚔️ {foe?.attackDamage || 5}</span>
                       <span className="text-blue-600">🛡️ {foe?.defense || 0}</span>
                    </div>
                </div>

                {/* 2. REWARD */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reward</span>
                    <span className="text-xl font-bold text-slate-700">
                      {/* @ts-ignore */}
                      {activeEncounter?.winRewardXp || 100} XP
                    </span>
                </div>
            </div>

            {/* Turns Warning */}
            <p className="text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
               You have <span className="text-red-600 text-sm">{questions.length} Turns</span> to defeat this enemy!
            </p>

            {/* Action Button */}
            <button
              onClick={() => setMode("battle")}
              className="group relative w-full overflow-hidden rounded-2xl bg-slate-900 px-8 py-4 text-white shadow-xl transition-all hover:bg-slate-800 hover:shadow-2xl active:scale-95"
            >
              <div className="relative z-10 flex items-center justify-center gap-2">
                <span className="text-xl font-black tracking-widest">FIGHT!</span>
                <span className="text-2xl group-hover:translate-x-1 transition-transform">⚔️</span>
              </div>
            </button>
            
          </div>
        </div>
      </main>
    );
  }

  const currentQ = questions[currentQIndex];

  if (!currentQ) return <div className="p-10 text-center font-bold text-gray-500">Loading Battle...</div>;

  return (
    <main className="min-h-screen p-4 flex flex-col items-center max-w-2xl mx-auto relative">
      
      {/* HUD (HEALTH BARS) */}
      <div className="w-full grid grid-cols-2 gap-4 mb-4">
        
        {/* PLAYER CARD */}
        <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-center space-y-2">
            <h3 className="font-bold text-blue-900">{character?.name}</h3>
            <HealthBar 
              label="YOU" 
              current={playerHp} 
              max={character?.maxHp || 100} // 👈 MUST HAVE THIS
            />
          <button 
            onClick={() => setShowInventory(true)}
            className="mt-4 text-xs bg-gray-100 hover:bg-gray-200 py-2 rounded-lg font-bold flex items-center justify-center gap-2 border"
          >
            🎒 Items ({character?.inventory.filter(i => gameItems[i.itemId]?.type === 'potion').length || 0})
          </button>
        </div>
        
        {/* ENEMY CARD */}
        <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-center space-y-2">
            <h3 className="font-bold text-red-900">{foe?.name || "Enemy"}</h3>
            <HealthBar 
              label="ENEMY" 
              current={foeHp} 
              max={foe?.maxHp || 50} // 👈 MUST HAVE THIS
            />
        </div>
      </div>

      {/* TIMER BAR */}
      <div className="bg-white px-6 py-4 rounded-3xl shadow-sm border border-gray-200 mb-6 w-full">
        <TimeBar 
            current={timeLeft} 
            max={totalTime} 
        />
      </div>

      {/* --- QUESTION CARD --- */}
      <div className="w-full bg-white rounded-3xl shadow-lg border p-8 space-y-6 relative">
        {msg && <div className="text-center text-red-500 font-bold animate-bounce">{msg}</div>}
        <div className="absolute top-4 right-6 bg-gray-100 px-3 py-1 rounded-full text-[10px] font-black text-gray-400 tracking-widest border border-gray-200">
           TURN {currentQIndex + 1} / {questions.length}
        </div>
        
        {/* 1. IMAGEN DE LA PREGUNTA (Si existe) */}
        {/* Asegúrate de que tu interfaz QuestionDoc tenga el campo optional 'imageUrl' */}
        {currentQ.imageUrl && (
          <div className="flex justify-center mb-4">
            <img 
              src={currentQ.imageUrl} 
              alt="Question Context" 
              className="rounded-xl max-h-60 object-contain shadow-sm"
            />
          </div>
        )}

        {/* 2. QUESTION TEXT, LATEX OR IMAGE*/}
        <div className="text-2xl font-bold text-gray-800 text-center my-4">
          {/* Priority 1: IMAGE */}
          {currentQ.promptImageUrl && (
            <div className="flex justify-center mb-4">
                <img 
                    src={currentQ.promptImageUrl} 
                    alt="Question Image" 
                    className="max-h-48 rounded-lg shadow-md border" 
                />
            </div>
          )}

          {/* Priority 2: LATEX BLOCK */}
          {currentQ.promptLatex && (
            <div className="py-4 overflow-x-auto">
               <BlockMath math={currentQ.promptLatex} />
            </div>
          )}

          {/* Priority 3: TEXT (Supports mixed math) */}
          {currentQ.promptText && (
            <div className="whitespace-pre-wrap leading-relaxed">
               {renderMixedText(currentQ.promptText || "")}
            </div>
          )}
        </div>

        {/* 3. ANSWERS (GRID) */}
        <div className="grid grid-cols-1 gap-3 min-h-[200px]">
          
          {/* A. IF PAUSE (Next Button) - Shows at top if paused */}
          {isPaused && (
            <div className="flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in mb-4">
              <div className="text-xl font-bold bg-white p-4 rounded-xl border-2 border-black w-full text-center shadow-md">
                 {msg || "Round Over"}
              </div>
              <button 
                onClick={() => {
                  setMsg(""); 
                  setIsPaused(false);
                  const nextQ = questions[currentQIndex + 1];
                  const baseTime = (nextQ?.timeLimit || 30) * (activeEncounter?.timeMultiplier || 1.0);
                  setTimeLeft(baseTime);
                  setTotalTime(baseTime);
                  resetTimer(baseTime); 
                  if (currentQIndex < questions.length - 1) {
                      setCurrentQIndex(prev => prev + 1);
                  } else {
                      handleWin();
                  }
                }} 
                className="w-full py-4 bg-blue-600 text-white text-xl font-black rounded-xl hover:bg-blue-800 shadow-lg transition-transform hover:scale-[1.02]"
              >
                NEXT QUESTION ➡️
              </button>
            </div>
          )}

          {/* B. ANSWERS (Always visible below) */}
          {currentQ.choices.map((choice, idx) => {
            return (
              <button 
                key={idx} 
                // 👇 This makes it unclickable when paused
                disabled={isPaused} 
                onClick={() => handleAnswer(idx)} 
                // 👇 This changes the look (grayed out) when paused
                className={`p-4 border-2 rounded-xl text-lg font-medium transition-all group relative
                  ${isPaused 
                    ? "opacity-50 cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400" 
                    : "hover:bg-black hover:text-white hover:border-black"
                  }
                `}
              >
                <span className="block w-full text-center pointer-events-none">
                  {renderMixedText(choice)}
                </span>
              </button>
            );
          })}
        </div>

        {/* --- SKIP & ESCAPE BUTTONS --- */}
        {!isPaused && (
            <div className="mt-6 flex flex-col gap-3 pt-6 border-t border-gray-100">
                
                {/* Skip Button */}
                <button 
                    onClick={skipQuestion}
                    className="w-full py-3 rounded-xl border-2 border-red-100 bg-red-50 text-red-500 font-bold hover:bg-red-100 hover:border-red-200 transition-colors text-sm"
                >
                    ⏭️ SKIP QUESTION
                </button>

                {/* Escape Button */}
                <button 
                    onClick={() => setShowEscapeConfirm(true)} 
                    className="w-full py-3 rounded-xl border-2 border-gray-200 text-gray-400 font-bold hover:bg-gray-100 hover:text-gray-600 transition-colors text-xs uppercase tracking-widest"
                >
                    🏃 Escape Battle
                </button>
            </div>
        )}
      </div>

      {/* 🎒 INVENTORY MODAL */}
      {showInventory && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 rounded-3xl">
           <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">🎒 Backpack</h3>
                <button onClick={() => setShowInventory(false)} className="text-gray-400 hover:text-black">✕</button>
              </div>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {character?.inventory.filter(i => gameItems[i.itemId]?.type === 'potion').length === 0 && (
                   <p className="text-center text-gray-400 py-4">No potions found!</p>
                )}
                
                {character?.inventory.map((invItem) => {
                   const def = gameItems[invItem.itemId];
                   if (!def || def.type !== 'potion') return null;
                   
                   return (
                     <div key={invItem.instanceId} className="flex justify-between items-center p-3 border rounded-xl hover:bg-green-50">
                        <div className="flex items-center gap-3">
                           {def.imageUrl ? <img src={def.imageUrl} className="w-8 h-8 rounded bg-gray-200" /> : <div className="w-8 h-8 rounded bg-pink-100 flex items-center justify-center text-xs">🧪</div>}
                           <div>
                             <div className="font-bold text-sm">{def.name}</div>
                             <div className="text-xs text-green-600 font-bold">Heals {def.stats?.heal?.flat || 20} HP</div>
                           </div>
                        </div>
                        <button 
                          onClick={() => usePotion(invItem)}
                          className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-lg hover:bg-green-600"
                        >
                          Drink
                        </button>
                     </div>
                   );
                })}
              </div>
              <p className="text-center text-[10px] text-red-500 mt-4 animate-pulse">⏰ Time is still ticking!</p>
           </div>
        </div>
      )}

      {/* 🛑 ESCAPE CONFIRMATION MODAL (Does not pause timer!) */}
      {showEscapeConfirm && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 rounded-3xl animate-in fade-in duration-200">
           <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl border-4 border-red-100 text-center space-y-4">
              
              <div className="text-4xl">🏃💨</div>
              
              <div>
                 <h3 className="text-xl font-black text-gray-800 uppercase">Run Away?</h3>
                 <p className="text-sm text-gray-500 font-medium mt-1">
                    You will keep your Backpack and Gold.
                 </p>
              </div>

              {/* Timer Warning */}
              <div className="bg-red-50 text-red-600 text-[10px] font-bold py-2 rounded animate-pulse">
                 ⚠️ HURRY! THE BATTLE IS STILL ACTIVE!
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                 <button 
                    onClick={() => setShowEscapeConfirm(false)}
                    className="py-3 rounded-xl font-bold bg-gray-200 hover:bg-gray-300 text-gray-700"
                 >
                    Cancel
                 </button>
                 <button 
                    onClick={executeEscape}
                    className="py-3 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg hover:scale-105 transition-transform"
                 >
                    Yes, Escape!
                 </button>
              </div>
           </div>
        </div>
      )}

    </main>
  );
}

// Fisher-Yates Shuffle Algorithm
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function HealthBar({ current, max, label }: { current: number; max: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  
  let colorClass = "bg-green-500";
  if (pct <= 50) colorClass = "bg-orange-500";
  if (pct <= 20) colorClass = "bg-red-600 animate-pulse";

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold uppercase text-gray-400">{label}</span>
        <span className="text-sm font-bold">{current}/{max} HP</span>
      </div>
      <div className="h-4 w-full bg-gray-200 rounded-full overflow-hidden border border-gray-300 relative shadow-inner">
        <div 
          className={`h-full ${colorClass} transition-all duration-500 ease-out`} 
          style={{ width: `${pct}%` }} 
        />
      </div>
    </div>
  );
}

function TimeBar({ current, max }: { current: number; max: number }) {
  const safeMax = max > 0 ? max : 30;
  const pct = Math.max(0, (current / safeMax) * 100);

  // Format Time: 252 -> 4:12
  const minutes = Math.floor(current / 60);
  const seconds = Math.ceil(current % 60);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  let colorClass = "bg-blue-500"; 
  if (pct <= 50) colorClass = "bg-orange-400";
  if (pct <= 15) colorClass = "bg-red-700 animate-pulse";
  
  return (
    <div className="w-full flex flex-col gap-1">
      <div className="flex justify-between items-end px-1">
        <span className="text-xs font-bold uppercase text-gray-400 tracking-wider">Time Remaining</span>
        <span className={`text-2xl font-black ${current <= 5 ? 'text-red-600' : 'text-gray-700'}`}>
           {timeString}
        </span>
      </div>
      <div className="h-4 w-full bg-gray-200 rounded-full overflow-hidden border border-gray-300 relative shadow-inner">
        <div 
          className={`h-full ${colorClass} transition-all duration-500 ease-out`} 
          style={{ width: `${pct}%` }} 
        />
      </div>
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center font-bold text-xl text-white">Loading Battle...</div>}>
      <PlayContent />
    </Suspense>
  );
}