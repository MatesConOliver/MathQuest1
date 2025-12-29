"use client";

import { useEffect, useState, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where, updateDoc, increment } from "firebase/firestore";
// Import the new GameItem type to use stats
import { QuestionDoc, FoeDoc, EncounterDoc, Character, EquipmentSlot, GameItem } from "@/types/game";

export default function PlayPage() {
  const [user, setUser] = useState<User | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  
  // 👇 NEW: Store Item Definitions (to read stats like damage/timeFactor)
  const [gameItems, setGameItems] = useState<Record<string, GameItem>>({});

  // Game States
  const [mode, setMode] = useState<"lobby" | "loading" | "battle" | "won" | "lost">("lobby");
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

  // 🕒 TIMER STATES
  const [timeLeft, setTimeLeft] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null); 

  // 1. Init
  useEffect(() => {
    onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Load Encounters
        const snap = await getDocs(collection(db, "encounters"));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as EncounterDoc));
        setEncounters(list);

        // Load Character
        const charSnap = await getDoc(doc(db, "characters", u.uid));
        if (charSnap.exists()) {
          setCharacter(charSnap.data() as Character);
        }

        // 👇 NEW: Load Items Database (so we know stats)
        const itemsSnap = await getDocs(collection(db, "items"));
        const itemsMap: Record<string, GameItem> = {};
        itemsSnap.forEach(doc => {
            itemsMap[doc.id] = doc.data() as GameItem;
        });
        setGameItems(itemsMap);
      }
    });
  }, []);

  // 🕒 TIMER EFFECT
  useEffect(() => {
    if (mode === "battle" && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleTimeRunOut(); 
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mode, timeLeft]);

  // ----------------------------------------------
  // 🔢 STAT CALCULATION HELPERS
  // ----------------------------------------------

  // 1. Get Timer Multiplier from Main Hand
  const getTimerMultiplier = () => {
    if (!character?.equipment.mainHand) return 1;
    const itemId = character.equipment.mainHand;
    const item = gameItems[itemId];
    
    // Use the item's timeFactor if it exists, otherwise 1
    return item?.stats?.timeFactor || 1;
  };

  // 2. Calculate Total Player Damage (Base + Flat) * Multiplier
  const calculatePlayerDamage = () => {
    // Base damage from the encounter settings (default 1)
    const baseDamage = activeEncounter?.damagePerCorrect || 1;
    if (!character) return baseDamage;

    let totalFlat = 0;
    let totalMult = 1;

    // Check all equipment slots
    Object.values(character.equipment).forEach(itemId => {
      if (!itemId) return;
      const item = gameItems[itemId];
      if (item?.stats?.damage) {
        if (item.stats.damage.flat) totalFlat += item.stats.damage.flat;
        if (item.stats.damage.mult) totalMult *= item.stats.damage.mult;
      }
    });

    return Math.ceil((baseDamage + totalFlat) * totalMult);
  };

  // 3. Calculate Incoming Damage (FoeDmg - FlatDef) * ResistanceMult
  const calculateIncomingDamage = (rawFoeDamage: number) => {
    if (!character) return rawFoeDamage;

    let totalFlatDef = 0;
    let totalMultDef = 1; 

    Object.values(character.equipment).forEach(itemId => {
      if (!itemId) return;
      const item = gameItems[itemId];
      if (item?.stats?.defense) {
        if (item.stats.defense.flat) totalFlatDef += item.stats.defense.flat;
        if (item.stats.defense.mult) totalMultDef *= item.stats.defense.mult;
      }
    });

    const finalDamage = Math.max(0, (rawFoeDamage - totalFlatDef) * totalMultDef);
    return Math.ceil(finalDamage);
  };

  // ----------------------------------------------

  const handleTimeRunOut = () => {
    setMsg("⏰ Time's Up! You took damage.");
    handleAnswer(-1); 
  };

  // --- DURABILITY ---
  const degradation = (slot: EquipmentSlot, amount: number) => {
    if (!character) return;
    const equippedId = character.equipment[slot];
    if (!equippedId) return;

    const newInventory = character.inventory.map((item) => {
      if (item.itemId === equippedId && item.durability !== undefined) {
        const newDur = Math.max(0, item.durability - amount);
        if (newDur === 0 && item.durability > 0) setMsg(`⚠️ Your ${item.itemId} broke!`);
        return { ...item, durability: newDur };
      }
      return item;
    });
    setCharacter({ ...character, inventory: newInventory });
  };

  const saveBattleState = async () => {
    if (!user || !character) return;
    const charRef = doc(db, "characters", user.uid);
    await updateDoc(charRef, { inventory: character.inventory });
  };

  // --- SETUP ENCOUNTER ---
  const startEncounter = async (enc: EncounterDoc) => {
    setMode("loading");
    setMsg("Summoning monsters...");
    
    try {
      const foeSnap = await getDoc(doc(db, "foes", enc.foeId));
      if (!foeSnap.exists()) throw new Error("Foe not found!");
      const foeData = foeSnap.data() as FoeDoc;
      
      const qColl = collection(db, "questions");
      const qQuery = query(qColl, where("tags", "array-contains", enc.questionTag));
      const qSnap = await getDocs(qQuery);
      
      let loadedQuestions = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionDoc));
      if (loadedQuestions.length === 0) throw new Error("No questions found!");

      const isOrdered = loadedQuestions.every(q => q.order !== undefined);
      if (isOrdered) loadedQuestions.sort((a, b) => (a.order || 0) - (b.order || 0));
      else loadedQuestions.sort(() => Math.random() - 0.5);

      setActiveEncounter(enc);
      setFoe(foeData);
      setFoeHp(foeData.maxHp);
      setPlayerHp(character?.maxHp || 20);
      setQuestions(loadedQuestions);
      setCurrentQIndex(0);

      // 🕒 INIT TIMER
      resetTimer(enc.timeLimitSeconds || 20); 

      setMode("battle");
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
      setMode("lobby");
    }
  };

  // 🕒 RESET TIMER HELPER
  const resetTimer = (baseSeconds: number) => {
    const multiplier = getTimerMultiplier(); // 👈 Now uses stats from DB
    const finalTime = Math.floor(baseSeconds * multiplier);
    
    setTimeLeft(finalTime);
    setMaxTime(finalTime);

    // If item provides a bonus (multiplier > 1), degrade it!
    if (multiplier > 1) {
       degradation("mainHand", 1); 
    }
  };

  const handleAnswer = async (choiceIndex: number) => {
    if (!activeEncounter || !foe) return;
    
    if (timerRef.current) clearInterval(timerRef.current);

    const currentQ = questions[currentQIndex];
    const isCorrect = choiceIndex === currentQ.correctIndex;

    if (isCorrect) {
      // ⚔️ ATTACK (Calculated)
      const dmg = calculatePlayerDamage(); // 👈 Using new math
      const newFoeHp = foeHp - dmg;
      setFoeHp(newFoeHp);
      
      degradation("mainHand", 1); 

      if (newFoeHp <= 0) {
        handleWin();
      } else {
        nextQuestion();
      }
    } else {
      // 🛡️ DEFEND (Calculated)
      const incDmg = calculateIncomingDamage(foe.attackDamage); // 👈 Using new math
      const newPlayerHp = playerHp - incDmg;
      setPlayerHp(newPlayerHp);
      
      degradation("armor", 1);
      
      if (newPlayerHp <= 0) {
        handleLoss();
      } else {
        if (choiceIndex === -1) setMsg("⏰ Time Out! took damage.");
        else setMsg("Wrong! You took damage.");
        nextQuestion(); 
      }
    }
  };

  const nextQuestion = () => {
    setCurrentQIndex((prev) => (prev + 1) % questions.length);
    resetTimer(activeEncounter?.timeLimitSeconds || 20);
  };

  const handleWin = async () => {
    setMode("won");
    await saveBattleState();
    if (!user || !activeEncounter) return;
    const charRef = doc(db, "characters", user.uid);
    await updateDoc(charRef, {
      xp: increment(activeEncounter.winRewardXp),
      gold: increment(activeEncounter.winRewardGold)
    });
  };

  const handleLoss = async () => {
    setMode("lost");
    await saveBattleState();
  };

  // --- RENDERING ---
  if (!user) return <div className="p-10">Please log in to play.</div>;
  if (mode === "lobby") return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-center mb-8">Choose Your Battle ⚔️</h1>
      <div className="grid gap-4">
        {encounters.map(enc => (
          <button key={enc.id} onClick={() => startEncounter(enc)} className="flex justify-between items-center p-6 border rounded-2xl hover:bg-gray-50 text-left">
            <div>
              <h3 className="font-bold text-lg">{enc.title}</h3>
              <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600 uppercase">Tag: {enc.questionTag}</span>
            </div>
            <div className="text-right text-sm text-gray-500">
               <div className="font-mono text-xs mb-1">⏱️ {enc.timeLimitSeconds || 20}s / Q</div>
               <div>🏆 {enc.winRewardXp} XP</div>
            </div>
          </button>
        ))}
      </div>
    </main>
  );

  if (mode === "loading") return <div className="p-10 text-center animate-pulse">⚔️ Entering the Arena...</div>;
  
  if (mode === "won") return <div className="p-10 text-center"><h1 className="text-5xl text-green-600">VICTORY!</h1><button onClick={()=>setMode("lobby")} className="mt-4 bg-black text-white px-6 py-2 rounded">Back</button></div>;
  if (mode === "lost") return <div className="p-10 text-center"><h1 className="text-5xl text-red-600">DEFEAT</h1><button onClick={()=>setMode("lobby")} className="mt-4 bg-black text-white px-6 py-2 rounded">Back</button></div>;

  const currentQ = questions[currentQIndex];

  return (
    <main className="min-h-screen p-4 flex flex-col items-center max-w-2xl mx-auto">
      {/* HUD */}
      <div className="w-full grid grid-cols-2 gap-4 mb-4">
        <div className="p-4 border rounded-2xl bg-white shadow-sm">
          <div className="text-xs uppercase font-bold text-gray-400">You</div>
          <div className="text-2xl font-bold text-green-600">HP: {playerHp}</div>
        </div>
        <div className="p-4 border rounded-2xl bg-white shadow-sm text-right">
          <div className="text-xs uppercase font-bold text-gray-400">{foe?.name}</div>
          <div className="text-2xl font-bold text-red-600">HP: {foeHp}</div>
        </div>
      </div>

      <div className="w-full mb-6">
        <TimeBar current={timeLeft} max={maxTime} />
      </div>

      <div className="w-full bg-white rounded-3xl shadow-lg border p-8 space-y-6">
        {msg && <div className="text-center text-red-500 font-bold animate-bounce">{msg}</div>}
        
        <div className="text-center space-y-4">
           {currentQ.promptType === 'image' && currentQ.promptImageUrl && (
             <img src={currentQ.promptImageUrl} alt="Question" className="mx-auto max-h-40 rounded-lg" />
           )}
           <h2 className="text-2xl font-bold font-mono">
             {currentQ.promptText || currentQ.promptLatex || "Solve this:"}
           </h2>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {currentQ.choices.map((choice, idx) => (
            <button
              key={idx}
              onClick={() => handleAnswer(idx)}
              className="p-4 border-2 rounded-xl text-lg font-medium hover:bg-black hover:text-white hover:border-black transition-all"
            >
              {choice}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

// TimeBar Component
function TimeBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, (current / max) * 100);
  let colorClass = "bg-green-500";
  if (pct <= 50) colorClass = "bg-orange-500";
  if (pct <= 20) colorClass = "bg-red-600 animate-pulse";

  return (
    <div className="w-full space-y-1">
      <div className="flex justify-between text-xs font-bold uppercase text-gray-400">
        <span>Time Remaining</span>
        <span>{current.toFixed(0)}s</span>
      </div>
      <div className="h-4 w-full bg-gray-200 rounded-full overflow-hidden border border-gray-300">
        <div 
          className={`h-full ${colorClass} transition-all duration-1000 ease-linear`} 
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}