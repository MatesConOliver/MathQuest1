"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  query
} from "firebase/firestore";
import { EncounterDoc } from "@/types/game";
import { Input } from "@/app/gm/components/Input";

export function EncountersPanel() {
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