"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { 
  doc, getDoc, getDocs, collection, 
  updateDoc, increment, arrayUnion 
} from "firebase/firestore";
import { Character, GameItem, EncounterDoc, InventoryItem } from "@/types/game";
import { useRouter, useSearchParams } from "next/navigation";
import { useAudio } from "@/context/AudioContext";
import Link from "next/link";
import { GameIcon } from "@/components/GameIcon";
import { compareStoreItems, getCategoryLabel, getCategoryIcon } from "@/lib/itemSorting";
import { ShoppingBag, Coins, Wrench, AlertTriangle, CheckCircle2, Shield, Sparkles } from "lucide-react";

type ShopTab = 'buy' | 'sell' | 'repair';

// Clean Durability Gauge component
function ShopDurabilityBar({ current, max }: { current: number; max: number }) {
  const safeMax = Math.max(1, max);
  const pct = Math.max(0, Math.min(100, Math.round((current / safeMax) * 100)));
  
  let barColor = "bg-green-500";
  let textColor = "text-green-400";
  if (current <= 0) {
    barColor = "bg-red-600 animate-pulse";
    textColor = "text-red-400 font-black";
  } else if (pct < 30) {
    barColor = "bg-red-500";
    textColor = "text-red-400";
  } else if (pct < 60) {
    barColor = "bg-amber-400";
    textColor = "text-amber-400";
  }

  return (
    <div className="w-full space-y-1">
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-gray-400 uppercase tracking-wider">Durability</span>
        <span className={textColor}>
          {current <= 0 ? "BROKEN (0)" : `${current} / ${safeMax} (${pct}%)`}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-black/60 border border-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ShopContent() {
  const { playTrack, playSfx } = useAudio()!; 

  useEffect(() => {
    playTrack("/the-minstrels-return-loopable-fantasy-medieval-rpg-music-447849.mp3");
  }, [playTrack]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const encounterId = searchParams.get('encounterId');
  const locationIdParam = searchParams.get('locationId');

  const [activeTab, setActiveTab] = useState<ShopTab>('buy');
  const [user, setUser] = useState<User | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [items, setItems] = useState<GameItem[]>([]);
  const [allItemsMap, setAllItemsMap] = useState<Record<string, GameItem>>({});
  const [encounter, setEncounter] = useState<EncounterDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Selection states
  const [selectedBuyItem, setSelectedBuyItem] = useState<GameItem | null>(null);
  const [selectedSellInstanceId, setSelectedSellInstanceId] = useState<string | null>(null);
  const [selectedRepairInstanceId, setSelectedRepairInstanceId] = useState<string | null>(null);

  const returnMapUrl = locationIdParam 
    ? `/map?locationId=${locationIdParam}`
    : (encounter?.locationId ? `/map?locationId=${encounter.locationId}` : '/map');

  // Load User, Character, Encounter, and ALL Items from Firestore
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
      const map: Record<string, GameItem> = {};
      const shopItems: GameItem[] = [];

      itemsSnap.forEach((d) => {
        const itemData = d.data() as GameItem;
        map[itemData.id] = itemData;
        if (itemData.inShop !== false) {
          shopItems.push(itemData);
        }
      });
      setAllItemsMap(map);

      let finalShopItems = shopItems;
      if (activeEncounter && Array.isArray(activeEncounter.shopItemIds) && activeEncounter.shopItemIds.length > 0) {
        const allowedSet = new Set(activeEncounter.shopItemIds);
        finalShopItems = shopItems.filter(item => allowedSet.has(item.id));
      }
      finalShopItems.sort(compareStoreItems);
      setItems(finalShopItems);
      if (finalShopItems.length > 0) {
        setSelectedBuyItem(finalShopItems[0]);
      }

      setLoading(false);
    });
    return () => unsub();
  }, [router, encounterId]);

  // Keep selectedBuyItem valid
  useEffect(() => {
    if (items.length > 0 && (!selectedBuyItem || !items.some(i => i.id === selectedBuyItem.id))) {
      setSelectedBuyItem(items[0]);
    }
  }, [items, selectedBuyItem]);

  // Inventory items with fallback definition resolution
  const inventoryList = useMemo(() => {
    return character?.inventory || [];
  }, [character?.inventory]);

  // Weapon & Durability Helpers
  const isWeapon = (def?: GameItem, inv?: InventoryItem) => {
    if (!def && !inv) return false;
    return (
      (inv?.maxDurability !== undefined && inv.maxDurability > 0) ||
      (def?.maxDurability !== undefined && def.maxDurability > 0) ||
      def?.slot === 'mainHand' ||
      def?.slot === 'offHand' ||
      def?.type === 'weapon'
    );
  };

  const isBroken = (inv: InventoryItem, def?: GameItem) => {
    const isWep = isWeapon(def, inv);
    const maxDur = inv.maxDurability ?? def?.maxDurability ?? 0;
    const curDur = inv.durability ?? maxDur;
    return isWep && maxDur > 0 && curDur <= 0;
  };

  // Pricing Formulas
  // Normal sell: 50% original price
  // Broken weapon sell: 10% original price (20% of 50% sell price)
  const getSellPrice = (inv: InventoryItem, def?: GameItem): number => {
    const basePrice = def?.price ?? def?.goldValue ?? 10;
    if (isBroken(inv, def)) {
      return Math.max(1, Math.floor(basePrice * 0.1));
    }
    return Math.max(1, Math.floor(basePrice * 0.5));
  };

  // Repair cost: 50% original price for weapons with >0 durability
  const getRepairCost = (def?: GameItem): number => {
    const basePrice = def?.price ?? def?.goldValue ?? 10;
    return Math.max(1, Math.ceil(basePrice * 0.5));
  };

  const isAchievementLogItem = (inv: InventoryItem, def?: GameItem) => {
    return (
      inv.itemId === 'achievement_log' ||
      def?.id === 'achievement_log' ||
      def?.name?.toLowerCase() === 'achievement log'
    );
  };

  // Sellable list: all inventory items EXCEPT non-sellable Achievement Log
  const sellableList = useMemo(() => {
    return inventoryList.filter(inv => {
      const def = allItemsMap[inv.itemId];
      return !isAchievementLogItem(inv, def);
    });
  }, [inventoryList, allItemsMap]);

  // Repairable list (weapons and items with durability)
  const repairableList = useMemo(() => {
    return inventoryList.filter(inv => {
      const def = allItemsMap[inv.itemId];
      return isWeapon(def, inv);
    });
  }, [inventoryList, allItemsMap]);

  // Keep selectedSellInstanceId valid
  useEffect(() => {
    if (sellableList.length > 0) {
      if (!selectedSellInstanceId || !sellableList.some(i => i.instanceId === selectedSellInstanceId)) {
        setSelectedSellInstanceId(sellableList[0].instanceId);
      }
    } else {
      setSelectedSellInstanceId(null);
    }
  }, [sellableList, selectedSellInstanceId]);

  // Keep selectedRepairInstanceId valid
  useEffect(() => {
    if (repairableList.length > 0) {
      if (!selectedRepairInstanceId || !repairableList.some(i => i.instanceId === selectedRepairInstanceId)) {
        setSelectedRepairInstanceId(repairableList[0].instanceId);
      }
    } else {
      setSelectedRepairInstanceId(null);
    }
  }, [repairableList, selectedRepairInstanceId]);

  // Selected sell item object
  const selectedSellItem = useMemo(() => {
    return sellableList.find(i => i.instanceId === selectedSellInstanceId) || null;
  }, [sellableList, selectedSellInstanceId]);

  // Selected repair item object
  const selectedRepairItem = useMemo(() => {
    return repairableList.find(i => i.instanceId === selectedRepairInstanceId) || null;
  }, [repairableList, selectedRepairInstanceId]);

  // Check if an instance is equipped
  const getEquippedSlot = (instanceId: string): string | null => {
    if (!character?.equipment) return null;
    for (const [slot, eqId] of Object.entries(character.equipment)) {
      if (eqId === instanceId) return slot;
    }
    return null;
  };

  // Stat summary helper
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
      list.push({ label: 'Max Durability', value: `${item.maxDurability} uses` });
    }

    return list;
  };

  // BUY ACTION
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
      const isWep = item.slot === "mainHand" || item.slot === "offHand" || item.type === "weapon";
      const newItem: InventoryItem = {
        itemId: item.id,
        obtainedAt: Date.now(),
        instanceId: crypto.randomUUID(),
        ...(isWep && item.maxDurability ? { 
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

      if (playSfx) playSfx("/item-sold.mp3");
      setMsg(`Acquired ${item.name}!`);
      setTimeout(() => setMsg(""), 2200);
    } catch (error) {
      console.error(error);
      setMsg("Purchase failed");
      setTimeout(() => setMsg(""), 2200);
    }
  };

  // SELL ACTION (Any item can be sold at any store!)
  const handleSell = async (invItem: InventoryItem) => {
    if (!user || !character) return;
    const def = allItemsMap[invItem.itemId];

    if (isAchievementLogItem(invItem, def)) {
      setMsg("The Achievement Log cannot be sold!");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    const sellPrice = getSellPrice(invItem, def);
    const itemName = def?.name || invItem.customData?.title || "Item";
    const broken = isBroken(invItem, def);

    setMsg(`Selling ${itemName}...`);
    try {
      const charRef = doc(db, "characters", user.uid);
      const updatedInventory = (character.inventory || []).filter(
        i => i.instanceId !== invItem.instanceId
      );

      // Unequip if equipped
      const updatedEquipment = { ...(character.equipment || {}) };
      let unequippedSlot: string | null = null;
      for (const [slot, id] of Object.entries(updatedEquipment)) {
        if (id === invItem.instanceId) {
          (updatedEquipment as any)[slot] = null;
          unequippedSlot = slot;
        }
      }

      await updateDoc(charRef, {
        gold: increment(sellPrice),
        inventory: updatedInventory,
        equipment: updatedEquipment
      });

      setCharacter(prev => prev ? ({
        ...prev,
        gold: prev.gold + sellPrice,
        inventory: updatedInventory,
        equipment: updatedEquipment
      }) : null);

      if (playSfx) playSfx("/item-sold.mp3");
      setMsg(`Sold ${itemName}${broken ? ' (Scrap)' : ''} for +${sellPrice} Gold${unequippedSlot ? ` (unequipped from ${unequippedSlot})` : ''}`);
      setTimeout(() => setMsg(""), 2500);
    } catch (error) {
      console.error(error);
      setMsg("Failed to sell item");
      setTimeout(() => setMsg(""), 2200);
    }
  };

  // REPAIR ACTION (50% original price, cannot repair 0 durability broken weapons)
  const handleRepair = async (invItem: InventoryItem) => {
    if (!user || !character) return;
    const def = allItemsMap[invItem.itemId];
    const broken = isBroken(invItem, def);

    if (broken) {
      setMsg("Broken weapons cannot be repaired! You can only sell them for scrap.");
      setTimeout(() => setMsg(""), 2500);
      return;
    }

    const maxDur = invItem.maxDurability || def?.maxDurability || 10;
    const curDur = invItem.durability ?? maxDur;
    if (curDur >= maxDur) {
      setMsg("This weapon is already at maximum durability.");
      setTimeout(() => setMsg(""), 2000);
      return;
    }

    const repairCost = getRepairCost(def);
    if (character.gold < repairCost) {
      setMsg("Insufficient gold for repairs.");
      setTimeout(() => setMsg(""), 2200);
      return;
    }

    setMsg("Smithing & repairing weapon...");
    try {
      const charRef = doc(db, "characters", user.uid);
      const updatedInventory = (character.inventory || []).map(i => {
        if (i.instanceId === invItem.instanceId) {
          return {
            ...i,
            durability: maxDur,
            maxDurability: maxDur
          };
        }
        return i;
      });

      await updateDoc(charRef, {
        gold: increment(-repairCost),
        inventory: updatedInventory
      });

      setCharacter(prev => prev ? ({
        ...prev,
        gold: prev.gold - repairCost,
        inventory: updatedInventory
      }) : null);

      if (playSfx) playSfx("/upgrade-sfx.mp3");
      setMsg(`Repaired ${def?.name || "weapon"} back to pristine condition!`);
      setTimeout(() => setMsg(""), 2500);
    } catch (error) {
      console.error(error);
      setMsg("Failed to repair item");
      setTimeout(() => setMsg(""), 2200);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <GameIcon name="shop" fallback="🏪" size="2xl" className="animate-pulse" />
          <span className="text-xs font-mono uppercase tracking-widest text-gray-400">Opening store...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full bg-gray-950 text-gray-100 overflow-x-hidden flex flex-col font-sans select-none">
      
      {/* BACKGROUND ART */}
      {encounter?.imageUrl ? (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <img
            src={encounter.imageUrl}
            alt={encounter.title || "Merchant Outpost"}
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-gray-950/85 via-gray-950/50 to-transparent" />
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

      {/* TOP BAR: Return Link, Store Name & Purse */}
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-gray-950/80 backdrop-blur-md border-b border-white/10 shrink-0">
        
        {/* Left: Return Link & Store Title */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={returnMapUrl}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-medium border border-white/10 transition-colors flex items-center gap-1 shrink-0"
          >
            <span>‹</span> Return to Location
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <GameIcon name="shop" fallback={encounter?.emoji || "🏪"} size="md" />
            <h1 className="text-sm sm:text-base font-black tracking-tight text-white truncate">
              {encounter?.title || "Outpost Merchant"}
            </h1>
            <span className="text-gray-500 hidden sm:inline">·</span>
            <span className="text-xs text-gray-400 font-mono hidden sm:inline">
              {encounter?.shopGreeting || "Expedition Merchant & Armory"}
            </span>
          </div>
        </div>

        {/* Right: Gold Purse & Character Link */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="px-3 py-1 rounded-lg bg-black/60 border border-amber-400/30 text-amber-300 font-mono text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm">
            <GameIcon name="gold" fallback="🪙" size="md" />
            <span>{character?.gold ?? 0}</span>
            <span className="text-[10px] text-amber-400/70 font-sans uppercase">Gold</span>
          </div>
          <Link
            href="/character"
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-medium border border-white/10 transition-colors flex items-center gap-2"
          >
            <GameIcon name="character" fallback="🦉" size="sm" /> Character
          </Link>
        </div>
      </header>

      {/* SHOP TABS NAVIGATION (BUY / SELL / REPAIR) */}
      <div className="relative z-20 max-w-6xl mx-auto w-full px-4 sm:px-6 pt-4 shrink-0">
        <div className="flex items-center gap-2 bg-gray-950/80 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shadow-lg">
          
          {/* 1. BUY TAB */}
          <button
            type="button"
            onClick={() => setActiveTab('buy')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-black transition-all ${
              activeTab === 'buy'
                ? 'bg-amber-400 text-gray-950 shadow-md scale-[1.01]'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span>Buy Wares</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${activeTab === 'buy' ? 'bg-black/20 text-gray-950 font-bold' : 'bg-white/10 text-gray-400'}`}>
              {items.length}
            </span>
          </button>

          {/* 2. SELL TAB */}
          <button
            type="button"
            onClick={() => setActiveTab('sell')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-black transition-all ${
              activeTab === 'sell'
                ? 'bg-emerald-400 text-gray-950 shadow-md scale-[1.01]'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <Coins className="w-4 h-4 shrink-0" />
            <span>Sell Items</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${activeTab === 'sell' ? 'bg-black/20 text-gray-950 font-bold' : 'bg-white/10 text-gray-400'}`}>
              {sellableList.length}
            </span>
          </button>

          {/* 3. REPAIR TAB */}
          <button
            type="button"
            onClick={() => setActiveTab('repair')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-black transition-all ${
              activeTab === 'repair'
                ? 'bg-indigo-400 text-gray-950 shadow-md scale-[1.01]'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <Wrench className="w-4 h-4 shrink-0" />
            <span>Repair Gear</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${activeTab === 'repair' ? 'bg-black/20 text-gray-950 font-bold' : 'bg-white/10 text-gray-400'}`}>
              {repairableList.length}
            </span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          TAB CONTENT 1: BUY WARES
          ========================================================================= */}
      {activeTab === 'buy' && (
        <div className="relative z-10 flex-1 flex flex-col md:flex-row p-4 sm:p-6 gap-6 max-w-6xl mx-auto w-full items-start justify-center">
          
          {items.length === 0 ? (
            <div className="w-full text-center py-16 bg-gray-950/80 rounded-2xl border border-white/10">
              <p className="text-sm font-medium text-gray-400">The merchant currently has no wares in stock.</p>
            </div>
          ) : (
            <>
              {/* Left: Compact Slots Grid Frame */}
              <div className="w-full md:w-[480px] bg-gray-950/85 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-2xl flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs font-mono text-gray-400 uppercase">
                  <span>Merchant Stock</span>
                  <span>{items.length} item(s) available</span>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-3 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
                  {items.map((item, idx) => {
                    const prevItem = idx > 0 ? items[idx - 1] : null;
                    const showCategoryHeader = !prevItem || prevItem.type !== item.type;
                    const isSelected = selectedBuyItem?.id === item.id;
                    const canAfford = (character?.gold || 0) >= item.price;
                    return (
                      <div key={item.id} className="contents">
                        {showCategoryHeader && (
                          <div className="col-span-full pt-3 pb-1 first:pt-0 flex items-center justify-between border-b border-white/10 text-[11px] font-mono font-bold tracking-wider text-amber-300 uppercase">
                            <span className="flex items-center gap-1.5">
                              <span>{getCategoryIcon(item.type)}</span>
                              <span>{getCategoryLabel(item.type)}</span>
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono lowercase">
                              ({items.filter(i => i.type === item.type).length})
                            </span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedBuyItem(item)}
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
                            <span className={`text-[10px] font-mono font-bold flex items-center gap-1 ${canAfford ? 'text-amber-300' : 'text-gray-500'}`}>
                              <GameIcon name="gold" fallback="🪙" size="sm" /> {item.price}
                            </span>
                          </div>
                          <p className="text-xs font-bold truncate text-white">{item.name}</p>
                          <p className="text-[10px] text-gray-400 uppercase truncate mt-0.5">
                            {item.type} {item.slot ? `· ${item.slot}` : ''}
                          </p>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Buy Inspector */}
              {selectedBuyItem && (
                <div className="w-full md:w-[380px] bg-gray-950/90 backdrop-blur-md rounded-2xl border border-amber-400/30 p-5 shadow-2xl flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                      <div className="w-14 h-14 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                        {selectedBuyItem.imageUrl ? (
                          <img src={selectedBuyItem.imageUrl} alt={selectedBuyItem.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl">📦</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-black text-white truncate">{selectedBuyItem.name}</h2>
                        <p className="text-xs text-gray-400 uppercase font-mono mt-0.5">
                          {selectedBuyItem.type} {selectedBuyItem.slot ? `· Slot: ${selectedBuyItem.slot}` : ''}
                        </p>
                        <p className="text-xs font-mono font-bold text-amber-300 mt-1 flex items-center gap-1.5">
                          <GameIcon name="gold" fallback="🪙" size="md" /> {selectedBuyItem.price} Gold
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-gray-300 italic leading-relaxed py-3 border-b border-white/10">
                      &ldquo;{selectedBuyItem.description || "A fine crafted item ready for your journey."}&rdquo;
                    </p>

                    {getItemStats(selectedBuyItem).length > 0 && (
                      <div className="space-y-1.5 pt-3">
                        <span className="text-[10px] uppercase font-mono text-gray-400 tracking-wider">Attributes:</span>
                        <div className="grid grid-cols-1 gap-1">
                          {getItemStats(selectedBuyItem).map((st, i) => (
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
                    onClick={() => handleBuy(selectedBuyItem)}
                    disabled={(character?.gold || 0) < selectedBuyItem.price}
                    className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                      (character?.gold || 0) >= selectedBuyItem.price
                        ? 'bg-amber-400 hover:bg-amber-300 text-gray-950 shadow-md active:scale-98'
                        : 'bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed'
                    }`}
                  >
                    <span className="flex items-center gap-1.5"><GameIcon name="gold" fallback="🪙" size="sm" /> {selectedBuyItem.price} G</span>
                    <span>{(character?.gold || 0) >= selectedBuyItem.price ? '— Acquire Ware' : '— Not Enough Gold'}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB CONTENT 2: SELL ITEMS (Any item can be sold at any store!)
          ========================================================================= */}
      {activeTab === 'sell' && (
        <div className="relative z-10 flex-1 flex flex-col md:flex-row p-4 sm:p-6 gap-6 max-w-6xl mx-auto w-full items-start justify-center">
          
          {sellableList.length === 0 ? (
            <div className="w-full text-center py-16 bg-gray-950/80 rounded-2xl border border-white/10 space-y-2">
              <Coins className="w-10 h-10 text-gray-500 mx-auto opacity-50" />
              <p className="text-sm font-bold text-gray-300">Your Inventory is Empty</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                You do not have any sellable items in your pack. Quest journals and permanent logs cannot be sold!
              </p>
            </div>
          ) : (
            <>
              {/* Left: Player Inventory Grid Frame */}
              <div className="w-full md:w-[480px] bg-gray-950/85 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-2xl flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs font-mono text-gray-400 uppercase">
                  <span>Your Inventory</span>
                  <span>{sellableList.length} item(s)</span>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-3 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
                  {sellableList.map((inv) => {
                    const def = allItemsMap[inv.itemId];
                    const isSelected = selectedSellInstanceId === inv.instanceId;
                    const equippedSlot = getEquippedSlot(inv.instanceId);
                    const broken = isBroken(inv, def);
                    const sellPrice = getSellPrice(inv, def);
                    const displayName = def?.name || inv.customData?.title || "Item";

                    return (
                      <button
                        key={inv.instanceId}
                        type="button"
                        onClick={() => setSelectedSellInstanceId(inv.instanceId)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between relative ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-inner scale-[1.02]'
                            : broken
                            ? 'bg-red-950/30 border-red-800/60 text-gray-300 hover:border-red-600'
                            : 'bg-black/50 border-white/10 text-gray-300 hover:border-white/30 hover:bg-black/70'
                        }`}
                      >
                        {/* Status Badges */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="w-8 h-8 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                            {def?.imageUrl ? (
                              <img src={def.imageUrl} alt={displayName} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-base">📦</span>
                            )}
                          </div>
                          <span className={`text-[10px] font-mono font-bold flex items-center gap-1 ${broken ? 'text-red-400' : 'text-emerald-300'}`}>
                            <GameIcon name="gold" fallback="🪙" size="sm" /> +{sellPrice}
                          </span>
                        </div>

                        <p className="text-xs font-bold truncate text-white">{displayName}</p>
                        
                        <div className="flex items-center justify-between gap-1 mt-1">
                          <span className="text-[9px] text-gray-400 uppercase truncate">
                            {def?.type || 'item'}
                          </span>
                          {equippedSlot ? (
                            <span className="text-[8px] font-black uppercase px-1 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-500/30">
                              Equipped
                            </span>
                          ) : broken ? (
                            <span className="text-[8px] font-black uppercase px-1 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-500/30">
                              Broken
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Sell Inspector */}
              {selectedSellItem && (
                (() => {
                  const def = allItemsMap[selectedSellItem.itemId];
                  const broken = isBroken(selectedSellItem, def);
                  const equippedSlot = getEquippedSlot(selectedSellItem.instanceId);
                  const sellPrice = getSellPrice(selectedSellItem, def);
                  const originalPrice = def?.price || def?.goldValue || 10;
                  const displayName = def?.name || selectedSellItem.customData?.title || "Item";

                  return (
                    <div className="w-full md:w-[380px] bg-gray-950/90 backdrop-blur-md rounded-2xl border border-emerald-400/30 p-5 shadow-2xl flex flex-col justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                          <div className="w-14 h-14 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                            {def?.imageUrl ? (
                              <img src={def.imageUrl} alt={displayName} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-2xl">📦</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <h2 className="text-base font-black text-white truncate">{displayName}</h2>
                            <p className="text-xs text-gray-400 uppercase font-mono mt-0.5">
                              {def?.type || 'item'} {def?.slot ? `· Slot: ${def.slot}` : ''}
                            </p>
                            <p className="text-xs font-mono font-bold text-emerald-300 mt-1 flex items-center gap-1.5">
                              <span>Pawn Value:</span>
                              <GameIcon name="gold" fallback="🪙" size="md" /> +{sellPrice} Gold
                            </p>
                          </div>
                        </div>

                        {/* Equipped Alert Banner */}
                        {equippedSlot && (
                          <div className="p-2.5 rounded-xl bg-blue-950/40 border border-blue-500/40 text-blue-300 text-xs flex items-center gap-2">
                            <Shield className="w-4 h-4 text-blue-400 shrink-0" />
                            <span>Currently equipped in <strong>{equippedSlot}</strong>. Selling will automatically unequip it.</span>
                          </div>
                        )}

                        {/* Broken Weapon Alert Banner */}
                        {broken && (
                          <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <div>
                              <strong>Broken Weapon (0 Durability):</strong> This weapon is shattered and cannot be repaired. Sold as scrap at <strong>10%</strong> original value (20% of standard sell price).
                            </div>
                          </div>
                        )}

                        {/* Pricing details */}
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-xs space-y-1">
                          <div className="flex justify-between text-gray-400">
                            <span>Original Store Price:</span>
                            <span className="font-mono text-gray-300">{originalPrice} G</span>
                          </div>
                          <div className="flex justify-between text-gray-400">
                            <span>Sell Rate:</span>
                            <span className="font-mono font-bold text-emerald-300">
                              {broken ? "10% (Scrap Value)" : "50% (Standard Wares)"}
                            </span>
                          </div>
                          <div className="flex justify-between text-white font-bold pt-1 border-t border-white/10">
                            <span>Gold Payout:</span>
                            <span className="font-mono text-emerald-300">+{sellPrice} G</span>
                          </div>
                        </div>

                        {/* Durability bar if applicable */}
                        {(selectedSellItem.maxDurability || def?.maxDurability) ? (
                          <div className="pt-1">
                            <ShopDurabilityBar
                              current={selectedSellItem.durability ?? selectedSellItem.maxDurability ?? 10}
                              max={selectedSellItem.maxDurability || def?.maxDurability || 10}
                            />
                          </div>
                        ) : null}

                        <p className="text-xs text-gray-300 italic leading-relaxed py-1">
                          &ldquo;{def?.description || "A possession carried in your journey."}&rdquo;
                        </p>
                      </div>

                      <button
                        onClick={() => handleSell(selectedSellItem)}
                        className="w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-emerald-400 hover:bg-emerald-300 text-gray-950 shadow-md active:scale-98 transition-all flex items-center justify-center gap-2"
                      >
                        <Coins className="w-4 h-4" />
                        <span>Sell Item (+{sellPrice} Gold)</span>
                      </button>
                    </div>
                  );
                })()
              )}
            </>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB CONTENT 3: REPAIR GEAR (Weapons & Durability Gear)
          ========================================================================= */}
      {activeTab === 'repair' && (
        <div className="relative z-10 flex-1 flex flex-col md:flex-row p-4 sm:p-6 gap-6 max-w-6xl mx-auto w-full items-start justify-center">
          
          {repairableList.length === 0 ? (
            <div className="w-full text-center py-16 bg-gray-950/80 rounded-2xl border border-white/10 space-y-2">
              <Wrench className="w-10 h-10 text-gray-500 mx-auto opacity-50" />
              <p className="text-sm font-bold text-gray-300">No Weapons to Repair</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                You don&apos;t have any weapons or durability gear in your pack. Weapons degrade during battle and can be brought here for smithing.
              </p>
            </div>
          ) : (
            <>
              {/* Left: Weapons List Frame */}
              <div className="w-full md:w-[480px] bg-gray-950/85 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-2xl flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs font-mono text-gray-400 uppercase">
                  <span>Armory & Weapons</span>
                  <span>{repairableList.length} weapon(s)</span>
                </div>
                
                <div className="space-y-2.5 pt-3 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
                  {repairableList.map((inv) => {
                    const def = allItemsMap[inv.itemId];
                    const isSelected = selectedRepairInstanceId === inv.instanceId;
                    const maxDur = inv.maxDurability || def?.maxDurability || 10;
                    const curDur = inv.durability ?? maxDur;
                    const broken = isBroken(inv, def);
                    const isPristine = curDur >= maxDur;
                    const repairCost = getRepairCost(def);
                    const displayName = def?.name || "Weapon";
                    const equippedSlot = getEquippedSlot(inv.instanceId);

                    return (
                      <button
                        key={inv.instanceId}
                        type="button"
                        onClick={() => setSelectedRepairInstanceId(inv.instanceId)}
                        className={`w-full p-3 rounded-xl border text-left transition-all flex items-center gap-3 relative ${
                          isSelected
                            ? 'bg-indigo-500/20 border-indigo-400 text-white shadow-inner scale-[1.01]'
                            : broken
                            ? 'bg-red-950/30 border-red-800/60 text-gray-300 hover:border-red-600'
                            : 'bg-black/50 border-white/10 text-gray-300 hover:border-white/30 hover:bg-black/70'
                        }`}
                      >
                        {/* Weapon image */}
                        <div className="w-11 h-11 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                          {def?.imageUrl ? (
                            <img src={def.imageUrl} alt={displayName} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl">⚔️</span>
                          )}
                        </div>

                        {/* Info & Durability Bar */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white truncate">{displayName}</span>
                            {equippedSlot && (
                              <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-500/30 shrink-0">
                                {equippedSlot}
                              </span>
                            )}
                          </div>

                          <div className="mt-1.5">
                            <ShopDurabilityBar current={curDur} max={maxDur} />
                          </div>
                        </div>

                        {/* Status / Cost Tag */}
                        <div className="shrink-0 text-right">
                          {broken ? (
                            <span className="text-[9px] font-black text-red-400 uppercase px-2 py-0.5 rounded bg-red-950/80 border border-red-500/40">
                              Broken
                            </span>
                          ) : isPristine ? (
                            <span className="text-[9px] font-bold text-green-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Pristine
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono font-bold text-amber-300 flex items-center gap-1">
                              <GameIcon name="gold" fallback="🪙" size="sm" /> {repairCost} G
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Repair Inspector */}
              {selectedRepairItem && (
                (() => {
                  const def = allItemsMap[selectedRepairItem.itemId];
                  const maxDur = selectedRepairItem.maxDurability || def?.maxDurability || 10;
                  const curDur = selectedRepairItem.durability ?? maxDur;
                  const broken = isBroken(selectedRepairItem, def);
                  const isPristine = curDur >= maxDur;
                  const repairCost = getRepairCost(def);
                  const canAfford = (character?.gold || 0) >= repairCost;
                  const originalPrice = def?.price || def?.goldValue || 10;
                  const scrapPrice = getSellPrice(selectedRepairItem, def);
                  const displayName = def?.name || "Weapon";

                  return (
                    <div className="w-full md:w-[380px] bg-gray-950/90 backdrop-blur-md rounded-2xl border border-indigo-400/30 p-5 shadow-2xl flex flex-col justify-between gap-4">
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                          <div className="w-14 h-14 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                            {def?.imageUrl ? (
                              <img src={def.imageUrl} alt={displayName} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-2xl">⚔️</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <h2 className="text-base font-black text-white truncate">{displayName}</h2>
                            <p className="text-xs text-gray-400 uppercase font-mono mt-0.5">
                              {def?.slot ? `Slot: ${def.slot}` : 'Weapon'}
                            </p>
                            <p className="text-xs font-mono font-bold text-indigo-300 mt-1 flex items-center gap-1.5">
                              <Wrench className="w-3.5 h-3.5" />
                              <span>{broken ? "Unrepairable" : isPristine ? "Full Durability" : `Repair: ${repairCost} Gold`}</span>
                            </p>
                          </div>
                        </div>

                        {/* Durability Meter */}
                        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
                          <ShopDurabilityBar current={curDur} max={maxDur} />
                        </div>

                        {/* Broken Weapon Case */}
                        {broken ? (
                          <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs space-y-2">
                            <div className="flex items-center gap-2 font-bold text-red-200">
                              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                              <span>Weapon Broken Beyond Repair</span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-red-300/90">
                              Weapons with 0 durability are completely shattered. Blacksmiths cannot reforge them. You may salvage it for <strong>10%</strong> of its original value (<strong>+{scrapPrice} Gold</strong>).
                            </p>
                          </div>
                        ) : isPristine ? (
                          <div className="p-3 rounded-xl bg-green-950/40 border border-green-500/40 text-green-300 text-xs flex items-center gap-2.5">
                            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                            <div>
                              <strong className="block text-green-200">Pristine Condition</strong>
                              <span className="text-[11px] text-green-300/80">This weapon does not need any repairs right now.</span>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-xs space-y-1.5">
                            <div className="flex justify-between text-gray-400">
                              <span>Original Weapon Cost:</span>
                              <span className="font-mono text-gray-300">{originalPrice} G</span>
                            </div>
                            <div className="flex justify-between text-gray-400">
                              <span>Repair Cost (50% of cost):</span>
                              <span className="font-mono font-bold text-amber-300">{repairCost} G</span>
                            </div>
                            <div className="flex justify-between text-gray-400">
                              <span>Your Gold:</span>
                              <span className="font-mono text-gray-300">{character?.gold ?? 0} G</span>
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-gray-300 italic leading-relaxed py-1">
                          &ldquo;{def?.description || "A trusty companion in battle."}&rdquo;
                        </p>
                      </div>

                      {/* Action Button */}
                      {broken ? (
                        <button
                          onClick={() => handleSell(selectedRepairItem)}
                          className="w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white shadow-md active:scale-98 transition-all flex items-center justify-center gap-2"
                        >
                          <Coins className="w-4 h-4" />
                          <span>Sell for Scrap (+{scrapPrice} Gold)</span>
                        </button>
                      ) : isPristine ? (
                        <button
                          disabled
                          className="w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Fully Repaired</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRepair(selectedRepairItem)}
                          disabled={!canAfford}
                          className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                            canAfford
                              ? 'bg-indigo-400 hover:bg-indigo-300 text-gray-950 shadow-md active:scale-98'
                              : 'bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed'
                          }`}
                        >
                          <Wrench className="w-4 h-4" />
                          <span>{canAfford ? `Repair to Full (${repairCost} Gold)` : 'Insufficient Gold for Repair'}</span>
                        </button>
                      )}
                    </div>
                  );
                })()
              )}
            </>
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
          <GameIcon name="shop" fallback="🏪" size="2xl" className="animate-pulse" />
          <span className="text-xs font-mono uppercase tracking-widest text-gray-400">Loading Store...</span>
        </div>
      </div>
    }>
      <ShopContent />
    </Suspense>
  );
}