"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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

import { InlineMath, BlockMath } from 'react-katex';
import { QuestionDoc, ContentBlock } from "@/types/game";
import { Input } from "@/app/gm/components/Input";
import { QuestionBatchImporter } from "./QuestionBatchImporter";

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
  
    // Search & Tag Fetch State
    const [dbTagSearch, setDbTagSearch] = useState("");
    const [selectedDropdownTag, setSelectedDropdownTag] = useState("");
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
    const [localFilter, setLocalFilter] = useState("");
    const [debouncedFilter, setDebouncedFilter] = useState("");
  
    // UNIFIED FORM STATE
    const [title, setTitle] = useState("");
    const [promptString, setPromptString] = useState(""); // Unified prompt field
    const [choices, setChoices] = useState(["", "", "", ""]);
    const [correctIndex, setCorrectIndex] = useState(0);
    const [difficulty, setDifficulty] = useState(1);
    const [tagsText, setTagsText] = useState("level1");
    const [order, setOrder] = useState("");
    const [groupId, setGroupId] = useState("");
    const [solutionUrl, setSolutionUrl] = useState("");
    const [solutionText, setSolutionText] = useState("");
    const [currentAiSolution, setCurrentAiSolution] = useState("");
    const [qMinutes, setQMinutes] = useState(0);
    const [qSeconds, setQSeconds] = useState(30);

    // Memoized preview content
    const promptPreview = useMemo(() => stringToContentBlocks(promptString), [promptString]);
    const choicesPreview = useMemo(() => choices.map(c => stringToContentBlocks(c)), [choices]);
  
    // 1. GATHER KNOWN TAGS ALPHABETICALLY ON MOUNT (MINIMAL READS: Encounters collection only)
    // NOTE: Questions list intentionally starts VOID to minimize Firestore document reads!
    useEffect(() => {
      async function loadKnownTags() {
        try {
          const defaultCurriculumTags = [
            "algebra", "arithmetic", "boss", "calculus", "derivatives",
            "equations", "fractions", "functions", "geometry", "integrals",
            "level1", "level2", "level3", "limits", "matrices", "polynomials",
            "probabilityAndStatistics", "statistics", "trigonometry", "vectors"
          ];
          const tagSet = new Set<string>(defaultCurriculumTags);

          // Read small encounters collection once
          const encSnap = await getDocs(collection(db, "encounters"));
          encSnap.docs.forEach((d) => {
            const data = d.data();
            if (data.questionTag && typeof data.questionTag === "string") {
              tagSet.add(data.questionTag.trim());
            }
            if (Array.isArray(data.questionTags)) {
              data.questionTags.forEach((t: string) => {
                if (t && typeof t === "string") tagSet.add(t.trim());
              });
            }
          });

          const sortedTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));
          setAvailableTags(sortedTags);
        } catch (e) {
          console.error("Error gathering tags:", e);
        }
      }
      loadKnownTags();
    }, []);

    // 2. FETCH QUESTIONS BY SPECIFIC TAG
    const loadByTag = useCallback(async (tagToSearch?: string) => {
      const tag = (tagToSearch !== undefined ? tagToSearch : dbTagSearch).trim();
      if (!tag) {
        setMsg("⚠️ Please enter or select a tag to fetch questions.");
        return;
      }
      setIsLoadingQuestions(true);
      try {
        const q = query(collection(db, "questions"), where("tags", "array-contains", tag));
        const snap = await getDocs(q);
        const fetched = snap.docs.map(d => ({ ...d.data(), id: d.id } as QuestionDoc));
        setQuestions(fetched);
        setMsg(`✅ Loaded ${fetched.length} questions matching tag '${tag}'`);
      } catch (e: any) {
        setMsg("Error searching tag: " + (e?.message || e));
      } finally {
        setIsLoadingQuestions(false);
      }
    }, [dbTagSearch]);

    // 3. DEBOUNCE MICRO-TIME FOR LOCAL FILTER (250ms)
    useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedFilter(localFilter);
      }, 250);
      return () => clearTimeout(timer);
    }, [localFilter]);

    // 4. DEBOUNCE MICRO-TIME FOR TAG SEARCH INPUT (500ms)
    useEffect(() => {
      const trimmed = dbTagSearch.trim();
      if (!trimmed || trimmed.length < 2) return;

      const timer = setTimeout(() => {
        loadByTag(trimmed);
      }, 500);
      return () => clearTimeout(timer);
    }, [dbTagSearch, loadByTag]);

    const getQuestionDisplayText = (q: QuestionDoc): string => {
        if (q.promptContent) return contentBlocksToString(q.promptContent);
        if (q.promptText) return q.promptText;
        if (q.promptLatex) return `$${q.promptLatex}$`;
        if (q.promptImageUrl) return `![image](${q.promptImageUrl})`;
        return "Untitled";
    }
  
    const visibleQuestions = useMemo(() => {
      return questions
        .filter(q => {
          if (!debouncedFilter.trim()) return true;
          const mainText = getQuestionDisplayText(q);
          const tags = q.tags ? q.tags.join(" ") : "";
          const searchString = `${q.title || ""} ${mainText} ${tags}`.toLowerCase();
          return searchString.includes(debouncedFilter.toLowerCase());
        })
        .sort((a, b) => (b.title || "").localeCompare(a.title || ""));
    }, [questions, debouncedFilter]);
  
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
      setGroupId(q.groupId || "");
      setSolutionUrl(q.solutionUrl || "");
      setSolutionText(q.solutionText || "");
      setCurrentAiSolution(q.aiSolution?.text || "");
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
      setDifficulty(1); setTagsText("level1"); setOrder(""); setGroupId("");
      setSolutionUrl(""); setSolutionText(""); setCurrentAiSolution(""); setMsg("");
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
        groupId: groupId.trim() || null,
        solutionUrl: solutionUrl.trim() || null,
        solutionText: solutionText.trim() || null,
        updatedAt: serverTimestamp(),
      };
    
      try {
        if (editingId) {
          await setDoc(doc(db, "questions", editingId), docData, { merge: true });
          const updatedDoc = { ...docData, id: editingId } as QuestionDoc;
          setQuestions((prev) => prev.map((q) => (q.id === editingId ? updatedDoc : q)));
          setMsg("✅ Updated & Migrated Question!");
        } else {
          docData.createdAt = serverTimestamp();
          const docRef = await addDoc(collection(db, "questions"), docData);
          const newDoc = { ...docData, id: docRef.id } as QuestionDoc;
          setQuestions((prev) => [newDoc, ...prev]);
          setMsg("✅ Created New Question!");
        }

        // Add any newly typed tags to available tags dropdown list
        if (tagsArray.length > 0) {
          setAvailableTags((prev) => Array.from(new Set([...prev, ...tagsArray])).sort((a, b) => a.localeCompare(b)));
        }

        if (!editingId) resetForm(); 
      } catch (e: any) { setMsg("Error: " + e.message); }
    }    
  
    async function deleteQuestion(qId: string) {
      if (!confirm("Permanently delete this question?")) return;
      try {
        await deleteDoc(doc(db, "questions", qId));
        setQuestions((prev) => prev.filter((q) => q.id !== qId));
        setMsg("🗑️ Question deleted.");
        if (editingId === qId) resetForm();
      } catch (e: any) { setMsg("Error: " + e.message); }
    }
  
    return (
      <>
        <QuestionBatchImporter />
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
               <span className="font-bold text-[10px] uppercase text-gray-600 dark:text-gray-300 block mb-2">Prompt Preview:</span>
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
                  <div className="text-xs text-blue-600 dark:text-blue-300 mt-2 p-2 bg-white dark:bg-gray-800 rounded border dark:border-gray-600">
                    {renderContent(choicesPreview[i])}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input type="number" label="Difficulty (1-5)" value={difficulty} onChange={(e:any) => setDifficulty(Number(e.target.value))} />
            <Input label="Tags (comma sep)" value={tagsText} onChange={(e:any) => setTagsText(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input type="number" label="Order" value={order} onChange={(e:any) => setOrder(e.target.value)} placeholder="1" />
            <Input label="Group ID (para encadenar)" value={groupId} onChange={(e:any) => setGroupId(e.target.value)} placeholder="ej. ejercicio_derivadas_01" />
          </div>

          <div className="space-y-2 bg-indigo-50/60 dark:bg-indigo-950/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
             <div className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase">💡 Solution & Walkthrough (Optional)</div>
             <Input label="Video / Image / Link URL" value={solutionUrl} onChange={(e:any) => setSolutionUrl(e.target.value)} placeholder="https://youtube.com/watch?v=... o URL de imagen/GeoGebra" />
             <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Solution Explanation (Supports LaTeX $...$)</label>
                <textarea
                  className="input w-full text-xs font-mono dark:bg-gray-800"
                  rows={2}
                  value={solutionText}
                  onChange={(e) => setSolutionText(e.target.value)}
                  placeholder="Manual step-by-step explanation (overwrites any AI solution)..."
                />
                {currentAiSolution && !solutionText && (
                  <div className="mt-1.5 p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-800 dark:text-indigo-300 flex items-center justify-between gap-2">
                    <div className="truncate flex-1">
                      <span className="font-bold">🤖 Stored AI Solution:</span> {currentAiSolution}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSolutionText(currentAiSolution)}
                      className="px-2 py-0.5 bg-indigo-600 text-white font-bold rounded text-[10px] hover:bg-indigo-500 shrink-0"
                    >
                      Copy to Edit
                    </button>
                  </div>
                )}
             </div>
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
        <div className="space-y-4 border-l dark:border-gray-700 pl-4 h-[75vh] flex flex-col">
          <div className="bg-gray-100 dark:bg-gray-700/60 p-3.5 rounded-xl space-y-2.5 border border-gray-200 dark:border-gray-600">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xs uppercase text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                <span>🏷️</span>
                <span>Fetch by Tag (On-Demand)</span>
              </h3>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                {questions.length} loaded
              </span>
            </div>

            {/* 1. Alphabetical Dropdown */}
            <div>
              <label className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 block mb-1">
                Choose Existing Tag (Alphabetical)
              </label>
              <select
                className="input w-full text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                value={selectedDropdownTag}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedDropdownTag(val);
                  setDbTagSearch(val);
                  if (val) loadByTag(val);
                }}
              >
                <option value="">-- Choose tag ({availableTags.length} available) --</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    🏷️ {tag}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Manual Tag Input & Fetch Button */}
            <div className="flex gap-2">
              <input
                className="input flex-1 text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                placeholder="Or type custom tag (auto-loads)..."
                value={dbTagSearch}
                onChange={(e) => {
                  setDbTagSearch(e.target.value);
                  setSelectedDropdownTag(e.target.value);
                }}
              />
              <button
                onClick={() => loadByTag(dbTagSearch)}
                disabled={isLoadingQuestions}
                className="bg-black text-white dark:bg-white dark:text-black px-3.5 py-1.5 rounded-lg text-xs font-bold hover:opacity-80 transition-opacity disabled:opacity-50 shrink-0 shadow-sm"
              >
                {isLoadingQuestions ? "Fetching..." : "Fetch"}
              </button>
            </div>

            <hr className="border-gray-200 dark:border-gray-600" />

            {/* 3. Debounced local filter */}
            <input
              className="input w-full text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              placeholder="🔍 Filter loaded list (debounced)..."
              value={localFilter}
              onChange={(e) => setLocalFilter(e.target.value)}
            />
          </div>
  
          <div className="space-y-2 overflow-y-auto pr-2 flex-1 custom-scrollbar">
            {isLoadingQuestions && (
              <div className="py-8 text-center text-xs text-gray-500 dark:text-gray-400 font-bold animate-pulse">
                ⏳ Loading questions for tag &lsquo;{dbTagSearch}&rsquo;...
              </div>
            )}

            {questions.length === 0 && !isLoadingQuestions && (
              <div className="py-12 px-4 text-center text-gray-500 dark:text-gray-400 space-y-2 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 my-2">
                <div className="text-3xl">📭</div>
                <div className="font-bold text-sm text-gray-700 dark:text-gray-300">Question Pool is Empty</div>
                <p className="text-xs max-w-xs mx-auto leading-relaxed">
                  Select an existing tag from the dropdown or type a tag above to fetch questions. Starting empty prevents unnecessary database reads.
                </p>
              </div>
            )}
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
                  <div className="text-xs text-gray-400 flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="bg-gray-100 dark:bg-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded-full font-mono">{q.tags?.join(", ")}</span>
                    <span className="font-bold text-orange-400">★{q.difficulty}</span>
                    {q.solutionText && (
                      <span className="bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 px-1.5 py-0.2 rounded-full font-bold text-[10px]">
                        👑 GM Sol
                      </span>
                    )}
                    {!q.solutionText && q.aiSolution?.text && (
                      <span className="bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 px-1.5 py-0.2 rounded-full font-bold text-[10px]">
                        ⚡ AI Sol
                      </span>
                    )}
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
      </>
    );
  }
