"use client";

import { useEffect, useState, useMemo } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, increment } from "firebase/firestore";
import { GameItem, InventoryItem, Character } from "@/types/game";
import { useAudio } from "@/context/AudioContext";
import Link from "next/link";

// --- COMPONENTS ---

const InventoryItemCard = ({ 
  item, 
  def, 
  isEquipped, 
  index, 
  onEquip, 
  onUse, 
  onSell 
}: {
  item: InventoryItem;
  def: GameItem;
  isEquipped: boolean;
  index: number;
  onEquip: (i: InventoryItem) => void;
  onUse: (i: InventoryItem) => void;
  onSell: (i: InventoryItem) => void;
}) => {
  const isBroken = (item.maxDurability || 0) > 0 && (item.durability || 0) <= 0;
  const isGear = def.slot || ["armor", "head", "mainHand", "offHand", "weapon", "shield"].includes(def.type as string);
  const isFirst = index === 0;

  // Sell Logic: Broken = 10%, Used = 50%
  const multiplier = isBroken ? 0.1 : 0.5;
  const sellValue = Math.max(1, Math.ceil(def.price * multiplier));

  const s = def.stats || {};

  return (
    <div className="group relative p-3 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 flex flex-col gap-2 transition-all">
      
      {/* HOVER TOOLTIP */}
      <div className={`hidden group-hover:block absolute z-50 left-0 w-full p-3 rounded-xl shadow-xl pointer-events-none animate-in fade-in zoom-in duration-200 border border-transparent dark:border-gray-700 bg-gray-900 dark:bg-black text-white text-xs ${
          isFirst ? "top-full mt-2" : "bottom-full mb-2"
      }`}>
        <div className="font-bold border-b border-gray-600 pb-1 mb-1 text-gray-300 uppercase tracking-widest text-[10px]">Item Stats</div>
        <div className="space-y-1">
          
          {/* 1. FLAT VARIABLES (A, B, C, D) */}
          {s.a && <div>🟥 Stat A: <span className="text-red-300 font-bold">+{s.a}</span></div>}
          {s.b && <div>🟧 Stat B: <span className="text-orange-300 font-bold">+{s.b}</span></div>}
          {s.c && <div>🟦 Stat C: <span className="text-blue-300 font-bold">+{s.c}</span></div>}
          {s.d && <div>🟩 Stat D: <span className="text-green-300 font-bold">+{s.d}</span></div>}
          
          {/* 2. FLAT X BONUS */}
          {s.xBonus && <div>✖️ X Bonus: <span className="text-gray-300 font-bold">+{s.xBonus}</span></div>}

          {/* 3. K (GLOBAL DAMAGE MULTIPLIER) */}
          {/* Assuming 0.1 = 10%, 1.5 = 150% */}
          {s.damage?.mult && (
            <div>💥 Damage: <span className="text-purple-300 font-bold">
              {s.damage.mult > 0 ? '+' : ''}{Math.round(s.damage.mult * 100)}%
            </span></div>
          )}

          {/* 4. STAT MODIFIERS (Check Flat vs Mult) */}
          
          {/* HP */}
          {s.maxHp?.flat && <div>❤️ Max HP: <span className="text-pink-300 font-bold">+{s.maxHp.flat}</span></div>}
          {s.maxHp?.mult && <div>❤️ Max HP: <span className="text-pink-300 font-bold">+{Math.round(s.maxHp.mult * 100)}%</span></div>}

          {/* Heal */}
          {s.heal?.flat && <div>🧪 Restores: <span className="text-green-300 font-bold">{s.heal.flat} HP</span></div>}
          {s.heal?.mult && <div>🧪 Restores: <span className="text-green-300 font-bold">{Math.round(s.heal.mult * 100)}% HP</span></div>}

          {/* Time */}
          {s.time?.flat && <div>⏳ Time: <span className="text-yellow-300 font-bold">+{s.time.flat}s</span></div>}
          {s.time?.mult && <div>⏳ Time: <span className="text-yellow-300 font-bold">+{Math.round(s.time.mult * 100)}%</span></div>}

          {!def.stats && <div className="italic text-gray-500">No stats.</div>}
        </div>
        
        {/* Arrow */}
        <div className={`absolute left-1/2 -translate-x-1/2 border-8 border-transparent ${
            isFirst ? "bottom-full border-b-gray-900 dark:border-b-black" : "top-full border-t-gray-900 dark:border-t-black"
        }`}></div>
      </div>

      {/* CARD CONTENT */}
      <div className="flex justify-between items-start">
          <div>
              <div className="font-bold text-sm text-gray-900 dark:text-gray-100">
                  {def.name} 
                  {isEquipped && <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1 rounded ml-1 border border-green-200 dark:border-green-800">EQUIPPED</span>}
                  {isBroken && <span className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-1 rounded ml-1 font-bold border border-red-200 dark:border-red-800">BROKEN</span>}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">
                {def.slot || (def.type as string)}
              </div>
                
                {item.maxDurability && (
                  <div className="mt-2">
                    <div className="flex justify-between items-center w-24 mb-0.5">
                      <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500">DURABILITY</span>
                      <span className={`text-[9px] font-bold ${isBroken ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}>
                        {item.durability}/{item.maxDurability}
                      </span>
                    </div>
                    <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className={isBroken ? "bg-red-500 h-full" : "bg-blue-500 h-full"} 
                        style={{ width: `${((item.durability || 0) / item.maxDurability) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
          </div>
          {def.imageUrl && <img src={def.imageUrl} className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-700 object-cover" alt={def.name}/>}
      </div>

      {/* BUTTONS */}
      <div className="flex gap-2 mt-1">
          <button 
            onClick={isGear ? () => onEquip(item) : () => onUse(item)}
            disabled={isEquipped || (isGear && isBroken)}
            className={`flex-1 py-1 text-xs rounded font-bold transition-colors ${
              isEquipped || (isGear && isBroken)
                ? "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed"
                : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
            }`}
          >
            {isEquipped ? "Equipped" : (isGear && isBroken ? "Needs Repair" : (isGear ? "Equip" : "Use"))}
          </button>

          <button 
            onClick={() => onSell(item)}
            disabled={isEquipped}
            className={`px-3 py-1 text-xs rounded font-bold border transition-colors ${
              isEquipped 
                ? "bg-gray-100 text-gray-300 border-gray-200 dark:bg-gray-700 dark:text-gray-500 dark:border-gray-600 cursor-not-allowed"
                : "bg-red-50 text-red-600 border-red-100 hover:bg-red-100 dark:bg-red-900/10 dark:text-red-300 dark:border-red-900/30 dark:hover:bg-red-900/30"
            }`}
          >
            {isEquipped ? "In Use" : `Sell ${sellValue}G`}
          </button>
      </div>
    </div>
  );
};

function StatUpgradeBox({ label, flavor, value, locked, canUpgrade, onUpgrade, color }: any) {
  return (
    <div className="group relative">
      {/* HOVER TOOLTIP */}
      <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-gray-800 text-white text-[10px] rounded-lg z-10 shadow-xl pointer-events-none">
        {locked ? "Locked: Level up to reveal." : flavor}
        <div className="absolute top-full left-4 border-8 border-transparent border-t-gray-800"></div>
      </div>

      <div className={`p-3 border rounded-xl flex flex-col justify-between h-24 transition-all ${locked ? "opacity-50 bg-gray-100" : "bg-white dark:bg-gray-700/50"}`}>
        <div className="flex justify-between items-start">
          <span className="text-[10px] font-black uppercase tracking-tighter">{label}</span>
          <span className={`text-xl font-black ${color}`}>{value}</span>
        </div>
        
        <button 
          onClick={onUpgrade}
          disabled={locked || !canUpgrade}
          className="mt-2 text-[9px] font-bold py-1 bg-black text-white rounded disabled:bg-gray-300"
        >
          {locked ? "LOCKED" : "UPGRADE"}
        </button>
      </div>
    </div>
  );
}

function EquipRow({ slotName, equippedId, gameItems, inventory, onUnequip }: any) {
  const instance = equippedId && inventory 
      ? inventory.find((i: any) => i.instanceId === equippedId) 
      : null;

  const def = instance ? gameItems[instance.itemId] : null;
  const stats = def?.stats || {};
  
  const isBroken = instance && (instance.maxDurability || 0) > 0 && (instance.durability || 0) <= 0;
  const fmt = (val: number) => (val > 0 ? `+${val}` : `${val}`);

  return (
    <div className={`flex justify-between items-center p-3 border rounded-xl transition-colors ${isBroken ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-900/30' : 'bg-gray-50 dark:bg-gray-700/30 dark:border-gray-700'}`}>
      <div className="flex items-center gap-3">
        <div className="text-[10px] font-bold bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded uppercase w-20 text-center text-gray-600 dark:text-gray-200">
          {slotName}
        </div>
        
        <div>
            <div className={`text-sm flex items-center gap-2 ${def ? "font-bold dark:text-gray-100" : "text-gray-400 dark:text-gray-500 italic"}`}>
               {def ? def.name : "Empty"}
               
               {def && !isBroken && (
                 <div className="flex gap-1 text-[10px] font-extrabold uppercase tracking-wide">
                    {/* REMOVED DEFENSE HERE */}
                    {(stats as any).damage?.flat && <span className="text-blue-600 dark:text-blue-400">{fmt((stats as any).damage.flat)} ⚔️</span>}
                    {(stats as any).maxHp?.flat && <span className="text-green-600 dark:text-green-400">{fmt((stats as any).maxHp.flat)} ❤️</span>}
                    {(stats as any).time?.flat && <span className="text-yellow-600 dark:text-yellow-400">{fmt((stats as any).time.flat)}s ⏳</span>}
                 </div>
               )}
            </div>
            {isBroken && <div className="text-[10px] text-red-600 dark:text-red-400 font-bold uppercase">⚠️ Broken (Stats Ignored)</div>}
        </div>
      </div>
      
      {def && (
        <button onClick={onUnequip} className="text-xs text-red-400 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-bold px-2">
            Unequip
        </button>
      )}
    </div>
  );
}

// --- MAIN PAGE ---

export default function CharacterPage() {
  const { playTrack, playSfx } = useAudio()!; 

  useEffect(() => {
    playTrack("/the-minstrels-return-loopable-fantasy-medieval-rpg-music-447849.mp3");
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [char, setChar] = useState<Character | null>(null);
  const [gameItems, setGameItems] = useState<Record<string, GameItem>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setLoading(false); return; }
      setUser(u);

      const itemsMap: Record<string, GameItem> = {};
      try {
        const itemsSnap = await getDocs(collection(db, "items"));
        itemsSnap.forEach((doc) => { itemsMap[doc.id] = doc.data() as GameItem; });
        setGameItems(itemsMap);
      } catch (e) { console.error("Error loading items", e); }

      const charRef = doc(db, "characters", u.uid);
      const charSnap = await getDoc(charRef);
      if (charSnap.exists()) {
        setChar(charSnap.data() as Character);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // --- STATS CALCULATION ---
  const derivedStats = useMemo(() => {
    // Return defaults if no char
    if (!char) return { 
       a: 0, b: 0, c: 0, d: 0, 
       k: 1, xBonus: 0, 
       maxHp: 0, powerScore: 0, 
       baseA: 0, baseB: 0, baseC: 0, baseD: 0 
    };

    // 1. Base Stats
    const baseA = char.stats?.a || 0;
    const baseB = char.stats?.b || 0;
    const baseC = char.stats?.c || 0;
    const baseD = char.stats?.d || 0;
    const baseHp = char.maxHp;

    // 2. Initialize Totals
    let totalA = baseA;
    let totalB = baseB;
    let totalC = baseC;
    let totalD = baseD;
    
    let totalXBonus = 0;
    let totalK = 1; // K starts at 1 (100% damage)

    let hpFlat = baseHp;
    let hpMult = 0; // Starts at 0% bonus

    // 3. Loop Equipment
    Object.values(char.equipment).forEach(equippedInstanceId => {
      if (!equippedInstanceId) return;
      const instance = char.inventory.find(i => i.instanceId === equippedInstanceId);
      if (!instance) return;
      const def = gameItems[instance.itemId];
      if (!def || !def.stats) return;

      // Check Broken
      const isBroken = (instance.maxDurability || 0) > 0 && (instance.durability || 0) <= 0;
      if (isBroken) return;

      const s = def.stats;

      // --- Sum Simple Numbers ---
      if (s.a) totalA += s.a;
      if (s.b) totalB += s.b;
      if (s.c) totalC += s.c;
      if (s.d) totalD += s.d;
      if (s.xBonus) totalXBonus += s.xBonus;

      // --- Calculate K (Damage Multiplier) ---
      // If items give +10% (0.1) and +20% (0.2), usually this sums to +30% (1.3 total)
      if (s.damage?.mult) totalK += s.damage.mult;

      // --- HP (Handle Flat and Mult) ---
      if (s.maxHp?.flat) hpFlat += s.maxHp.flat;
      if (s.maxHp?.mult) hpMult += s.maxHp.mult;
    });

    // 4. Final Calculations
    const finalMaxHp = Math.floor(hpFlat * (1 + hpMult));

    // Power Score Formula (using x=1 for preview)
    // y = k * [ (a/400)x^3 + (b/40)x^2 + (1 + c/10)x + d/2 ]
    // Note: We are ignoring xBonus in the *preview* unless you want x to be (1 + xBonus)
    
    const x = 1; 
    
    const termA = (totalA / 400) * Math.pow(x, 3);
    const termB = (totalB / 40) * Math.pow(x, 2);
    const termC = (1 + (totalC / 10)) * x;
    const termD = (totalD / 2);

    const powerScore = totalK * (termA + termB + termC + termD);

    return { 
        a: totalA, baseA,
        b: totalB, baseB,
        c: totalC, baseC,
        d: totalD, baseD,
        xBonus: totalXBonus,
        k: totalK,
        maxHp: finalMaxHp,
        powerScore 
    };
  }, [char, gameItems]);

  // --- HANDLERS ---

  const handleEquip = async (item: InventoryItem) => {
    if (!char || !user) return;
    const def = gameItems[item.itemId];
    if (!def) return;

    let slot = def.slot;
    const typeStr = def.type as string; 

    if (!slot) {
        if (typeStr === "armor") slot = "armor";
        else if (typeStr === "mainHand" || typeStr === "weapon") slot = "mainHand";
        else if (typeStr === "offHand" || typeStr === "shield") slot = "offHand";
        else if (typeStr === "head") slot = "head";
    }

    if (!slot) {
        alert("This item cannot be equipped.");
        return;
    }

    const newEquipment = { ...char.equipment, [slot]: item.instanceId };
    setChar({ ...char, equipment: newEquipment });

    try {
        await updateDoc(doc(db, "characters", user.uid), {
            [`equipment.${slot}`]: item.instanceId
        });
        setMsg(`⚔️ Equipped ${def.name}!`);
    } catch (e) { setMsg("Error equipping item."); }
  };

  const handleUnequip = async (slot: string) => {
    if (!char || !user) return;
    setChar({ ...char, equipment: { ...char.equipment, [slot as any]: null } });
    await updateDoc(doc(db, "characters", user.uid), { [`equipment.${slot}`]: null });
    setMsg(`Un-equipped item from ${slot}.`);
  };

  const handleSell = async (item: InventoryItem) => {
    if (!char || !user) return;
    const def = gameItems[item.itemId];
    if (!def) return;

    const isEquipped = Object.values(char.equipment).includes(item.instanceId);
    if (isEquipped) {
        alert("Unequip this item first before selling.");
        return;
    }

    const isBroken = (item.maxDurability || 0) > 0 && (item.durability || 0) <= 0;
    const multiplier = isBroken ? 0.1 : 0.5;
    const sellPrice = Math.max(1, Math.ceil(def.price * multiplier));

    if (!confirm(`Sell ${def.name} for ${sellPrice} Gold?`)) return;

    const newInventory = char.inventory.filter(i => i.instanceId !== item.instanceId);
    const newGold = (char.gold || 0) + sellPrice;
    
    setChar({ ...char, inventory: newInventory, gold: newGold });

    await updateDoc(doc(db, "characters", user.uid), {
        inventory: newInventory,
        gold: newGold
    });

    playSfx("/item-sold.mp3");
    setMsg(`💰 Sold ${def.name} for ${sellPrice} G`);
  };

  const handleUse = async (item: InventoryItem) => {
    if (!char || !user) return;
    const def = gameItems[item.itemId];
    if (!def) return;

    // Rare Candy
    if (item.itemId === 'rare-candy' || def.name.toLowerCase() === 'rare candy') {
        const newLevel = char.level + 1;
        const newHp = char.maxHp + 5;
        const newInventory = char.inventory.filter(i => i.instanceId !== item.instanceId);
        
        setChar({ ...char, level: newLevel, maxHp: newHp, inventory: newInventory });
        await updateDoc(doc(db, "characters", user.uid), {
            level: increment(1),
            maxHp: increment(5),
            inventory: newInventory
        });
        alert("✨ LEVEL UP!");
        return;
    }

    // Potion
    if (def.type === 'potion') {
        const currentHp = (char as any).hp ?? char.maxHp;
        if (currentHp >= char.maxHp) {
            alert("Health is full.");
            return;
        }

        const healAmt = def.stats?.heal?.flat || 20;
        const newHp = Math.min(char.maxHp, currentHp + healAmt);

        if (!confirm(`Drink ${def.name}?`)) return;

        const newInventory = char.inventory.filter(i => i.instanceId !== item.instanceId);
        setChar({ ...char, inventory: newInventory, hp: newHp } as any);
        await updateDoc(doc(db, "characters", user.uid), {
            hp: newHp,
            inventory: newInventory
        });
        setMsg(`🧪 Restored health to ${newHp}/${char.maxHp}`);
        return;
    }

    // Fallback: Equip
    if (["armor", "mainHand", "offHand", "head", "weapon", "shield"].includes(def.type) || def.slot) {
        handleEquip(item);
        return;
    }

    alert(`Cannot use ${def.name}.`);
  };

  const upgradeStat = async (key: 'a' | 'b' | 'c' | 'd') => {
    if (!char || !user) return;
    
    const points = char.unspentPoints || 0;
    if (points <= 0) {
        alert("No upgrade points.");
        return;
    }

    if (key === 'a' && char.level < 50) { alert("Unlocks at Level 50!"); return; }
    if (key === 'b' && char.level < 20) { alert("Unlocks at Level 20!"); return; }

    const currentVal = char.stats?.[key] || 0;
    const newStats = { ...(char.stats || {}), [key]: currentVal + 1 };
    
    setChar({ 
        ...char, 
        stats: newStats as any, 
        unspentPoints: points - 1 
    });

    try {
        await updateDoc(doc(db, "characters", user.uid), {
            [`stats.${key}`]: increment(1),
            unspentPoints: increment(-1)
        });
        playSfx("/upgrade-sfx.mp3");
        setMsg(`Upgraded Stat ${key.toUpperCase()}!`);
    } catch (e) {
        setMsg("Error saving stats.");
    }
  };

  if (loading) return <div className="p-10 text-center">Loading Character...</div>;
  if (!char) return <div className="p-10 text-center">No character found. <Link href="/create" className="underline">Create one?</Link></div>;

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto space-y-8">
      {/* HEADER */}
      <header className="flex justify-between items-end border-b pb-4">
        <div>
          <h1 className="text-4xl font-bold">{char.name}</h1>
          <p className="text-gray-500">Level {char.level} {char.className}</p>
        </div>
        <div className="text-right">
            <div className="text-2xl font-bold text-yellow-600">🪙 {char.gold} G</div>
            <Link href="/" className="text-sm underline text-gray-400">Back to Map</Link>
        </div>
      </header>

      {msg && <div className="bg-blue-50 text-blue-800 p-3 rounded-xl text-center font-bold animate-pulse border border-blue-200">{msg}</div>}

      <div className="grid md:grid-cols-2 gap-8">
        
        {/* LEFT COL: STATS & GEAR */}
        <div className="space-y-6">
          <section className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-sm border space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Character Stats</h2>
                <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-3 py-1 rounded-full text-xs font-bold border border-yellow-200 dark:border-yellow-700">
                    POINTS: {char.unspentPoints || 0}
                </div>
            </div>

            {/* TOTAL POWER PREVIEW */}
            <div className="space-y-2">
              <button 
                onClick={() => setShowFormula(!showFormula)}
                className="w-full py-2 px-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl text-purple-700 dark:text-purple-300 text-xs font-bold flex justify-between items-center hover:bg-purple-100 transition-colors"
              >
                <span>{showFormula ? "▼ HIDE DAMAGE FUNCTION" : "▶ VIEW DAMAGE FUNCTION"}</span>
                <span className="font-mono text-sm">{derivedStats.powerScore.toFixed(2)} Power</span>
              </button>

              {showFormula && (
                <div className="p-4 bg-gray-900 text-gray-100 rounded-xl font-mono text-[10px] space-y-2 animate-in slide-in-from-top-2">
                  <p className="text-purple-400 font-bold">
                    Damage = k * [ (a/400)x³ + (b/40)x² + (1 + c/10)x + d/2 ]
                  </p>
                  <div className="grid grid-cols-2 gap-2 opacity-80">
                    <div>k: {derivedStats.k.toFixed(2)}</div>
                    <div>x: 1.00 (Base)</div>
                  </div>
                </div>
              )}
            </div>

            {/* STATS GRID */}
            <div className="grid grid-cols-2 gap-3">
               <StatUpgradeBox 
                    label="Mastery (a)" 
                    flavor="Massively boosts damage on the hardest challenges."
                    value={derivedStats.a} 
                    locked={char.level < 50}
                    canUpgrade={(char.unspentPoints || 0) > 0}
                    onUpgrade={() => upgradeStat('a')}
                    color="text-red-600"
                />

               <StatUpgradeBox 
                    label="Insight (b)" 
                    flavor="Greatly increases damage on difficult questions."
                    value={derivedStats.b} 
                    locked={char.level < 20}
                    canUpgrade={(char.unspentPoints || 0) > 0}
                    onUpgrade={() => upgradeStat('b')}
                    color="text-orange-600"
                />

                <StatUpgradeBox 
                    label="Understanding (c)" 
                    flavor="Improves your damage consistently on all questions."
                    value={derivedStats.c} 
                    locked={false}
                    canUpgrade={(char.unspentPoints || 0) > 0}
                    onUpgrade={() => upgradeStat('c')}
                    color="text-blue-600"
                />

                <StatUpgradeBox 
                    label="Focus (d)" 
                    flavor="Increases the minimum damage you deal, especially on easy questions."
                    value={derivedStats.d} 
                    locked={false}
                    canUpgrade={(char.unspentPoints || 0) > 0}
                    onUpgrade={() => upgradeStat('d')}
                    color="text-green-600"
                />
            </div>
            
            {/* FOOTER NOTE */}
            <div className="pt-2 border-t dark:border-gray-700 text-center text-xs text-gray-400 italic">
                Values shown include equipment bonuses.
            </div>
          </section>

          <section className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-sm border space-y-4">
            <h2 className="text-xl font-bold">Equipped Gear</h2>
            <div className="space-y-2">
                <EquipRow slotName="Main Hand" slotKey="mainHand" equippedId={char.equipment.mainHand} gameItems={gameItems} inventory={char.inventory} onUnequip={() => handleUnequip('mainHand')} />
                <EquipRow slotName="Off Hand" slotKey="offHand" equippedId={char.equipment.offHand} gameItems={gameItems} inventory={char.inventory} onUnequip={() => handleUnequip('offHand')} />
                <EquipRow slotName="Armor" slotKey="armor" equippedId={char.equipment.armor} gameItems={gameItems} inventory={char.inventory} onUnequip={() => handleUnequip('armor')} />
                <EquipRow slotName="Head" slotKey="head" equippedId={char.equipment.head} gameItems={gameItems} inventory={char.inventory} onUnequip={() => handleUnequip('head')} />
            </div>
          </section>
        </div>

        {/* RIGHT COL: INVENTORY */}
        <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 h-fit transition-colors">
          <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Backpack ({char.inventory.length})</h2>
              <Link 
                href="/shop" 
                className="text-xs bg-black text-white dark:bg-white dark:text-black px-3 py-1 rounded-lg hover:opacity-80 transition-opacity"
              >
                Visit Shop
              </Link>
          </div>
          
          <div className="grid grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {char.inventory.length === 0 && (
              <p className="col-span-2 text-gray-400 text-center py-8">Your bag is empty.</p>
            )}
            
            {char.inventory.map((item, index) => {
                const def = gameItems[item.itemId];
                if (!def) return null; 
                const isEquipped = Object.values(char.equipment).includes(item.instanceId);

                return (
                  <InventoryItemCard 
                    key={item.instanceId}
                    item={item}
                    def={def}
                    isEquipped={isEquipped}
                    index={index}
                    onEquip={handleEquip}
                    onUse={handleUse}
                    onSell={handleSell}
                  />
                );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}