"use client";

import { useEffect, useState, useMemo } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot, updateDoc, collection, getDocs, increment } from "firebase/firestore";
import { GameItem, InventoryItem, Character } from "@/types/game";
import { useAudio } from "@/context/AudioContext";
import { BlockMath } from 'react-katex';
import Link from "next/link";
import { HealthBar } from "@/app/play/components/shared/Bars";

// --- COMPONENTS ---

// Durability Bar with exact Health Bar color palette & logic
function DurabilityBar({ current, max }: { current: number; max: number }) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (current / safeMax) * 100));
  const isBroken = current <= 0;

  // Exact health bar palette & logic: >50% green, 20-50% orange/yellow, <=20% red/pulsing, 0% dark red
  let colorClass = "bg-green-500";
  if (pct <= 50) colorClass = "bg-yellow-500";
  if (pct <= 20) colorClass = "bg-red-500 animate-pulse";
  if (isBroken) colorClass = "bg-red-700";

  return (
    <div className="w-full space-y-0.5">
      <div className="flex justify-between items-center text-[9px] font-bold">
        <span className="text-gray-500 dark:text-gray-400 uppercase tracking-tighter">Durability</span>
        <span className={isBroken ? "text-red-500 font-black animate-pulse" : "text-gray-700 dark:text-gray-300 font-mono"}>
          {current}/{max} {isBroken ? "• BROKEN" : ""}
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden border border-gray-300/40 dark:border-gray-600/40">
        <div 
          className={`h-full ${colorClass} transition-all duration-300`} 
          style={{ width: `${pct}%` }} 
        />
      </div>
    </div>
  );
}

// Hover Tooltip that shows all item stats cleanly (with correct percentage bonus calculations)
function ItemStatsTooltip({ def, isFirstRow }: { def: GameItem; isFirstRow?: boolean }) {
  const s = def.stats || {};
  return (
    <div className={`hidden group-hover:block absolute z-50 left-0 w-64 p-3 rounded-xl shadow-2xl pointer-events-none animate-in fade-in zoom-in duration-200 border border-white/20 bg-gray-900/95 dark:bg-black/95 text-white text-xs backdrop-blur-md ${
      isFirstRow ? "top-full mt-2" : "bottom-full mb-2"
    }`}>
      <div className="font-bold border-b border-gray-700 pb-1 mb-1.5 text-gray-300 uppercase tracking-widest text-[10px]">
        {def.name} Stats
      </div>
      <div className="space-y-1">
        {s.a && <div>🟥 Stat A: <span className="text-red-300 font-bold">+{s.a}</span></div>}
        {s.b && <div>🟧 Stat B: <span className="text-orange-300 font-bold">+{s.b}</span></div>}
        {s.c && <div>🟦 Stat C: <span className="text-blue-300 font-bold">+{s.c}</span></div>}
        {s.d && <div>🟩 Stat D: <span className="text-green-300 font-bold">+{s.d}</span></div>}
        {s.xBonus && <div>✖️ Difficulty (x): <span className="text-indigo-300 font-bold">+{s.xBonus}</span></div>}

        {s.damage?.mult && (
          <div>💥 Damage: <span className="text-purple-300 font-bold">
            {s.damage.mult > 1 ? `+${Math.round((s.damage.mult - 1) * 100)}%` : `${s.damage.mult > 0 ? '+' : ''}${Math.round(s.damage.mult * 100)}%`}
          </span></div>
        )}

        {s.maxHp?.flat && <div>❤️ Max HP: <span className="text-pink-300 font-bold">+{s.maxHp.flat}</span></div>}
        {s.maxHp?.mult && (
          <div>❤️ Max HP: <span className="text-pink-300 font-bold">
            +{Math.round((s.maxHp.mult > 1 ? s.maxHp.mult - 1 : s.maxHp.mult) * 100)}%
          </span></div>
        )}

        {s.heal?.flat && <div>🧪 Restores: <span className="text-green-300 font-bold">{s.heal.flat} HP</span></div>}
        {s.heal?.mult && (
          <div>🧪 Restores: <span className="text-green-300 font-bold">
            +{Math.round((s.heal.mult > 1 ? s.heal.mult - 1 : s.heal.mult) * 100)}% HP
          </span></div>
        )}

        {s.time?.flat && <div>⏳ Time: <span className="text-yellow-300 font-bold">+{s.time.flat}s</span></div>}
        {/* Fixed: 1.05 represents a +5% increase */}
        {s.time?.mult && (
          <div>⏳ Time: <span className="text-yellow-300 font-bold">
            +{Math.round((s.time.mult > 1 ? s.time.mult - 1 : s.time.mult) * 100)}%
          </span></div>
        )}

        {!def.stats && <div className="italic text-gray-400">No special stats.</div>}
      </div>
    </div>
  );
}

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
  const isGoldPouch = item.itemId === 'gift_gold_bounty' || !!item.customData?.goldAmount || !!def.goldValue;
  const goldAmount = item.customData?.goldAmount || def.goldValue || 100;
  const displayName = item.customData?.title || def.name;

  const isWeapon = def.slot === "mainHand" || def.slot === "offHand" || def.type === "weapon";
  const isBroken = isWeapon && (item.maxDurability || 0) > 0 && (item.durability || 0) <= 0;
  const isGear = def.slot || ["armor", "head", "mainHand", "offHand", "weapon", "shield"].includes(def.type as string);
  const isFirstRow = index < 2;

  // Sell Price: Usual = 50%, Broken = half of usual (25%)
  const usualSellPrice = Math.max(1, Math.ceil(def.price * 0.5));
  const sellValue = isBroken ? Math.max(1, Math.floor(usualSellPrice / 2)) : usualSellPrice;

  return (
    <div className={`group relative p-3 rounded-xl flex flex-col gap-2 transition-all ${
      isGoldPouch
        ? "bg-amber-50/80 border-2 border-amber-400 dark:bg-amber-950/40 dark:border-amber-500/70 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
        : isBroken 
        ? "bg-red-950/30 border-2 border-red-600/70 dark:bg-red-950/40 dark:border-red-600/80 shadow-[0_0_12px_rgba(220,38,38,0.25)]" 
        : "border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 hover:bg-gray-50 dark:hover:bg-gray-700/50"
    }`}>
      
      {/* HOVER TOOLTIP */}
      <ItemStatsTooltip def={def} isFirstRow={isFirstRow} />

      {/* CARD CONTENT */}
      <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">
                  {displayName} 
                  {isGoldPouch && <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 px-1.5 py-0.5 rounded ml-1 font-black border border-amber-300 dark:border-amber-700">GIFT</span>}
                  {isEquipped && <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1 rounded ml-1 border border-green-200 dark:border-green-800">EQUIPPED</span>}
                  {isBroken && <span className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-1 rounded ml-1 font-black border border-red-200 dark:border-red-800 animate-pulse">BROKEN</span>}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">
                {isGoldPouch ? `Consumable Gift (+${goldAmount} Gold)` : def.slot || (def.type as string)}
              </div>
              {item.customData?.reason && (
                <div className="mt-1.5 p-2 rounded-lg bg-amber-100/90 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60 text-[11px] text-amber-950 dark:text-amber-200 leading-snug shadow-inner">
                  <div className="font-black flex items-center gap-1 text-[9px] uppercase tracking-wider text-amber-800 dark:text-amber-400 mb-0.5">
                    <span>📜</span>
                    <span>Note from GM:</span>
                  </div>
                  <div className="italic break-words">&ldquo;{item.customData.reason}&rdquo;</div>
                </div>
              )}
                
              {isWeapon && item.maxDurability ? (
                <div className="mt-2 w-full max-w-[130px]">
                  <DurabilityBar current={item.durability || 0} max={item.maxDurability} />
                </div>
              ) : null}
          </div>
          {def.imageUrl ? (
            <img 
              src={def.imageUrl} 
              className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 object-cover shrink-0 border border-gray-300 dark:border-gray-600" 
              alt={displayName}
            />
          ) : isGoldPouch ? (
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-xl shrink-0 border border-amber-300">
              🎁
            </div>
          ) : null}
      </div>

      {/* BUTTONS */}
      <div className="flex gap-2 mt-auto pt-1">
          <button 
            onClick={isGear ? () => onEquip(item) : () => onUse(item)}
            disabled={isEquipped || (isGear && isBroken)}
            className={`flex-1 py-1.5 text-xs rounded-lg font-bold transition-all active:scale-95 ${
              isGoldPouch
                ? "bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black shadow-md"
                : isEquipped || (isGear && isBroken)
                ? "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed"
                : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
            }`}
          >
            {isGoldPouch
              ? `Open Pouch (+${goldAmount}G)`
              : isEquipped
              ? "Equipped"
              : isGear && isBroken
              ? "Needs Repair"
              : isGear
              ? "Equip"
              : "Use"}
          </button>

          {!isGoldPouch && (
            <button 
              onClick={() => onSell(item)}
              disabled={isEquipped}
              className={`px-3 py-1.5 text-xs rounded-lg font-bold border transition-colors ${
                isEquipped 
                  ? "bg-gray-100 text-gray-300 border-gray-200 dark:bg-gray-700 dark:text-gray-500 dark:border-gray-600 cursor-not-allowed"
                  : "bg-red-50 text-red-600 border-red-100 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/40 dark:hover:bg-red-900/40"
              }`}
            >
              {isEquipped ? "In Use" : `Sell ${sellValue}G`}
            </button>
          )}
      </div>
    </div>
  );
};

function StatUpgradeBox({ 
  label, flavor, value, pending, locked, unlockLevel, 
  canAfford, onIncrement, onDecrement, color 
}: any) {
  
  // Corrected logic to prevent double-counting
  const baseValue = value - pending;
  const isChanged = pending > 0;

  return (
    <div className={`p-3 border rounded-xl flex flex-col justify-between h-28 transition-all 
      ${locked 
        ? "opacity-50 bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700" 
        : "bg-white dark:bg-gray-700/30 border-gray-200 dark:border-gray-600 relative overflow-hidden"
      }`}>
      
      {/* Pending Indicator */}
      {isChanged && <div className="absolute top-0 right-0 w-8 h-8 bg-yellow-400/30 dark:bg-yellow-400/20 rounded-bl-full z-0"></div>}

      <div className="flex justify-between items-start z-10">
        <div>
           <span className="text-[10px] font-black uppercase tracking-tighter block text-gray-700 dark:text-gray-300">{label}</span>
           {/* THIS IS THE FLAVOR TEXT, NOW ADDED BACK IN */}
           <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">{flavor}</p>
        </div>
        
        <div className="text-right">
           <span className={`text-xl font-black ${color}`}>
             {baseValue}
             {isChanged && (
               <span className="text-green-500 ml-1">+{pending}</span>
             )}
           </span>
           {isChanged && <div className="text-[9px] text-green-600 dark:text-green-400 font-bold">Pending</div>}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 z-10">
        {locked ? (
           <div className="w-full text-center text-[10px] bg-gray-200 dark:bg-gray-800 rounded py-1 font-bold text-gray-500 dark:text-gray-400">UNLOCK AT LVL {unlockLevel}</div>
        ) : (
          <>
            <button 
              onClick={onDecrement} disabled={pending === 0}
              className="w-8 h-6 flex items-center justify-center bg-gray-200 dark:bg-gray-600 rounded text-gray-600 dark:text-gray-200 font-bold hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-30 transition-colors"
            >-</button>
            <button 
              onClick={onIncrement} disabled={!canAfford}
              className={`flex-1 h-6 flex items-center justify-center text-[10px] font-bold rounded transition-colors ${
                 !canAfford 
                   ? "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600" 
                   : "bg-black text-white dark:bg-white dark:text-black hover:opacity-80 shadow-md"
              }`}
            >
              UPGRADE
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Equipped Gear Row: Shows item image, slot, name, durability bar with health bar colors, and stats on hover only
function EquipRow({ slotName, slotKey, equippedId, gameItems, inventory, onUnequip }: any) {
  const instance = equippedId && inventory 
      ? inventory.find((i: any) => i.instanceId === equippedId) 
      : null;

  const def = instance ? gameItems[instance.itemId] : null;
  const isWeaponSlot = slotKey === "mainHand" || slotKey === "offHand";
  const isBroken = isWeaponSlot && instance && (instance.maxDurability || 0) > 0 && (instance.durability || 0) <= 0;

  const slotIcons: Record<string, string> = {
    mainHand: "⚔️",
    offHand: "🛡️",
    armor: "🥋",
    head: "👑",
  };

  return (
    <div className={`group relative flex items-center justify-between p-3 border rounded-xl transition-all ${
      isBroken 
        ? "bg-red-950/30 border-2 border-red-600/70 dark:bg-red-950/40 dark:border-red-600/80 shadow-[0_0_15px_rgba(220,38,38,0.25)]" 
        : "bg-white dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40"
    }`}>
      {/* HOVER TOOLTIP (Stats shown ONLY when hovering over equipped gear) */}
      {def && <ItemStatsTooltip def={def} />}

      {/* LEFT: IMAGE + SLOT + NAME + DURABILITY BAR */}
      <div className="flex items-center gap-3 flex-1 min-w-0 pr-3">
        {/* Item image or slot icon placeholder */}
        <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 shrink-0 flex items-center justify-center overflow-hidden shadow-inner">
          {def?.imageUrl ? (
            <img src={def.imageUrl} alt={def.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl opacity-50">{slotIcons[slotKey] || "📦"}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded uppercase tracking-wider text-gray-700 dark:text-gray-300">
              {slotName}
            </span>
            <span className={`text-xs sm:text-sm font-bold truncate ${def ? (isBroken ? "text-red-400 font-black" : "text-gray-900 dark:text-gray-100") : "text-gray-400 italic"}`}>
              {def ? def.name : "Empty"}
            </span>
          </div>

          {/* NO other stats displayed directly, ONLY durability bar for weapons */}
          {isWeaponSlot && instance && instance.maxDurability ? (
            <div className="mt-1.5 max-w-[180px]">
              <DurabilityBar current={instance.durability || 0} max={instance.maxDurability} />
            </div>
          ) : def ? (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 italic mt-0.5">
              Hover to view stats
            </div>
          ) : null}
        </div>
      </div>

      {/* UNEQUIP BUTTON */}
      {def && (
        <button 
          onClick={onUnequip} 
          className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-bold px-2.5 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors shrink-0"
        >
          Unequip
        </button>
      )}
    </div>
  );
}

const SkillCircle = ({
  name,
  value,
  color,
}: {
  name: string;
  value: number;
  color: string;
}) => {
  const glowIntensity = Math.min(value / 1000, 1);

  // Define HSL colors for easier programmatic manipulation
  const colorConfig: { [key: string]: { hsl: string } } = {
    red:    { hsl: '0, 84%, 60%' },    // approx. text-red-500
    green:  { hsl: '142, 71%, 45%' },  // approx. text-green-500
    blue:   { hsl: '217, 91%, 60%' },  // approx. text-blue-500
    yellow: { hsl: '48, 96%, 50%' },   // approx. text-yellow-500
    violet: { hsl: '255, 90%, 68%' },  // approx. text-violet-400
  };

  const { hsl } = colorConfig[color as keyof typeof colorConfig];

  // Dynamically calculate colors based on skill value
  const circleBgColor = `hsla(${hsl}, ${0.05 + glowIntensity * 0.2})`; // alpha from 5% -> 25%
  const borderColor   = `hsla(${hsl}, ${0.1 + glowIntensity * 0.3})`;   // alpha from 10% -> 40%
  const textColor     = `hsla(${hsl}, ${0.7 + glowIntensity * 0.3})`;   // lightness from 70% -> 100%
  const shadowColor   = `hsla(${hsl}, ${glowIntensity * 0.6})`;         // alpha from 0% -> 60%

  return (
    <div className="relative text-center flex flex-col items-center gap-2">
      <div
        className="relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500"
        style={{
          backgroundColor: circleBgColor,
          borderColor: borderColor,
          borderWidth: '2px',
          boxShadow: `0 0 18px 2px ${shadowColor}, inset 0 0 12px 1px hsla(${hsl}, 0.15)`,
        }}
      >
        <div className="z-10">
          <div
            className="font-black text-3xl"
            style={{
              color: textColor,
              textShadow: `0 0 8px hsla(0, 0%, 100%, ${0.3 * glowIntensity})`
            }}
          >
            {value}
          </div>
        </div>
        <div className="absolute -bottom-6 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
          {name}
        </div>
      </div>
    </div>
  );
};

// Computes the effective max HP (base + equipment bonuses) for a given equipment map,
// so we can diff "before" vs "after" equip/unequip and shift current HP by the same delta.
const calculateMaxHpForEquipment = (
  baseMaxHp: number,
  equipment: Character["equipment"] | undefined,
  inventory: InventoryItem[],
  gameItems: Record<string, GameItem>
) => {
  let hpFlat = baseMaxHp;
  let hpMult = 0;

  Object.values(equipment || {}).forEach((equippedInstanceId) => {
    if (!equippedInstanceId) return;
    const instance = inventory.find((i) => i.instanceId === equippedInstanceId);
    if (!instance) return;
    const def = gameItems[instance.itemId];
    if (!def || !def.stats) return;

    const isWeapon = def.slot === "mainHand" || def.slot === "offHand" || def.type === "weapon";
    const isBroken = isWeapon && (instance.maxDurability || 0) > 0 && (instance.durability || 0) <= 0;
    if (isBroken) return;

    if (def.stats.maxHp?.flat) hpFlat += def.stats.maxHp.flat;
    if (def.stats.maxHp?.mult) hpMult += def.stats.maxHp.mult;
  });

  return Math.floor(hpFlat * (1 + hpMult));
};

// --- MAIN PAGE ---

export default function CharacterPage() {
  const { playTrack, playSfx } = useAudio()!; 

  useEffect(() => {
    playTrack("/the-minstrels-return-loopable-fantasy-medieval-rpg-music-447849.mp3");
  }, [playTrack]);

  const [user, setUser] = useState<User | null>(null);
  const [char, setChar] = useState<Character | null>(null);
  const [gameItems, setGameItems] = useState<Record<string, GameItem>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [showFormula, setShowFormula] = useState(false);
  const [pendingUpgrades, setPendingUpgrades] = useState({ a: 0, b: 0, c: 0, d: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [previewX, setPreviewX] = useState(1);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setLoading(false);
        // Optional: redirect to login if you have a router setup
        // router.push('/login'); 
        return;
      }
      setUser(u);

      const unsubChar = onSnapshot(doc(db, "characters", u.uid), (charSnap) => {
        if (charSnap.exists()) {
          setChar(charSnap.data() as Character);
        } else {
          // This handles the case where the character document might not be created yet.
          console.log("Character document not found.");
        }
        setLoading(false);
      });

      return () => unsubChar();
    });

    // Separately load game items once.
    const fetchItems = async () => {
        const itemsMap: Record<string, GameItem> = {};
        try {
            const itemsSnap = await getDocs(collection(db, "items"));
            itemsSnap.forEach((doc) => { itemsMap[doc.id] = doc.data() as GameItem; });
            setGameItems(itemsMap);
        } catch (e) { console.error("Error loading items", e); }
    };
    fetchItems();

    return () => unsub();
  }, []);

  // --- STATS CALCULATION ---
  const derivedStats = useMemo(() => {
    // 1. SAFETY CHECK: Return safe defaults if data isn't loaded
    if (!char) return { 
        a: 0, b: 0, c: 0, d: 0, 
        k: 1, xBonus: 0, 
        maxHp: 0, 
        baseA: 0, baseB: 0, baseC: 0, baseD: 0,
        currentPower: 0, minPower: 0, maxPower: 0
    };

    // 2. Base Stats
    const baseA = char.stats?.a || 0;
    const baseB = char.stats?.b || 0;
    const baseC = char.stats?.c || 0;
    const baseD = char.stats?.d || 0;
    const baseHp = char.maxHp;

    // 3. Initialize Totals
    let totalA = baseA;
    let totalB = baseB;
    let totalC = baseC;
    let totalD = baseD;
    
    let totalXBonus = 0;
    let totalK = 1; 

    let hpFlat = baseHp;
    let hpMult = 0; 

    // 4. Loop Equipment (Your existing logic)
    Object.values(char.equipment || {}).forEach(equippedInstanceId => {
      if (!equippedInstanceId) return;
      const instance = char.inventory.find(i => i.instanceId === equippedInstanceId);
      if (!instance) return;
      const def = gameItems[instance.itemId];
      if (!def || !def.stats) return;

      const isWeapon = def.slot === "mainHand" || def.slot === "offHand" || def.type === "weapon";
      const isBroken = isWeapon && (instance.maxDurability || 0) > 0 && (instance.durability || 0) <= 0;
      if (isBroken) return;

      const s = def.stats;

      if (s.a) totalA += s.a;
      if (s.b) totalB += s.b;
      if (s.c) totalC += s.c;
      if (s.d) totalD += s.d;
      if (s.xBonus) totalXBonus += s.xBonus;

      if (s.damage?.mult) totalK += s.damage.mult;

      if (s.maxHp?.flat) hpFlat += s.maxHp.flat;
      if (s.maxHp?.mult) hpMult += s.maxHp.mult;
    });

    // 5. ADD PENDING UPGRADES (The new interactive part)
    const finalTotalA = totalA + pendingUpgrades.a;
    const finalTotalB = totalB + pendingUpgrades.b;
    const finalTotalC = totalC + pendingUpgrades.c;
    const finalTotalD = totalD + pendingUpgrades.d;

    // 6. Final Calculations
    const finalMaxHp = Math.floor(hpFlat * (1 + hpMult));

    // 7. Dynamic Power Function
    const calculatePower = (xVal: number) => {
      const termA = (finalTotalA / 400) * Math.pow(xVal, 3);
      const termB = (finalTotalB / 40) * Math.pow(xVal, 2);
      const termC = (1 + (finalTotalC / 10)) * xVal;
      const termD = (finalTotalD / 2);
      return totalK * (termA + termB + termC + termD);
    };

    return { 
        a: finalTotalA, baseA,
        b: finalTotalB, baseB,
        c: finalTotalC, baseC,
        d: finalTotalD, baseD,
        xBonus: totalXBonus,
        k: totalK,
        maxHp: finalMaxHp,
        currentPower: calculatePower(previewX),
        minPower: calculatePower(1),
        maxPower: calculatePower(15)
    };
  }, [char, gameItems, pendingUpgrades, previewX]);  

  // --- HANDLERS FOR STAT UPGRADES ---

  const handlePendingChange = (stat: 'a'|'b'|'c'|'d', delta: number) => {
    setPendingUpgrades(prev => {
      const newVal = prev[stat] + delta;
      const currentSpent = prev.a + prev.b + prev.c + prev.d;
      
      // Prevent negative pending or spending more than you have
      if (delta > 0 && currentSpent >= (char?.unspentPoints || 0)) return prev;
      if (newVal < 0) return prev;
      
      return { ...prev, [stat]: newVal };
    });
  };

  const commitUpgrades = async () => {
    if(!char || !user || isSaving) return; // Prevent multiple clicks
    
    const { a, b, c, d } = pendingUpgrades;
    const totalCost = a + b + c + d;
    
    if(totalCost === 0) return;
    if (totalCost > (char.unspentPoints || 0)) {
      setMsg("Not enough points.");
      return;
    }

    setIsSaving(true); // Disable the button immediately
    try {
      const charRef = doc(db, "characters", user.uid);
      
      await updateDoc(charRef, {
          "stats.a": increment(a),
          "stats.b": increment(b),
          "stats.c": increment(c),
          "stats.d": increment(d),
          "unspentPoints": increment(-totalCost)
      });
      
      setPendingUpgrades({ a:0, b:0, c:0, d:0 }); 
      setMsg("Stats Saved!");
      playSfx("/upgrade-sfx.mp3");

    } catch (error) {
      console.error("Error upgrading stats:", error);
      setMsg("Error saving stats.");
      setPendingUpgrades({ a:0, b:0, c:0, d:0 });
    } finally {
      setIsSaving(false); // Re-enable the button
    }
  };

  
  // --- HANDLERS ---

  // Diffs effective max HP before/after an equipment change and returns the HP the
  // character should end up with. Returns null if the player cancels a risky unequip.
  const resolveHpAfterEquipmentChange = (newEquipment: Character["equipment"]): number | null => {
    if (!char) return null;

    const oldMax = calculateMaxHpForEquipment(char.maxHp, char.equipment, char.inventory, gameItems);
    const newMax = calculateMaxHpForEquipment(char.maxHp, newEquipment, char.inventory, gameItems);
    const delta = newMax - oldMax;

    const currentHp = char.hp ?? char.maxHp;
    const proposedHp = currentHp + delta;

    if (proposedHp <= 0) {
      const confirmed = confirm(
        "Removing this item would drop your HP to 0 or below. Your HP will be set to 1 instead. Continue?"
      );
      if (!confirmed) return null;
      return 1;
    }

    return proposedHp;
  };

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
    const newHp = resolveHpAfterEquipmentChange(newEquipment);
    if (newHp === null) return;

    setChar({ ...char, equipment: newEquipment, hp: newHp });

    try {
        await updateDoc(doc(db, "characters", user.uid), {
            [`equipment.${slot}`]: item.instanceId,
            hp: newHp
        });
        setMsg(`⚔️ Equipped ${def.name}!`);
    } catch (e) { setMsg("Error equipping item."); }
  };

  const handleUnequip = async (slot: string) => {
    if (!char || !user) return;

    const newEquipment = { ...char.equipment, [slot as any]: null };
    const newHp = resolveHpAfterEquipmentChange(newEquipment);
    if (newHp === null) return;

    setChar({ ...char, equipment: newEquipment, hp: newHp });
    await updateDoc(doc(db, "characters", user.uid), { [`equipment.${slot}`]: null, hp: newHp });
    setMsg(`Un-equipped item from ${slot}.`);
  };

  const handleSell = async (item: InventoryItem) => {
    if (!char || !user) return;
    const def = gameItems[item.itemId];
    if (!def) return;

    const isEquipped = Object.values(char.equipment || {}).includes(item.instanceId);
    if (isEquipped) {
        setMsg("⚠️ Unequip this item first before selling.");
        setTimeout(() => setMsg(""), 2500);
        return;
    }

    // Broken objects are sellable for half of usual selling price (usual is 50%, broken is 25%)
    const isWeapon = def.slot === "mainHand" || def.slot === "offHand" || def.type === "weapon";
    const isBroken = isWeapon && (item.maxDurability || 0) > 0 && (item.durability || 0) <= 0;
    const usualSellPrice = Math.max(1, Math.ceil(def.price * 0.5));
    const sellPrice = isBroken ? Math.max(1, Math.floor(usualSellPrice / 2)) : usualSellPrice;

    const newInventory = char.inventory.filter(i => i.instanceId !== item.instanceId);
    const newGold = (char.gold || 0) + sellPrice;
    
    setChar({ ...char, inventory: newInventory, gold: newGold });

    await updateDoc(doc(db, "characters", user.uid), {
        inventory: newInventory,
        gold: newGold
    });

    playSfx("/item-sold.mp3");
    setMsg(`💰 Sold ${def.name}${isBroken ? ' (Broken)' : ''} for ${sellPrice} G!`);
    setTimeout(() => setMsg(""), 2500);
  };

  const handleUse = async (item: InventoryItem) => {
    if (!char || !user) return;
    const def = gameItems[item.itemId];

    // Gold Bounty Pouch / Gift Consumable
    if (item.itemId === 'gift_gold_bounty' || item.customData?.goldAmount || def?.goldValue) {
        const goldAmt = item.customData?.goldAmount || def?.goldValue || 100;
        const newGold = (char.gold || 0) + goldAmt;
        const newInventory = char.inventory.filter(i => (i.instanceId ? i.instanceId !== item.instanceId : i.itemId !== item.itemId));

        setChar({ ...char, gold: newGold, inventory: newInventory });
        await updateDoc(doc(db, "characters", user.uid), {
            gold: increment(goldAmt),
            inventory: newInventory
        });
        playSfx("/item-sold.mp3");
        const gmNote = item.customData?.reason ? ` • Note: "${item.customData.reason}"` : "";
        setMsg(`💰 Opened ${item.customData?.title || def?.name || "Gold Bounty Pouch"}! Claimed +${goldAmt} Gold!${gmNote}`);
        setTimeout(() => setMsg(""), 5000);
        return;
    }

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
        playSfx("/upgrade-sfx.mp3");
        setMsg("✨ LEVEL UP!");
        setTimeout(() => setMsg(""), 2500);
        return;
    }

    // Potion / Healing Consumable
    if (def.type === 'potion' || !!def.stats?.heal || def.name.toLowerCase().includes('potion')) {
        const currentHp = (char as any).hp ?? char.maxHp;
        const healFlat = def.stats?.heal?.flat || 0;
        const healMult = def.stats?.heal?.mult || 0;
        const healAmt = (healFlat > 0 || healMult > 0)
          ? Math.round(healFlat + (derivedStats.maxHp * (healMult > 1 ? healMult - 1 : healMult)))
          : 20;

        const newHp = Math.min(derivedStats.maxHp, currentHp + healAmt);

        const newInventory = char.inventory.filter(i => (i.instanceId ? i.instanceId !== item.instanceId : i.itemId !== item.itemId));
        setChar({ ...char, inventory: newInventory, hp: newHp } as any);
        await updateDoc(doc(db, "characters", user.uid), {
            hp: newHp,
            inventory: newInventory
        });
        playSfx("/potion-drink.mp3");
        setMsg(`🧪 Drank ${def.name}! Restored health to ${newHp}/${derivedStats.maxHp} HP`);
        setTimeout(() => setMsg(""), 3000);
        return;
    }

    // Fallback: Equip if it is gear
    if (["armor", "mainHand", "offHand", "head", "weapon", "shield"].includes(def.type) || def.slot) {
        handleEquip(item);
        return;
    }

    setMsg(`Cannot use ${def.name}.`);
    setTimeout(() => setMsg(""), 2000);
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
      <header className="flex justify-between items-end border-b border-gray-200 dark:border-gray-700 pb-4">
        <div>  
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-gray-900 dark:text-white">{char.name}</h1>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">• Level {char.level} •</div>
          </div>

          {/* XP BAR SECTION START */}
          {(() => {
            // 1. Calculate XP needed based on your formula
            const base = 3 * char.level * char.level - 3 * char.level + 1;
            // Math.max(0, ...) ensures we don't sqrt a negative number if level gets too high
            const modifier = Math.sqrt(Math.max(0, 1 - 0.005 * char.level)); 
            const nextLevelXp = Math.max(1, Math.floor(base * modifier));
            
            // 2. Calculate percentage for the bar width
            const xpPercent = Math.min(100, Math.max(0, (char.xp / nextLevelXp) * 100));

            return (
              <div className="w-full max-w-[220px] mt-1 group">
                <div className="flex justify-between items-center text-[10px] font-bold text-gray-600 dark:text-gray-300 mb-0.5 uppercase tracking-wide">
                  <span>XP Progress: </span>
                  <span className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {char.xp} / {nextLevelXp}
                  </span>
                </div>
                <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 dark:bg-indigo-400 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                    style={{ width: `${xpPercent}%` }}
                  />
                </div>
              </div>
            );
          })()}
          {/* XP BAR SECTION END */}

        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-500">🪙 {char.gold} G</div>
          <nav aria-label="Page navigation" className="flex flex-wrap justify-end gap-2">
            <Link href="/map" className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-bold text-gray-800 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700">🗺️ Map</Link>
            <Link href="/" className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-bold text-gray-800 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700">🏠 Main menu</Link>
          </nav>
        </div>
      </header>

      {/* STATUS MESSAGE POPUP */}
      {msg && <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 p-3 rounded-xl text-center font-bold animate-pulse border border-blue-200 dark:border-blue-800">{msg}</div>}

      <div className="grid md:grid-cols-2 gap-8">
        
        {/* LEFT COL: STATS & GEAR */}
        <div className="space-y-6">
          
          {/* NEW INTERACTIVE STATS SECTION */}
          <section className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-4 transition-colors">
            
            {/* Stats Header with Save Button */}
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Character Stats</h2>
                <div className="flex gap-2 items-center">
                   <div className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200 px-3 py-1 rounded-full text-xs font-bold border border-yellow-200 dark:border-yellow-700/50">
                      PTS: {(char.unspentPoints || 0) - (pendingUpgrades.a + pendingUpgrades.b + pendingUpgrades.c + pendingUpgrades.d)}
                   </div>
                   {(pendingUpgrades.a + pendingUpgrades.b + pendingUpgrades.c + pendingUpgrades.d) > 0 && (
                       <button 
                       onClick={commitUpgrades} 
                       disabled={isSaving}
                       className="bg-green-600 text-white dark:bg-green-500 dark:text-white text-xs px-3 py-1 rounded font-bold hover:bg-green-500 dark:hover:bg-green-400 shadow-lg disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors"
                     >
                       {isSaving ? "SAVING..." : "CONFIRM ✔"}
                     </button>
                   )}
                </div>
            </div>

            {/* STAT BOXES GRID */}
            <div className="grid grid-cols-2 gap-3">
              {/* 1. HEALTH BOX */}
              {(() => {
                  const currentHp = char.hp ?? char.maxHp;
                  const maxHp = derivedStats.maxHp;
                  
                  return (
                      <div className="p-3 border rounded-xl flex flex-col justify-between h-28 bg-white dark:bg-gray-700/30 border-gray-200 dark:border-gray-600">
                      <HealthBar label="Health" current={currentHp} max={maxHp} />
                      </div>
                  );
              })()}

              {/* 2. MULTIPLIER (K) BOX */}
              <div className="p-3 border rounded-xl flex flex-col justify-between h-28 bg-white dark:bg-gray-700/30 border-gray-200 dark:border-gray-600">
                  <span className="text-[10px] font-black uppercase tracking-tighter text-gray-500 dark:text-gray-400">Multiplier (k)</span>
                  <span className="text-xl font-black text-purple-600 dark:text-purple-400">
                      x{derivedStats.k.toFixed(2)}
                  </span>
                  <div className="mt-auto text-[9px] font-bold text-gray-600 dark:text-gray-300 text-right">
                      GEAR BONUS
                  </div>
              </div>
              <StatUpgradeBox 
                label="Mastery (a)" 
                flavor="Massively boosts damage on the hardest challenges."
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
                color="text-orange-600 dark:text-orange-400"
              />
              <StatUpgradeBox 
                label="Understanding (c)" 
                flavor="Improves your damage consistently on all questions."
                value={derivedStats.c} 
                pending={pendingUpgrades.c}
                locked={false}
                canAfford={((char.unspentPoints || 0) - (pendingUpgrades.a + pendingUpgrades.b + pendingUpgrades.c + pendingUpgrades.d)) > 0}
                onIncrement={() => handlePendingChange('c', 1)}
                onDecrement={() => handlePendingChange('c', -1)}
                color="text-blue-600 dark:text-blue-400"
              />
              <StatUpgradeBox 
                label="Focus (d)" 
                flavor="Increases the minimum damage you deal, especially on easy questions."
                value={derivedStats.d} 
                pending={pendingUpgrades.d}
                locked={false}
                canAfford={((char.unspentPoints || 0) - (pendingUpgrades.a + pendingUpgrades.b + pendingUpgrades.c + pendingUpgrades.d)) > 0}
                onIncrement={() => handlePendingChange('d', 1)}
                onDecrement={() => handlePendingChange('d', -1)}
                color="text-green-600 dark:text-green-400"
              />
            </div>
            
            {/* DAMAGE FORMULA TOGGLE & PREVIEW */}
            <div className="space-y-2">
              <button 
                onClick={() => setShowFormula(!showFormula)}
                className="w-full py-3 px-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl text-purple-700 dark:text-purple-300 text-xs font-bold flex justify-between items-center hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span>{showFormula ? "▼ HIDE" : "▶ VIEW"} DAMAGE FUNCTION</span>
                </div>
                <span className="font-mono text-sm bg-white dark:bg-black/50 px-2 py-1 rounded border border-purple-100 dark:border-purple-800">
                  {derivedStats.currentPower.toFixed(2)} Dmg
                </span>
              </button>

              {showFormula && (
                <div className="p-4 bg-gray-900 dark:bg-black text-gray-100 rounded-xl space-y-3 border border-transparent dark:border-gray-800 shadow-inner animate-in slide-in-from-top-2 fade-in duration-300">
                  <div className="text-center text-xs text-gray-400 mb-1 font-mono uppercase tracking-widest">Damage Formula</div>
                  
                  {/* Math Formula */}
                  <div className="text-[10px] md:text-xs overflow-x-auto text-center text-purple-300 py-2">
                      <BlockMath math="y = k \cdot [ \frac{a}{400}x^3 + \frac{b}{40}x^2 + (1 + \frac{c}{10})x + \frac{d}{2} ]" />
                  </div>
                  
                  {/* Slider and Results */}
                  <div className="border-t border-gray-700 dark:border-gray-800 pt-3 mt-3">
                      <div className="flex justify-between text-xs font-bold text-gray-400 mb-2">
                        <span>DIFFICULTY (x): <span className="text-purple-300 text-lg ml-2">{previewX} min</span></span>
                        <span>DAMAGE: <span className="text-white text-lg ml-2">{derivedStats.currentPower.toFixed(2)}</span></span>
                      </div>
                      
                      <input 
                        type="range" min="1" max="15" step="1" 
                        value={previewX} 
                        onChange={(e) => setPreviewX(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 dark:accent-purple-400"
                      />
                      
                      <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-300 mt-1 font-mono">
                        <span>x=1 (Trivial)</span>
                        <span>x=15 (VERY Hard)</span>
                      </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="pt-2 border-t border-gray-100 dark:border-gray-700 text-center text-xs text-gray-600 dark:text-gray-300 italic">
                Values shown include equipment bonuses.
            </div>
          </section>

          {/* EQUIPPED GEAR SECTION */}
          <section className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
            <h2 className="text-xl font-bold">Equipped Gear</h2>
            <div className="space-y-2">
            <EquipRow slotName="Main Hand" slotKey="mainHand" equippedId={char.equipment?.mainHand} gameItems={gameItems} inventory={char.inventory} onUnequip={() => handleUnequip('mainHand')} />
            <EquipRow slotName="Off Hand" slotKey="offHand" equippedId={char.equipment?.offHand} gameItems={gameItems} inventory={char.inventory} onUnequip={() => handleUnequip('offHand')} />
            <EquipRow slotName="Armor" slotKey="armor" equippedId={char.equipment?.armor} gameItems={gameItems} inventory={char.inventory} onUnequip={() => handleUnequip('armor')} />
            <EquipRow slotName="Head" slotKey="head" equippedId={char.equipment?.head} gameItems={gameItems} inventory={char.inventory} onUnequip={() => handleUnequip('head')} />
            </div>
          </section>
        </div>

        {/* RIGHT COL: SKILLS & BACKPACK */}
        <div className="space-y-6">

            {/* BACKPACK INVENTORY */}
            <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 h-fit transition-colors">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Backpack ({char.inventory.length})</h2>
                </div>
                
                <div className="grid grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {char.inventory.length === 0 && (
                    <p className="col-span-2 text-gray-600 dark:text-gray-300 text-center py-8">Your bag is empty.</p>
                    )}
                    
                    {char.inventory.map((item, index) => {
                        const def = gameItems[item.itemId];
                        if (!def) return null; 
                        const isEquipped = Object.values(char.equipment || {}).includes(item.instanceId);

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

            {/* SKILLS SECTION */}
            <section className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
                <h2 className="text-xl font-bold">Skills</h2>
                <div className="flex flex-wrap justify-around items-center gap-y-12 gap-x-4 pt-8">
                    <SkillCircle
                        name="Number and Algebra"
                        color="red"
                        value={char.skills?.algebra || 0}
                    />
                    <SkillCircle
                        name="Functions"
                        color="green"
                        value={char.skills?.functions || 0}
                    />
                    <SkillCircle
                        name="Geometry and Trigonometry"
                        color="blue"
                        value={char.skills?.geometry || 0}
                    />
                    <SkillCircle
                        name="Statistics and Probability"
                        color="yellow"
                        value={char.skills?.probabilityAndStatistics || 0}
                    />
                    <SkillCircle
                        name="Calculus"
                        color="violet"
                        value={char.skills?.calculus || 0}
                    />
                </div>
            </section>
        </div>
      </div>
    </main>
  );
}