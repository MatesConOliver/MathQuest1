
"use client";

import { useEffect, useState, ChangeEvent, MouseEvent } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  where,
} from "firebase/firestore";
import { EncounterDoc, GameLocation, SubArea } from "@/types/game";
import { Input } from "@/app/gm/components/Input";

export function EncountersPanel() {
    const [encounters, setEncounters] = useState<EncounterDoc[]>([]);
    const [locations, setLocations] = useState<GameLocation[]>([]);
    const [subAreas, setSubAreas] = useState<SubArea[]>([]);
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
    const [foesText, setFoesText] = useState("");
    const [xp, setXp] = useState(100);
    const [gold, setGold] = useState(50);
    const [timeMult, setTimeMult] = useState(1.0);
    const [order, setOrder] = useState(0);
    const [imageUrl, setImageUrl] = useState("");
    const [emoji, setEmoji] = useState("👹");
    const [shuffle, setShuffle] = useState(false);
    const [winRewardStoryFlag, setWinRewardStoryFlag] = useState("");

    const [selectedLocationId, setSelectedLocationId] = useState("");
    const [selectedSubAreaId, setSelectedSubAreaId] = useState("");

    // Skill Rewards
    const [rewardAlgebra, setRewardAlgebra] = useState(0);
    const [rewardFunctions, setRewardFunctions] = useState(0);
    const [rewardGeometry, setRewardGeometry] = useState(0);
    const [rewardStats, setRewardStats] = useState(0);
    const [rewardCalculus, setRewardCalculus] = useState(0);

  
    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, "encounters"), orderBy("title")), (snap) => {
            setEncounters(snap.docs.map(d => ({ ...d.data(), id: d.id } as EncounterDoc)));
        });
        const unsubLocs = onSnapshot(query(collection(db, "locations"), orderBy("order")), (snap) => {
            setLocations(snap.docs.map(d => ({ ...d.data(), id: d.id } as GameLocation)));
        });
        return () => { unsub(); unsubLocs(); };
    }, []);

    useEffect(() => {
        if (!selectedLocationId) {
            setSubAreas([]);
            return;
        }
        const unsub = onSnapshot(
            query(collection(db, "subAreas"), where("locationId", "==", selectedLocationId), orderBy("order")),
            (snap) => {
                setSubAreas(snap.docs.map(d => ({ ...d.data(), id: d.id } as SubArea)));
            }
        );
        return () => unsub();
    }, [selectedLocationId]);
  
    function resetForm() {
      setEditingId(""); setTitle(""); setDesc("");
      setQuestionTag(""); setFoesText(""); 
      setXp(0); setGold(0); setTimeMult(1.0); setOrder(0);
      setSelectedLocationId(""); setSelectedSubAreaId("");
      setRewardAlgebra(0); setRewardFunctions(0); setRewardGeometry(0); setRewardStats(0); setRewardCalculus(0);
      setImageUrl(""); setEmoji(""); setShuffle(false);
      setWinRewardStoryFlag("");
      setMsg("");
    }
  
    async function loadEncounterToEdit(enc: EncounterDoc) {
      if (!enc.id) return;
      setEditingId(enc.id);
      setTitle(enc.title || "");
      setDesc(enc.description || "");
      setQuestionTag(enc.questionTags?.join(", ") || enc.questionTag || "level1");
      setFoesText(enc.foes?.join(", ") || enc.foeId || "");
  
      setXp(enc.winRewardXp || 0);
      setGold(enc.winRewardGold || 0);          
      setTimeMult(enc.timeMultiplier !== undefined ? enc.timeMultiplier : 1.0);
      setOrder(enc.order || 0);
      
      const subAreaLocationId = subAreas.find(sa => sa.id === enc.subAreaId)?.locationId;
      setSelectedLocationId(enc.locationId || subAreaLocationId || ""); 

      setTimeout(() => {
        setSelectedSubAreaId(enc.subAreaId || "");
      }, 0);

      setImageUrl(enc.imageUrl || "");
      setEmoji(enc.emoji || "");
      setShuffle(enc.shuffleQuestions || false);
      setWinRewardStoryFlag(enc.winRewardStoryFlag || "");

      setRewardAlgebra(enc.winRewardSkills?.algebra || 0);
      setRewardFunctions(enc.winRewardSkills?.functions || 0);
      setRewardGeometry(enc.winRewardSkills?.geometry || 0);
      setRewardStats(enc.winRewardSkills?.probabilityAndStatistics || 0);
      setRewardCalculus(enc.winRewardSkills?.calculus || 0);
      
      setMsg(`✏️ Editing: ${enc.title}`);
    }
  
    async function saveEncounter() {
      if (!title || !selectedSubAreaId) { setMsg("❌ Title and a Sub-Area selection are required"); return; }
      setMsg("Saving...");
  
      const foeIds = foesText.split(",").map(s => s.trim()).filter(Boolean);
      const skillsReward = {
        algebra: Number(rewardAlgebra), functions: Number(rewardFunctions), geometry: Number(rewardGeometry),
        probabilityAndStatistics: Number(rewardStats), calculus: Number(rewardCalculus),
      };
      const finalSkillsReward = Object.fromEntries(Object.entries(skillsReward).filter(([, value]) => value > 0));
      
      const docData: EncounterDoc = {
        title, description: desc,
        order: Number(order),
        questionTags: questionTag.split(",").map(s => s.trim()).filter(Boolean),
        winRewardXp: Number(xp), winRewardGold: Number(gold), timeMultiplier: Number(timeMult) || 1.0,
        winRewardSkills: finalSkillsReward,
        ...(winRewardStoryFlag && { winRewardStoryFlag }),
        subAreaId: selectedSubAreaId,
        locationId: selectedLocationId, // For backward compatibility
        foes: foeIds, foeId: foesText.split(",")[0]?.trim() || "",
        imageUrl: imageUrl || "", emoji: emoji || "👹", shuffleQuestions: shuffle,
        questionTag: questionTag //legacy
      };
  
      try {
        const docRef = editingId ? doc(db, "encounters", editingId) : await addDoc(collection(db, "encounters"), {});
        await setDoc(docRef, docData, { merge: true });
        
        setMsg(editingId ? "✅ Updated Encounter!" : "✅ Created New Encounter!");
        if (!editingId) resetForm();
        else setEditingId(docRef.id); // Ensure editingId is set for new docs

      } catch (e: any) { setMsg("Error: " + e.message); }
    }
  
    async function deleteEnc(id: string) {
      if (!confirm("Delete this encounter forever?")) return;
      await deleteDoc(doc(db, "encounters", id));
      if(editingId === id) resetForm();
    }
  
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-xl border dark:border-gray-700 shadow-sm transition-colors">
        {/* FORM SIDE */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold">{editingId ? "✏️ Edit Encounter" : "⚔️ New Encounter"}</h2>
          {msg && <div className="text-center bg-blue-50 dark:bg-blue-900/30 p-2 rounded text-blue-800 dark:text-blue-200 font-bold text-sm">{msg}</div>}
  
          <Input label="Title" value={title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} />
          <Input label="Description" value={desc} onChange={(e: ChangeEvent<HTMLInputElement>) => setDesc(e.target.value)} />
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Location</label>
              <select value={selectedLocationId} onChange={(e: ChangeEvent<HTMLSelectElement>) => {setSelectedLocationId(e.target.value); setSelectedSubAreaId("");}} className="input">
                <option value="">Select Location...</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Sub-Area</label>
              <select value={selectedSubAreaId} onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedSubAreaId(e.target.value)} className="input" disabled={!selectedLocationId}>
                <option value="">Select Sub-Area...</option>
                {subAreas.map(sa => <option key={sa.id} value={sa.id}>{sa.name}</option>)}
              </select>
            </div>
          </div>

          <Input label="Question Tags (comma sep)" value={questionTag} onChange={(e: ChangeEvent<HTMLInputElement>) => setQuestionTag(e.target.value)} placeholder="level1, algebra" />
          <Input label="Foe IDs (comma sep)" value={foesText} onChange={(e: ChangeEvent<HTMLInputElement>) => setFoesText(e.target.value)} placeholder="goblin, dragon" />
  
          <div className="grid grid-cols-4 gap-4 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border dark:border-gray-600">
             <Input type="number" label="XP" value={xp} onChange={(e: ChangeEvent<HTMLInputElement>) => setXp(Number(e.target.value))} />
             <Input type="number" label="Gold" value={gold} onChange={(e: ChangeEvent<HTMLInputElement>) => setGold(Number(e.target.value))} />
             <Input type="number" step="0.1" min="0.1" label="Time x" value={timeMult} onChange={(e: ChangeEvent<HTMLInputElement>) => setTimeMult(Number(e.target.value))} />
             <Input type="number" label="Order" value={order} onChange={(e: ChangeEvent<HTMLInputElement>) => setOrder(Number(e.target.value))} />
          </div>

          <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border dark:border-gray-600">
            <h3 className="label-sm">Skill Rewards</h3>
            <div className="grid grid-cols-3 gap-2">
                <Input type="number" label="Algebra" value={rewardAlgebra} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardAlgebra(Number(e.target.value))} />
                <Input type="number" label="Functions" value={rewardFunctions} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardFunctions(Number(e.target.value))} />
                <Input type="number" label="Geometry" value={rewardGeometry} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardGeometry(Number(e.target.value))} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
                <Input type="number" label="Stats/Prob" value={rewardStats} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardStats(Number(e.target.value))} />
                <Input type="number" label="Calculus" value={rewardCalculus} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardCalculus(Number(e.target.value))} />
            </div>
          </div>

          <Input label="Win Reward Story Flag" value={winRewardStoryFlag} onChange={(e: ChangeEvent<HTMLInputElement>) => setWinRewardStoryFlag(e.target.value)} placeholder="e.g., DEFEATED_GOBLIN_KING" />
  
          <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border dark:border-gray-600 space-y-3">
              <h3 className="label-sm">Visuals & Logic</h3>
              <Input label="Image URL" value={imageUrl} onChange={(e: ChangeEvent<HTMLInputElement>) => setImageUrl(e.target.value)} placeholder="https://..." />
              <div className="flex gap-4 items-end">
                <Input label="Emoji" value={emoji} onChange={(e: ChangeEvent<HTMLInputElement>) => setEmoji(e.target.value)} placeholder="👹" />
                <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-gray-600 dark:border-gray-500 border px-3 py-3 rounded-lg h-[42px] mb-[2px]">
                  <input type="checkbox" checked={shuffle} onChange={(e: ChangeEvent<HTMLInputElement>) => setShuffle(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-bold">Shuffle Qs?</span>
                </label>
              </div>
          </div>
  
          <div className="flex gap-2 pt-2">
              <button onClick={saveEncounter} className="btn-primary flex-1 py-2 rounded-lg font-bold">
                  {editingId ? "Update Encounter" : "Create Encounter"}
              </button>
              {editingId && (
                  <button onClick={resetForm} className="btn-secondary">
                      Cancel
                  </button>
              )}
          </div>
        </div>
  
        <div className="space-y-4 border-l dark:border-gray-700 pl-4">
          <Input 
              className="w-full text-sm" 
              placeholder="🔍 Filter Encounters..." 
              value={searchTerm} 
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)} 
          />
          <h3 className="label-sm">Existing Encounters</h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
              {visibleEncounters.map(enc => {
                  const subArea = subAreas.find(sa => sa.id === enc.subAreaId);
                  const location = locations.find(l => l.id === enc.locationId || l.id === subArea?.locationId);
                  return (
                      <div 
                          key={enc.id} 
                          onClick={() => loadEncounterToEdit(enc)} 
                          className={`p-3 border rounded-lg flex justify-between items-center cursor-pointer transition-colors 
                              ${editingId === enc.id 
                                  ? 'border-green-500 bg-green-50 ring-1 ring-green-500 dark:bg-green-900/30 dark:border-green-400' 
                                  : 'dark:border-gray-600 hover:bg-gray-700/50'}`}
                      >
                          <div className="min-w-0">
                              <div className="font-bold text-sm flex items-center gap-2 dark:text-gray-100">
                                <span>{enc.emoji || "👹"}</span>
                                {enc.title}
                              </div>
                              <div className="text-xs text-gray-400 font-mono">{location?.name} &gt; {subArea?.name || `(${enc.subAreaId || 'Legacy'})`}</div>
                          </div>
                          <button onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); if (enc.id) deleteEnc(enc.id); }} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 text-xs font-bold px-2 ml-2">
                              DEL
                          </button>
                      </div>
                  )
              })}
          </div>
        </div>
      </div>
    );
  }
