"use client";

import { useEffect, useState, useMemo } from "react";
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
  where,
  serverTimestamp,
} from "firebase/firestore";

import 'katex/dist/katex.min.css'; 
import { InlineMath, BlockMath } from 'react-katex';
import { QuestionDoc, ContentBlock } from "@/types/game";
import { Input } from "@/app/gm/components/Input";

// ==================================================================================
// 👇 NEW HELPERS for migrating to structured content
// ==================================================================================

/**
 * Converts a string with mixed text and LaTeX (e.g., "Find $x$")
 * into an array of structured ContentBlocks.
 * @param text The input string.
 * @returns An array of ContentBlocks.
 */
const stringToContentBlocks = (text: string): ContentBlock[] => {
    if (!text) return [];
    // Regex to split by markdown images and by $...$ latex, keeping delimiters
    const parts = text.split(/(!\[.*?\]\(.*?\)|\$.*?\$)/g).filter(Boolean);
  
    return parts.map(part => {
      if (part.startsWith('![')) { // Handle images
        const altMatch = part.match(/!\[(.*?)\]/);
        const urlMatch = part.match(/\((.*?)\)/);
        return { type: 'image', value: urlMatch ? urlMatch[1] : '' };
      }
      if (part.startsWith('$') && part.endsWith('$')) { // Handle LaTeX
        return { type: 'latex', value: part.slice(1, -1) };
      }
      return { type: 'text', value: part }; // Handle text
    });
};

/**
 * Converts an array of structured ContentBlocks back into a single
 * string for editing in a text field.
 * @param blocks The array of ContentBlocks.
 * @returns A single string representation.
 */
const contentBlocksToString = (blocks: ContentBlock[] | undefined): string => {
    if (!blocks) return "";
    return blocks.map(block => {
        if (block.type === 'latex') {
            return `$${block.value}$`;
        }
        if (block.type === 'image') {
            return `![image](${block.value})`;
        }
        return block.value;
    }).join('');
};

/**
 * Renders an array of ContentBlocks into React nodes for display.
 * @param blocks The array of ContentBlocks.
 * @param isBlockMath If true, wraps LaTeX in <BlockMath> instead of <InlineMath>.
 * @returns A React fragment with the rendered content.
 */
const renderContent = (blocks: ContentBlock[] | undefined, isBlockMath = false) => {
    if (!blocks) return null;
    const MathComponent = isBlockMath ? BlockMath : InlineMath;
    return (
      <>
        {blocks.map((block, index) => {
          switch (block.type) {
            case 'text':
              return <span key={index}>{block.value}</span>;
            case 'latex':
              try {
                return <span key={index} className="inline-block mx-1 text-blue-600 dark:text-blue-400"><MathComponent math={block.value} /></span>;
              } catch (e) { return <span key={index} className="text-red-500 font-mono">{`$${block.value}$`}</span> }
            case 'image':
              return <img key={index} src={block.value} alt="Content" className="my-2 rounded-lg max-w-full h-auto" />;
            default:
              return null;
          }
        })}
      </>
    );
  };


export function QuestionsPanel() {
    const [msg, setMsg] = useState("");
    const [questions, setQuestions] = useState<QuestionDoc[]>([]);
    const [editingId, setEditingId] = useState("");
  
    // Search
    const [dbTagSearch, setDbTagSearch] = useState("");
    const [localFilter, setLocalFilter] = useState("");
  
    // UNIFIED FORM STATE
    const [title, setTitle] = useState("");
    const [promptString, setPromptString] = useState(""); // Unified prompt field
    const [choices, setChoices] = useState(["", "", "", ""]);
    const [correctIndex, setCorrectIndex] = useState(0);
    const [difficulty, setDifficulty] = useState(1);
    const [tagsText, setTagsText] = useState("level1");
    const [order, setOrder] = useState("");
    const [qMinutes, setQMinutes] = useState(0);
    const [qSeconds, setQSeconds] = useState(30);

    // Memoized preview content
    const promptPreview = useMemo(() => stringToContentBlocks(promptString), [promptString]);
    const choicesPreview = useMemo(() => choices.map(c => stringToContentBlocks(c)), [choices]);
  
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

    const getQuestionDisplayText = (q: QuestionDoc): string => {
        if (q.promptContent) return contentBlocksToString(q.promptContent);
        if (q.promptText) return q.promptText;
        if (q.promptLatex) return `$${q.promptLatex}$`;
        if (q.promptImageUrl) return `![image](${q.promptImageUrl})`;
        return "Untitled";
    }
  
    const visibleQuestions = questions
    .filter(q => {
        const mainText = getQuestionDisplayText(q);
        const tags = q.tags ? q.tags.join(" ") : "";
        const searchString = `${q.title || ""} ${mainText} ${tags}`.toLowerCase();
        return searchString.includes(localFilter.toLowerCase());
    })
    .sort((a, b) => (b.title || "").localeCompare(a.title || ""));
  
    function loadQuestionToEdit(q: QuestionDoc) {
      if (!q.id) return;
      setEditingId(q.id);
      setTitle(q.title || "");
      
      // MIGRATE-ON-EDIT LOGIC
      if (q.promptContent) { // New format
        setPromptString(contentBlocksToString(q.promptContent));
        const choicesStrings = (q.choicesContent || []).map(choice => contentBlocksToString(choice.content));
        setChoices(choicesStrings.length === 4 ? choicesStrings : ["","","",""]);
      } else { // Legacy format
        let legacyPrompt = q.promptText || "";
        if(q.promptType === 'latex' && q.promptLatex) legacyPrompt = `$${q.promptLatex}$`;
        if(q.promptType === 'image' && q.promptImageUrl) legacyPrompt = `![image](${q.promptImageUrl})`;
        setPromptString(legacyPrompt);
        setChoices(q.choices && q.choices.length === 4 ? q.choices : ["","","",""]);
      }

      setCorrectIndex(q.correctIndex || 0);
      setDifficulty(q.difficulty || 1);
      setTagsText(q.tags ? q.tags.join(",") : "level1");
      setOrder(q.order ? String(q.order) : "");
      const totalSecs = q.timeLimit || 30; 
      setQMinutes(Math.floor(totalSecs / 60));
      setQSeconds(totalSecs % 60);
      setMsg(`✏️ Editing: ${q.title || "Untitled"}`);
    }
  
    function resetForm() {
      setEditingId(""); setTitle(""); setPromptString("");
      setChoices(["", "", "", ""]);
      setCorrectIndex(0); 
      setQMinutes(0); setQSeconds(30);
      setDifficulty(1); setTagsText("level1"); setOrder(""); setMsg("");
    }
  
    async function saveQuestion() {
      setMsg("Saving...");
      const tagsArray = tagsText.split(",").map((s) => s.trim()).filter(Boolean);
      const totalSecs = (Number(qMinutes) * 60) + Number(qSeconds);
      const safeTime = totalSecs > 0 ? totalSecs : 30;
    
      const docData: any = {
        title: title || "Untitled",
        promptContent: stringToContentBlocks(promptString),
        choicesContent: choices.map(c => ({ content: stringToContentBlocks(c) })),
        correctIndex,
        difficulty: Number(difficulty),
        tags: tagsArray,
        timeLimit: safeTime,
        order: order ? Number(order) : null,
        updatedAt: serverTimestamp(),
      };
    
      try {
        if (editingId) {
          await setDoc(doc(db, "questions", editingId), docData, { merge: true });
          setMsg("✅ Updated & Migrated Question!");
        } else {
          docData.createdAt = serverTimestamp();
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
        {/* FORM SIDE */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">{editingId ? "✏️ Edit Mode" : "📝 New Question"}</h2>
          </div>
  
          {msg && <div className="text-center bg-blue-50 dark:bg-blue-900/30 p-2 rounded text-blue-800 dark:text-blue-200 font-bold text-sm">{msg}</div>}
          
          <Input label="Internal Title" value={title} onChange={(e:any) => setTitle(e.target.value)} />
          
          <Input 
             label="Prompt (Supports Text, $LaTeX$, and ![img](url))"
             value={promptString} 
             onChange={(e:any) => setPromptString(e.target.value)} 
             isTextarea={true}
          />
          
          {promptString && (
             <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-lg">
               <span className="font-bold text-[10px] uppercase text-gray-400 block mb-2">Prompt Preview:</span>
               <div className="leading-relaxed text-lg font-serif text-gray-800 dark:text-gray-200 text-center">
                 {renderContent(promptPreview, true)}
               </div>
             </div>
          )}
          
          <div className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border dark:border-gray-700">
            {choices.map((c, i) => (
              <div key={i}>
                <label className="text-[10px] font-bold uppercase flex justify-between px-1 mb-1 cursor-pointer items-center">
                  <span>Option {i + 1}</span>
                  <input type="radio" name="correct-choice" checked={correctIndex === i} onChange={() => setCorrectIndex(i)} />
                </label>
                <input 
                  className={`input w-full text-sm transition-all ${correctIndex === i ? 'border-green-500 bg-green-50 dark:bg-green-900/20 ring-1 ring-green-500' : 'dark:border-gray-600'}`}
                  value={c}
                  onChange={(e) => { const copy = [...choices]; copy[i] = e.target.value; setChoices(copy); }}
                  placeholder={`Answer ${i+1}`}
                />
                {c && (
                  <div className="text-xs text-blue-600 mt-2 p-2 bg-white dark:bg-gray-800 rounded border dark:border-gray-600">
                    {renderContent(choicesPreview[i])}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input type="number" label="Difficulty (1-5)" value={difficulty} onChange={(e:any) => setDifficulty(Number(e.target.value))} />
            <Input type="number" label="Order" value={order} onChange={(e:any) => setOrder(e.target.value)} placeholder="1" />
            <Input label="Tags (comma sep)" value={tagsText} onChange={(e:any) => setTagsText(e.target.value)} />
          </div>

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
          
          <div className="flex gap-2 pt-2 border-t dark:border-gray-700">
              <button onClick={saveQuestion} className="btn-primary flex-1 bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 py-3 rounded-lg font-bold text-base">
                {editingId ? "Update & Migrate" : "Create Question"}
              </button>
              {editingId && (
                <button onClick={resetForm} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded font-bold hover:bg-gray-300 dark:hover:bg-gray-600 dark:text-white">
                  Cancel
                </button>
              )}
          </div>
        </div>
  
        {/* LIST SIDE */}
        <div className="space-y-4 border-l dark:border-gray-700 pl-4 h-[70vh] flex flex-col">
          <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-xl space-y-2">
            <h3 className="font-bold text-xs uppercase text-gray-500 dark:text-gray-300">Database Search</h3>
            <div className="flex gap-2">
              <input className="input flex-1 text-xs" placeholder="Load by Tag..." value={dbTagSearch} onChange={(e) => setDbTagSearch(e.target.value)}/>
              <button onClick={loadByTag} className="bg-black text-white dark:bg-white dark:text-black px-3 rounded text-xs font-bold">Fetch</button>
            </div>
            <hr className="border-gray-200 dark:border-gray-600" />
            <input className="input w-full text-xs" placeholder="Filter loaded list..." value={localFilter} onChange={(e) => setLocalFilter(e.target.value)}/>
          </div>
  
          <div className="space-y-2 overflow-y-auto pr-2 flex-1">
            {visibleQuestions.map((q) => (
              <div key={q.id} onClick={() => loadQuestionToEdit(q)} 
                className={`p-3 border rounded-lg cursor-pointer transition-all flex justify-between items-start 
                        ${editingId === q.id 
                            ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500 dark:bg-blue-900/30 dark:border-blue-400' 
                            : 'dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`
                }
              >
                <div className="overflow-hidden">
                  <div className="font-bold text-sm truncate dark:text-gray-100 flex items-center">
                    {!q.promptContent && <span title="Legacy Question" className="text-yellow-500 mr-2">⚠️</span>}
                    {q.title ? q.title : "Untitled Question"}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">{getQuestionDisplayText(q)}</div>
                  <div className="text-xs text-gray-400 flex gap-2 mt-2">
                    <span className="bg-gray-100 dark:bg-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded-full font-mono">{q.tags?.join(", ")}</span>
                    <span className="font-bold text-orange-400">★{q.difficulty}</span>
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
