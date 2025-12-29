"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs, // For lists
  getDoc,  // For editing specific items
  setDoc,  // For custom IDs (Items)
  addDoc,  // For auto IDs (Questions/Foes)
  deleteDoc,
  limit,
  query,
  orderBy
} from "firebase/firestore";

// Types imported from your game.ts
import { 
  GameItem, ItemType, EquipmentSlot, 
  QuestionDoc, Monster, EncounterDoc 
} from "@/types/game";

const GM_EMAIL = "oliveru1996@gmail.com"; 

export default function GMPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // 🗂️ TABS STATE
  const [activeTab, setActiveTab] = useState<"questions" | "foes" | "encounters" | "items">("questions");

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
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold">🛠️ GM Dashboard</h1>
          <p className="text-sm text-gray-400">Master Control Panel</p>
        </div>
        <div className="flex flex-wrap gap-2 bg-gray-100 p-1 rounded-xl">
          <TabButton label="Questions" active={activeTab === "questions"} onClick={() => setActiveTab("questions")} />
          <TabButton label="Foes" active={activeTab === "foes"} onClick={() => setActiveTab("foes")} />
          <TabButton label="Encounters" active={activeTab === "encounters"} onClick={() => setActiveTab("encounters")} />
          <TabButton label="Item Factory" active={activeTab === "items"} onClick={() => setActiveTab("items")} />
        </div>
      </header>

      {/* ACTIVE PANEL RENDERING */}
      <div className="bg-gray-50 p-1 rounded-2xl min-h-[600px]">
        {activeTab === "questions" && <QuestionsPanelOriginal />}
        {activeTab === "foes" && <FoesPanel />}
        {activeTab === "encounters" && <EncountersPanel />}
        {activeTab === "items" && <ItemsPanel />}
      </div>
    </main>
  );
}

// =========================================================
// 1. ORIGINAL QUESTIONS PANEL (RESTORED FULL LOGIC)
// =========================================================
function QuestionsPanelOriginal() {
  const [msg, setMsg] = useState("");
  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  
  // State for Editing
  const [editingId, setEditingId] = useState("");

  // Form Fields
  const [title, setTitle] = useState("");
  const [promptType, setPromptType] = useState<"text" | "latex" | "image">("text");
  const [promptText, setPromptText] = useState("");
  const [promptLatex, setPromptLatex] = useState("");
  const [promptImageUrl, setPromptImageUrl] = useState("");
  const [choices, setChoices] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  
  // Stats
  const [rewardXp, setRewardXp] = useState(10);
  const [rewardGold, setRewardGold] = useState(5);
  const [difficulty, setDifficulty] = useState(1);
  const [tagsText, setTagsText] = useState("level1");
  const [order, setOrder] = useState("");

  useEffect(() => { loadRecent(); }, []);

  async function loadRecent() {
    try {
      // Order by created/ID isn't perfect without a timestamp, but this works for now
      const q = query(collection(db, "questions"), limit(25));
      const snap = await getDocs(q);
      setQuestions(snap.docs.map(d => ({ ...d.data(), id: d.id } as QuestionDoc)));
    } catch (e) { console.error(e); }
  }

  // 🔄 RESTORED: Load data into form for editing
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
    setRewardXp(q.rewardXp || 10);
    setRewardGold(q.rewardGold || 5);
    setDifficulty(q.difficulty || 1);
    setTagsText(q.tags ? q.tags.join(",") : "level1");
    setOrder(q.order ? String(q.order) : "");
    setMsg(`✏️ Editing: ${q.title || "Untitled"}`);
  }

  function resetForm() {
    setEditingId("");
    setTitle("");
    setPromptType("text");
    setPromptText("");
    setPromptLatex("");
    setPromptImageUrl("");
    setChoices(["", "", "", ""]);
    setCorrectIndex(0);
    setRewardXp(10);
    setRewardGold(5);
    setDifficulty(1);
    setTagsText("level1");
    setOrder("");
    setMsg("");
  }

  async function saveQuestion() {
    setMsg("Saving...");
    const tagsArray = tagsText.split(",").map((s) => s.trim()).filter(Boolean);

    const docData: QuestionDoc = {
      title: title || "Untitled",
      promptType,
      promptText: promptText || undefined,
      promptLatex: promptLatex || undefined,
      promptImageUrl: promptImageUrl || undefined,
      choices,
      correctIndex,
      rewardXp: Number(rewardXp),
      rewardGold: Number(rewardGold),
      difficulty: Number(difficulty), // Ensures number type
      tags: tagsArray,
      order: order ? Number(order) : undefined,
    };

    try {
      if (editingId) {
        // UPDATE Existing
        await setDoc(doc(db, "questions", editingId), docData, { merge: true });
        setMsg("✅ Updated Question!");
      } else {
        // CREATE New
        await addDoc(collection(db, "questions"), docData);
        setMsg("✅ Created New Question!");
      }
      loadRecent();
      if (!editingId) resetForm(); // Only clear if we were creating new
    } catch (e: any) { setMsg("Error: " + e.message); }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-xl border shadow-sm">
      {/* LEFT: FORM */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">{editingId ? "✏️ Edit Mode" : "📝 New Question"}</h2>
          <button onClick={resetForm} className="text-xs bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded">Reset Form</button>
        </div>
        
        {msg && <div className="text-center bg-blue-50 p-2 rounded text-blue-800 font-bold text-sm">{msg}</div>}

        <Input label="Internal Title" value={title} onChange={(e:any) => setTitle(e.target.value)} />

        {/* Prompt Type Toggle */}
        <div className="flex gap-2 mb-2">
          {(["text", "latex", "image"] as const).map(t => (
            <button key={t} onClick={() => setPromptType(t)} 
              className={`px-3 py-1 text-xs font-bold uppercase rounded border transition-colors ${promptType === t ? 'bg-black text-white' : 'bg-gray-100'}`}>
              {t}
            </button>
          ))}
        </div>

        {promptType === "text" && <Input label="Prompt Text" value={promptText} onChange={(e:any) => setPromptText(e.target.value)} />}
        {promptType === "latex" && <Input label="LaTeX Formula (e.g. \sqrt{x})" value={promptLatex} onChange={(e:any) => setPromptLatex(e.target.value)} />}
        {promptType === "image" && <Input label="Image URL" value={promptImageUrl} onChange={(e:any) => setPromptImageUrl(e.target.value)} />}

        {/* Choices */}
        <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-xl border">
          {choices.map((c, i) => (
            <div key={i}>
              <label className="text-[10px] font-bold uppercase flex justify-between px-1 mb-1 cursor-pointer">
                <span>Option {i + 1}</span>
                <input type="radio" checked={correctIndex === i} onChange={() => setCorrectIndex(i)} />
              </label>
              <input 
                className={`w-full border px-2 py-1 rounded text-sm transition-all ${correctIndex === i ? 'border-green-500 bg-green-50 ring-1 ring-green-500' : ''}`}
                value={c}
                onChange={(e) => {
                  const copy = [...choices]; copy[i] = e.target.value; setChoices(copy);
                }}
                placeholder={`Answer ${i+1}`}
              />
            </div>
          ))}
        </div>

        {/* Meta Data */}
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tags (comma sep)" value={tagsText} onChange={(e:any) => setTagsText(e.target.value)} />
          <Input type="number" label="Order (Optional)" value={order} onChange={(e:any) => setOrder(e.target.value)} placeholder="1" />
        </div>
        <div className="grid grid-cols-3 gap-2">
           <Input type="number" label="XP Reward" value={rewardXp} onChange={(e:any) => setRewardXp(Number(e.target.value))} />
           <Input type="number" label="Gold Reward" value={rewardGold} onChange={(e:any) => setRewardGold(Number(e.target.value))} />
           {/* Fixed Type Error: Using Number() */}
           <Input type="number" label="Difficulty (1-3)" value={difficulty} onChange={(e:any) => setDifficulty(Number(e.target.value))} />
        </div>

        <button onClick={saveQuestion} className="btn-primary">
          {editingId ? "Update Question" : "Create Question"}
        </button>
      </div>

      {/* RIGHT: LIST */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Recent Questions</h2>
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
          {questions.map((q) => (
            <div key={q.id} 
              onClick={() => loadQuestionToEdit(q)} // 👈 RESTORED CLICK TO EDIT
              className={`p-3 border rounded cursor-pointer transition-all hover:bg-blue-50 hover:border-blue-300 ${editingId === q.id ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : ''}`}
            >
              <div className="font-bold text-sm truncate">{q.promptText || q.promptLatex || "Image Question"}</div>
              <div className="text-xs text-gray-400 flex justify-between mt-1">
                <span>{q.tags?.join(", ")}</span>
                <span className="flex gap-2">
                    {q.difficulty && <span className="text-orange-400">★{q.difficulty}</span>}
                    {q.order && <span className="bg-gray-200 px-1 rounded text-gray-600">#{q.order}</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// 2. ITEMS PANEL (NEW FACTORY)
// =========================================================
function ItemsPanel() {
  const [msg, setMsg] = useState("");
  // Basic Info
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState(""); 
  const [price, setPrice] = useState(10);
  const [type, setType] = useState<ItemType>("weapon");
  const [slot, setSlot] = useState<EquipmentSlot>("mainHand");
  
  // Stats
  const [dmgFlat, setDmgFlat] = useState<number | "">("");
  const [dmgMult, setDmgMult] = useState<number | "">("");
  const [defFlat, setDefFlat] = useState<number | "">("");
  const [defMult, setDefMult] = useState<number | "">("");
  const [timeFactor, setTimeFactor] = useState<number | "">("");

  const handleSave = async () => {
    if (!id || !name) { setMsg("❌ ID & Name required"); return; }
    
    // Construct the generic GameItem object
    const newItem: GameItem = {
      id, name, description: desc, price: Number(price), type,
      slot: (type === 'potion' || type === 'misc') ? undefined : slot,
      imageUrl: "https://placehold.co/100?text=" + name.charAt(0), 
      stats: {
        ...( (dmgFlat || dmgMult) && { damage: { ...(dmgFlat && { flat: Number(dmgFlat) }), ...(dmgMult && { mult: Number(dmgMult) }) } }),
        ...( (defFlat || defMult) && { defense: { ...(defFlat && { flat: Number(defFlat) }), ...(defMult && { mult: Number(defMult) }) } }),
        ...( timeFactor && { timeFactor: Number(timeFactor) })
      }
    };
    try {
      await setDoc(doc(db, "items", id), newItem);
      setMsg(`✅ Saved Item: ${name}`); 
      setId(""); // Clear ID to prevent accidental overwrite
    } catch (e: any) { setMsg("Error: " + e.message); }
  };

  return (
    <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
      <div className="flex justify-between items-center"><h2 className="text-xl font-bold">Create Item</h2>{msg && <span className="text-sm font-bold text-green-600">{msg}</span>}</div>
      
      <div className="grid grid-cols-2 gap-4">
        <Input label="ID (Unique, e.g. sword-fire)" value={id} onChange={(e:any) => setId(e.target.value)} />
        <Input label="Name" value={name} onChange={(e:any) => setName(e.target.value)} />
      </div>
      
      <Input label="Lore Description" value={desc} onChange={(e:any) => setDesc(e.target.value)} />
      
      <div className="grid grid-cols-3 gap-4">
        <div>
            <label className="label">Type</label>
            <select className="input" value={type} onChange={e => setType(e.target.value as any)}>
                <option value="weapon">Weapon</option><option value="armor">Armor</option><option value="potion">Potion</option><option value="misc">Misc</option>
            </select>
        </div>
        <div>
            <label className="label">Slot</label>
            <select className="input disabled:bg-gray-100" disabled={type==='potion'||type==='misc'} value={slot} onChange={e => setSlot(e.target.value as any)}>
                <option value="mainHand">Main Hand</option><option value="offHand">Off Hand</option><option value="armor">Armor</option><option value="head">Head</option>
            </select>
        </div>
        <Input type="number" label="Price (Gold)" value={price} onChange={(e:any) => setPrice(Number(e.target.value))} />
      </div>
      
      <hr className="border-gray-200" />
      
      <div className="grid grid-cols-3 gap-4">
        <div className="p-3 bg-red-50 rounded border border-red-100">
            <div className="text-xs font-bold text-red-800 uppercase mb-2">Damage</div>
            <div className="flex gap-2"><input className="input text-xs" placeholder="Flat (+)" value={dmgFlat} onChange={(e:any)=>setDmgFlat(Number(e.target.value))}/><input className="input text-xs" placeholder="Mult (x)" value={dmgMult} onChange={(e:any)=>setDmgMult(Number(e.target.value))}/></div>
        </div>
        <div className="p-3 bg-blue-50 rounded border border-blue-100">
            <div className="text-xs font-bold text-blue-800 uppercase mb-2">Defense</div>
            <div className="flex gap-2"><input className="input text-xs" placeholder="Flat (+)" value={defFlat} onChange={(e:any)=>setDefFlat(Number(e.target.value))}/><input className="input text-xs" placeholder="Mult (x)" value={defMult} onChange={(e:any)=>setDefMult(Number(e.target.value))}/></div>
        </div>
        <div className="p-3 bg-purple-50 rounded border border-purple-100">
            <div className="text-xs font-bold text-purple-800 uppercase mb-2">Time Manipulation</div>
            <input className="input text-xs" placeholder="Factor (e.g. 1.5)" value={timeFactor} onChange={(e:any)=>setTimeFactor(Number(e.target.value))}/>
        </div>
      </div>
      <button onClick={handleSave} className="btn-primary">Save Item</button>
    </div>
  );
}

// =========================================================
// 3. FOES PANEL
// =========================================================
function FoesPanel() {
  const [foes, setFoes] = useState<Monster[]>([]);
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [hp, setHp] = useState(20);
  const [damage, setDamage] = useState(2);
  const [editingId, setEditingId] = useState("");
  
  useEffect(() => { loadFoes(); }, []);
  async function loadFoes() {
    const s = await getDocs(collection(db, "foes"));
    setFoes(s.docs.map(d => ({ ...d.data(), id: d.id } as Monster)));
  }
  // 1. New Function: Load data into form
  function loadFoeToEdit(f: Monster) {
    setEditingId(f.id);
    setName(f.name);
    setHp(f.maxHp);
    // Handle both 'damage' and 'attackDamage' depending on your DB version
    setDamage(f.damage || (f as any).attackDamage || 2); 
    setMsg(`✏️ Editing: ${f.name}`);
  }

  // 2. Updated Function: Handle Create OR Update
  async function saveFoe() {
    if (!name) return;
    
    const foeData = { 
      name, 
      maxHp: Number(hp), 
      attackDamage: Number(damage) 
    };

    try {
      if (editingId) {
         // UPDATE existing Foe
         await setDoc(doc(db, "foes", editingId), foeData, { merge: true });
         setMsg(`✅ Updated ${name}`);
      } else {
         // CREATE new Foe
         await addDoc(collection(db, "foes"), foeData);
         setMsg(`✅ Created ${name}`);
      }
      
      // Reset Form
      setName(""); setHp(20); setDamage(2); setEditingId("");
      loadFoes();
    } catch (e: any) { setMsg(e.message); }
  }
  async function deleteFoe(id: string) {
    if(!confirm("Delete this foe?")) return;
    await deleteDoc(doc(db, "foes", id)); loadFoes();
  }

  return (
    <div className="grid md:grid-cols-2 gap-6 bg-white p-6 rounded-xl border shadow-sm">
      <div className="space-y-4">
        <h2 className="font-bold text-xl">New Foe</h2>
        {msg && <div className="text-green-600 text-sm">{msg}</div>}
        <Input label="Name" value={name} onChange={(e:any) => setName(e.target.value)} placeholder="Goblin" />
        <div className="grid grid-cols-2 gap-4"><Input type="number" label="HP" value={hp} onChange={(e:any)=>setHp(Number(e.target.value))}/><Input type="number" label="Attack Dmg" value={damage} onChange={(e:any)=>setDamage(Number(e.target.value))}/></div>
        <button onClick={saveFoe} className="btn-primary">Save Foe</button>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        <h2 className="font-bold text-xl">Existing Foes</h2>
        {foes.map(f => (
          <div key={f.id} onClick={() => loadFoeToEdit(f)} className="p-3 border rounded flex justify-between items-center hover:bg-gray-50">
            <div><div className="font-bold text-sm">{f.name}</div><div className="text-xs text-red-500">HP:{f.maxHp} ATK:{f.damage||(f as any).attackDamage}</div></div>
            <button onClick={() => deleteFoe(f.id)} className="text-red-400 hover:text-red-600 text-xs font-bold px-2">Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================================
// 4. ENCOUNTERS PANEL
// =========================================================
function EncountersPanel() {
  const [encounters, setEncounters] = useState<EncounterDoc[]>([]);
  const [foes, setFoes] = useState<Monster[]>([]);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState("");
  
  // Form
  const [title, setTitle] = useState("");
  const [foeId, setFoeId] = useState("");
  const [tag, setTag] = useState("level1");
  const [dmg, setDmg] = useState(5);
  const [xp, setXp] = useState(20);
  const [gold, setGold] = useState(10);
  const [time, setTime] = useState(20);

  useEffect(() => { loadEncounters(); loadFoes(); }, []);
  async function loadEncounters() {
    const s = await getDocs(collection(db, "encounters"));
    setEncounters(s.docs.map(d => ({ ...d.data(), id: d.id } as EncounterDoc)));
  }
  async function loadFoes() {
    const s = await getDocs(collection(db, "foes"));
    setFoes(s.docs.map(d => ({ ...d.data(), id: d.id } as Monster)));
  }
  async function saveEncounter() {
    if (!title || !foeId) { setMsg("❌ Title & Foe required"); return; }
    
    const data: EncounterDoc = {
      title,
      foeId,
      questionTag: tag,
      damagePerCorrect: Number(dmg),
      winRewardXp: Number(xp),
      winRewardGold: Number(gold),
      timeLimitSeconds: Number(time)
    };

    try {
      if (editingId) {
        // 🔄 UPDATE EXISTING
        await setDoc(doc(db, "encounters", editingId), data, { merge: true });
        setMsg(`✅ Updated ${title}`);
      } else {
        // 🆕 CREATE NEW
        await addDoc(collection(db, "encounters"), data);
        setMsg(`✅ Created ${title}`);
      }
      
      // Clear form and reload
      loadEncounters();
      setEditingId(""); // Stop editing mode
      setTitle(""); 
      // (Optional: reset other fields to defaults if you like)
    } catch (e: any) { 
      setMsg(e.message); 
    }
  }
  async function deleteEnc(id: string) {
    if(!confirm("Delete?")) return;
    await deleteDoc(doc(db, "encounters", id)); loadEncounters();
  }

  function loadEncounterToEdit(enc: EncounterDoc) {
    if (!enc.id) return;
    setEditingId(enc.id);
    setTitle(enc.title);
    setFoeId(enc.foeId);
    setTag(enc.questionTag);
    setDmg(enc.damagePerCorrect);
    setXp(enc.winRewardXp);
    setGold(enc.winRewardGold);
    setTime(enc.timeLimitSeconds || 20);
    setMsg(`✏️ Loaded: ${enc.title} )`);
  }

  return (
    <div className="grid md:grid-cols-2 gap-6 bg-white p-6 rounded-xl border shadow-sm">
      <div className="space-y-4">
        <h2 className="font-bold text-xl">New Battle</h2>
        {msg && <div className="text-green-600 text-sm">{msg}</div>}
        <Input label="Title" value={title} onChange={(e:any)=>setTitle(e.target.value)} />
        <div>
            <label className="label">Foe</label>
            <select className="input" value={foeId} onChange={e=>setFoeId(e.target.value)}>
                <option value="">Select Foe</option>{foes.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
        </div>
        <div className="grid grid-cols-2 gap-4"><Input label="Q Tag" value={tag} onChange={(e:any)=>setTag(e.target.value)} /><Input type="number" label="Player Dmg" value={dmg} onChange={(e:any)=>setDmg(Number(e.target.value))} /></div>
        <div className="grid grid-cols-3 gap-2"><Input type="number" label="XP" value={xp} onChange={(e:any)=>setXp(Number(e.target.value))} /><Input type="number" label="Gold" value={gold} onChange={(e:any)=>setGold(Number(e.target.value))} /><Input type="number" label="Time(s)" value={time} onChange={(e:any)=>setTime(Number(e.target.value))} /></div>
        <button onClick={saveEncounter} className="btn-primary">Save Battle</button>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        <h2 className="font-bold text-xl">Existing Battles</h2>
        {encounters.map(e => (
          <div key={e.id} onClick={() => loadEncounterToEdit(e)} className={`p-3 border rounded flex justify-between items-center cursor-pointer hover:bg-green-50 ${editingId === e.id ? 'border-green-500 bg-green-50 ring-1 ring-green-500' : ''}`}>
            <div><div className="font-bold text-sm">{e.title}</div><div className="text-xs text-gray-400">{e.questionTag} | {e.timeLimitSeconds}s</div></div>
            <button onClick={() => deleteEnc(e.id!)} className="text-red-400 hover:text-red-600 text-xs font-bold px-2">Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================================
// UI HELPERS
// =========================================================
function TabButton({ label, active, onClick }: any) {
  return <button onClick={onClick} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${active ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-white hover:shadow'}`}>{label}</button>;
}
function Input({ label, ...props }: any) {
  return <div><label className="label">{label}</label><input className="input" {...props} /></div>;
}

// STYLES (Add to globals.css if preferred, but referencing here for structure)
// .input { w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black transition-all }
// .label { block text-xs font-bold uppercase text-gray-500 mb-1 }
// .btn-primary { w-full bg-black text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-md active:scale-95 }