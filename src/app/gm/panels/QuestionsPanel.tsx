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
  onSnapshot,
  orderBy,
} from "firebase/firestore";

import { InlineMath, BlockMath } from 'react-katex';
import { QuestionDoc, ContentBlock, GameLocation } from "@/types/game";
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
  
    // Live Questions & Strict Reactive Tag State
    const [allQuestions, setAllQuestions] = useState<QuestionDoc[]>([]);
    const [dbTagSearch, setDbTagSearch] = useState("");
    const [selectedDropdownTag, setSelectedDropdownTag] = useState("");
    const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
    const [localFilter, setLocalFilter] = useState("");
    const [debouncedFilter, setDebouncedFilter] = useState("");
    const [hasLoadedAllQuestions, setHasLoadedAllQuestions] = useState(false);
  
    // UNIFIED FORM STATE
    const [title, setTitle] = useState("");
    const [promptString, setPromptString] = useState("");
    const [choices, setChoices] = useState(["", "", "", ""]);
    const [correctIndex, setCorrectIndex] = useState(0);
    const [difficulty, setDifficulty] = useState(1);
    const [tagsText, setTagsText] = useState("");
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
    const [batchAutoDetectLoc, setBatchAutoDetectLoc] = useState(true);
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

    // LOCATIONS & CURRICULUM TAG MAPPINGS
    const [locations, setLocations] = useState<GameLocation[]>([]);

    useEffect(() => {
      const q = query(collection(db, "locations"), orderBy("order"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as GameLocation));
        setLocations(fetched);
      });
      return () => unsubscribe();
    }, []);

    // 1. LIVE SUBSCRIPTION TO ALL QUESTIONS IN FIRESTORE
    useEffect(() => {
      setIsLoadingQuestions(true);
      const unsub = onSnapshot(
        collection(db, "questions"),
        (snapshot) => {
          const fetched = snapshot.docs.map(
            (d) => ({ ...d.data(), id: d.id } as QuestionDoc)
          );
          setAllQuestions(fetched);
          setQuestions(fetched);
          setIsLoadingQuestions(false);
          setHasLoadedAllQuestions(true);
        },
        (error) => {
          console.error("Error subscribing to questions:", error);
          setMsg("Error loading questions: " + error.message);
          setIsLoadingQuestions(false);
        }
      );
      return () => unsub();
    }, []);

    // 2. STRICT ACTIVE TAG DERIVATION (Only tags with >= 1 question exist in the list)
    const tagCountMap = useMemo(() => {
      const map = new Map<string, number>();
      allQuestions.forEach((q) => {
        (q.tags || []).forEach((t) => {
          if (t && typeof t === "string") {
            const clean = t.trim();
            if (clean) {
              map.set(clean, (map.get(clean) || 0) + 1);
            }
          }
        });
      });
      return map;
    }, [allQuestions]);

    const availableTags = useMemo(() => {
      return Array.from(tagCountMap.keys()).sort((a, b) => a.localeCompare(b));
    }, [tagCountMap]);

    // 3. AUTO-PRUNE DEAD TAGS FROM LOCATIONS IF THEIR QUESTION COUNT DROPPED TO 0
    useEffect(() => {
      if (!hasLoadedAllQuestions || locations.length === 0) return;
      const validLowerTags = new Set(availableTags.map((t) => t.toLowerCase()));

      locations.forEach(async (loc) => {
        const assigned = loc.assignedTags || [];
        const orphaned = assigned.filter((t) => !validLowerTags.has(t.trim().toLowerCase()));
        if (orphaned.length > 0) {
          const cleaned = assigned.filter((t) => validLowerTags.has(t.trim().toLowerCase()));
          try {
            await updateDoc(doc(db, "locations", loc.id), {
              assignedTags: cleaned,
            });
            console.log(`[QuestionsPanel] Auto-pruned dead tag(s) from Location ${loc.order}:`, orphaned);
          } catch (e) {
            console.warn(`[QuestionsPanel] Error auto-cleaning orphaned tags on Loc ${loc.order}:`, e);
          }
        }
      });
    }, [availableTags, locations, hasLoadedAllQuestions]);

    // 4. RESET ACTIVE FILTER IF ACTIVE TAG HAS 0 REMAINING QUESTIONS
    useEffect(() => {
      const activeTag = (dbTagSearch || selectedDropdownTag || "").trim().toLowerCase();
      if (activeTag && !availableTags.some((t) => t.toLowerCase() === activeTag)) {
        setSelectedDropdownTag("");
        setDbTagSearch("");
        setMsg(`ℹ️ Tag '${activeTag}' has no remaining questions and was removed from the tags list.`);
      }
    }, [availableTags, selectedDropdownTag, dbTagSearch]);

    // Global Mapping: Tag -> Location
    const tagToLocationMap = useMemo(() => {
      const map = new Map<string, { id: string; name: string; order: number }>();
      locations.forEach((l) => {
        (l.assignedTags || []).forEach((t) => {
          const norm = t.trim().toLowerCase();
          if (norm) {
            map.set(norm, { id: l.id, name: l.name, order: l.order });
          }
        });
      });
      return map;
    }, [locations]);

    // Resolve location from question tags
    const getQuestionLocation = useCallback(
      (q: { tags?: string[] }) => {
        const tags = q.tags || [];
        if (tags.length === 0) {
          return { locationOrder: null, locationName: null, isConflict: false, conflicts: [], matchedTags: [] };
        }

        const matches: { tag: string; loc: { id: string; name: string; order: number } }[] = [];
        for (const rawTag of tags) {
          const loc = tagToLocationMap.get(rawTag.trim().toLowerCase());
          if (loc) {
            matches.push({ tag: rawTag, loc });
          }
        }

        if (matches.length === 0) {
          return { locationOrder: null, locationName: null, isConflict: false, conflicts: [], matchedTags: [] };
        }

        const distinctOrders = Array.from(new Set(matches.map((m) => m.loc.order)));
        if (distinctOrders.length > 1) {
          return {
            locationOrder: matches[0].loc.order,
            locationName: matches[0].loc.name,
            isConflict: true,
            conflicts: matches.map((m) => `Loc ${m.loc.order} (${m.tag})`),
            matchedTags: matches.map((m) => m.tag),
          };
        }

        return {
          locationOrder: matches[0].loc.order,
          locationName: matches[0].loc.name,
          isConflict: false,
          conflicts: [],
          matchedTags: matches.map((m) => m.tag),
        };
      },
      [tagToLocationMap]
    );

    // Memoized preview content
    const promptPreview = useMemo(() => stringToContentBlocks(promptString), [promptString]);
    const choicesPreview = useMemo(() => choices.map(c => stringToContentBlocks(c)), [choices]);

    // 5. FILTERING QUESTIONS BY TAG AND SEARCH
    const filteredByTagQuestions = useMemo(() => {
      const activeTag = (dbTagSearch || selectedDropdownTag || "").trim().toLowerCase();
      if (!activeTag) return allQuestions;
      return allQuestions.filter((q) =>
        (q.tags || []).some((t) => t.trim().toLowerCase() === activeTag)
      );
    }, [allQuestions, dbTagSearch, selectedDropdownTag]);

    const loadAllQuestions = useCallback(async () => {
      setSelectedDropdownTag("");
      setDbTagSearch("");
      setMsg(`✅ Showing all ${allQuestions.length} questions`);
      return allQuestions;
    }, [allQuestions]);

    const loadByTag = useCallback(async (tagToSearch?: string) => {
      const tag = (tagToSearch !== undefined ? tagToSearch : dbTagSearch).trim();
      if (!tag || tag === "__ALL__") {
        await loadAllQuestions();
        return;
      }
      setSelectedDropdownTag(tag);
      setDbTagSearch(tag);
      const count = allQuestions.filter((q) =>
        (q.tags || []).some((t) => t.trim().toLowerCase() === tag.toLowerCase())
      ).length;
      setMsg(`✅ Filtered to ${count} question${count === 1 ? "" : "s"} matching tag '${tag}'`);
    }, [dbTagSearch, loadAllQuestions, allQuestions]);

    // Debounce for local search filter (300ms)
    useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedFilter(localFilter);
      }, 300);
      return () => clearTimeout(timer);
    }, [localFilter]);

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
      setTagsText(q.tags ? q.tags.join(", ") : "");
      setOrder(q.order ? String(q.order) : "");
      setGroupId(q.groupId || "");
      setSolutionUrl(q.solutionUrl || "");
      setSolutionText(q.solutionText || "");
      setCurrentAiSolution(q.aiSolution?.text || "");
      const resolvedLoc = getQuestionLocation(q);
      setSingleLocOrder(q.aiSolution?.locationOrder ?? resolvedLoc.locationOrder ?? null);
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
      setDifficulty(1); setTagsText(""); setOrder(""); setGroupId("");
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
        const existingAi = allQuestions.find(q => q.id === editingId)?.aiSolution;
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
        const oldDoc = editingId ? allQuestions.find((q) => q.id === editingId) : null;
        const oldTags = oldDoc?.tags || [];

        if (editingId) {
          await setDoc(doc(db, "questions", editingId), docData, { merge: true });
          setMsg("✅ Updated & Saved Question!");
        } else {
          docData.createdAt = serverTimestamp();
          await addDoc(collection(db, "questions"), docData);
          setMsg("✅ Created New Question!");
        }

        // If an old tag no longer belongs to any question, prune it from locations in Firestore
        if (editingId && oldTags.length > 0) {
          const newTagsLower = new Set(tagsArray.map((t) => t.toLowerCase()));
          const removedTags = oldTags.filter((t) => !newTagsLower.has(t.trim().toLowerCase()));

          removedTags.forEach(async (removedTag) => {
            const norm = removedTag.trim().toLowerCase();
            const stillHasQuestions = allQuestions.some(
              (q) => q.id !== editingId && (q.tags || []).some((t) => t.trim().toLowerCase() === norm)
            );
            if (!stillHasQuestions) {
              locations.forEach(async (loc) => {
                if ((loc.assignedTags || []).some((t) => t.trim().toLowerCase() === norm)) {
                  const cleaned = (loc.assignedTags || []).filter((t) => t.trim().toLowerCase() !== norm);
                  try {
                    await updateDoc(doc(db, "locations", loc.id), { assignedTags: cleaned });
                  } catch (e) {
                    console.warn(`Error pruning tag '${removedTag}' from loc ${loc.id}:`, e);
                  }
                }
              });
            }
          });
        }

        if (!editingId) resetForm(); 
      } catch (e: any) { setMsg("Error: " + e.message); }
    }    
  
    async function deleteQuestion(qId: string) {
      if (!confirm("Permanently delete this question?")) return;
      try {
        const targetQ = allQuestions.find((q) => q.id === qId);
        const tagsOfDeletedQ = targetQ?.tags || [];

        await deleteDoc(doc(db, "questions", qId));
        setSelectedQIds((prev) => {
          const next = new Set(prev);
          next.delete(qId);
          return next;
        });

        // Prune any tags that no longer have any questions from location assigned tags
        tagsOfDeletedQ.forEach(async (tag) => {
          const norm = tag.trim().toLowerCase();
          const otherQuestionsWithTag = allQuestions.filter(
            (q) => q.id !== qId && (q.tags || []).some((t) => t.trim().toLowerCase() === norm)
          );
          if (otherQuestionsWithTag.length === 0) {
            locations.forEach(async (loc) => {
              if ((loc.assignedTags || []).some((t) => t.trim().toLowerCase() === norm)) {
                const cleaned = (loc.assignedTags || []).filter((t) => t.trim().toLowerCase() !== norm);
                try {
                  await updateDoc(doc(db, "locations", loc.id), { assignedTags: cleaned });
                } catch (e) {
                  console.warn(`Error pruning tag '${tag}' from loc ${loc.id}:`, e);
                }
              }
            });
          }
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
          setAllQuestions((prev) =>
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
          setAllQuestions((prev) =>
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
      const targetQuestions = allQuestions.filter((q) => q.id && selectedQIds.has(q.id));
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

        // Determine effective location order for curriculum constraint
        let effectiveLocOrder = batchLocOrder;
        let locSourceNote = batchLocOrder ? `Unit ${batchLocOrder}` : "Universal";
        if (batchAutoDetectLoc) {
          const locInfo = getQuestionLocation(q);
          if (locInfo.locationOrder !== null) {
            effectiveLocOrder = locInfo.locationOrder;
            locSourceNote = `Tag Unit ${effectiveLocOrder} (${locInfo.locationName})`;
          } else if (batchLocOrder !== null) {
            locSourceNote = `Fallback Unit ${batchLocOrder}`;
          } else {
            locSourceNote = "Universal (Unassigned Tag)";
          }
        }

        // Generate AI solution for question with no existing answer
        setBatchStats((prev) => ({
          ...prev,
          processed: i + 1,
          currentTitle: qTitle,
          currentStatus: `Generating AI answer [${locSourceNote}] (${i + 1}/${targetList.length})...`,
        }));

        try {
          const result = await generateAiSolutionForQuestion(q, effectiveLocOrder, signal);
          if (signal.aborted) break;

          const aiPayload = {
            text: result.text,
            verifiedCorrectIndex: result.verifiedIndex,
            isDiscrepancy: result.isDiscrepancy,
            discrepancyNote: result.discrepancyNote || "",
            generatedAt: Date.now(),
            model: "gemini-3.8-flash",
            locationOrder: effectiveLocOrder,
          };

          if (q.id) {
            await updateDoc(doc(db, "questions", q.id), {
              aiSolution: aiPayload,
              updatedAt: serverTimestamp(),
            });
            setAllQuestions((prev) =>
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
            <Input label="Tags (comma sep)" value={tagsText} onChange={(e:any) => setTagsText(e.target.value)} placeholder="e.g. algebra, functions" />
          </div>

          {availableTags.length > 0 && (
            <div className="-mt-1 bg-gray-50 dark:bg-gray-900/60 p-2.5 rounded-lg border dark:border-gray-700/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Active Question Tags ({availableTags.length}) — Click to toggle:
                </span>
              </div>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                {availableTags.map((t) => {
                  const active = tagsText.split(",").map(s => s.trim().toLowerCase()).includes(t.toLowerCase());
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        const current = tagsText.split(",").map(s => s.trim()).filter(Boolean);
                        if (active) {
                          setTagsText(current.filter(x => x.toLowerCase() !== t.toLowerCase()).join(", "));
                        } else {
                          setTagsText([...current, t].join(", "));
                        }
                      }}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-mono transition-all ${
                        active
                          ? "bg-indigo-600 text-white font-bold shadow-xs"
                          : "bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-gray-700 dark:text-gray-300 border dark:border-gray-700"
                      }`}
                    >
                      {active ? "✓ " : "+ "}{t} ({tagCountMap.get(t)})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold uppercase text-indigo-800 dark:text-indigo-300">
                      🤖 AI Solution (Editable)
                    </label>
                    {(() => {
                      const curTags = tagsText.split(",").map((s) => s.trim()).filter(Boolean);
                      const locInfo = getQuestionLocation({ tags: curTags });
                      if (locInfo.isConflict) {
                        return (
                          <span
                            className="text-[10px] bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full font-bold border border-red-300 dark:border-red-800"
                            title={`Conflict: tags belong to different locations (${locInfo.conflicts.join(", ")})`}
                          >
                            ⚠️ Multi-Unit Conflict
                          </span>
                        );
                      }
                      if (locInfo.locationOrder !== null) {
                        return (
                          <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-bold">
                            📍 Tag Unit: Loc {locInfo.locationOrder} ({locInfo.locationName})
                          </span>
                        );
                      }
                      return (
                        <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full font-bold">
                          ⚪ Unassigned Unit (Universal)
                        </span>
                      );
                    })()}
                  </div>

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
                <span>Question Filter & Search</span>
              </h3>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                {visibleQuestions.length} shown of {allQuestions.length} in DB
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
                }}
              >
                <option value="">-- All Questions ({allQuestions.length} in Database) --</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    🏷️ {tag} ({tagCountMap.get(tag) || 0} question{tagCountMap.get(tag) === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
            </div>

            {/* Manual Tag Input with quick clear */}
            <div className="flex gap-2">
              <input
                className="input flex-1 text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                placeholder="Type tag to filter (or empty for all)..."
                value={dbTagSearch}
                onChange={(e) => {
                  setDbTagSearch(e.target.value);
                  setSelectedDropdownTag(e.target.value);
                }}
              />
              {dbTagSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setDbTagSearch("");
                    setSelectedDropdownTag("");
                  }}
                  className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors"
                >
                  Clear Tag
                </button>
              )}
            </div>

            {/* Debounced filter (300ms delay) */}
            <input
              className="input w-full text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              placeholder={
                dbTagSearch.trim()
                  ? `🔍 Search within tag '${dbTagSearch}'...`
                  : "🔍 Search title, prompt text, or LaTeX..."
              }
              value={localFilter}
              onChange={(e) => setLocalFilter(e.target.value)}
            />
          </div>

          {/* BATCH SELECTION & ACTION TOOLBAR */}
          {visibleQuestions.length > 0 && (
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
                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">
                    {batchAutoDetectLoc ? "Fallback Scope:" : "Scope:"}
                  </span>
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

              {/* Tag Auto-detection Toggle */}
              <div className="flex items-center justify-between pt-1 border-t border-indigo-200/60 dark:border-indigo-900/40">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-900 dark:text-indigo-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={batchAutoDetectLoc}
                    onChange={(e) => setBatchAutoDetectLoc(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                  />
                  <span>Auto-detect Unit per Question from Tags (Recommended)</span>
                </label>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {batchAutoDetectLoc ? "Strict syllabus bounds per tag" : "Uniform syllabus bounds"}
                </span>
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
                  Type in the search box above to search across all questions (auto-loads after 0.5s), choose a tag, or load the whole pool directly.
                </p>
                <button
                  type="button"
                  onClick={loadAllQuestions}
                  className="mt-2 px-3 py-1.5 bg-black text-white dark:bg-white dark:text-black rounded-lg text-xs font-bold hover:opacity-80 transition-opacity"
                >
                  🌐 Load All Questions
                </button>
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
                      {(() => {
                        const locInfo = getQuestionLocation(q);
                        if (locInfo.isConflict) {
                          return (
                            <span
                              className="bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 px-1.5 py-0.2 rounded-full font-bold text-[10px]"
                              title={`Multi-Unit conflict: ${locInfo.conflicts.join(", ")}`}
                            >
                              ⚠️ Loc Conflict
                            </span>
                          );
                        }
                        if (locInfo.locationOrder !== null) {
                          return (
                            <span className="bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0.2 rounded-full font-bold text-[10px]">
                              📍 Loc {locInfo.locationOrder}: {locInfo.locationName}
                            </span>
                          );
                        }
                        return (
                          <span className="bg-gray-100 dark:bg-gray-800 text-gray-400 px-1.5 py-0.2 rounded-full text-[10px]">
                            ⚪ Unassigned Loc
                          </span>
                        );
                      })()}
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
