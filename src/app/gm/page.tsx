"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  limit,
  query,
  orderBy,
  where
} from "firebase/firestore";

import 'katex/dist/katex.min.css'; 
import { InlineMath, BlockMath } from 'react-katex';

// Types imported from your game.ts
import { 
  GameItem, ItemType, EquipmentSlot, 
  QuestionDoc, Monster, EncounterDoc, GameLocation
} from "@/types/game";

const GM_EMAIL = "oliveru1996@gmail.com"; 

export default function GMPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // 🗂️ TABS STATE (Fixed: Added "locations")
  const [activeTab, setActiveTab] = useState<"questions" | "foes" | "encounters" | "items" | "locations">("questions");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!user || user.email !== GM_EMAIL) return <div className="p-8 text-red-600 font-bold">Access Denied</div>;

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-4">
        <div>
          <h1 className="text-3xl font-bold">🛠️ GM Dashboard</h1>
          <p className="text-sm text-gray-400">Master Control Panel</p>
        </div>

        <div className="flex flex-wrap gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl transition-colors">
          <TabButton label="Questions" active={activeTab === "questions"} onClick={() => setActiveTab("questions")} />
          <TabButton label="Foes" active={activeTab === "foes"} onClick={() => setActiveTab("foes")} />
          <TabButton label="Locations" active={activeTab === "locations"} onClick={() => setActiveTab("locations")} />
          <TabButton label="Encounters" active={activeTab === "encounters"} onClick={() => setActiveTab("encounters")} />
          <TabButton label="Item Factory" active={activeTab === "items"} onClick={() => setActiveTab("items")} />
        </div>
      </header>

      {/* ACTIVE PANEL RENDERING */}
      <div className="bg-gray-50 dark:bg-gray-800/50 p-1 rounded-2xl min-h-[600px] border dark:border-gray-700">
        {activeTab === "questions" && <QuestionsPanelOriginal />}
        {activeTab === "foes" && <FoesPanel />}
        {activeTab === "locations" && <LocationsPanel />}
        {activeTab === "encounters" && <EncountersPanel />}
        {activeTab === "items" && <ItemsPanel />}
      </div>
    </main>
  );
}

// =========================================================
// 1. QUESTIONS PANEL 
// =========================================================
function QuestionsPanelOriginal() {
  const [msg, setMsg] = useState("");
  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  const [editingId, setEditingId] = useState("");

  // Search
  const [dbTagSearch, setDbTagSearch] = useState("");
  const [localFilter, setLocalFilter] = useState("");

  // Form
  const [title, setTitle] = useState("");
  const [promptType, setPromptType] = useState<"text" | "latex" | "image">("text");
  const [promptText, setPromptText] = useState("");
  const [promptLatex, setPromptLatex] = useState("");
  const [promptImageUrl, setPromptImageUrl] = useState("");
  const [choices, setChoices] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [difficulty, setDifficulty] = useState(1);
  const [tagsText, setTagsText] = useState("level1");
  const [order, setOrder] = useState("");
  const [qMinutes, setQMinutes] = useState(0);
  const [qSeconds, setQSeconds] = useState(30);

  useEffect(() => { loadRecent(); }, []);

  async function loadRecent() {
    try {
      const q = query(collection(db, "questions"), limit(1000));
      const snap = await getDocs(q);
      setQuestions(snap.docs.map(d => ({ ...d.data(), id: d.id } as QuestionDoc)));
    } catch (e) { console.error(e); }
  }

  async function loadByTag() {
    if (!dbTagSearch) return loadRecent();
    try {
      const q = query(collection(db, "questions"), where("tags", "array-contains", dbTagSearch));
      const snap = await getDocs(q);
      setQuestions(snap.docs.map(d => ({ ...d.data(), id: d.id } as QuestionDoc)));
      setMsg(`Found ${snap.docs.length} questions with tag: '${dbTagSearch}'`);
    } catch (e) { setMsg("Error searching tag."); }
  }

  const visibleQuestions = questions
  .filter(q => {
    const searchString = `
      ${q.title || ""} 
      ${q.promptText || ""} 
      ${q.tags ? q.tags.join(" ") : ""}
    `.toLowerCase();
    
    return searchString.includes(localFilter.toLowerCase());
  })
  .sort((a, b) => {
    const ta = (a.title || "").toLowerCase();
    const tb = (b.title || "").toLowerCase();
    return tb.localeCompare(ta); // 👈 Z → A
  });

  function loadQuestionToEdit(q: QuestionDoc) {
    if (!q.id) return;
    setEditingId(q.id);
    setTitle(q.title || "");
    setPromptType(q.promptType || "text");
    setPromptText(q.promptText || "");
    setPromptLatex(q.promptLatex || "");
    setPromptImageUrl(q.promptImageUrl || "");
    setChoices(q.choices && q.choices.length === 4 ? q.choices : ["","","",""]);
    setCorrectIndex(q.correctIndex || 0);
    // 🗑️ XP y Oro eliminados
    setDifficulty(q.difficulty || 1);
    setTagsText(q.tags ? q.tags.join(",") : "level1");
    setOrder(q.order ? String(q.order) : "");
    const totalSecs = q.timeLimit || 30; 
    setQMinutes(Math.floor(totalSecs / 60));
    setQSeconds(totalSecs % 60);
    setMsg(`✏️ Editing: ${q.title || "Untitled"}`);
  }

  function resetForm() {
    setEditingId(""); setTitle(""); setPromptType("text"); setPromptText("");
    setPromptLatex(""); setPromptImageUrl(""); setChoices(["", "", "", ""]);
    setCorrectIndex(0); 
    setQMinutes(0); setQSeconds(30);
    setDifficulty(1); setTagsText("level1"); setOrder(""); setMsg("");
  }

  // 👇 HELPER: Renders mixed Text + LaTeX (e.g. "Find $x$")
  const renderMixedText = (text: string | undefined) => {
    if (!text) return null;
    return (
      <span>
        {text.split('$').map((part, index) => {
          // Odd indices (1, 3, 5) are inside $$ -> Render as Math
          if (index % 2 === 1) {
            return <span key={index} className="inline-block mx-1 text-blue-600 dark:text-blue-400"><InlineMath math={part} /></span>;
          }
          // Even indices are text
          return <span key={index}>{part}</span>;
        })}
      </span>
    );
  };

  async function saveQuestion() {
    setMsg("Saving...");
    const tagsArray = tagsText.split(",").map((s) => s.trim()).filter(Boolean);
    const totalSecs = (Number(qMinutes) * 60) + Number(qSeconds);
    const safeTime = totalSecs > 0 ? totalSecs : 30;

    // He cambiado el tipo a 'any' para evitar errores si tu archivo de tipos aún exige XP/Oro
    const docData: any = {
      title: title || "Untitled",
      promptType,
      // ✅ ARREGLO: Usamos "" en lugar de undefined para evitar el crash
      promptText: promptText || "",
      promptLatex: promptLatex || "",
      promptImageUrl: promptImageUrl || "",
      choices,
      correctIndex,
      difficulty: Number(difficulty),
      tags: tagsArray,
      timeLimit: safeTime,
      // ✅ ARREGLO: Usamos null en lugar de undefined para el orden
      order: order ? Number(order) : null,
    };

    try {
      if (editingId) {
        await setDoc(doc(db, "questions", editingId), docData, { merge: true });
        setMsg("✅ Updated Question!");
      } else {
        await addDoc(collection(db, "questions"), docData);
        setMsg("✅ Created New Question!");
      }
      if (!editingId) resetForm(); 
      if (dbTagSearch) loadByTag(); else loadRecent();
    } catch (e: any) { setMsg("Error: " + e.message); }
  }

  async function deleteQuestion(qId: string) {
    if (!confirm("Permanently delete this question?")) return;
    try {
      await deleteDoc(doc(db, "questions", qId));
      setMsg("🗑️ Question deleted.");
      if (editingId === qId) resetForm();
      if (dbTagSearch) loadByTag(); else loadRecent();
    } catch (e: any) { setMsg("Error: " + e.message); }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-xl border dark:border-gray-700 shadow-sm transition-colors">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">{editingId ? "✏️ Edit Mode" : "📝 New Question"}</h2>
        </div>

        {msg && <div className="text-center bg-blue-50 dark:bg-blue-900/30 p-2 rounded text-blue-800 dark:text-blue-200 font-bold text-sm">{msg}</div>}
        
        <Input label="Internal Title" value={title} onChange={(e:any) => setTitle(e.target.value)} />
        
        <div className="flex gap-2 mb-2">
          {(["text", "latex", "image"] as const).map(t => (
            <button key={t} onClick={() => setPromptType(t)} 
              className={`px-3 py-1 text-xs font-bold uppercase rounded border dark:border-gray-600 transition-colors ${
                promptType === t 
                ? 'bg-black text-white dark:bg-white dark:text-black' 
                : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-300'
              }`}>
              {t}
            </button>
          ))}
        </div>
        
        {promptType === "text" && <Input label="Prompt Text" value={promptText} onChange={(e:any) => setPromptText(e.target.value)} />}
        {promptType === "latex" && <Input label="LaTeX Formula (e.g. \sqrt{x})" value={promptLatex} onChange={(e:any) => setPromptLatex(e.target.value)} />}
        {promptType === "image" && <Input label="Image URL" value={promptImageUrl} onChange={(e:any) => setPromptImageUrl(e.target.value)} />}
        
        {/* 👇 NEW: LIVE PREVIEW BOX */}
        {promptType === "text" && promptText && (
           <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-200">
             <span className="font-bold text-[10px] uppercase text-gray-400 block mb-1">Preview:</span>
             <div className="leading-relaxed">
               {renderMixedText(promptText)}
             </div>
           </div>
        )}
        
        <div className="flex gap-2 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800">
           <div className="flex-1">
              <label className="text-[10px] font-bold uppercase text-blue-800 dark:text-blue-300">Min</label>
              <input type="number" min="0" value={qMinutes} onChange={(e)=>setQMinutes(Number(e.target.value))} className="input w-full" />
           </div>
           <div className="flex-1">
              <label className="text-[10px] font-bold uppercase text-blue-800 dark:text-blue-300">Sec</label>
              <input type="number" min="0" max="59" value={qSeconds} onChange={(e)=>setQSeconds(Number(e.target.value))} className="input w-full" />
           </div>
           <div className="flex items-end pb-2 text-xs font-bold text-blue-600 dark:text-blue-400">
              Total: {(Number(qMinutes)*60) + Number(qSeconds)}s
           </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border dark:border-gray-700">
          {choices.map((c, i) => (
            <div key={i}>
              <label className="text-[10px] font-bold uppercase flex justify-between px-1 mb-1 cursor-pointer">
                <span>Option {i + 1}</span>
                <input type="radio" checked={correctIndex === i} onChange={() => setCorrectIndex(i)} />
              </label>
              <input 
                className={`w-full border px-2 py-1 rounded text-sm transition-all ${correctIndex === i ? 'border-green-500 bg-green-50 ring-1 ring-green-500' : ''}`}
                value={c}
                onChange={(e) => { const copy = [...choices]; copy[i] = e.target.value; setChoices(copy); }}
                placeholder={`Answer ${i+1}`}
              />
              {/* 👇 NEW: CHOICE PREVIEW */}
              {c && c.includes('$') && (
                <div className="text-xs text-blue-600 mt-1 pl-1">
                  {renderMixedText(c)}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tags (comma sep)" value={tagsText} onChange={(e:any) => setTagsText(e.target.value)} />
          <Input type="number" label="Order" value={order} onChange={(e:any) => setOrder(e.target.value)} placeholder="1" />
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Input type="number" label="Difficulty (1-5)" value={difficulty} onChange={(e:any) => setDifficulty(Number(e.target.value))} />
        </div>
        
        <div className="flex gap-2">
            <button onClick={saveQuestion} className="btn-primary flex-1 bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 py-2 rounded-lg font-bold">
              {editingId ? "Update Question" : "Create Question"}
            </button>
            {editingId && (
              <button onClick={resetForm} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded font-bold hover:bg-gray-300 dark:hover:bg-gray-600 dark:text-white">
                Cancel
              </button>
            )}
        </div>
      </div>

      {/* LIST SIDE */}
      <div className="space-y-4 border-l dark:border-gray-700 pl-4">
        <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-xl space-y-2">
          <h3 className="font-bold text-xs uppercase text-gray-500 dark:text-gray-300">Database Search</h3>
          <div className="flex gap-2">
            <input className="input flex-1 text-xs" placeholder="Load by Tag..." value={dbTagSearch} onChange={(e) => setDbTagSearch(e.target.value)}/>
            <button onClick={loadByTag} className="bg-black text-white dark:bg-white dark:text-black px-3 rounded text-xs font-bold">Fetch</button>
          </div>
          <hr className="border-gray-200 dark:border-gray-600" />
          <input className="input w-full text-xs" placeholder="Filter loaded list..." value={localFilter} onChange={(e) => setLocalFilter(e.target.value)}/>
        </div>

        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
          {visibleQuestions.map((q) => (
            <div key={q.id} onClick={() => loadQuestionToEdit(q)} 
              className={`p-3 border rounded cursor-pointer transition-all flex justify-between items-start 
                      ${editingId === q.id 
                          ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 dark:bg-blue-900/30 dark:border-blue-400' 
                          : 'dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`
              }
            >
              <div className="overflow-hidden">
                <div className="font-bold text-sm truncate dark:text-gray-100">{q.title ? q.title : "⚠️ Untitled Question"}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{q.promptText || q.promptLatex || "Image Question"}</div>
                <div className="text-xs text-gray-400 flex gap-2 mt-1">
                  <span className="bg-gray-100 dark:bg-gray-700 dark:text-gray-300 px-1 rounded">{q.tags?.join(", ")}</span>
                  <span className="text-orange-400">★{q.difficulty}</span>
                </div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); if(q.id) deleteQuestion(q.id); }}
                className="text-red-300 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-bold px-2"
              >✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// 2. ITEMS PANEL
// =========================================================
function ItemsPanel() {
  const [items, setItems] = useState<GameItem[]>([]);
  const [msg, setMsg] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Form States
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState(10);
  const [type, setType] = useState<ItemType>("weapon");
  const [slot, setSlot] = useState<EquipmentSlot>("mainHand");
  const [imageUrl, setImageUrl] = useState("");

  // Stats
  const [dmgFlat, setDmgFlat] = useState<number | "">("");
  const [dmgMult, setDmgMult] = useState<number | "">("");
  const [defFlat, setDefFlat] = useState<number | "">("");
  const [defMult, setDefMult] = useState<number | "">("");
  const [maxHpFlat, setMaxHpFlat] = useState<number | "">("");
  const [maxHpMult, setMaxHpMult] = useState<number | "">("");
  const [timeFactor, setTimeFactor] = useState<number | "">("");
  const [healFlat, setHealFlat] = useState<number | "">("");
  const [healPercent, setHealPercent] = useState<number | "">("");
  const [maxDurability, setMaxDurability] = useState<number | "">("");
  
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
    setDmgFlat(""); setDmgMult(""); setDefFlat(""); setDefMult(""); setMaxHpFlat(""); setMaxHpMult(""); setTimeFactor("");
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

    setDmgFlat(item.stats?.damage?.flat ?? "");
    setDmgMult(item.stats?.damage?.mult ?? "");
    setDefFlat(item.stats?.defense?.flat ?? "");
    setDefMult(item.stats?.defense?.mult ?? "");
    setMaxHpFlat(item.stats?.maxHp?.flat || "");
    setMaxHpMult(item.stats?.maxHp?.mult || "");
    setTimeFactor(item.stats?.timeFactor ?? "");
    setMsg(`✏️ Editing: ${item.name}`);
  }

  const handleSave = async () => {
    if (!id || !name) { setMsg("❌ ID & Name required"); return; }
    try {
      const baseItem: any = {
        id, name, description: desc, price: Number(price), type,
        imageUrl: imageUrl || `https://placehold.co/100?text=${name.charAt(0)}`,
        stats: {
          ...((dmgFlat || dmgMult) && { damage: { ...(dmgFlat && { flat: Number(dmgFlat) }), ...(dmgMult && { mult: Number(dmgMult) }) } }),
          ...((defFlat || defMult) && { defense: { ...(defFlat && { flat: Number(defFlat) }), ...(defMult && { mult: Number(defMult) }) } }),
          ...((maxHpFlat || maxHpMult) && { maxHp: { ...(maxHpFlat && { flat: Number(maxHpFlat) }), ...(maxHpMult && { mult: Number(maxHpMult) }) } }),
          ...(timeFactor && { timeFactor: Number(timeFactor) })
        }
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

  // Determine if we are technically in "Edit Mode" (ID exists in list)
  const isEditing = id && items.some(i => i.id === id);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-xl border dark:border-gray-700 shadow-sm transition-colors">
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

          <div className="grid grid-cols-3 gap-4">
            {/* DAMAGE BOX (RED) */}
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-100 dark:border-red-900/50">
              <div className="text-xs font-bold text-red-800 dark:text-red-300 uppercase mb-2">Damage</div>
              <div className="flex gap-2">
                <input type="number" className="input text-xs dark:bg-gray-800 dark:border-red-900/50" placeholder="Flat" value={dmgFlat} onChange={(e: any) => setDmgFlat(e.target.value === "" ? "" : Number(e.target.value))} />
                <input type="number" step="0.01" className="input text-xs dark:bg-gray-800 dark:border-red-900/50" placeholder="Mult" value={dmgMult} onChange={(e: any) => setDmgMult(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
            </div>

            {/* DEFENSE BOX (BLUE) */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-900/50">
              <div className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase mb-2">Defense</div>
              <div className="flex gap-2">
                <input type="number" className="input text-xs dark:bg-gray-800 dark:border-blue-900/50" placeholder="Flat" value={defFlat} onChange={(e: any) => setDefFlat(e.target.value === "" ? "" : Number(e.target.value))} />
                <input type="number" step="0.01" className="input text-xs dark:bg-gray-800 dark:border-blue-900/50" placeholder="Mult" value={defMult} onChange={(e: any) => setDefMult(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
            </div>

            {/* MAX HP BOX (GREEN) */}
             <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-100 dark:border-green-900/50">
              <div className="text-xs font-bold text-green-800 dark:text-green-300 uppercase mb-2">Max HP</div>
              <div className="flex gap-2">
                <input type="number" className="input text-xs dark:bg-gray-800 dark:border-green-900/50" placeholder="Flat" value={maxHpFlat} onChange={(e: any) => setMaxHpFlat(e.target.value === "" ? "" : Number(e.target.value))} />
                <input type="number" step="0.01" className="input text-xs dark:bg-gray-800 dark:border-green-900/50" placeholder="Mult" value={maxHpMult} onChange={(e: any) => setMaxHpMult(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
            </div>

            {/* TIME BOX (PURPLE) */}
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-100 dark:border-purple-900/50 col-span-3 md:col-span-1">
              <div className="text-xs font-bold text-purple-800 dark:text-purple-300 uppercase mb-2">Time</div>
              <input type="number" step="0.01" className="input text-xs dark:bg-gray-800 dark:border-purple-900/50" placeholder="Factor" value={timeFactor} onChange={(e: any) => setTimeFactor(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          </div>
          
          {/* 👇 UPDATED BUTTONS */}
          <div className="flex gap-2 mt-4">
              <button onClick={handleSave} className="btn-primary w-full py-3 bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 rounded-lg font-bold">
                  {isEditing ? "Update Item" : "Save Item"}
              </button>
              <button onClick={resetForm} className="px-6 py-3 bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 rounded-lg font-bold hover:bg-gray-300">
                  {isEditing ? "Cancel" : "Clear"}
              </button>
          </div>
      </div>

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
                        <div className="text-xs text-gray-400 font-mono">{item.id}</div>
                        <div className="mt-1 flex gap-2 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
                            <span className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{item.type}</span>
                            <span>💰 {item.price}</span>
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

// =========================================================
// 3. FOES PANEL
// =========================================================
function FoesPanel() {
  const [foes, setFoes] = useState<Monster[]>([]);
  const [msg, setMsg] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const visibleFoes = foes.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Form State
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [emoji, setEmoji] = useState("👾");
  const [maxHp, setMaxHp] = useState<number | "">("");
  
  // 🟢 NEW FIELDS
  const [attack, setAttack] = useState<number | "">("");
  const [defense, setDefense] = useState<number | "">("");

  useEffect(() => { loadFoes(); }, []);

  async function loadFoes() {
    try {
      const snap = await getDocs(collection(db, "foes"));
      setFoes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Monster)));
    } catch (e) { console.error(e); }
  }

  function resetForm() {
    setId(""); setName(""); setDesc(""); setEmoji("👾");
    setMaxHp(""); setAttack(""); setDefense(""); 
    setMsg("");
  }

  function loadFoeToEdit(f: Monster) {
    setId(f.id || "");
    setName(f.name);
    setDesc(f.description || "");
    setEmoji(f.emoji || "👾");
    setMaxHp(f.maxHp || "");
    setAttack(f.attackDamage ?? ""); 
    setDefense(f.defense ?? "");
    setMsg(`✏️ Editing: ${f.name}`);
  }

  async function saveFoe() {
    if (!name) { setMsg("❌ Name is required"); return; }
    setMsg("Saving...");

    const docData: any = {
      name,
      description: desc,
      emoji,
      maxHp: Number(maxHp) || 20,
      attackDamage: Number(attack) || 5, 
      defense: Number(defense) || 0,
    };

    try {
      if (id) {
        await setDoc(doc(db, "foes", id), docData, { merge: true });
        setMsg("✅ Updated Foe!");
      } else {
        await addDoc(collection(db, "foes"), docData);
        setMsg("✅ Created New Foe!");
      }
      if (!id) resetForm();
      loadFoes();
    } catch (e: any) { setMsg("Error: " + e.message); }
  }

  async function deleteFoe(foeId: string) {
    if (!confirm("Delete this foe?")) return;
    await deleteDoc(doc(db, "foes", foeId));
    loadFoes();
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-xl border dark:border-gray-700 shadow-sm transition-colors">
      {/* FORM SIDE */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{id ? "✏️ Edit Foe" : "👾 New Foe"}</h2>
        
        {msg && <div className="text-center bg-blue-50 dark:bg-blue-900/30 p-2 rounded text-blue-800 dark:text-blue-200 font-bold text-sm">{msg}</div>}

        <Input label="Name" value={name} onChange={(e: any) => setName(e.target.value)} />
        <Input label="Description" value={desc} onChange={(e: any) => setDesc(e.target.value)} />

        <div className="grid grid-cols-2 gap-4">
           <Input label="Emoji" value={emoji} onChange={(e: any) => setEmoji(e.target.value)} />
           <Input type="number" label="Max HP" value={maxHp} onChange={(e: any) => setMaxHp(Number(e.target.value))} />
        </div>

        {/* 🟢 NEW STAT INPUTS */}
        <div className="grid grid-cols-2 gap-4 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-900/50">
           <Input type="number" label="Attack Dmg" value={attack} onChange={(e: any) => setAttack(Number(e.target.value))} placeholder="5" />
           <Input type="number" label="Defense" value={defense} onChange={(e: any) => setDefense(Number(e.target.value))} placeholder="0" />
        </div>

        <div className="flex gap-2 pt-2">
            <button onClick={saveFoe} className="btn-primary flex-1 bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 py-2 rounded-lg font-bold">
                {id ? "Update Foe" : "Create Foe"}
            </button>
            {id && (
                <button onClick={resetForm} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 dark:text-white rounded font-bold hover:bg-gray-300 dark:hover:bg-gray-600">
                    Cancel
                </button>
            )}
        </div>
      </div>

      {/* LIST SIDE */}
      <div className="space-y-4 border-l dark:border-gray-700 pl-4">
        <input 
            className="input w-full text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
            placeholder="🔍 Filter Foes..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
        />
        <h3 className="font-bold text-gray-500 dark:text-gray-400 text-xs uppercase">Existing Foes</h3>
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
            {visibleFoes.map(f => (
            <div 
                key={f.id} 
                onClick={() => loadFoeToEdit(f)} 
                className={`p-3 border rounded flex justify-between items-center cursor-pointer transition-colors 
                    ${id === f.id 
                        ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500 dark:bg-purple-900/30 dark:border-purple-400' 
                        : 'dark:border-gray-600 hover:bg-purple-50 dark:hover:bg-purple-900/20'}`
                }
            >
                <div className="min-w-0 flex items-center gap-3">
                    <div className="text-2xl">{f.emoji || "👾"}</div>
                    <div>
                        <div className="font-bold text-sm dark:text-gray-100">{f.name}</div>
                        {/* 🟢 SHOW STATS IN LIST */}
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                           ❤️{f.maxHp} ⚔️{f.attackDamage ?? "?"} 🛡️{f.defense ?? "?"}
                        </div>
                    </div>
                </div>
                
                <button onClick={(e) => { e.stopPropagation(); if (f.id) deleteFoe(f.id); }} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 text-xs font-bold px-2 ml-2">
                    Delete
                </button>
            </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// 4. LOCATIONS PANEL (With Search!)
// =========================================================
function LocationsPanel() {
  const [locs, setLocs] = useState<GameLocation[]>([]);
  const [editingId, setEditingId] = useState("");
  const [msg, setMsg] = useState("");
  
  // 🔍 Search State
  const [searchTerm, setSearchTerm] = useState("");

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [order, setOrder] = useState(1);

  useEffect(() => { loadLocs(); }, []);

  async function loadLocs() {
    const q = query(collection(db, "locations"), orderBy("order"));
    const s = await getDocs(q);
    setLocs(s.docs.map(d => ({ ...d.data(), id: d.id } as GameLocation)));
  }

  // 🔍 Filter Logic
  const visibleLocs = locs.filter(l => 
    l.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function loadLocationToEdit(l: GameLocation) {
      setEditingId(l.id!);
      setName(l.name);
      setDesc(l.description);
      setOrder(l.order);
      setMsg(`✏️ Editing: ${l.name}`);
  }

  async function saveLocation() {
    if (!name) return;
    const data = { name, description: desc, order: Number(order) };

    if (editingId) {
        await setDoc(doc(db, "locations", editingId), data, { merge: true });
        setMsg("✅ Updated Location");
    } else {
        await addDoc(collection(db, "locations"), data);
        setMsg("✅ Created New Location");
    }
    setName(""); setDesc(""); setEditingId(""); loadLocs();
  }
  
  async function deleteLoc(id: string) {
      if(!confirm("Delete location?")) return;
      await deleteDoc(doc(db, "locations", id));
      loadLocs();
  }

  return (
    <div className="grid md:grid-cols-2 gap-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-xl border dark:border-gray-700 shadow-sm transition-colors">
      <div className="space-y-4">
        <h2 className="font-bold text-xl">{editingId ? "Edit Location" : "Create Map Location"}</h2>
        
        {msg && <div className="text-green-600 dark:text-green-400 text-sm font-bold">{msg}</div>}
        
        <Input label="Location Name" value={name} onChange={(e:any)=>setName(e.target.value)} />
        <Input label="Description" value={desc} onChange={(e:any)=>setDesc(e.target.value)} />
        <Input type="number" label="Order (1, 2, 3...)" value={order} onChange={(e:any)=>setOrder(e.target.value)} />
        
        <div className="flex gap-2">
            <button onClick={saveLocation} className="btn-primary flex-1 bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 py-2 rounded-lg font-bold">
                {editingId ? "Update" : "Save"}
            </button>
            {editingId && (
                <button onClick={() => { setEditingId(""); setName(""); setDesc(""); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 dark:text-white rounded font-bold hover:bg-gray-300 dark:hover:bg-gray-600">
                    Cancel
                </button>
            )}
        </div>
      </div>
      
      <div className="space-y-4 border-l dark:border-gray-700 pl-4">
         {/* 🔍 SEARCH BAR */}
        <div>
            <input 
                className="input w-full text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                placeholder="🔍 Search Locations..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            <h2 className="font-bold text-gray-500 dark:text-gray-400 text-xs uppercase">Library ({visibleLocs.length})</h2>
            {visibleLocs.map(l => (
                <div 
                    key={l.id} 
                    onClick={() => loadLocationToEdit(l)}
                    className={`p-3 border rounded flex justify-between cursor-pointer transition-colors 
                        ${editingId === l.id 
                            ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 dark:bg-blue-900/30 dark:border-blue-400' 
                            : 'bg-white dark:bg-gray-800 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`
                    }
                >
                    <div>
                        <span className="font-bold mr-2 dark:text-gray-100">{l.order}. {l.name}</span>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{l.description}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteLoc(l.id!); }} className="text-xs text-red-400 font-bold hover:text-red-600 dark:hover:text-red-300">Delete</button>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// 5. ENCOUNTERS PANEL
// =========================================================
function EncountersPanel() {
  const [encounters, setEncounters] = useState<EncounterDoc[]>([]);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const visibleEncounters = encounters.filter(e => 
    e.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- FORM STATE ---
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [questionTag, setQuestionTag] = useState("level1");
  const [foesText, setFoesText] = useState(""); // "id1, id2"

  // Stats
  const [xp, setXp] = useState(100);
  const [gold, setGold] = useState(50);
  const [timeMult, setTimeMult] = useState(1.0);
  
  // Location
  const [locationId, setLocationId] = useState(""); 

  // Visuals & Logic
  const [imageUrl, setImageUrl] = useState("");
  const [emoji, setEmoji] = useState("👹");
  const [shuffle, setShuffle] = useState(false);

  useEffect(() => { loadEncounters(); }, []);

  async function loadEncounters() {
    try {
      const q = query(collection(db, "encounters"));
      const snap = await getDocs(q);
      setEncounters(snap.docs.map(d => ({ ...d.data(), id: d.id } as EncounterDoc)));
    } catch (e) { console.error(e); }
  }

  function resetForm() {
    setEditingId(""); setTitle(""); setDesc("");
    setQuestionTag("level1"); setFoesText(""); 
    
    // Stats Defaults
    setXp(100); setGold(50); setTimeMult(1.0);
    setLocationId("");

    // Visuals Defaults
    setImageUrl(""); setEmoji("👹"); setShuffle(false);
    setMsg("");
  }

  function loadEncounterToEdit(enc: EncounterDoc) {
    if (!enc.id) return;
    setEditingId(enc.id);
    setTitle(enc.title || "");
    setDesc(enc.description || "");
    if (enc.questionTags && enc.questionTags.length > 0) {
        setQuestionTag(enc.questionTags.join(", "));
    } else {
        setQuestionTag(enc.questionTag || "level1");
    }
    
    // Handle foes array OR legacy foeId
    if (enc.foes && enc.foes.length > 0) {
        setFoesText(enc.foes.join(", "));
    } else {
        setFoesText(enc.foeId || ""); 
    }

    setXp(enc.winRewardXp || 100);
    setGold(enc.winRewardGold || 50);          
    setTimeMult(enc.timeMultiplier !== undefined ? enc.timeMultiplier : 1.0);
    setLocationId(enc.locationId || "");       
    
    setImageUrl(enc.imageUrl || "");
    setEmoji(enc.emoji || "👹");
    setShuffle(enc.shuffleQuestions || false);
    
    setMsg(`✏️ Editing: ${enc.title}`);
  }

  async function saveEncounter() {
    if (!title) { setMsg("❌ Title is required"); return; }
    setMsg("Saving...");

    const foeIds = foesText.split(",").map(s => s.trim()).filter(Boolean);

    const docData: EncounterDoc = {
      title,
      description: desc,
      questionTag, //legacy
      questionTags: questionTag.split(",").map(s => s.trim()).filter(Boolean),
      
      // Stats
      winRewardXp: Number(xp),
      winRewardGold: Number(gold),
      timeMultiplier: Number(timeMult) || 1.0,
      
      // Logic
      locationId: locationId || "world-map",
      foes: foeIds,
      foeId: foeIds[0] || "",
      
      // Visuals
      imageUrl: imageUrl || "", 
      emoji: emoji || "👹",
      shuffleQuestions: shuffle
    };

    try {
      if (editingId) {
        await setDoc(doc(db, "encounters", editingId), docData, { merge: true });
        setMsg("✅ Updated Encounter!");
      } else {
        await addDoc(collection(db, "encounters"), docData);
        setMsg("✅ Created New Encounter!");
      }
      if (!editingId) resetForm();
      loadEncounters();
    } catch (e: any) { setMsg("Error: " + e.message); }
  }

  async function deleteEnc(id: string) {
    if (!confirm("Delete this encounter?")) return;
    await deleteDoc(doc(db, "encounters", id));
    loadEncounters();
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-xl border dark:border-gray-700 shadow-sm transition-colors">
      {/* FORM SIDE */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{editingId ? "✏️ Edit Encounter" : "⚔️ New Encounter"}</h2>
        
        {msg && <div className="text-center bg-blue-50 dark:bg-blue-900/30 p-2 rounded text-blue-800 dark:text-blue-200 font-bold text-sm">{msg}</div>}

        <Input label="Title" value={title} onChange={(e:any) => setTitle(e.target.value)} />
        <Input label="Description" value={desc} onChange={(e:any) => setDesc(e.target.value)} />
        
        <div className="grid grid-cols-2 gap-4">
           <Input label="Tag (e.g. level1)" value={questionTag} onChange={(e:any) => setQuestionTag(e.target.value)} />
           <Input label="Location ID" value={locationId} onChange={(e:any) => setLocationId(e.target.value)} placeholder="forest-1" />
        </div>

        <Input label="Foe IDs (comma sep)" value={foesText} onChange={(e:any) => setFoesText(e.target.value)} placeholder="goblin1, dragon2" />

        <div className="grid grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border dark:border-gray-600">
           <Input type="number" label="XP Reward" value={xp} onChange={(e:any) => setXp(Number(e.target.value))} />
           <Input type="number" label="Gold Reward" value={gold} onChange={(e:any) => setGold(Number(e.target.value))} />
           <Input type="number" step="0.01" min="0.1" label="Time Speed (x)" value={timeMult} onChange={(e:any) => setTimeMult(Number(e.target.value))} />
        </div>

        {/* VISUALS SECTION */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border dark:border-gray-600 space-y-3">
            <h3 className="text-xs font-bold uppercase text-gray-500 dark:text-gray-300">Visuals & Logic</h3>
            <Input label="Intro Image URL" value={imageUrl} onChange={(e:any) => setImageUrl(e.target.value)} placeholder="https://..." />
            
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                 <Input label="Custom Emoji" value={emoji} onChange={(e:any) => setEmoji(e.target.value)} placeholder="👹" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-gray-600 dark:border-gray-500 border px-3 py-3 rounded-lg h-[42px] mb-[2px]">
                <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Shuffle Qs?</span>
              </label>
            </div>
        </div>

        <div className="flex gap-2 pt-2">
            <button onClick={saveEncounter} className="btn-primary flex-1 bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 py-2 rounded-lg font-bold">
                {editingId ? "Update Encounter" : "Create Encounter"}
            </button>
            {editingId && (
                <button onClick={resetForm} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 dark:text-white rounded font-bold hover:bg-gray-300 dark:hover:bg-gray-600">
                    Cancel
                </button>
            )}
        </div>
      </div>

      {/* LIST SIDE */}
      <div className="space-y-4 border-l dark:border-gray-700 pl-4">
        <input 
            className="input w-full text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
            placeholder="🔍 Filter Encounters..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
        />
        <h3 className="font-bold text-gray-500 dark:text-gray-400 text-xs uppercase">Existing Encounters</h3>
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
            {visibleEncounters.map(enc => (
            <div 
                key={enc.id} 
                onClick={() => loadEncounterToEdit(enc)} 
                className={`p-3 border rounded flex justify-between items-center cursor-pointer transition-colors 
                    ${editingId === enc.id 
                        ? 'border-green-500 bg-green-50 ring-1 ring-green-500 dark:bg-green-900/30 dark:border-green-400' 
                        : 'dark:border-gray-600 hover:bg-green-50 dark:hover:bg-green-900/20'}`
                }
            >
                <div className="min-w-0">
                    <div className="font-bold text-sm flex items-center gap-2 dark:text-gray-100">
                      <span>{enc.emoji || "👹"}</span>
                      {enc.title}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 italic truncate max-w-[150px]">{enc.description}</div>
                </div>
                
                <button onClick={(e) => { e.stopPropagation(); if (enc.id) deleteEnc(enc.id); }} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 text-xs font-bold px-2 ml-2">
                    Delete
                </button>
            </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// UI HELPERS
// =========================================================

function TabButton({ label, active, onClick }: any) {
  return (
    <button 
      onClick={onClick} 
      className={`px-4 py-2 rounded-lg font-bold text-sm transition-all 
        ${active 
          ? 'bg-black text-white shadow-md dark:bg-white dark:text-black' 
          : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
        }`}
    >
      {label}
    </button>
  );
}

function Input({ label, className, ...props }: any) {
  return (
    <div className="mb-2">
      {label && (
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1 dark:text-gray-400">
          {label}
        </label>
      )}
      <input 
        className={`w-full p-2 border rounded-lg text-sm bg-white border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 
                   dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 transition-colors ${className || ""}`} 
        {...props} 
      />
    </div>
  );
}