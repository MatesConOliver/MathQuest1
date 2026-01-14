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

import { Monster } from "@/types/game";
import { Input } from "@/app/gm/components/Input";

export function FoesPanel() {
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
    
    // 🟢 NEW FIELDS (Defense Removed)
    const [attack, setAttack] = useState<number | "">("");
  
    useEffect(() => { loadFoes(); }, []);
  
    async function loadFoes() {
      try {
        const snap = await getDocs(collection(db, "foes"));
        setFoes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Monster)));
      } catch (e) { console.error(e); }
    }
  
    function resetForm() {
      setId(""); setName(""); setDesc(""); setEmoji("👾");
      setMaxHp(""); setAttack(""); 
      setMsg("");
    }
  
    function loadFoeToEdit(f: Monster) {
      setId(f.id || "");
      setName(f.name);
      setDesc(f.description || "");
      setEmoji(f.emoji || "👾");
      setMaxHp(f.maxHp || "");
      setAttack(f.attackDamage ?? ""); 
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
        // Defense removed from save data
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
  
          {/* 🟢 NEW STAT INPUTS (Attack Only) */}
          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-900/50">
             <Input type="number" label="Attack Dmg" value={attack} onChange={(e: any) => setAttack(Number(e.target.value))} placeholder="5" />
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
                          {/* 🟢 SHOW STATS IN LIST (Defense Removed) */}
                          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                             ❤️{f.maxHp} ⚔️{f.attackDamage ?? "?"}
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