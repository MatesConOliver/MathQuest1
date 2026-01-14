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
  query,
  orderBy
} from "firebase/firestore";
import { GameLocation } from "@/types/game";
import { Input } from "@/app/gm/components/Input";

export function LocationsPanel() {
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