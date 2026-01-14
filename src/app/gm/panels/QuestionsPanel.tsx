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
  limit,
  query,
  orderBy,
  where
} from "firebase/firestore";

import 'katex/dist/katex.min.css'; 
import { InlineMath, BlockMath } from 'react-katex';
import { QuestionDoc } from "@/types/game";
import { Input } from "@/app/gm/components/Input";

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

export function QuestionsPanelOriginal() {
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