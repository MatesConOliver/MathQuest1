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
      itemsSnap.forEach((doc) => loadedItems.push(doc.data() as GameItem));
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
        instanceId: crypto.randomUUID() // Unique ID for this specific item
      };

      await updateDoc(charRef, {
        gold: increment(-item.price),
        inventory: arrayUnion(newItem)
      });

      // Update local state so UI reflects changes immediately
      setCharacter(prev => prev ? ({
        ...prev,
        gold: prev.gold - item.price,
        inventory: [...prev.inventory, newItem]
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
        stats: { damage: 2 }
      },
      {
        id: 'armor-cloth',
        name: 'Apprentice Robe',
        description: 'Offers minimal protection.',
        type: 'armor',
        slot: 'armor',
        price: 30,
        stats: { defense: 1 }
      },
      {
        id: 'potion-small',
        name: 'Small Potion',
        description: 'Restores 10 HP.',
        type: 'potion',
        price: 15,
        stats: { heal: 10 }
      },
      {
        id: 'shield-calc',
        name: 'Calculator Shield',
        description: 'Blocks attacks with logic.',
        type: 'armor',
        slot: 'offHand',
        price: 100,
        stats: { defense: 3 }
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
    <main className="min-h-screen p-6 flex flex-col items-center">
      <div className="w-full max-w-4xl">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Item Shop</h1>
            <p className="text-gray-500">Spend your hard-earned gold here.</p>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-yellow-600">
              🪙 {character?.gold || 0} G
            </div>
            <a href="/character" className="text-sm underline text-gray-500 hover:text-black">
              ← Back to Character
            </a>
          </div>
        </header>

        {msg && (
          <div className="mb-4 p-3 bg-blue-50 text-blue-800 rounded-xl text-center font-medium">
            {msg}
          </div>
        )}

        {/* Shop Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="border rounded-2xl p-5 bg-white shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-lg">{item.name}</h3>
                  <span className="text-xs font-bold uppercase bg-gray-100 px-2 py-1 rounded">
                    {item.type}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-2">{item.description}</p>
                
                {/* Stats Display */}
                <div className="mt-3 text-sm text-gray-600">
                  {item.stats?.damage && <div>⚔️ Damage: +{item.stats.damage}</div>}
                  {item.stats?.defense && <div>🛡️ Defense: +{item.stats.defense}</div>}
                  {item.stats?.heal && <div>❤️ Heals: {item.stats.heal}</div>}
                </div>
              </div>

              <button
                onClick={() => handleBuy(item)}
                disabled={(character?.gold || 0) < item.price}
                className={`mt-4 w-full py-2 rounded-xl font-bold transition ${
                  (character?.gold || 0) >= item.price
                    ? "bg-black text-white hover:opacity-80"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                Buy for {item.price} G
              </button>
            </div>
          ))}
        </div>

        {/* Empty Shop State / Admin Seeder */}
        {items.length === 0 && (
          <div className="text-center mt-12 p-8 border-2 border-dashed rounded-2xl">
            <h2 className="text-xl font-bold text-gray-400">The shop is empty!</h2>
            <p className="text-gray-400 mb-4">No items found in database.</p>
            <button 
              onClick={restockShop}
              className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-600"
            >
              [Admin] Restock Default Items
            </button>
          </div>
        )}

      </div>
    </main>
  );
}