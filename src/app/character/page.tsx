"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, increment } from "firebase/firestore";
import { GameItem, InventoryItem, Character } from "@/types/game";
import Link from "next/link";

export default function CharacterPage() {
  const [user, setUser] = useState<User | null>(null);
  const [char, setChar] = useState<Character | null>(null);
  const [gameItems, setGameItems] = useState<Record<string, GameItem>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setLoading(false); return; }
      setUser(u);

      // 1. Load Item Definitions
      const itemsMap: Record<string, GameItem> = {};
      try {
        const itemsSnap = await getDocs(collection(db, "items"));
        itemsSnap.forEach((doc) => { itemsMap[doc.id] = doc.data() as GameItem; });
        setGameItems(itemsMap);
      } catch (e) { console.error("Error loading items", e); }

      // 2. Load Character
      const charRef = doc(db, "characters", u.uid);
      const charSnap = await getDoc(charRef);
      if (charSnap.exists()) {
        setChar(charSnap.data() as Character);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // --- ACTIONS ---

  const handleEquip = async (item: InventoryItem) => {
    if (!char || !user) return;
    const def = gameItems[item.itemId];
    if (!def) return;

    // 1. Determine Slot
    let slot = def.slot;
    
    // 👇 FIX: Create a helper variable that forces the type to be a plain string
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

    // 2. Update Local State
    const newEquipment = { ...char.equipment, [slot]: item.instanceId };
    setChar({ ...char, equipment: newEquipment });

    // 3. Update Firebase
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

  // 💰 SELLING LOGIC
  const handleSell = async (item: InventoryItem) => {
    if (!char || !user) return;
    const def = gameItems[item.itemId];
    if (!def) return;

    // 1. Check Equipped
    const isEquipped = Object.values(char.equipment).includes(item.instanceId);
    if (isEquipped) {
        alert("🚫 You cannot sell an item that is currently equipped! Unequip it first.");
        return;
    }

    // 2. Check Broken Status
    const isBroken = (item.maxDurability || 0) > 0 && (item.durability || 0) <= 0;

    // 3. Calculate Price (Normal: 50% | Broken: 10% | Minimum: 1 Gold)
    const multiplier = isBroken ? 0.1 : 0.5;
    const sellPrice = Math.max(1, Math.ceil(def.price * multiplier));

    if (!confirm(`Sell ${def.name} for ${sellPrice} Gold?`)) return;

    // 4. Remove from Inventory
    const newInventory = char.inventory.filter(i => i.instanceId !== item.instanceId);
    
    // 5. Update State
    const newGold = (char.gold || 0) + sellPrice;
    
    setChar({ ...char, inventory: newInventory, gold: newGold });

    // 6. Update Firebase
    await updateDoc(doc(db, "characters", user.uid), {
        inventory: newInventory,
        gold: newGold
    });
    setMsg(`💰 Sold ${def.name} for ${sellPrice} G`);
  };

  // 🧪 USE / CONSUME LOGIC
  const handleUse = async (item: InventoryItem) => {
    if (!char || !user) return;
    const def = gameItems[item.itemId];
    if (!def) return;

    // A. RARE CANDY
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
        alert("✨ LEVEL UP! You feel stronger!");
        return;
    }

    // B. POTIONS
    if (def.type === 'potion') {
        // 1. Get Current HP (assume full if 'hp' is missing in DB)
        // We cast to 'any' just in case 'hp' isn't in your TS type definition yet
        const currentHp = (char as any).hp ?? char.maxHp;
        
        // 2. Check if damaged
        if (currentHp >= char.maxHp) {
            alert("❤️ Your health is already full! You don't need this yet.");
            return;
        }

        // 3. Apply Healing
        const healAmt = def.stats?.heal?.flat || 20;
        const newHp = Math.min(char.maxHp, currentHp + healAmt);

        if (!confirm(`Drink ${def.name} to heal ${healAmt} HP?`)) return;

        // 4. Consume Item
        const newInventory = char.inventory.filter(i => i.instanceId !== item.instanceId);
        
        // 5. Save Logic
        setChar({ ...char, inventory: newInventory, hp: newHp } as any);
        await updateDoc(doc(db, "characters", user.uid), {
            hp: newHp,
            inventory: newInventory
        });
        setMsg(`🧪 Gulp! Restored health to ${newHp}/${char.maxHp}`);
        return;
    }

    // C. EQUIP (Fallback logic if data is missing 'slot')
    // If it looks like gear, treat it as an Equip action
    if (["armor", "mainHand", "offHand", "head", "weapon", "shield"].includes(def.type) || def.slot) {
        handleEquip(item);
        return;
    }

    // D. MISC / TREASURE
    alert(`This is a ${def.name}. It can't be used, but maybe it's worth some gold?`);
  };

  // --- RENDERING ---

  if (loading) return <div className="p-10 text-center">Loading Character...</div>;
  if (!char) return <div className="p-10 text-center">No character found. <Link href="/create" className="underline">Create one?</Link></div>;

  const getStat = (type: 'damage' | 'defense') => {
    let total = type === 'damage' ? (char.baseDamage || 0) : (char.baseDefense || 0);

    Object.values(char.equipment).forEach(equippedInstanceId => {
        if (!equippedInstanceId) return;

        // 1. Find the specific item instance in inventory using unique ID
        const instance = char.inventory.find(i => i.instanceId === equippedInstanceId);
        if (!instance) return; // Item equipped but not found in bag? Skip.

        // 2. Get Definition
        const def = gameItems[instance.itemId];
        if (!def) return;
        
        // 3. Check Broken
        const isBroken = (instance.maxDurability || 0) > 0 && (instance.durability || 0) <= 0;

        // 4. Add Stats
        // We use (def.stats as any) to prevent the red squiggles you saw earlier
        if (!isBroken && (def.stats as any)?.[type]?.flat) {
            total += (def.stats as any)[type]!.flat!;
        }
    });
    return total;
  };

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

      {msg && <div className="bg-blue-50 text-blue-800 p-3 rounded-xl text-center font-bold animate-pulse">{msg}</div>}

      <div className="grid md:grid-cols-2 gap-8">
        
        {/* LEFT COL: STATS & GEAR */}
        <div className="space-y-6">
          <section className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-sm border space-y-4">
            <h2 className="text-xl font-bold">Stats</h2>
            <div className="grid grid-cols-2 gap-4">
               <StatBox 
                 label="Health" 
                 value={`${(char as any).hp ?? char.maxHp} / ${char.maxHp}`} 
                 icon="❤️" 
               />
               <StatBox 
                 label="XP Progress" 
                 value={`${char.xp} / ${Math.floor(100 * Math.pow(1.1, (char.level || 1) - 1))}`} 
                 icon="✨" 
               />
               <StatBox label="Attack" value={getStat('damage')} icon="⚔️" />
               <StatBox label="Defense" value={getStat('defense')} icon="🛡️" />
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
        <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-sm border h-fit">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Backpack ({char.inventory.length})</h2>
                <Link href="/shop" className="text-xs bg-black text-white px-3 py-1 rounded-lg hover:opacity-80">Visit Shop</Link>
            </div>
            
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
               {char.inventory.length === 0 && <p className="text-gray-400 text-center py-8">Your bag is empty.</p>}
               
               {char.inventory.map((item) => {
                   const def = gameItems[item.itemId];
                   if (!def) return null; 

                   // 1. Calculate Status First
                   const isEquipped = Object.values(char.equipment).includes(item.instanceId);
                   const isBroken = (item.maxDurability || 0) > 0 && (item.durability || 0) <= 0;
                   
                   // 2. Calculate Sell Price based on Status
                   const multiplier = isBroken ? 0.1 : 0.5;
                   const sellValue = Math.max(1, Math.ceil(def.price * multiplier));

                   // We treat def.type "as string" to stop TypeScript from complaining
                   const isGear = def.slot || ["armor", "head", "mainHand", "offHand", "weapon", "shield"].includes(def.type as string);

                   return (
                       // Added 'group' and 'relative' to container for hover logic
                       <div key={item.instanceId} className="group relative p-3 border rounded-xl hover:bg-gray-50 flex flex-col gap-2 transition-all">
                           
                           {/* 👇 NEW: HOVER TOOLTIP (Shows all stats) */}
                           <div className="hidden group-hover:block absolute z-50 bottom-full left-0 w-full mb-2 bg-gray-900 text-white text-xs p-3 rounded-xl shadow-xl pointer-events-none animate-in fade-in zoom-in duration-200">
                              <div className="font-bold border-b border-gray-600 pb-1 mb-1 text-gray-300 uppercase tracking-widest text-[10px]">Item Stats</div>
                              <div className="space-y-1">
                                 {def.stats?.damage?.flat && <div>⚔️ Attack Damage: <span className="text-blue-300 font-bold">+{def.stats.damage.flat}</span></div>}
                                 {def.stats?.defense?.flat && <div>🛡️ Defense: <span className="text-purple-300 font-bold">+{def.stats.defense.flat}</span></div>}
                                 {def.stats?.heal?.flat && <div>🧪 Restores: <span className="text-green-300 font-bold">{def.stats.heal.flat} HP</span></div>}
                                 {def.stats?.maxHp?.flat && <div>💚 Max HP: <span className="text-green-300 font-bold">+{def.stats.maxHp.flat}</span></div>}
                                 {def.stats?.time?.flat && <div>⏳ Time Bonus: <span className="text-yellow-300 font-bold">{def.stats.time.flat > 0 ? '+' : ''}{def.stats.time.flat}s</span></div>}
                                 
                                 {/* Fallback if no stats found */}
                                 {!def.stats && <div className="italic text-gray-500">No combat stats.</div>}
                              </div>
                              {/* Arrow pointing down */}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900"></div>
                           </div>

                           {/* EXISTING CARD CONTENT */}
                           <div className="flex justify-between items-start">
                               <div>
                                   <div className="font-bold text-sm">{def.name} {isEquipped && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded ml-1">EQUIPPED</span>}{isBroken && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded ml-1 font-bold">BROKEN</span>}</div>
                                   <div className="text-[10px] text-gray-500 uppercase">{def.type}</div>
                                    {item.maxDurability && (
                                      <div className="mt-2">
                                        <div className="flex justify-between items-center w-24 mb-0.5">
                                          <span className="text-[9px] font-bold text-gray-400">DURABILITY</span>
                                          <span className={`text-[9px] font-bold ${isBroken ? "text-red-500" : "text-gray-600"}`}>
                                            {item.durability}/{item.maxDurability}
                                          </span>
                                        </div>
                                        <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                          <div 
                                            className={isBroken ? "bg-red-500 h-full" : "bg-blue-500 h-full"} 
                                            style={{ width: `${((item.durability || 0) / item.maxDurability) * 100}%` }}
                                          ></div>
                                        </div>
                                      </div>
                                    )}
                               </div>
                               {def.imageUrl && <img src={def.imageUrl} className="w-10 h-10 rounded bg-gray-200 object-cover" />}
                           </div>

                           {/* BUTTONS (Existing Code) */}
                           <div className="flex gap-2 mt-1">
                              <button 
                                onClick={isGear ? () => handleEquip(item) : () => handleUse(item)}
                                disabled={isEquipped || (isGear && isBroken)}
                                className={`flex-1 py-1 text-xs rounded font-bold ${
                                  isEquipped || (isGear && isBroken)
                                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                }`}
                              >
                                {isEquipped ? "Equipped" : (isGear && isBroken ? "Needs Repair" : (isGear ? "Equip" : "Use"))}
                              </button>

                               <button 
                                 onClick={() => handleSell(item)}
                                 disabled={isEquipped}
                                 className={`px-3 py-1 text-xs rounded font-bold border ${
                                   isEquipped 
                                     ? "bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed"
                                     : "bg-red-50 text-red-600 border-red-100 hover:bg-red-100"
                                 }`}
                               >
                                 {isEquipped ? "In Use" : `Sell ${sellValue}G`}
                               </button>
                           </div>
                       </div>
                   );
               })}
            </div>
        </div>

      </div>
    </main>
  );
}

// COMPONENTS
function StatBox({ label, value, icon }: { label: string, value: string | number, icon: string }) {
  return (
    <div className="flex items-center gap-3 p-3 border rounded-xl bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
      <div className="text-xl">{icon}</div>
      <div>
        <div className="text-[10px] uppercase text-gray-500 dark:text-gray-400 font-bold">{label}</div>
        <div className="text-lg font-bold dark:text-gray-100">{value}</div>
      </div>
    </div>
  );
}

function EquipRow({ slotName, equippedId, gameItems, inventory, onUnequip }: any) {
  // 1. Find the specific Instance (using unique instanceId)
  const instance = equippedId && inventory 
      ? inventory.find((i: any) => i.instanceId === equippedId) 
      : null;

  // 2. Get Static Data (from the instance's itemId)
  const def = instance ? gameItems[instance.itemId] : null;
  const stats = def?.stats || {};
  
  // 3. Check Status
  const isBroken = instance && (instance.maxDurability || 0) > 0 && (instance.durability || 0) <= 0;
  const fmt = (val: number) => (val > 0 ? `+${val}` : `${val}`);

  const bgClass = isBroken 
    ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' 
    : 'bg-gray-50 dark:bg-gray-700 dark:border-gray-600';

  return (
    <div className={`flex justify-between items-center p-3 border rounded-xl ${isBroken ? 'bg-red-50 border-red-200' : 'bg-gray-50'}`}>
      <div className="flex items-center gap-3">
        <div className="text-[10px] font-bold bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded uppercase w-20 text-center text-gray-600 dark:text-gray-200">
          {slotName}
        </div>
        
        <div>
            <div className={`text-sm flex items-center gap-2 ${def ? "font-bold dark:text-gray-100" : "text-gray-400 dark:text-gray-500 italic"}`}>
               {def ? def.name : "Empty"}
               
               {def && !isBroken && (
                 <div className="flex gap-1 text-[10px] font-extrabold uppercase tracking-wide">
                    {/* Using 'as any' to fix your red lines */}
                    {(stats as any).damage?.flat && <span className="text-blue-600 dark:text-blue-400">{fmt((stats as any).damage.flat)} ⚔️</span>}
                    {(stats as any).defense?.flat && <span className="text-purple-600 dark:text-purple-400">{fmt((stats as any).defense.flat)} 🛡️</span>}
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