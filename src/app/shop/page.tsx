"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { 
  doc, getDoc, getDocs, collection, 
  updateDoc, increment, arrayUnion, setDoc 
} from "firebase/firestore";
import { Character, GameItem } from "@/types/game";
import { useRouter } from "next/navigation";

export default function ShopPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [items, setItems] = useState<GameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // 1. Load User and Character
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);

      // Fetch Character to check Gold
      const charRef = doc(db, "characters", u.uid);
      const charSnap = await getDoc(charRef);
      if (charSnap.exists()) {
        setCharacter(charSnap.data() as Character);
      }

      // Fetch Items from the Shop
      const itemsSnap = await getDocs(collection(db, "items"));
      const loadedItems: GameItem[] = [];
      itemsSnap.forEach((doc) => {
          const itemData = doc.data() as GameItem;
          if (itemData.inShop !== false) {
              loadedItems.push(itemData);
          }
      });
      setItems(loadedItems);

      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  // 2. Function to Buy an Item
  const handleBuy = async (item: GameItem) => {
    if (!user || !character) return;
    if (character.gold < item.price) {
      setMsg("❌ Not enough gold!");
      return;
    }

    setMsg("Buying...");
    try {
      const charRef = doc(db, "characters", user.uid);
      
      // Create the inventory object
      const newItem = {
        itemId: item.id,
        obtainedAt: Date.now(),
        instanceId: crypto.randomUUID(),
        ...(item.maxDurability ? { 
            durability: item.maxDurability, 
            maxDurability: item.maxDurability 
        } : {})
      };

      await updateDoc(charRef, {
        gold: increment(-item.price),
        inventory: arrayUnion(newItem)
      });

      // Update local state so UI reflects changes immediately
      setCharacter(prev => prev ? ({
        ...prev,
        gold: prev.gold - item.price,
        inventory: [...(prev.inventory || []), newItem]
      }) : null);

      setMsg(`✅ Bought ${item.name}!`);
    } catch (error) {
      console.error(error);
      setMsg("❌ Error buying item.");
    }
  };

  // 3. Secret Admin Function to Seed the Database
  const restockShop = async () => {
    if(!confirm("This will overwrite/add default items to the database. Continue?")) return;
    
    const initialItems: GameItem[] = [
      {
        id: 'sword-wood',
        name: 'Wooden Sword',
        description: 'A basic practice sword.',
        type: 'weapon',
        slot: 'mainHand',
        price: 50,
        stats: { damage: { flat: 2 } },
        maxDurability: 50
      },
      {
        id: 'armor-cloth',
        name: 'Apprentice Robe',
        description: 'Offers minimal protection.',
        type: 'armor',
        slot: 'armor',
        price: 30,
        stats: { defense: { flat: 1 } },
        maxDurability: 50
      },
      {
        id: 'potion-small',
        name: 'Small Potion',
        description: 'Restores 10 HP.',
        type: 'potion',
        price: 15,
        stats: { heal: { flat: 10 } }
      },
      {
        id: 'shield-calc',
        name: 'Calculator Shield',
        description: 'Blocks attacks with logic.',
        type: 'armor',
        slot: 'offHand',
        price: 100,
        stats: { defense: { flat: 3 } },
        maxDurability: 50
      }
    ];

    try {
      for (const item of initialItems) {
        await setDoc(doc(db, "items", item.id), item);
      }
      alert("Shop restocked! Refresh the page.");
      window.location.reload();
    } catch (e) {
      alert("Error restocking shop.");
    }
  };

  if (loading) return <div className="p-8">Loading Shop...</div>;

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      <header className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-4xl font-bold">Item Shop</h1>
          <p className="text-gray-500">Spend your hard-earned gold!</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-yellow-600">
            🪙 {character ? character.gold : 0} G
          </div>
          <button onClick={() => router.push("/")} className="text-sm underline text-gray-400 hover:text-gray-600">
            Back to Map
          </button>
        </div>
      </header>

      {/* SHOP GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item) => {
           // Calculate dynamic visual things
           const canAfford = (character?.gold || 0) >= item.price;
           const isRare = item.price > 500; // Just an example logic for "shiny" items

           return (
            <div 
              key={item.id} 
              className={`
                relative flex flex-col justify-between
                p-5 bg-white rounded-2xl border shadow-sm transition-all duration-200
                hover:shadow-lg hover:-translate-y-1
                ${isRare ? 'border-yellow-200' : 'border-gray-200'}
              `}
            >
              {/* CONTENT WRAPPER */}
              <div>
                
                {/* 1. TOP ROW: Image + Name */}
                <div className="flex gap-4 mb-4">
                    {/* Image Box */}
                    <div className="w-12 h-12 bg-gray-50 rounded-xl border shrink-0 flex items-center justify-center overflow-hidden">
                        {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-3xl opacity-50">📦</span>
                        )}
                    </div>

                    {/* Title & Type */}
                    <div>
                        <h3 className="font-bold text-lg leading-tight">{item.name}</h3>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-wider rounded">
                            {item.type} {item.slot ? `• ${item.slot}` : ''}
                        </span>
                    </div>
                </div>

                {/* 2. STATS BADGES (Now before Description!) */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {/* DAMAGE */}
                    {(item.stats?.damage?.flat || item.stats?.damage?.mult) && (
                        <div className="px-2 py-1 bg-red-50 text-red-700 text-xs font-bold rounded flex items-center gap-1 border border-red-100">
                            <span>⚔️</span>
                            {item.stats.damage.flat ? `+${item.stats.damage.flat}` : ''}
                            {item.stats.damage.mult ? `x${item.stats.damage.mult}` : ''} Dmg
                        </div>
                    )}

                    {/* DEFENSE */}
                    {(item.stats?.defense?.flat || item.stats?.defense?.mult) && (
                        <div className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded flex items-center gap-1 border border-blue-100">
                            <span>🛡️</span>
                            {item.stats.defense.flat ? `+${item.stats.defense.flat}` : ''}
                            {item.stats.defense.mult ? `x${item.stats.defense.mult}` : ''} Def
                        </div>
                    )}

                    {/* HEAL (Restored!) */}
                    {item.stats?.heal?.flat && (
                        <div className="px-2 py-1 bg-green-50 text-green-700 text-xs font-bold rounded flex items-center gap-1 border border-green-100">
                            <span>❤️</span> +{item.stats.heal.flat} HP
                        </div>
                    )}

                    {/* TIME (Cleaner format) */}
                    {item.stats?.timeFactor && (
                        <div className="px-2 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded flex items-center gap-1 border border-purple-100">
                           <span>⏳</span> 
                           {item.stats.timeFactor > 1 ? "+" : ""}
                           {Math.round((item.stats.timeFactor - 1) * 100)}% Time
                        </div>
                    )}

                    {/* DURABILITY */}
                    {item.maxDurability && (
                        <div className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded flex items-center gap-1 border border-gray-200">
                            <span>🔨</span> {item.maxDurability} Dur
                        </div>
                    )}
                </div>

                {/* 3. DESCRIPTION (Now at the bottom) */}
                <p className="text-sm text-gray-500 italic mb-6 leading-relaxed border-t pt-3">
                  "{item.description || "A mysterious item found in the void..."}"
                </p>

              </div>

              {/* 4. BUY BUTTON (Sticks to bottom) */}
              <button
                onClick={() => handleBuy(item)}
                disabled={!canAfford}
                className={`w-full py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 ${
                  canAfford
                    ? "bg-black text-white hover:bg-gray-800 hover:shadow-md active:scale-95"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                <span>🪙 {item.price}</span>
                <span>{canAfford ? "Purchase" : "Too Expensive"}</span>
              </button>

            </div>
          );
        })}
      </div>

      {/* Empty Shop State */}
      {items.length === 0 && !loading && (
          <div className="text-center mt-20 opacity-50">
            <h2 className="text-2xl font-bold text-gray-400">Shop Closed</h2>
            <p>No items available right now.</p>
          </div>
      )}
    </main>
  );
}