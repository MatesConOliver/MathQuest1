"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
// We import types, but we will also define a local version to ensure it matches strictly
import { GameItem, InventoryItem } from "@/types/game";

// 1. FIX: Update the Character type to include offHand
type Character = {
  ownerUid: string;
  name: string;
  className: string;
  level: number;
  xp: number;
  gold: number;
  maxHp: number;
  inventory: InventoryItem[];
  equipment: {
    mainHand: string | null;
    offHand: string | null; // <--- This was missing!
    armor: string | null;
    head: string | null;
  };
};

export default function CharacterPage() {
  const [user, setUser] = useState<User | null>(null);
  const [char, setChar] = useState<Character | null>(null);
  const [gameItems, setGameItems] = useState<Record<string, GameItem>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setLoading(false);
        return;
      }
      setUser(u);

      // Load Items Definitions
      const itemsMap: Record<string, GameItem> = {};
      const itemsSnap = await getDocs(collection(db, "items"));
      itemsSnap.forEach((doc) => {
        const item = doc.data() as GameItem;
        itemsMap[item.id] = item;
      });
      setGameItems(itemsMap);

      // Load Character
      const charRef = doc(db, "characters", u.uid);
      const charSnap = await getDoc(charRef);
      if (charSnap.exists()) {
        const data = charSnap.data() as Character;
        // Ensure offHand exists in the data even if DB is old
        if (!data.equipment.offHand) data.equipment.offHand = null;
        setChar(data);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // --- EQUIP LOGIC ---
  const handleEquip = async (invItem: InventoryItem) => {
    if (!char || !user) return;
    setMsg("Equipping...");

    const itemDef = gameItems[invItem.itemId];
    if (!itemDef || !itemDef.slot) {
      setMsg("❌ Cannot equip this.");
      return;
    }

    // 2. FIX: Tell TypeScript this string is definitely a key of equipment
    const targetSlot = itemDef.slot as keyof Character['equipment']; 

    const currentEquipId = char.equipment[targetSlot];

    let newInventory = char.inventory.filter((i) => i.instanceId !== invItem.instanceId);
    let newEquipment = { ...char.equipment };

    // Swap items if something is already there
    if (currentEquipId) {
      const oldItem: InventoryItem = {
        itemId: currentEquipId,
        obtainedAt: Date.now(),
        instanceId: crypto.randomUUID(),
      };
      newInventory.push(oldItem);
    }

    newEquipment[targetSlot] = invItem.itemId;

    try {
      const charRef = doc(db, "characters", user.uid);
      await updateDoc(charRef, {
        inventory: newInventory,
        equipment: newEquipment,
      });

      setChar({ ...char, inventory: newInventory, equipment: newEquipment });
      setMsg(`✅ Equipped ${itemDef.name}`);
    } catch (e) {
      console.error(e);
      setMsg("❌ Error saving.");
    }
  };

  // --- UNEQUIP LOGIC ---
  // 3. FIX: Use 'keyof Character["equipment"]' to allow any valid slot
  const handleUnequip = async (slot: keyof Character['equipment']) => {
    if (!char || !user) return;
    const itemId = char.equipment[slot];
    if (!itemId) return;

    setMsg("Unequipping...");

    const newItem: InventoryItem = {
      itemId: itemId,
      obtainedAt: Date.now(),
      instanceId: crypto.randomUUID(),
    };

    const newInventory = [...char.inventory, newItem];
    const newEquipment = { ...char.equipment, [slot]: null };

    try {
      const charRef = doc(db, "characters", user.uid);
      await updateDoc(charRef, {
        inventory: newInventory,
        equipment: newEquipment,
      });

      setChar({ ...char, inventory: newInventory, equipment: newEquipment });
      setMsg("✅ Unequipped");
    } catch (e) {
      setMsg("❌ Error unequipping");
    }
  };

  const getStats = () => {
    let damage = 0;
    let defense = 0;
    if (char) {
      // Loop over values safely
      Object.values(char.equipment).forEach((id) => {
        if (id && gameItems[id]) {
          damage += gameItems[id].stats?.damage || 0;
          defense += gameItems[id].stats?.defense || 0;
        }
      });
    }
    return { damage, defense };
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (!char) return <div className="p-8">No character found.</div>;

  const stats = getStats();

  return (
    <main className="min-h-screen p-6 flex flex-col items-center">
      <div className="w-full max-w-4xl space-y-4">
        
        {/* Header */}
        <header className="rounded-2xl border p-5 shadow-sm bg-white flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{char.name}</h1>
            <p className="text-sm opacity-70">{char.className} - Lvl {char.level}</p>
          </div>
          <div className="flex gap-2">
            <a href="/shop" className="bg-yellow-400 px-4 py-2 rounded-xl font-bold text-sm hover:bg-yellow-500">
              🛍️ Shop
            </a>
          </div>
        </header>

        {msg && <div className="text-center p-2 bg-blue-50 text-blue-800 rounded-lg">{msg}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          
          {/* Stats & Gear */}
          <div className="space-y-4">
            <section className="rounded-2xl border p-5 shadow-sm bg-white">
              <h2 className="font-semibold mb-3">Current Stats</h2>
              <div className="grid grid-cols-2 gap-3">
                <StatBox label="Attack" value={stats.damage} icon="⚔️" />
                <StatBox label="Defense" value={stats.defense} icon="🛡️" />
                <StatBox label="Gold" value={char.gold} icon="🪙" />
                <StatBox label="HP" value={char.maxHp} icon="❤️" />
              </div>
            </section>

            <section className="rounded-2xl border p-5 shadow-sm bg-white">
              <h2 className="font-semibold mb-3">Equipped Gear</h2>
              <div className="space-y-2">
                <EquipRow 
                  slotName="Main Hand" 
                  itemId={char.equipment.mainHand} 
                  gameItems={gameItems} 
                  onUnequip={() => handleUnequip('mainHand')} 
                />
                <EquipRow 
                  slotName="Off Hand" 
                  itemId={char.equipment.offHand} 
                  gameItems={gameItems} 
                  onUnequip={() => handleUnequip('offHand')} 
                />
                <EquipRow 
                  slotName="Armor" 
                  itemId={char.equipment.armor} 
                  gameItems={gameItems} 
                  onUnequip={() => handleUnequip('armor')} 
                />
                <EquipRow 
                  slotName="Head" 
                  itemId={char.equipment.head} 
                  gameItems={gameItems} 
                  onUnequip={() => handleUnequip('head')} 
                />
              </div>
            </section>
          </div>

          {/* Inventory */}
          <div className="space-y-4">
            <section className="rounded-2xl border p-5 shadow-sm bg-white min-h-[400px]">
              <h2 className="font-semibold mb-3">Backpack ({char.inventory.length})</h2>
              
              {char.inventory.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-10">Empty</p>
              ) : (
                <ul className="space-y-2">
                  {char.inventory.map((invItem) => {
                    const def = gameItems[invItem.itemId];
                    if (!def) return null;
                    
                    return (
                      <li key={invItem.instanceId} className="flex justify-between items-center p-3 border rounded-xl bg-gray-50">
                        <div>
                          <div className="font-bold text-sm">{def.name}</div>
                          <div className="text-xs text-gray-500">
                             {def.stats?.damage ? `+${def.stats.damage} Atk` : ""}
                             {def.stats?.defense ? `+${def.stats.defense} Def` : ""}
                             {def.type === 'potion' ? "Restores HP" : ""}
                          </div>
                        </div>
                        
                        {def.slot ? (
                          <button 
                            onClick={() => handleEquip(invItem)}
                            className="text-xs bg-black text-white px-3 py-1 rounded-lg hover:opacity-80"
                          >
                            Equip
                          </button>
                        ) : (
                          <button className="text-xs bg-gray-200 text-gray-500 px-3 py-1 rounded-lg">
                            Use
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

        </div>
      </div>
    </main>
  );
}

function StatBox({ label, value, icon }: { label: string, value: number, icon: string }) {
  return (
    <div className="flex items-center gap-3 p-3 border rounded-xl bg-gray-50">
      <div className="text-xl">{icon}</div>
      <div>
        <div className="text-xs uppercase text-gray-500 font-bold">{label}</div>
        <div className="text-lg font-bold">{value}</div>
      </div>
    </div>
  );
}

function EquipRow({ slotName, itemId, gameItems, onUnequip }: any) {
  const item = itemId ? gameItems[itemId] : null;

  return (
    <div className="flex justify-between items-center p-3 border rounded-xl">
      <div className="flex items-center gap-3">
        <div className="text-xs font-bold bg-gray-100 px-2 py-1 rounded uppercase w-20 text-center">
          {slotName}
        </div>
        <div className={`text-sm ${item ? "font-medium" : "text-gray-400 italic"}`}>
          {item ? item.name : "Empty"}
        </div>
      </div>
      
      {item && (
        <button 
          onClick={onUnequip}
          className="text-xs text-red-500 hover:text-red-700 underline"
        >
          Unequip
        </button>
      )}
    </div>
  );
}