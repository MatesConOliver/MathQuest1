"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { InlineMath, BlockMath } from 'react-katex';
import { QuestionDoc, ContentBlock } from "@/types/game";
import { Input } from "@/app/gm/components/Input";
import { QuestionBatchImporter } from "./QuestionBatchImporter";
import { IB_MATH_AA_HL_SYLLABUS } from "@/lib/syllabus";

// ==================================================================================
// 👇 CONTENT BLOCK HELPERS for structured content
// ==================================================================================

const stringToContentBlocks = (text: string): ContentBlock[] => {
    if (!text) return [];
    const parts = text.split(/(!\[.*?\]\(.*?\)|\$.*?\$)/g).filter(Boolean);
  
    return parts.map(part => {
      if (part.startsWith('![')) {
        const altMatch = part.match(/!\[(.*?)\]/);
        const urlMatch = part.match(/\((.*?)\)/);
        return { type: 'image', value: urlMatch ? urlMatch[1] : '' };
      }
      if (part.startsWith('$') && part.endsWith('$')) {
        return { type: 'latex', value: part.slice(1, -1) };
      }
      return { type: 'text', value: part };
    });
};

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
              } catch { return <span key={index} className="text-red-500 font-mono">{`$${block.value}$`}</span>; }
            case 'image':
              return <img key={index} src={block.value} alt="Content" className="my-2 rounded-lg max-w-full h-auto" />;
            default:
              return null;
          }
        })}
      </>
    );
};

// Parse AI response to extract formatted explanation text and verification block
function parseStreamingContent(fullText: string) {
  if (!fullText) {
    return {
      displayText: "",
      verifiedIndex: null,
      isDiscrepancy: false,
      discrepancyNote: "",
      hasVerification: false,
    };
  }

  const markerMatch = fullText.match(/(?:###\s*Verification|##\s*Verification|---VERIFICATION---)/i);
  const markerIndex = markerMatch && markerMatch.index !== undefined ? markerMatch.index : -1;

  let displayText = fullText;
  let vBlock = "";

  if (markerIndex !== -1) {
    const candidateText = fullText.slice(0, markerIndex).trim();
    vBlock = fullText.slice(markerIndex);
    if (candidateText.length > 0) {
      displayText = candidateText;
    }
  }

  const optMatch = vBlock.match(/CORRECT_OPTION:\s*([A-D])/i);
  const discMatch = vBlock.match(/IS_DISCREPANCY:\s*(TRUE|FALSE)/i);
  const noteMatch = vBlock.match(/DISCREPANCY_NOTE:\s*([^\n\r]+)/i);

  const optionLetter = optMatch ? optMatch[1].toUpperCase() : null;
  const verifiedIndex = optionLetter ? optionLetter.charCodeAt(0) - 65 : null;
  const isDiscrepancy = discMatch ? discMatch[1].toUpperCase() === "TRUE" : false;
  const note = noteMatch && noteMatch[1].trim().toLowerCase() !== "none" ? noteMatch[1].trim() : "";

  return {
    displayText,
    verifiedIndex,
    isDiscrepancy,
    discrepancyNote: note,
    hasVerification: verifiedIndex !== null,
  };
}

// Reusable function to call /api/questions/solve and stream/parse answer
async function generateAiSolutionForQuestion(
  q: QuestionDoc,
  locOrder: number | null,
  signal?: AbortSignal
): Promise<{ text: string; verifiedIndex: number; isDiscrepancy: boolean; discrepancyNote: string }> {
  const res = await fetch("/api/questions/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questionId: q.id,
      questionData: q,
      forceRefresh: true,
      locationOrder: locOrder,
    }),
    signal,
  });

  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || `HTTP ${res.status}`);
  }

  if (contentType.includes("application/json")) {
    const data = await res.json();
    return {
      text: data.solutionText || "",
      verifiedIndex: data.verifiedCorrectIndex ?? (q.correctIndex ?? 0),
      isDiscrepancy: Boolean(data.isDiscrepancy),
      discrepancyNote: data.discrepancyNote || "",
    };
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body stream");

  const decoder = new TextDecoder();
  let rawAccumulated = "";
  let streamBuffer = "";
  let streamError = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    streamBuffer += decoder.decode(value, { stream: true });
    const parts = streamBuffer.split("\n\n");
    streamBuffer = parts.pop() || "";

    for (const part of parts) {
      const lines = part.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const jsonStr = trimmed.slice(6);
        try {
          const data = JSON.parse(jsonStr);
          if (data.type === "chunk" && data.text) {
            rawAccumulated += data.text;
          } else if (data.type === "error") {
            streamError = data.error || "Streaming error";
          }
        } catch {}
      }
    }
  }

  if (streamError && !rawAccumulated.trim()) {
    throw new Error(streamError);
  }

  const parsed = parseStreamingContent(rawAccumulated);
  const cleanSolutionText = (parsed.displayText || rawAccumulated).trim();
  if (!cleanSolutionText) {
    throw new Error(streamError || "AI returned empty solution");
  }

  return {
    text: cleanSolutionText,
    verifiedIndex: parsed.verifiedIndex ?? (q.correctIndex ?? 0),
    isDiscrepancy: parsed.isDiscrepancy,
    discrepancyNote: parsed.discrepancyNote || "",
  };
}

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
    const [promptString, setPromptString] = useState("");
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

    // AI SOLUTION GENERATION STATE (SINGLE QUESTION)
    const [singleLocOrder, setSingleLocOrder] = useState<number | null>(null);
    const [isSingleGenerating, setIsSingleGenerating] = useState(false);

    // BATCH SELECTION & GENERATION STATE
    const [selectedQIds, setSelectedQIds] = useState<Set<string>>(new Set());
    const [batchLocOrder, setBatchLocOrder] = useState<number | null>(null);
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchRunning, setBatchRunning] = useState(false);
    const [batchStats, setBatchStats] = useState({
      total: 0,
      processed: 0,
      generated: 0,
      skipped: 0,
      errors: 0,
      currentTitle: "",
      currentStatus: "",
      isComplete: false,
    });
    const abortControllerRef = useRef<AbortController | null>(null);

    // Memoized preview content
    const promptPreview = useMemo(() => stringToContentBlocks(promptString), [promptString]);
    const choicesPreview = useMemo(() => choices.map(c => stringToContentBlocks(c)), [choices]);
  
    // 1. GATHER KNOWN TAGS ALPHABETICALLY ON MOUNT
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

    // 3. DEBOUNCE FOR LOCAL FILTER (250ms)
    useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedFilter(localFilter);
      }, 250);
      return () => clearTimeout(timer);
    }, [localFilter]);

    // 4. DEBOUNCE FOR TAG SEARCH INPUT (500ms)
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
    };
  
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
      
      if (q.promptContent) {
        setPromptString(contentBlocksToString(q.promptContent));
        const choicesStrings = (q.choicesContent || []).map(choice => contentBlocksToString(choice.content));
        setChoices(choicesStrings.length === 4 ? choicesStrings : ["","","",""]);
      } else {
        let legacyPrompt = q.promptText || "";
        if (q.promptType === 'latex' && q.promptLatex) legacyPrompt = `$${q.promptLatex}$`;
        if (q.promptType === 'image' && q.promptImageUrl) legacyPrompt = `![image](${q.promptImageUrl})`;
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
      setSingleLocOrder(q.aiSolution?.locationOrder ?? null);
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
      setSolutionUrl(""); setSolutionText(""); setCurrentAiSolution("");
      setSingleLocOrder(null);
      setMsg("");
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

      // Preserve or update AI solution text if user edited it
      if (currentAiSolution.trim()) {
        const existingAi = questions.find(q => q.id === editingId)?.aiSolution;
        docData.aiSolution = {
          text: currentAiSolution.trim(),
          verifiedCorrectIndex: existingAi?.verifiedCorrectIndex ?? correctIndex,
          isDiscrepancy: existingAi?.isDiscrepancy ?? false,
          discrepancyNote: existingAi?.discrepancyNote ?? "",
          generatedAt: existingAi?.generatedAt ?? Date.now(),
          model: existingAi?.model ?? "gemini-3.8-flash",
          locationOrder: singleLocOrder,
        };
      } else {
        docData.aiSolution = null;
      }
    
      try {
        if (editingId) {
          await setDoc(doc(db, "questions", editingId), docData, { merge: true });
          const updatedDoc = { ...docData, id: editingId } as QuestionDoc;
          setQuestions((prev) => prev.map((q) => (q.id === editingId ? updatedDoc : q)));
          setMsg("✅ Updated & Saved Question!");
        } else {
          docData.createdAt = serverTimestamp();
          const docRef = await addDoc(collection(db, "questions"), docData);
          const newDoc = { ...docData, id: docRef.id } as QuestionDoc;
          setQuestions((prev) => [newDoc, ...prev]);
          setMsg("✅ Created New Question!");
        }

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
        setSelectedQIds((prev) => {
          const next = new Set(prev);
          next.delete(qId);
          return next;
        });
        setMsg("🗑️ Question deleted.");
        if (editingId === qId) resetForm();
      } catch (e: any) { setMsg("Error: " + e.message); }
    }

    // ==================================================================================
    // 💡 SINGLE QUESTION AI SOLUTION GENERATION & CLEAR
    // ==================================================================================
    async function handleGenerateSingleAi() {
      const hasGm = Boolean(solutionText && solutionText.trim());
      const hasAi = Boolean(currentAiSolution && currentAiSolution.trim());

      if (hasGm || hasAi) {
        setMsg("⚠️ An answer already exists (GM or AI). Clear it first to generate a new one.");
        return;
      }

      setIsSingleGenerating(true);
      setMsg("⏳ Generating AI explanation...");

      try {
        const questionDataToSolve: QuestionDoc = {
          id: editingId || "temp_id",
          title: title || "Untitled",
          promptContent: stringToContentBlocks(promptString),
          choicesContent: choices.map((c) => ({ content: stringToContentBlocks(c) })),
          correctIndex,
          difficulty: Number(difficulty),
          tags: tagsText.split(",").map((s) => s.trim()).filter(Boolean),
          timeLimit: Number(qMinutes) * 60 + Number(qSeconds),
          order: order ? Number(order) : undefined,
          groupId: groupId.trim() || undefined,
        };

        const result = await generateAiSolutionForQuestion(questionDataToSolve, singleLocOrder);
        setCurrentAiSolution(result.text);

        const aiPayload = {
          text: result.text,
          verifiedCorrectIndex: result.verifiedIndex,
          isDiscrepancy: result.isDiscrepancy,
          discrepancyNote: result.discrepancyNote || "",
          generatedAt: Date.now(),
          model: "gemini-3.8-flash",
          locationOrder: singleLocOrder,
        };

        if (editingId) {
          await updateDoc(doc(db, "questions", editingId), {
            aiSolution: aiPayload,
            updatedAt: serverTimestamp(),
          });
          setQuestions((prev) =>
            prev.map((q) => (q.id === editingId ? { ...q, aiSolution: aiPayload } : q))
          );
        }
        setMsg("✅ AI Solution generated and saved!");
      } catch (err: any) {
        setMsg(`❌ Error generating AI solution: ${err.message || err}`);
      } finally {
        setIsSingleGenerating(false);
      }
    }

    async function handleClearSingleAi() {
      setCurrentAiSolution("");
      if (editingId) {
        try {
          await updateDoc(doc(db, "questions", editingId), {
            aiSolution: null,
            updatedAt: serverTimestamp(),
          });
          setQuestions((prev) =>
            prev.map((q) => (q.id === editingId ? { ...q, aiSolution: undefined } : q))
          );
          setMsg("🗑️ AI Solution cleared. You can generate a new one now.");
        } catch (err: any) {
          setMsg(`Error clearing: ${err.message || err}`);
        }
      } else {
        setMsg("AI Solution field cleared.");
      }
    }

    // ==================================================================================
    // ⚡ BATCH QUESTION SELECTION & AI GENERATION QUEUE
    // ==================================================================================
    function toggleSelectQuestion(id: string) {
      setSelectedQIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }

    function selectAllVisible() {
      const ids = visibleQuestions.map((q) => q.id).filter(Boolean) as string[];
      setSelectedQIds(new Set(ids));
    }

    function deselectAll() {
      setSelectedQIds(new Set());
    }

    function startBatchGeneration() {
      const targetQuestions = questions.filter((q) => q.id && selectedQIds.has(q.id));
      if (targetQuestions.length === 0) {
        setMsg("⚠️ No questions selected for batch AI generation.");
        return;
      }

      setIsBatchModalOpen(true);
      setBatchRunning(true);
      setBatchStats({
        total: targetQuestions.length,
        processed: 0,
        generated: 0,
        skipped: 0,
        errors: 0,
        currentTitle: "",
        currentStatus: "Starting batch queue...",
        isComplete: false,
      });

      const controller = new AbortController();
      abortControllerRef.current = controller;

      runBatchProcess(targetQuestions, controller.signal);
    }

    function stopBatchGeneration() {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setBatchRunning(false);
      setBatchStats((prev) => ({
        ...prev,
        currentStatus: "🛑 Stopped by user.",
        isComplete: true,
      }));
    }

    async function runBatchProcess(targetList: QuestionDoc[], signal: AbortSignal) {
      let genCount = 0;
      let skipCount = 0;
      let errCount = 0;

      for (let i = 0; i < targetList.length; i++) {
        if (signal.aborted) break;

        const q = targetList[i];
        const qTitle = q.title || getQuestionDisplayText(q) || `Question ${i + 1}`;

        // RULE 3: Only questions with no answer at all will ask for a new AI answer
        // (if either GM answer or AI answer already exists, skip question)
        const hasGm = Boolean(q.solutionText && q.solutionText.trim());
        const hasAi = Boolean(q.aiSolution && q.aiSolution.text && q.aiSolution.text.trim());

        if (hasGm || hasAi) {
          skipCount++;
          setBatchStats((prev) => ({
            ...prev,
            processed: i + 1,
            skipped: skipCount,
            currentTitle: qTitle,
            currentStatus: `Skipped: Already has ${hasGm ? "GM solution" : "AI solution"}`,
          }));
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }

        // Generate AI solution for question with no existing answer
        setBatchStats((prev) => ({
          ...prev,
          processed: i + 1,
          currentTitle: qTitle,
          currentStatus: `Generating AI answer (${i + 1}/${targetList.length})...`,
        }));

        try {
          const result = await generateAiSolutionForQuestion(q, batchLocOrder, signal);
          if (signal.aborted) break;

          const aiPayload = {
            text: result.text,
            verifiedCorrectIndex: result.verifiedIndex,
            isDiscrepancy: result.isDiscrepancy,
            discrepancyNote: result.discrepancyNote || "",
            generatedAt: Date.now(),
            model: "gemini-3.8-flash",
            locationOrder: batchLocOrder,
          };

          if (q.id) {
            await updateDoc(doc(db, "questions", q.id), {
              aiSolution: aiPayload,
              updatedAt: serverTimestamp(),
            });
            setQuestions((prev) =>
              prev.map((item) => (item.id === q.id ? { ...item, aiSolution: aiPayload } : item))
            );
          }

          genCount++;
          setBatchStats((prev) => ({
            ...prev,
            generated: genCount,
            currentStatus: `✅ Generated successfully.`,
          }));

          // Pacing delay (~3.5s) to safely respect Google AI Studio's 15 RPM free tier limits
          if (i < targetList.length - 1 && !signal.aborted) {
            setBatchStats((prev) => ({
              ...prev,
              currentStatus: `Pacing delay (3.5s) to protect API rate limit...`,
            }));
            await new Promise((r) => setTimeout(r, 3500));
          }
        } catch (err: any) {
          if (signal.aborted) break;
          errCount++;
          console.warn(`[Batch AI] Error on question ${q.id}:`, err);
          setBatchStats((prev) => ({
            ...prev,
            errors: errCount,
            currentStatus: `⚠️ Error: ${err.message || "Failed"}. Moving to next question...`,
          }));
          if (i < targetList.length - 1 && !signal.aborted) {
            await new Promise((r) => setTimeout(r, 3500));
          }
        }
      }

      setBatchRunning(false);
      setBatchStats((prev) => ({
        ...prev,
        currentStatus: signal.aborted ? "🛑 Batch cancelled." : "🎉 Batch complete!",
        isComplete: true,
      }));
    }

    const hasAnyExistingAnswer = Boolean(solutionText?.trim() || currentAiSolution?.trim());
  
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

          {/* SOLUTION & WALKTHROUGH SECTION */}
          <div className="space-y-3 bg-indigo-50/60 dark:bg-indigo-950/20 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
             <div className="flex items-center justify-between">
               <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase">
                 💡 Solution & Walkthrough
               </span>
               {solutionText.trim() ? (
                 <span className="text-[10px] bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-bold">
                   👑 GM Solution Active
                 </span>
               ) : currentAiSolution.trim() ? (
                 <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-bold">
                   ⚡ AI Solution Stored
                 </span>
               ) : (
                 <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full font-bold">
                   ⚪ No Solution Yet
                 </span>
               )}
             </div>

             <Input 
               label="Video / Image / Link URL" 
               value={solutionUrl} 
               onChange={(e:any) => setSolutionUrl(e.target.value)} 
               placeholder="https://youtube.com/watch?v=... o URL de imagen/GeoGebra" 
             />

             {/* Manual GM Solution */}
             <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 mb-1 block">
                  👑 Manual GM Solution (Always overrides AI)
                </label>
                <textarea
                  className="input w-full text-xs font-mono dark:bg-gray-800"
                  rows={2}
                  value={solutionText}
                  onChange={(e) => setSolutionText(e.target.value)}
                  placeholder="Manual step-by-step explanation (takes absolute priority over AI)..."
                />
             </div>

             {/* AI Solution (Editable + Generatable) */}
             <div className="pt-2 border-t border-indigo-200/60 dark:border-indigo-900/40 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[10px] font-bold uppercase text-indigo-800 dark:text-indigo-300">
                    🤖 AI Solution (Editable)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Curriculum Scope:</span>
                    <select
                      value={singleLocOrder ?? ""}
                      onChange={(e) => setSingleLocOrder(e.target.value ? Number(e.target.value) : null)}
                      className="text-xs py-0.5 px-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-200"
                    >
                      <option value="">Universal (Topics 1–16)</option>
                      {IB_MATH_AA_HL_SYLLABUS.map((t) => (
                        <option key={t.number} value={t.number}>
                          Loc {t.number}: {t.title.slice(0, 22)}... (1–{t.number})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <textarea
                  className="input w-full text-xs font-mono dark:bg-gray-800 border-indigo-200 dark:border-indigo-900"
                  rows={3}
                  value={currentAiSolution}
                  onChange={(e) => setCurrentAiSolution(e.target.value)}
                  placeholder="No AI solution generated yet. Click 'Generate AI Solution' below or type/paste one..."
                />

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleGenerateSingleAi}
                    disabled={isSingleGenerating || hasAnyExistingAnswer}
                    title={
                      hasAnyExistingAnswer
                        ? "An answer already exists. Erase text or click 'Clear AI Solution' first to generate a new one."
                        : "Generate a step-by-step AI explanation using curriculum constraints"
                    }
                    className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {isSingleGenerating ? (
                      <>
                        <span className="animate-spin text-sm">⏳</span>
                        <span>Generating AI Solution...</span>
                      </>
                    ) : (
                      <>
                        <span>⚡</span>
                        <span>Generate AI Solution</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleClearSingleAi}
                    disabled={!currentAiSolution.trim() || isSingleGenerating}
                    title="Clear the AI solution to re-enable generation"
                    className="px-3 py-2 bg-gray-200 hover:bg-red-100 hover:text-red-700 dark:bg-gray-700 dark:hover:bg-red-900/40 dark:hover:text-red-300 text-gray-700 dark:text-gray-200 rounded-lg font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    🗑️ Clear AI
                  </button>
                </div>

                {hasAnyExistingAnswer && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 italic">
                    ℹ️ Answer exists ({solutionText.trim() ? "GM manual" : "AI stored"}). Erase it or click Clear AI to re-enable the Generate button.
                  </p>
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
                {editingId ? "Update & Save" : "Create Question"}
              </button>
              {editingId && (
                <button onClick={resetForm} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded font-bold hover:bg-gray-300 dark:hover:bg-gray-600 dark:text-white">
                  Cancel
                </button>
              )}
          </div>
        </div>
  
        {/* LIST SIDE */}
        <div className="space-y-3 border-l dark:border-gray-700 pl-4 h-[80vh] flex flex-col">
          {/* Tag fetch & Filter header */}
          <div className="bg-gray-100 dark:bg-gray-700/60 p-3 rounded-xl space-y-2 border border-gray-200 dark:border-gray-600">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xs uppercase text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                <span>🏷️</span>
                <span>Fetch by Tag (On-Demand)</span>
              </h3>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                {questions.length} loaded
              </span>
            </div>

            {/* Alphabetical Tag Dropdown */}
            <div>
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

            {/* Manual Tag Input */}
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

            {/* Debounced filter */}
            <input
              className="input w-full text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              placeholder="🔍 Filter loaded list..."
              value={localFilter}
              onChange={(e) => setLocalFilter(e.target.value)}
            />
          </div>

          {/* BATCH SELECTION & ACTION TOOLBAR */}
          {questions.length > 0 && (
            <div className="bg-indigo-50/70 dark:bg-indigo-950/30 p-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={selectAllVisible}
                    className="text-[11px] font-bold px-2 py-1 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-gray-700 dark:text-gray-200 hover:bg-gray-50"
                  >
                    Select All ({visibleQuestions.length})
                  </button>
                  {selectedQIds.size > 0 && (
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="text-[11px] font-bold px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-200 hover:bg-gray-300"
                    >
                      Deselect
                    </button>
                  )}
                  <span className="text-xs font-black text-indigo-700 dark:text-indigo-300 ml-1">
                    {selectedQIds.size} selected
                  </span>
                </div>

                {/* Batch Scope Selector */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">Scope:</span>
                  <select
                    value={batchLocOrder ?? ""}
                    onChange={(e) => setBatchLocOrder(e.target.value ? Number(e.target.value) : null)}
                    className="text-[11px] py-1 px-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">Universal (Topics 1–16)</option>
                    {IB_MATH_AA_HL_SYLLABUS.map((t) => (
                      <option key={t.number} value={t.number}>
                        Loc {t.number}: {t.title.slice(0, 18)}...
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Batch Generate Button */}
              <button
                type="button"
                onClick={startBatchGeneration}
                disabled={selectedQIds.size === 0 || batchRunning}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 px-3 rounded-lg text-xs shadow transition-all flex items-center justify-center gap-1.5"
              >
                <span>⚡</span>
                <span>Batch Generate AI Answers for Selected ({selectedQIds.size})</span>
              </button>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 text-center">
                🛡️ Strictly skips questions with existing solutions • Paced at 3.5s per request
              </div>
            </div>
          )}
  
          {/* QUESTIONS SCROLLABLE LIST */}
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
            {visibleQuestions.map((q) => {
              const isSelected = q.id ? selectedQIds.has(q.id) : false;
              const hasGm = Boolean(q.solutionText && q.solutionText.trim());
              const hasAi = Boolean(q.aiSolution && q.aiSolution.text && q.aiSolution.text.trim());

              return (
                <div 
                  key={q.id} 
                  onClick={() => loadQuestionToEdit(q)} 
                  className={`p-3 border rounded-lg cursor-pointer transition-all flex items-start gap-2.5 
                          ${editingId === q.id 
                              ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500 dark:bg-blue-900/30 dark:border-blue-400' 
                              : isSelected
                              ? 'bg-indigo-50/70 border-indigo-400 dark:bg-indigo-950/40 dark:border-indigo-700'
                              : 'dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`
                  }
                >
                  {/* Selection Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (q.id) toggleSelectQuestion(q.id);
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer mt-1 shrink-0"
                  />

                  <div className="overflow-hidden flex-1 min-w-0">
                    <div className="font-bold text-sm truncate dark:text-gray-100 flex items-center">
                      {!q.promptContent && <span title="Legacy Question" className="text-yellow-500 mr-2">⚠️</span>}
                      {q.title ? q.title : "Untitled Question"}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">{getQuestionDisplayText(q)}</div>
                    <div className="text-xs text-gray-400 flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="bg-gray-100 dark:bg-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded-full font-mono text-[10px]">{q.tags?.join(", ")}</span>
                      <span className="font-bold text-orange-400 text-[10px]">★{q.difficulty}</span>
                      {hasGm && (
                        <span className="bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 px-1.5 py-0.2 rounded-full font-bold text-[10px]">
                          👑 GM Sol
                        </span>
                      )}
                      {!hasGm && hasAi && (
                        <span className="bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 px-1.5 py-0.2 rounded-full font-bold text-[10px]">
                          ⚡ AI Sol
                        </span>
                      )}
                      {!hasGm && !hasAi && (
                        <span className="bg-gray-100 dark:bg-gray-800 text-gray-400 px-1.5 py-0.2 rounded-full font-bold text-[10px]">
                          No Sol
                        </span>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); if(q.id) deleteQuestion(q.id); }}
                    className="text-red-300 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-bold px-2 py-1"
                  >✕</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================================================================================== */}
      {/* 🚀 BATCH AI PROGRESS MODAL WITH QUEUE & SAFE RATE-LIMIT PACING */}
      {/* ================================================================================== */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <div>
                  <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">
                    Batch AI Solution Generator
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Queue processing with safe 3.5s delay to protect API limits
                  </p>
                </div>
              </div>
              {!batchRunning && (
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-bold text-lg p-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-gray-600 dark:text-gray-300">
                <span>Progress</span>
                <span>
                  {batchStats.processed} / {batchStats.total} (
                  {batchStats.total > 0
                    ? Math.round((batchStats.processed / batchStats.total) * 100)
                    : 0}
                  %)
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-full transition-all duration-300"
                  style={{
                    width: `${
                      batchStats.total > 0
                        ? Math.min(100, Math.round((batchStats.processed / batchStats.total) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Live Status Description */}
            <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 text-xs space-y-1">
              <div className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300">
                {batchRunning && <span className="animate-spin">🔄</span>}
                <span className="truncate">{batchStats.currentTitle || "Initializing..."}</span>
              </div>
              <div className="text-indigo-600 dark:text-indigo-400 font-mono text-[11px]">
                {batchStats.currentStatus}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                <div className="text-[10px] font-bold text-gray-500 uppercase">Selected</div>
                <div className="text-lg font-black text-gray-800 dark:text-gray-200">{batchStats.total}</div>
              </div>
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60">
                <div className="text-[10px] font-bold text-emerald-600 uppercase">Generated</div>
                <div className="text-lg font-black text-emerald-600">{batchStats.generated}</div>
              </div>
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60">
                <div className="text-[10px] font-bold text-amber-600 uppercase">Skipped</div>
                <div className="text-lg font-black text-amber-600">{batchStats.skipped}</div>
              </div>
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60">
                <div className="text-[10px] font-bold text-red-600 uppercase">Errors</div>
                <div className="text-lg font-black text-red-600">{batchStats.errors}</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t dark:border-gray-800">
              {batchRunning ? (
                <button
                  type="button"
                  onClick={stopBatchGeneration}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1.5"
                >
                  <span>🛑</span>
                  <span>Stop Queue</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="px-5 py-2 bg-black text-white dark:bg-white dark:text-black font-bold text-xs rounded-xl shadow hover:opacity-80 transition-all"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </>
    );
}
