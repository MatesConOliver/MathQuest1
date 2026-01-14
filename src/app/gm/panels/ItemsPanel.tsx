"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc
} from "firebase/firestore";

import { GameItem, ItemType, EquipmentSlot } from "@/types/game";
import { Input } from "@/app/gm/components/Input";

export function ItemsPanel() {
    const [items, setItems] = useState<GameItem[]>([]);
    const [msg, setMsg] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
  
    // --- Form States ---
    const [id, setId] = useState("");
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [price, setPrice] = useState(10);
    const [type, setType] = useState<ItemType>("weapon");
    const [slot, setSlot] = useState<EquipmentSlot>("mainHand");
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
    const [timeMult, setTimeMult] = useState<number | "">(""); // Replaces timeFactor
  
    useEffect(() => { loadItems(); }, []);
  
    async function loadItems() {
      const s = await getDocs(collection(db, "items"));
      setItems(s.docs.map(d => ({ ...d.data(), id: d.id } as GameItem)));
    }
  
    const visibleItems = items.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  
    function resetForm() {
      setId(""); setName(""); setDesc(""); setPrice(10); setType("weapon"); setSlot("mainHand");
      setImageUrl(""); setMaxDurability("");
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
        // Construct the stats object cleanly
        // We use Number() which handles negatives perfectly (-5 becomes -5)
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
  
        const baseItem: any = {
          id, name, description: desc, price: Number(price), type,
          imageUrl: imageUrl || `https://placehold.co/100?text=${name.charAt(0)}`,
          stats: statsObj // Attach our clean stats object
        };
  
        if (type !== 'potion' && type !== 'misc') baseItem.slot = slot;
        if (maxDurability) baseItem.maxDurability = Number(maxDurability);
  
        await setDoc(doc(db, "items", id), baseItem);
        setMsg(`✅ Saved Item: ${name}`);
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-xl border dark:border-gray-700 shadow-sm transition-colors">
        
        {/* --- LEFT COLUMN: EDIT FORM --- */}
        <div className="md:col-span-2 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">{isEditing ? "Item Factory (Editing)" : "Item Factory (New)"}</h2>
              {msg && <span className={`text-sm font-bold ${msg.startsWith("❌") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>{msg}</span>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="ID (Unique)" value={id} onChange={(e: any) => setId(e.target.value)} />
              <Input label="Name" value={name} onChange={(e: any) => setName(e.target.value)} />
            </div>
            <Input label="Lore Description" value={desc} onChange={(e: any) => setDesc(e.target.value)} />
            
             {/* IMAGE INPUT */}
             <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <label className="label mb-2">Item Image URL</label>
              <div className="flex gap-4 items-center">
                  <input className="input flex-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" placeholder="https://..." value={imageUrl} onChange={(e: any) => setImageUrl(e.target.value)} />
                  <div className="w-16 h-16 bg-white dark:bg-gray-800 dark:border-gray-600 border rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                      {imageUrl ? <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" /> : <span className="text-xs text-gray-300 dark:text-gray-600">No Img</span>}
                  </div>
              </div>
            </div>
  
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="label">Type</label>
                <select className="input dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={type} onChange={e => setType(e.target.value as any)}>
                  <option value="weapon">Weapon</option><option value="armor">Armor</option><option value="potion">Potion</option><option value="misc">Misc</option>
                </select>
              </div>
              <div>
                <label className="label">Slot</label>
                <select className="input dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50" disabled={type === 'potion' || type === 'misc'} value={slot} onChange={e => setSlot(e.target.value as any)}>
                  <option value="mainHand">Main Hand</option><option value="offHand">Off Hand</option><option value="armor">Armor</option><option value="head">Head</option>
                </select>
              </div>
              <Input type="number" label="Price" value={price} onChange={(e: any) => setPrice(Number(e.target.value))} />
              <Input type="number" label="Durability" value={maxDurability} onChange={(e: any) => setMaxDurability(Number(e.target.value))} placeholder="Opt." />
            </div>
  
            <hr className="border-gray-200" />
  
            {/* 🟢 POLYNOMIAL STATS GRID */}
            <div className="grid grid-cols-4 gap-2 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50">
               <div className="col-span-4 text-xs font-bold text-blue-800 dark:text-blue-300 uppercase mb-1">
                  Polynomial Modifiers (Negatives Allowed)
               </div>
               
               {/* A */}
               <div>
                 <label className="text-[10px] font-bold text-gray-500 uppercase">A (x³)</label>
                 <input type="number" className="input text-xs dark:bg-gray-800" placeholder="0" value={valA} onChange={(e:any) => setValA(e.target.value)} />
               </div>
               {/* B */}
               <div>
                 <label className="text-[10px] font-bold text-gray-500 uppercase">B (x²)</label>
                 <input type="number" className="input text-xs dark:bg-gray-800" placeholder="0" value={valB} onChange={(e:any) => setValB(e.target.value)} />
               </div>
               {/* C */}
               <div>
                 <label className="text-[10px] font-bold text-gray-500 uppercase">C (x)</label>
                 <input type="number" className="input text-xs dark:bg-gray-800" placeholder="0" value={valC} onChange={(e:any) => setValC(e.target.value)} />
               </div>
               {/* D */}
               <div>
                 <label className="text-[10px] font-bold text-gray-500 uppercase">D (Const)</label>
                 <input type="number" className="input text-xs dark:bg-gray-800" placeholder="0" value={valD} onChange={(e:any) => setValD(e.target.value)} />
               </div>
            </div>
  
            {/* 🟢 MULTIPLIERS & X-BONUS */}
            <div className="grid grid-cols-2 gap-4 bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-900/50">
               <div>
                 <label className="text-[10px] font-bold text-red-800 dark:text-red-300 uppercase">Global Multiplier (k)</label>
                 <input type="number" step="0.01" className="input text-xs dark:bg-gray-800" placeholder="x1.0" value={dmgMult} onChange={(e:any) => setDmgMult(e.target.value)} />
                 <p className="text-[9px] text-gray-500 mt-1">Multiplies FINAL damage.</p>
               </div>
               <div>
                 <label className="text-[10px] font-bold text-red-800 dark:text-red-300 uppercase">Difficulty Bonus (x)</label>
                 <input type="number" className="input text-xs dark:bg-gray-800" placeholder="+0" value={valX} onChange={(e:any) => setValX(e.target.value)} />
                 <p className="text-[9px] text-gray-500 mt-1">Adds to difficulty 'x' before calc.</p>
               </div>
            </div>
  
            <div className="grid grid-cols-3 gap-4">
              
              {/* 🟢 MAX HP BOX */}
               <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-100 dark:border-green-900/50">
                <div className="text-xs font-bold text-green-800 dark:text-green-300 uppercase mb-2">Max HP</div>
                <div className="flex gap-2">
                  <input type="number" className="input text-xs dark:bg-gray-800 dark:border-green-900/50" placeholder="Flat" value={maxHpFlat} onChange={(e: any) => setMaxHpFlat(e.target.value)} />
                  <input type="number" step="0.01" className="input text-xs dark:bg-gray-800 dark:border-green-900/50" placeholder="Mult" value={maxHpMult} onChange={(e: any) => setMaxHpMult(e.target.value)} />
                </div>
              </div>
  
              {/* 🟢 HEALING BOX */}
              <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded border border-pink-100 dark:border-pink-900/50">
                <div className="text-xs font-bold text-pink-800 dark:text-pink-300 uppercase mb-2">Heal Power</div>
                <div className="flex gap-2">
                  <input type="number" className="input text-xs dark:bg-gray-800 dark:border-pink-900/50" placeholder="Flat" value={healFlat} onChange={(e: any) => setHealFlat(e.target.value)} />
                  <input type="number" step="0.01" className="input text-xs dark:bg-gray-800 dark:border-pink-900/50" placeholder="% (0.5)" value={healMult} onChange={(e: any) => setHealMult(e.target.value)} />
                </div>
                <p className="text-[8px] text-gray-500 mt-1">Use 0.5 for 50% Max HP</p>
              </div>
  
              {/* 🟢 TIME BOX */}
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-100 dark:border-purple-900/50">
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
  
        {/* --- RIGHT COLUMN: ITEM LIST --- */}
        <div className="space-y-4 border-l dark:border-gray-700 pl-4">
          <input className="input w-full text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="🔍 Filter Items..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          <div className="space-y-2 max-h-[800px] overflow-y-auto">
              <h3 className="font-bold text-gray-500 dark:text-gray-400 uppercase text-xs">Library ({visibleItems.length})</h3>
              {visibleItems.map(item => (
                  <div 
                  key={item.id} 
                  onClick={() => loadItemToEdit(item)}
                  className={`p-3 border rounded cursor-pointer transition-colors flex justify-between items-center 
                      ${id === item.id 
                          ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 dark:bg-blue-900/30 dark:border-blue-400' 
                          : 'dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`
                  }
                  >
                      <div>
                          <div className="font-bold text-sm dark:text-gray-100">{item.name}</div>
                          
                          {/* 🟢 SHOW ICONS IF PRESENT */}
                          <div className="flex flex-wrap gap-1 mt-1">
                               {item.stats?.damage?.mult && <span className="text-[9px] bg-red-100 text-red-800 px-1 rounded">k: x{item.stats.damage.mult}</span>}
                               {item.stats?.xBonus && <span className="text-[9px] bg-purple-100 text-purple-800 px-1 rounded">x+: {item.stats.xBonus}</span>}
                               {item.stats?.a && <span className="text-[9px] bg-gray-100 text-gray-600 px-1 rounded">A:{item.stats.a}</span>}
                               {item.stats?.heal?.flat && <span className="text-[9px] bg-pink-100 text-pink-600 px-1 rounded">Heal:{item.stats.heal.flat}</span>}
                          </div>
                      </div>
                      
                      <button 
                          onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} 
                          className="text-xs text-red-400 font-bold hover:text-red-600 dark:hover:text-red-300 ml-2 px-2 py-1"
                      >Delete</button>
                  </div>
              ))}
          </div>
        </div>
      </div>
    );
  }