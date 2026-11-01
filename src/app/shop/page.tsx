"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { 
  doc, getDoc, getDocs, collection, 
  updateDoc, increment, arrayUnion 
} from "firebase/firestore";
import { Character, GameItem, EncounterDoc } from "@/types/game";
import { useRouter, useSearchParams } from "next/navigation";
import { useAudio } from "@/context/AudioContext";
import Link from "next/link";

function ShopContent() {
  const { playTrack } = useAudio()!; 

  useEffect(() => {
    playTrack("/the-minstrels-return-loopable-fantasy-medieval-rpg-music-447849.mp3");
  }, [playTrack]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const encounterId = searchParams.get('encounterId');
  const locationIdParam = searchParams.get('locationId');

  const [user, setUser] = useState<User | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [items, setItems] = useState<GameItem[]>([]);
  const [encounter, setEncounter] = useState<EncounterDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [selectedItem, setSelectedItem] = useState<GameItem | null>(null);

  const returnMapUrl = locationIdParam 
    ? `/map?locationId=${locationIdParam}`
    : (encounter?.locationId ? `/map?locationId=${encounter.locationId}` : '/map');

  // Load User, Character, Encounter, and Items
  useEffect(() => {
    if (!encounterId) {
      router.replace("/map");
      return;
    }

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);

      const charRef = doc(db, "characters", u.uid);
      const charSnap = await getDoc(charRef);
      if (charSnap.exists()) {
        setCharacter(charSnap.data() as Character);
      }

      let activeEncounter: EncounterDoc | null = null;
      if (encounterId) {
        try {
          const encSnap = await getDoc(doc(db, "encounters", encounterId));
          if (encSnap.exists()) {
            activeEncounter = { ...encSnap.data(), id: encSnap.id } as EncounterDoc;
            setEncounter(activeEncounter);
          }
        } catch (err) {
          console.error("Error loading encounter:", err);
        }
      }

      const itemsSnap = await getDocs(collection(db, "items"));
      const loadedItems: GameItem[] = [];
      itemsSnap.forEach((d) => {
        const itemData = d.data() as GameItem;
        if (itemData.inShop !== false) {
          loadedItems.push(itemData);
        }
      });

      let finalItems = loadedItems;
      if (activeEncounter && Array.isArray(activeEncounter.shopItemIds) && activeEncounter.shopItemIds.length > 0) {
        const allowedSet = new Set(activeEncounter.shopItemIds);
        finalItems = loadedItems.filter(item => allowedSet.has(item.id));
      }
      setItems(finalItems);
      if (finalItems.length > 0) {
        setSelectedItem(finalItems[0]);
      }

      setLoading(false);
    });
    return () => unsub();
  }, [router, encounterId]);

  // Keep selectedItem valid if items change
  useEffect(() => {
    if (items.length > 0 && (!selectedItem || !items.some(i => i.id === selectedItem.id))) {
      setSelectedItem(items[0]);
    }
  }, [items, selectedItem]);

  // Buy Item Action
  const handleBuy = async (item: GameItem) => {
    if (!user || !character) return;
    if (character.gold < item.price) {
      setMsg("Insufficient gold");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    setMsg("Purchasing...");
    try {
      const charRef = doc(db, "characters", user.uid);
      const isWeapon = item.slot === "mainHand" || item.slot === "offHand" || item.type === "weapon";
      const newItem = {
        itemId: item.id,
        obtainedAt: Date.now(),
        instanceId: crypto.randomUUID(),
        ...(isWeapon && item.maxDurability ? { 
          durability: item.maxDurability, 
          maxDurability: item.maxDurability 
        } : {})
      };

      await updateDoc(charRef, {
        gold: increment(-item.price),
        inventory: arrayUnion(newItem)
      });

      setCharacter(prev => prev ? ({
        ...prev,
        gold: prev.gold - item.price,
        inventory: [...(prev.inventory || []), newItem]
      }) : null);

      setMsg(`Acquired ${item.name}`);
      setTimeout(() => setMsg(""), 2200);
    } catch (error) {
      console.error(error);
      setMsg("Purchase failed");
      setTimeout(() => setMsg(""), 2200);
    }
  };

  // Stat summary helper: clean, unboxed rows with no rainbow emojis
  const getItemStats = (item: GameItem) => {
    const s = item.stats || {};
    const list: { label: string; value: string }[] = [];

    if (s.a) list.push({ label: 'Stat A (Cubic)', value: `+${s.a}` });
    if (s.b) list.push({ label: 'Stat B (Quad)', value: `+${s.b}` });
    if (s.c) list.push({ label: 'Stat C (Linear)', value: `+${s.c}` });
    if (s.d) list.push({ label: 'Stat D (Flat)', value: `+${s.d}` });
    if (s.xBonus) list.push({ label: 'Variable Bonus', value: `X +${s.xBonus}` });
    if (s.damage?.mult) list.push({ label: 'Damage Bonus', value: `${s.damage.mult > 0 ? '+' : ''}${Math.round(s.damage.mult * 100)}%` });
    if (s.heal?.flat || s.heal?.mult) {
      const val = [s.heal?.flat ? `+${s.heal.flat} HP` : '', s.heal?.mult ? `(+${Math.round(s.heal.mult * 100)}%)` : ''].filter(Boolean).join(' ');
      list.push({ label: 'Health Restoration', value: val });
    }
    if (s.maxHp?.flat || s.maxHp?.mult) {
      const val = [s.maxHp?.flat ? `+${s.maxHp.flat}` : '', s.maxHp?.mult ? `(+${Math.round(s.maxHp.mult * 100)}%)` : ''].filter(Boolean).join(' ');
      list.push({ label: 'Max Health', value: `${val} HP` });
    }
    if (s.time?.flat || s.time?.mult) {
      const val = [s.time?.flat ? `+${s.time.flat}s` : '', s.time?.mult ? `(+${Math.round((s.time.mult > 1 ? s.time.mult - 1 : s.time.mult) * 100)}%)` : ''].filter(Boolean).join(' ');
      list.push({ label: 'Question Timer', value: val });
    }
    if ((item.slot === 'mainHand' || item.slot === 'offHand' || item.type === 'weapon') && item.maxDurability) {
      list.push({ label: 'Durability', value: `${item.maxDurability} uses` });
    }

    return list;
  };

  const selectedItemStats = useMemo(() => {
    return selectedItem ? getItemStats(selectedItem) : [];
  }, [selectedItem]);

  const canAffordSelected = character && selectedItem ? character.gold >= selectedItem.price : false;

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <span className="text-3xl animate-pulse">🏪</span>
          <span className="text-xs font-mono uppercase tracking-widest text-gray-400">Opening store...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full bg-gray-950 text-gray-100 overflow-x-hidden flex flex-col font-sans select-none">
      
      {/* =========================================================================
          BACKGROUND ART (Crisp & clearly visible with subtle edge scrim)
          ========================================================================= */}
      {encounter?.imageUrl ? (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <img
            src={encounter.imageUrl}
            alt={encounter.title || "Merchant Outpost"}
            className="w-full h-full object-cover object-center"
          />
          {/* Subtle directional scrim to preserve rich art contrast without muddying colors */}
          <div className="absolute inset-0 bg-gradient-to-tr from-gray-950/85 via-gray-950/40 to-transparent" />
        </div>
      ) : (
        <div className="fixed inset-0 pointer-events-none z-0 bg-gradient-to-b from-gray-900 to-gray-950" />
      )}

      {/* Floating Toast Notification */}
      {msg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-gray-900/95 text-amber-300 border border-amber-400/40 shadow-2xl text-xs font-mono font-bold tracking-wide animate-in fade-in duration-200">
          {msg}
        </div>
      )}

      {/* =========================================================================
          TOP BAR: Return Link, Store Name & Purse
          ========================================================================= */}
      <header className="relative z-20 flex items-center justify-between gap-4 px-4 sm:px-6 py-3 bg-gray-950/70 backdrop-blur-md border-b border-white/10 shrink-0">
        
        {/* Left: Return Link & Store Title */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={returnMapUrl}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-medium border border-white/10 transition-colors flex items-center gap-1 shrink-0"
          >
            <span>‹</span> Return to Location
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">{encounter?.emoji || "🏪"}</span>
            <h1 className="text-sm sm:text-base font-black tracking-tight text-white truncate">
              {encounter?.title || "Outpost Merchant"}
            </h1>
            <span className="text-gray-500 hidden sm:inline">·</span>
            <span className="text-xs text-gray-400 font-mono hidden sm:inline">
              {encounter?.shopGreeting || "Curated Expedition Wares"}
            </span>
          </div>
        </div>

        {/* Right: Gold Purse & Character Link */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="px-3 py-1 rounded-lg bg-black/60 border border-amber-400/30 text-amber-300 font-mono text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm">
            <span>🪙</span>
            <span>{character?.gold ?? 0}</span>
            <span className="text-[10px] text-amber-400/70 font-sans uppercase">Gold</span>
          </div>
          <Link
            href="/character"
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-medium border border-white/10 transition-colors"
          >
            🦉 Character
          </Link>
        </div>
      </header>

      {/* Empty Store State */}
      {items.length === 0 && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8 text-center">
          <p className="text-sm font-medium text-gray-400">The merchant currently has no wares in stock.</p>
          <Link href={returnMapUrl} className="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold text-white">
            ‹ Return to Location
          </Link>
        </div>
      )}

      {/* =========================================================================
          COMPACT GRID STORE (Option 3)
          Tight, space-efficient item slots on the left, full inspector card on the right.
          Atmospheric background art remains visible around the interface.
          ========================================================================= */}
      {items.length > 0 && (
        <div className="relative z-10 flex-1 flex flex-col md:flex-row p-4 sm:p-6 gap-6 max-w-6xl mx-auto w-full items-center justify-center">
          
          {/* Left: Compact Slots Grid Frame */}
          <div className="w-full md:w-[480px] bg-gray-950/85 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs font-mono text-gray-400 uppercase">
              <span>Merchant Wares</span>
              <span>{items.length} item(s)</span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-3 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
              {items.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                const canAfford = (character?.gold || 0) >= item.price;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-400/20 border-amber-400 text-white shadow-inner scale-[1.02]'
                        : 'bg-black/50 border-white/10 text-gray-300 hover:border-white/30 hover:bg-black/70'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-base">📦</span>
                        )}
                      </div>
                      <span className={`text-[10px] font-mono font-bold ${canAfford ? 'text-amber-300' : 'text-gray-500'}`}>
                        🪙 {item.price}
                      </span>
                    </div>
                    <p className="text-xs font-bold truncate text-white">{item.name}</p>
                    <p className="text-[10px] text-gray-400 uppercase truncate mt-0.5">{item.type}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Full Lore & Attribute Inspector */}
          {selectedItem && (
            <div className="w-full md:w-[380px] bg-gray-950/90 backdrop-blur-md rounded-2xl border border-amber-400/30 p-5 shadow-2xl flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                  <div className="w-14 h-14 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                    {selectedItem.imageUrl ? (
                      <img src={selectedItem.imageUrl} alt={selectedItem.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">📦</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-black text-white truncate">{selectedItem.name}</h2>
                    <p className="text-xs text-gray-400 uppercase font-mono mt-0.5">
                      {selectedItem.type} {selectedItem.slot ? `· Slot: ${selectedItem.slot}` : ''}
                    </p>
                    <p className="text-xs font-mono font-bold text-amber-300 mt-1">
                      🪙 {selectedItem.price} Gold
                    </p>
                  </div>
                </div>

                <p className="text-xs text-gray-300 italic leading-relaxed py-3 border-b border-white/10">
                  &ldquo;{selectedItem.description || "A fine crafted item ready for your journey."}&rdquo;
                </p>

                {selectedItemStats.length > 0 && (
                  <div className="space-y-1.5 pt-3">
                    <span className="text-[10px] uppercase font-mono text-gray-400 tracking-wider">Attributes:</span>
                    <div className="grid grid-cols-1 gap-1">
                      {selectedItemStats.map((st, i) => (
                        <div key={i} className="px-2 py-1 rounded bg-black/40 border border-white/10 text-xs flex justify-between">
                          <span className="text-gray-400">{st.label}</span>
                          <span className="font-mono font-bold text-amber-200">{st.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleBuy(selectedItem)}
                disabled={!canAffordSelected}
                className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  canAffordSelected
                    ? 'bg-amber-400 hover:bg-amber-300 text-gray-950 shadow-md active:scale-98'
                    : 'bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed'
                }`}
              >
                <span>🪙 {selectedItem.price} G</span>
                <span>{canAffordSelected ? '— Acquire Ware' : '— Not Enough Gold'}</span>
              </button>
            </div>
          )}
        </div>
      )}

    </main>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <span className="text-3xl animate-pulse">🏪</span>
          <span className="text-xs font-mono uppercase tracking-widest text-gray-400">Loading Store...</span>
        </div>
      </div>
    }>
      <ShopContent />
    </Suspense>
  );
}