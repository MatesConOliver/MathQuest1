"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc
} from "firebase/firestore";

import { GameItem, ItemType, EquipmentSlot } from "@/types/game";
import { Input } from "@/app/gm/components/Input";
import { AssetPickerModal } from "@/app/gm/components/AssetPickerModal";
import { Image as ImageIcon } from "lucide-react";
import {
  compareStoreItems,
  getSubGroupKey,
  getSubGroupTitle,
  getCategoryIcon,
  getSlotLabel
} from "@/lib/itemSorting";

const ITEM_TABS = [
  { id: "potion", label: "Potions", icon: "🧪" },
  { id: "weapon", label: "Weapons", icon: "⚔️" },
  { id: "armor", label: "Armor", icon: "🛡️" },
  { id: "misc", label: "Miscellaneous", icon: "📦" },
  { id: "all", label: "All Items", icon: "📋" },
] as const;

type ItemTabId = typeof ITEM_TABS[number]["id"];

export function ItemsPanel() {
    const [items, setItems] = useState<GameItem[]>([]);
    const [msg, setMsg] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<ItemTabId>("potion");
  
    // --- Form States ---
    const [id, setId] = useState("");
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [price, setPrice] = useState(10);
    const [type, setType] = useState<ItemType>("potion");
    const [slot, setSlot] = useState<EquipmentSlot>("mainHand");
    const [order, setOrder] = useState<number>(1);
    const [imageUrl, setImageUrl] = useState("");
    const [maxDurability, setMaxDurability] = useState<number | "">("");
  
    // 🟢 POLYNOMIAL STATS (A, B, C, D) + X Bonus
    const [valA, setValA] = useState<number | "">("");
    const [valB, setValB] = useState<number | "">("");
    const [valC, setValC] = useState<number | "">("");
    const [valD, setValD] = useState<number | "">("");
    const [valX, setValX] = useState<number | "">(""); // Difficulty Displacer
  
    // 🔴 GLOBAL DAMAGE MULTIPLIER (k)
    const [dmgMult, setDmgMult] = useState<number | "">(""); 
  
    // 🔵 UTILITY STATS (Heal, HP, Time)
    const [healFlat, setHealFlat] = useState<number | "">("");
    const [healMult, setHealMult] = useState<number | "">(""); // % Max HP
    
    const [maxHpFlat, setMaxHpFlat] = useState<number | "">("");
    const [maxHpMult, setMaxHpMult] = useState<number | "">("");
    
    const [timeFlat, setTimeFlat] = useState<number | "">("");
    const [timeMult, setTimeMult] = useState<number | "">("");
  
    useEffect(() => { loadItems(); }, []);
  
    async function loadItems() {
      const s = await getDocs(collection(db, "items"));
      setItems(s.docs.map(d => ({ ...d.data(), id: d.id } as GameItem)));
    }
  
    const tabFilteredItems = items.filter(item => {
      if (activeTab === "all") return true;
      return item.type === activeTab;
    });

    const visibleItems = tabFilteredItems
      .filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        item.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort(compareStoreItems);
  
    function resetForm() {
      setId("");
      setName("");
      setDesc("");
      setPrice(10);
      setType(activeTab !== "all" ? (activeTab as ItemType) : "potion");
      setSlot("mainHand");
      setOrder(1);
      setImageUrl("");
      setMaxDurability("");
      // Reset Stats
      setValA(""); setValB(""); setValC(""); setValD(""); setValX(""); setDmgMult("");
      setHealFlat(""); setHealMult("");
      setMaxHpFlat(""); setMaxHpMult(""); 
      setTimeFlat(""); setTimeMult("");
      setMsg("");
    }
  
    function loadItemToEdit(item: GameItem) {
      setId(item.id);
      setName(item.name);
      setDesc(item.description || ""); 
      setPrice(item.price || 0);
      setType(item.type);
      setSlot(item.slot || "mainHand");
      setOrder(typeof item.order === "number" && !isNaN(item.order) ? item.order : 1);
      setImageUrl(item.imageUrl || "");
      setMaxDurability(item.maxDurability || "");
  
      // 🟢 Load Poly Stats (Supports negatives)
      setValA(item.stats?.a ?? "");
      setValB(item.stats?.b ?? "");
      setValC(item.stats?.c ?? "");
      setValD(item.stats?.d ?? "");
      setValX(item.stats?.xBonus ?? "");
      
      // 🔴 Load Damage Multiplier
      setDmgMult(item.stats?.damage?.mult ?? "");
  
      // 🔵 Load Utility
      setHealFlat(item.stats?.heal?.flat ?? "");
      setHealMult(item.stats?.heal?.mult ?? "");
  
      setMaxHpFlat(item.stats?.maxHp?.flat ?? "");
      setMaxHpMult(item.stats?.maxHp?.mult ?? "");
      
      setTimeFlat(item.stats?.time?.flat ?? "");
      setTimeMult(item.stats?.time?.mult ?? "");
  
      setMsg(`✏️ Editing: ${item.name}`);
    }
  
    const handleSave = async () => {
      if (!id || !name) { setMsg("❌ ID & Name required"); return; }
      try {
        const statsObj: any = {};
  
        // Poly Stats
        if (valA !== "") statsObj.a = Number(valA);
        if (valB !== "") statsObj.b = Number(valB);
        if (valC !== "") statsObj.c = Number(valC);
        if (valD !== "") statsObj.d = Number(valD);
        if (valX !== "") statsObj.xBonus = Number(valX);
  
        // Damage Multiplier
        if (dmgMult !== "") statsObj.damage = { mult: Number(dmgMult) };
  
        // Utility - HP
        if (maxHpFlat !== "" || maxHpMult !== "") {
          statsObj.maxHp = {};
          if (maxHpFlat !== "") statsObj.maxHp.flat = Number(maxHpFlat);
          if (maxHpMult !== "") statsObj.maxHp.mult = Number(maxHpMult);
        }
  
        // Utility - Heal
        if (healFlat !== "" || healMult !== "") {
          statsObj.heal = {};
          if (healFlat !== "") statsObj.heal.flat = Number(healFlat);
          if (healMult !== "") statsObj.heal.mult = Number(healMult);
        }
  
        // Utility - Time
        if (timeFlat !== "" || timeMult !== "") {
          statsObj.time = {};
          if (timeFlat !== "") statsObj.time.flat = Number(timeFlat);
          if (timeMult !== "") statsObj.time.mult = Number(timeMult);
        }
  
        const safeOrder = typeof order === "number" && !isNaN(order) && order > 0 
          ? Math.floor(order) 
          : 1;

        const baseItem: any = {
          id,
          name,
          description: desc,
          price: Number(price),
          type,
          order: safeOrder,
          imageUrl: imageUrl || `https://placehold.co/100?text=${name.charAt(0)}`,
          stats: statsObj
        };
  
        if (type !== 'potion' && type !== 'misc') baseItem.slot = slot;
        if (maxDurability) baseItem.maxDurability = Number(maxDurability);
  
        await setDoc(doc(db, "items", id), baseItem);
        setMsg(`✅ Saved Item: ${name} (Order: ${safeOrder})`);
        loadItems();
      } catch (e: any) { setMsg("Error: " + e.message); }
    };
  
    async function deleteItem(itemId: string) {
      if (!confirm("Permanently delete this item?")) return;
      try {
        await deleteDoc(doc(db, "items", itemId));
        setMsg("🗑️ Item deleted.");
        if (id === itemId) resetForm();
        loadItems();
      } catch (e: any) { setMsg("Error: " + e.message); }
    }
  
    const isEditing = id && items.some(i => i.id === id);
  
    return (
      <div className="space-y-6">
        {/* --- CATEGORY TABS (Potions, Weapons, Armor, Misc, All) --- */}
        <div className="flex flex-wrap items-center gap-2 bg-gray-50 dark:bg-gray-800/80 p-2.5 rounded-2xl border dark:border-gray-700">
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2">Category:</span>
          {ITEM_TABS.map((tab) => {
            const count = tab.id === "all" 
              ? items.length 
              : items.filter(i => i.type === tab.id).length;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id !== "all" && !isEditing) {
                    setType(tab.id as ItemType);
                  }
                }}
                className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all ${
                  isActive
                    ? "bg-amber-500 text-gray-950 border-amber-400 shadow-md ring-2 ring-amber-400/30 scale-[1.02]"
                    : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-650"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  isActive
                    ? "bg-black/25 text-black font-extrabold"
                    : "bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* --- MAIN GRID: FORM (2 cols) & LIBRARY (1 col) --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl border dark:border-gray-700 shadow-sm transition-colors">
          
          {/* --- LEFT COLUMN: EDIT FORM --- */}
          <div className="md:col-span-2 space-y-6">
              <div className="flex justify-between items-center pb-2 border-b dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getCategoryIcon(type)}</span>
                  <h2 className="text-xl font-bold">
                    {isEditing ? `Item Factory — Editing: ${name}` : `Item Factory — New ${type.toUpperCase()}`}
                  </h2>
                </div>
                {msg && (
                  <span className={`text-sm font-bold ${msg.startsWith("❌") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                    {msg}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input label="ID (Unique)" value={id} onChange={(e: any) => setId(e.target.value)} />
                <Input label="Name" value={name} onChange={(e: any) => setName(e.target.value)} />
              </div>
              <Input label="Lore Description" value={desc} onChange={(e: any) => setDesc(e.target.value)} />
              
              {/* IMAGE INPUT */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Item Image URL</label>
                  <button
                    type="button"
                    onClick={() => setIsAssetPickerOpen(true)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> Pick from Asset Hub
                  </button>
                </div>
                <div className="flex gap-4 items-center">
                    <input
                      className="input flex-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                      placeholder="https://... or /Assets/General/gear/..."
                      value={imageUrl}
                      onChange={(e: any) => setImageUrl(e.target.value)}
                    />
                    <div className="w-16 h-16 bg-white dark:bg-gray-800 dark:border-gray-600 border rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                        {imageUrl ? (
                          <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">No Img</span>
                        )}
                    </div>
                </div>
              </div>

              {/* Asset Picker Modal */}
              <AssetPickerModal
                isOpen={isAssetPickerOpen}
                onClose={() => setIsAssetPickerOpen(false)}
                onSelectAsset={(path) => setImageUrl(path)}
                initialFolder={type === 'potion' ? 'Assets/General/consumables' : 'Assets/General/gear'}
              />
    
              {/* TYPE, SLOT, PRICE, DURABILITY, ORDER */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 bg-gray-50 dark:bg-gray-700/30 p-3.5 rounded-xl border border-gray-200 dark:border-gray-600">
                <div>
                  <label className="label text-[11px] uppercase font-bold">Type</label>
                  <select
                    className="input dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs"
                    value={type}
                    onChange={e => {
                      const newType = e.target.value as ItemType;
                      setType(newType);
                      if (activeTab !== "all" && activeTab !== newType) {
                        setActiveTab(newType);
                      }
                    }}
                  >
                    <option value="potion">🧪 Potion</option>
                    <option value="weapon">⚔️ Weapon</option>
                    <option value="armor">🛡️ Armor</option>
                    <option value="misc">📦 Misc</option>
                  </select>
                </div>

                <div>
                  <label className="label text-[11px] uppercase font-bold">Slot</label>
                  <select
                    className="input dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs disabled:opacity-40"
                    disabled={type === 'potion' || type === 'misc'}
                    value={slot}
                    onChange={e => setSlot(e.target.value as any)}
                  >
                    <option value="mainHand">Main Hand</option>
                    <option value="offHand">Off Hand</option>
                    <option value="armor">Armor</option>
                    <option value="head">Head</option>
                  </select>
                </div>

                <Input
                  type="number"
                  label="Price"
                  value={price}
                  onChange={(e: any) => setPrice(Number(e.target.value))}
                />

                <Input
                  type="number"
                  label="Durability"
                  value={maxDurability}
                  onChange={(e: any) => setMaxDurability(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Opt."
                />

                <Input
                  type="number"
                  label="Order in Group"
                  value={order}
                  onChange={(e: any) => setOrder(e.target.value === "" ? 1 : Number(e.target.value))}
                  placeholder="1 (Default 1)"
                />
              </div>

              <div className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                * Order controls display sequence within its subgroup in store and library. Items with equal order sort alphabetically. Default is 1.
              </div>
    
              <hr className="border-gray-200 dark:border-gray-700" />
    
              {/* 🟢 POLYNOMIAL STATS GRID */}
              <div className="grid grid-cols-4 gap-2 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50">
                 <div className="col-span-4 text-xs font-bold text-blue-800 dark:text-blue-300 uppercase mb-1">
                    Polynomial Modifiers (Negatives Allowed)
                 </div>
                 
                 {/* A */}
                 <div>
                   <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase">A (x³)</label>
                   <input type="number" className="input text-xs dark:bg-gray-800" placeholder="0" value={valA} onChange={(e:any) => setValA(e.target.value)} />
                 </div>
                 {/* B */}
                 <div>
                   <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase">B (x²)</label>
                   <input type="number" className="input text-xs dark:bg-gray-800" placeholder="0" value={valB} onChange={(e:any) => setValB(e.target.value)} />
                 </div>
                 {/* C */}
                 <div>
                   <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase">C (x)</label>
                   <input type="number" className="input text-xs dark:bg-gray-800" placeholder="0" value={valC} onChange={(e:any) => setValC(e.target.value)} />
                 </div>
                 {/* D */}
                 <div>
                   <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase">D (Const)</label>
                   <input type="number" className="input text-xs dark:bg-gray-800" placeholder="0" value={valD} onChange={(e:any) => setValD(e.target.value)} />
                 </div>
              </div>
    
              {/* 🟢 MULTIPLIERS & X-BONUS */}
              <div className="grid grid-cols-2 gap-4 bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-900/50">
                 <div>
                   <label className="text-[10px] font-bold text-red-800 dark:text-red-300 uppercase">Global Multiplier (k)</label>
                   <input type="number" step="0.01" className="input text-xs dark:bg-gray-800" placeholder="x1.0" value={dmgMult} onChange={(e:any) => setDmgMult(e.target.value)} />
                   <p className="text-[9px] text-gray-700 dark:text-gray-300 mt-1">Multiplies FINAL damage.</p>
                 </div>
                 <div>
                   <label className="text-[10px] font-bold text-red-800 dark:text-red-300 uppercase">Difficulty Bonus (x)</label>
                   <input type="number" className="input text-xs dark:bg-gray-800" placeholder="+0" value={valX} onChange={(e:any) => setValX(e.target.value)} />
                   <p className="text-[9px] text-gray-700 dark:text-gray-300 mt-1">Adds to difficulty &apos;x&apos; before calc.</p>
                 </div>
              </div>
    
              <div className="grid grid-cols-3 gap-4">
                
                {/* 🟢 MAX HP BOX */}
                 <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-900/50">
                  <div className="text-xs font-bold text-green-800 dark:text-green-300 uppercase mb-2">Max HP</div>
                  <div className="flex gap-2">
                    <input type="number" className="input text-xs dark:bg-gray-800 dark:border-green-900/50" placeholder="Flat" value={maxHpFlat} onChange={(e: any) => setMaxHpFlat(e.target.value)} />
                    <input type="number" step="0.01" className="input text-xs dark:bg-gray-800 dark:border-green-900/50" placeholder="Mult" value={maxHpMult} onChange={(e: any) => setMaxHpMult(e.target.value)} />
                  </div>
                </div>
    
                {/* 🟢 HEALING BOX */}
                <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-xl border border-pink-100 dark:border-pink-900/50">
                  <div className="text-xs font-bold text-pink-800 dark:text-pink-300 uppercase mb-2">Heal Power</div>
                  <div className="flex gap-2">
                    <input type="number" className="input text-xs dark:bg-gray-800 dark:border-pink-900/50" placeholder="Flat" value={healFlat} onChange={(e: any) => setHealFlat(e.target.value)} />
                    <input type="number" step="0.01" className="input text-xs dark:bg-gray-800 dark:border-pink-900/50" placeholder="% (0.5)" value={healMult} onChange={(e: any) => setHealMult(e.target.value)} />
                  </div>
                  <p className="text-[8px] text-gray-700 dark:text-gray-300 mt-1">Use 0.5 for 50% Max HP</p>
                </div>
    
                {/* 🟢 TIME BOX */}
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-900/50">
                  <div className="text-xs font-bold text-purple-800 dark:text-purple-300 uppercase mb-2">Time Bonus</div>
                  <div className="flex gap-2">
                     <input type="number" className="input text-xs dark:bg-gray-800 dark:border-purple-900/50" placeholder="Flat (+s)" value={timeFlat} onChange={(e: any) => setTimeFlat(e.target.value)} />
                     <input type="number" step="0.01" className="input text-xs dark:bg-gray-800 dark:border-purple-900/50" placeholder="Mult (x)" value={timeMult} onChange={(e: any) => setTimeMult(e.target.value)} />
                  </div>
                </div>
    
              </div>
              
              <div className="flex gap-2 mt-4">
                  <button onClick={handleSave} className="btn-primary w-full py-3 bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 rounded-lg font-bold">
                      {isEditing ? "Update Item" : "Save Item"}
                  </button>
                  <button onClick={resetForm} className="px-6 py-3 bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 rounded-lg font-bold hover:bg-gray-300">
                      {isEditing ? "Cancel" : "Clear"}
                  </button>
              </div>
          </div>
    
          {/* --- RIGHT COLUMN: ITEM LIST WITH TABS FILTER & SUBGROUPS --- */}
          <div className="space-y-4 border-l dark:border-gray-700 pl-4">
            <input
              className="input w-full text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="🔍 Filter Items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider pb-1">
              <span>{activeTab === 'all' ? 'All Items' : ITEM_TABS.find(t => t.id === activeTab)?.label} ({visibleItems.length})</span>
              <span className="text-[10px] font-mono lowercase">sorted by group & order</span>
            </div>

            <div className="space-y-2 max-h-[800px] overflow-y-auto pr-1 custom-scrollbar">
                {visibleItems.length === 0 && (
                  <div className="p-6 text-center text-xs text-gray-400 border border-dashed rounded-xl dark:border-gray-700">
                    No items found in this tab.
                  </div>
                )}
                {visibleItems.map((item, idx) => {
                    const prevItem = idx > 0 ? visibleItems[idx - 1] : null;
                    const showSubGroupHeader = !prevItem || getSubGroupKey(prevItem) !== getSubGroupKey(item);

                    return (
                      <div key={item.id} className="space-y-1">
                        {showSubGroupHeader && (
                          <div className="pt-3 pb-1 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                            <span className="flex items-center gap-1.5">
                              <span>{getCategoryIcon(item.type)}</span>
                              <span>{getSubGroupTitle(item)}</span>
                            </span>
                            <span className="text-[10px] font-mono text-gray-400">
                              {visibleItems.filter(i => getSubGroupKey(i) === getSubGroupKey(item)).length}
                            </span>
                          </div>
                        )}
                        <div 
                          onClick={() => loadItemToEdit(item)}
                          className={`p-3 border rounded-xl cursor-pointer transition-all flex justify-between items-center 
                              ${id === item.id 
                                  ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 dark:bg-blue-900/30 dark:border-blue-400' 
                                  : 'dark:border-gray-700 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 bg-white dark:bg-gray-800'}`
                          }
                        >
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center overflow-hidden shrink-0">
                                  {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-sm">{getCategoryIcon(item.type)}</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-bold shrink-0">
                                        #{item.order ?? 1}
                                      </span>
                                      <div className="font-bold text-sm dark:text-gray-100 truncate">{item.name}</div>
                                    </div>
                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono flex items-center gap-2 mt-0.5">
                                      <span>🪙 {item.price}g</span>
                                      {item.slot && <span>· {getSlotLabel(item.slot)}</span>}
                                      {item.maxDurability && <span>· 🛡️ {item.maxDurability} uses</span>}
                                    </div>
                                    
                                    {/* 🟢 STAT BADGES */}
                                    <div className="flex flex-wrap gap-1 mt-1">
                                         {item.stats?.damage?.mult && <span className="text-[9px] bg-red-100 text-red-800 px-1 rounded">k: x{item.stats.damage.mult}</span>}
                                         {item.stats?.xBonus && <span className="text-[9px] bg-purple-100 text-purple-800 px-1 rounded">x+: {item.stats.xBonus}</span>}
                                         {item.stats?.a && <span className="text-[9px] bg-gray-100 text-gray-600 px-1 rounded">A:{item.stats.a}</span>}
                                         {item.stats?.heal?.flat && <span className="text-[9px] bg-pink-100 text-pink-600 px-1 rounded">Heal:{item.stats.heal.flat}</span>}
                                    </div>
                                </div>
                            </div>
                            
                            <button 
                                onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} 
                                className="text-xs text-red-400 font-bold hover:text-red-600 dark:hover:text-red-300 ml-2 px-2 py-1 shrink-0"
                            >Delete</button>
                        </div>
                      </div>
                    );
                })}
            </div>
          </div>
        </div>
      </div>
    );
}