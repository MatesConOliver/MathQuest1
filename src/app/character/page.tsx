"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot, getDocs, collection, updateDoc, writeBatch } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Character, GameItem, CharacterStats } from "@/types/game";
import Link from "next/link";
import 'katex/dist/katex.min.css';
import { InlineMath } from 'react-katex';

// ... (helper components are defined below)

export default function CharacterPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [char, setChar] = useState<Character | null>(null);
  const [gameItems, setGameItems] = useState<Record<string, GameItem>>({});
  const [loading, setLoading] = useState(true);
  const [pendingUpgrades, setPendingUpgrades] = useState({ a: 0, b: 0, c: 0, d: 0 });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);
      
      const unsubChar = onSnapshot(doc(db, "characters", u.uid), (charSnap) => {
        if (charSnap.exists()) {
          setChar(charSnap.data() as Character);
        } else {
          // This case should ideally not be hit if character is created on signup
          console.log("No character data found for user.");
          router.push("/"); // Redirect to home, which should trigger character creation
        }
        setLoading(false);
      });
      
      return () => unsubChar();
    });

    return () => unsub();
  }, [router]);
  
  useEffect(() => {
    const fetchGameItems = async () => {
      const itemsSnapshot = await getDocs(collection(db, "items"));
      const items: Record<string, GameItem> = {};
      itemsSnapshot.forEach(doc => {
        items[doc.id] = { id: doc.id, ...doc.data() } as GameItem;
      });
      setGameItems(items);
    };
    
    fetchGameItems();
  }, []);

  const derivedStats = useMemo(() => {
    if (!char || !gameItems) return { a: 0, b: 0, c: 0, d: 0, maxHp: 0 };
    
    const base = char.stats;
    const equippedIds = char.equipment ? Object.values(char.equipment) : [];

    const fromEquipment = equippedIds.reduce((acc, instanceId) => {
        if (!instanceId) return acc;

        const inventoryItem = char.inventory?.find(i => i.instanceId === instanceId);
        if (!inventoryItem) return acc;

        const itemDef = gameItems[inventoryItem.itemId];
        if (!itemDef || !itemDef.stats) return acc;
        
        acc.a += itemDef.stats.a || 0;
        acc.b += itemDef.stats.b || 0;
        acc.c += itemDef.stats.c || 0;
        acc.d += itemDef.stats.d || 0;
        // Note: maxHp from equipment is not included here, handle separately if needed
        return acc;
    }, { a: 0, b: 0, c: 0, d: 0 });
    
    return {
      a: (base?.a || 0) + fromEquipment.a,
      b: (base?.b || 0) + fromEquipment.b,
      c: (base?.c || 0) + fromEquipment.c,
      d: (base?.d || 0) + fromEquipment.d,
      maxHp: char.maxHp // Placeholder for now
    };
  }, [char, gameItems]);

  const handlePendingChange = (stat: 'a' | 'b' | 'c' | 'd', delta: number) => {
    const totalPending = Object.values(pendingUpgrades).reduce((sum, val) => sum + val, 0);
    const unspentPoints = char?.unspentPoints || 0;

    if (delta > 0 && totalPending >= unspentPoints) return; // Cannot spend more than we have
    if (delta < 0 && pendingUpgrades[stat] <= 0) return; // Cannot go below zero

    setPendingUpgrades(prev => ({ ...prev, [stat]: prev[stat] + delta }));
  };

  const handleConfirmUpgrades = async () => {
    if (!user || !char) return;
    const totalCost = Object.values(pendingUpgrades).reduce((sum, v) => sum + v, 0);
    if (totalCost <= 0 || totalCost > (char.unspentPoints || 0)) return;
    
    setIsSaving(true);
    try {
      const charRef = doc(db, "characters", user.uid);
      await updateDoc(charRef, {
        "stats.a": (char.stats.a || 0) + pendingUpgrades.a,
        "stats.b": (char.stats.b || 0) + pendingUpgrades.b,
        "stats.c": (char.stats.c || 0) + pendingUpgrades.c,
        "stats.d": (char.stats.d || 0) + pendingUpgrades.d,
        "unspentPoints": (char.unspentPoints || 0) - totalCost
      });
      setPendingUpgrades({ a: 0, b: 0, c: 0, d: 0 });
    } catch (e) {
      console.error("Error saving upgrades:", e);
      alert("There was an issue saving your upgrades.");
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleUnequip = async (instanceId: string, slot: string) => {
      if (!user || !char || !instanceId) return;

      const charRef = doc(db, "characters", user.uid);
      
      try {
          await updateDoc(charRef, {
              [`equipment.${slot}`]: null
          });
      } catch (e) {
          console.error(`Error unequipping item from ${slot}:`, e);
          alert("Failed to unequip item.");
      }
  };
  
    const handleEquip = async (inventoryItemInstanceId: string) => {
        if (!user || !char || !gameItems) return;

        const itemInstance = char.inventory.find(i => i.instanceId === inventoryItemInstanceId);
        if (!itemInstance) return;

        const itemDef = gameItems[itemInstance.itemId];
        if (!itemDef || !itemDef.slot) return;

        const { slot } = itemDef;
        
        // Check if another item is already in that slot
        const currentItemInSlot = char.equipment[slot as keyof typeof char.equipment];
        
        const batch = writeBatch(db);
        const charRef = doc(db, "characters", user.uid);

        // Set the new item
        batch.update(charRef, { [`equipment.${slot}`]: inventoryItemInstanceId });
        
        try {
            await batch.commit();
        } catch (e) {
            console.error("Error equipping item:", e);
            alert("Failed to equip item.");
        }
    };


  if (loading || !char) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-400">Loading Character...</div>;
  }
  
  const totalPendingCost = Object.values(pendingUpgrades).reduce((sum, v) => sum + v, 0);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="text-blue-400 hover:text-blue-300 transition-colors">&larr; Back to Home</Link>

        {/* Header */}
        <div className="text-center my-6">
          <h1 className="text-4xl sm:text-5xl font-bold text-white">{char.name}</h1>
          <p className="text-lg text-gray-400">Level {char.level} {char.className}</p>
        </div>

        {/* Core Stats & Vitals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <StatCard title="Health" value={`${char.hp} / ${char.maxHp}`} color="text-green-400" />
            <StatCard title="Gold" value={char.gold} color="text-yellow-400" />
            <StatCard title="XP" value={`${char.xp} / 1000`} color="text-purple-400" />
        </div>
        
        {/* Equipment Section */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
          <h2 className="text-2xl font-semibold text-white mb-4">Equipment</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {char.equipment && Object.entries(char.equipment).map(([slot, instanceId]) => (
              <EquipRow 
                key={slot}
                slotName={slot}
                equippedId={instanceId}
                gameItems={gameItems}
                inventory={char.inventory}
                onUnequip={() => handleUnequip(instanceId as string, slot)}
              />
            ))}
          </div>
        </div>

        {/* Inventory Section */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Inventory</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {char.inventory && char.inventory.length > 0 ? (
                    char.inventory.map(invItem => (
                        <InventoryItemCard 
                            key={invItem.instanceId}
                            instance={invItem}
                            definition={gameItems[invItem.itemId]}
                            onEquip={handleEquip}
                            isEquipped={Object.values(char.equipment || {}).includes(invItem.instanceId)}
                        />
                    ))
                ) : (
                    <p className="text-gray-500 col-span-full">Your backpack is empty.</p>
                )}
            </div>
        </div>

        {/* Stat Upgrades Section */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-white">Coefficients</h2>
                <div className="text-right">
                    <p className="text-lg font-bold text-blue-400">
                        {((char.unspentPoints || 0) - totalPendingCost)} Points Available
                    </p>
                    {totalPendingCost > 0 && (
                        <button 
                            onClick={handleConfirmUpgrades}
                            disabled={isSaving}
                            className="mt-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-500 text-white font-bold py-2 px-4 rounded transition-colors"
                        >
                            {isSaving ? "Saving..." : `Confirm (+${totalPendingCost})`}
                        </button>
                    )}
                </div>
            </div>

            <p className="text-center text-gray-400 mb-6 text-lg">
                Your damage is determined by the primordial equation: <br />
                <span className="font-mono text-xl text-yellow-300 my-2 block">
                    <InlineMath math={`D(x) = ${round(derivedStats.a)}x^3 + ${round(derivedStats.b)}x^2 + ${round(derivedStats.c)}x + ${round(derivedStats.d)}`} />
                </span>
                Where <InlineMath math="x" /> is the question difficulty.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatUpgradeBox 
                    label="Complexity (a)" 
                    flavor="Boosts very high-difficulty questions. For true scholars."
                    value={derivedStats.a}
                    pending={pendingUpgrades.a}
                    locked={char.level < 50} 
                    unlockLevel={50}
                    canAfford={((char.unspentPoints || 0) - (pendingUpgrades.a + pendingUpgrades.b + pendingUpgrades.c + pendingUpgrades.d)) > 0}
                    onIncrement={() => handlePendingChange('a', 1)}
                    onDecrement={() => handlePendingChange('a', -1)}
                    color="text-red-600 dark:text-red-400"
                  />
                  <StatUpgradeBox 
                    label="Insight (b)" 
                    flavor="Greatly increases damage on difficult questions."
                    value={derivedStats.b}
                    pending={pendingUpgrades.b}
                    locked={char.level < 20} 
                    unlockLevel={20}
                    canAfford={((char.unspentPoints || 0) - (pendingUpgrades.a + pendingUpgrades.b + pendingUpgrades.c + pendingUpgrades.d)) > 0}
                    onIncrement={() => handlePendingChange('b', 1)}
                    onDecrement={() => handlePendingChange('b', -1)}
                    color="text-cyan-600 dark:text-cyan-400"
                  />
                  <StatUpgradeBox 
                    label="Knowledge (c)" 
                    flavor="A solid, reliable damage increase for all questions."
                    value={derivedStats.c}
                    pending={pendingUpgrades.c}
                    canAfford={((char.unspentPoints || 0) - (pendingUpgrades.a + pendingUpgrades.b + pendingUpgrades.c + pendingUpgrades.d)) > 0}
                    onIncrement={() => handlePendingChange('c', 1)}
                    onDecrement={() => handlePendingChange('c', -1)}
                    color="text-green-600 dark:text-green-400"
                  />
                  <StatUpgradeBox 
                    label="Foundation (d)" 
                    flavor="Increases base damage, ensuring you always hit."
                    value={derivedStats.d}
                    pending={pendingUpgrades.d}
                    canAfford={((char.unspentPoints || 0) - (pendingUpgrades.a + pendingUpgrades.b + pendingUpgrades.c + pendingUpgrades.d)) > 0}
                    onIncrement={() => handlePendingChange('d', 1)}
                    onDecrement={() => handlePendingChange('d', -1)}
                    color="text-gray-400"
                  />
            </div>
        </div>
      </div>
    </div>
  );
}


// ========== Helper Components ==========

function StatCard({ title, value, color }: { title: string, value: string | number, color?: string }) {
    return (
        <div className="bg-gray-800 p-4 rounded-lg text-center shadow">
            <p className="text-sm text-gray-400">{title}</p>
            <p className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</p>
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
  const fmt = (val: number) => (val > 0 ? \`+${val}\` : \`\${val}\`);

  return (
    <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-md">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gray-800 rounded-md flex items-center justify-center text-2xl">
          {def ? <img src={def.imageUrl} alt={def.name} className="w-full h-full object-cover rounded-md" /> : '❓'}
        </div>
        <div>
          <p className="font-bold capitalize text-white">{slotName.replace(/([A-Z])/g, ' $1')}</p>
          {def ? (
            <p className={`text-sm ${isBroken ? 'text-red-500' : 'text-gray-300'}`}>
              {def.name} {isBroken && "(Broken)"}
            </p>
          ) : (
            <p className="text-sm text-gray-500">- Empty -</p>
          )}
        </div>
      </div>
      {def && (
        <div className="text-right">
            <div className="text-xs text-gray-400">
              {stats.a ? \`A: \${fmt(stats.a)} \` : ''}
              {stats.b ? \`B: \${fmt(stats.b)} \` : ''}
              {stats.c ? \`C: \${fmt(stats.c)} \` : ''}
              {stats.d ? \`D: \${fmt(stats.d)}\` : ''}
            </div>
            <button onClick={onUnequip} className="text-xs text-red-400 hover:underline mt-1">
                Unequip
            </button>
        </div>
      )}
    </div>
  );
}

function InventoryItemCard({ instance, definition, onEquip, isEquipped }: any) {
    if (!definition) {
        return (
            <div className="bg-gray-700/50 p-2 rounded-md text-center text-xs text-red-500">
                Unknown Item
                <span className="block text-gray-500 truncate">{instance.itemId}</span>
            </div>
        );
    }
    
    const isBroken = (instance.maxDurability || 0) > 0 && (instance.durability || 0) <= 0;

    return (
        <div className={`border-2 rounded-lg relative overflow-hidden ${isEquipped ? 'border-blue-500' : 'border-gray-700'}`}>
            <div className="h-24 bg-gray-800 flex items-center justify-center">
                 <img src={definition.imageUrl} alt={definition.name} className="max-w-full max-h-full object-contain"/>
            </div>
            <div className="p-2 bg-gray-700/80">
                <p className={`font-bold text-sm truncate ${isBroken ? 'text-red-500' : 'text-white'}`}>{definition.name}</p>
                {definition.slot && !isEquipped && !isBroken && (
                    <button 
                        onClick={() => onEquip(instance.instanceId)}
                        className="w-full mt-1 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold py-1 rounded"
                    >
                        Equip
                    </button>
                )}
                 {isEquipped && (
                    <p className="text-xs text-center text-blue-400 mt-1 font-bold">Equipped</p>
                )}
                {isBroken && (
                    <p className="text-xs text-center text-red-500 mt-1 font-bold">Broken</p>
                )}
            </div>
        </div>
    );
}

const StatUpgradeBox = ({ label, flavor, value, pending, locked, unlockLevel, canAfford, onIncrement, onDecrement, color }: any) => {
  if (locked) {
    return (
      <div className="bg-gray-700/50 p-4 rounded-lg text-center opacity-60">
        <p className={`text-lg font-bold ${color}`}>{label}</p>
        <p className="text-xs text-gray-400 mt-1 mb-2 h-8">{flavor}</p>
        <p className="text-sm font-bold text-yellow-500">Unlocks at Level {unlockLevel}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-700/50 p-4 rounded-lg">
        <p className={`text-lg font-bold ${color}`}>{label}</p>
        <p className="text-xs text-gray-400 mt-1 mb-2 h-8">{flavor}</p>

        <div className="flex items-center justify-center gap-4">
            <button 
              onClick={onDecrement} 
              disabled={pending <= 0}
              className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-bold"
            >
                -
            </button>
            <div className="text-xl font-mono">
                <span className="text-white">{value - pending}</span>
                {pending > 0 && <span className="text-green-400"> +{pending}</span>}
            </div>
            <button 
              onClick={onIncrement} 
              disabled={!canAfford}
              className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-bold"
            >
                +
            </button>
        </div>
    </div>
  );
};


const round = (val: number, dp = 2) => {
    const multiplier = Math.pow(10, dp);
    return Math.round(val * multiplier) / multiplier;
}
