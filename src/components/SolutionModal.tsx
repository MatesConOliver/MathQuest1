"use client";

import React, { useState, useEffect } from "react";
import { QuestionDoc, Character, SubArea, ContentBlock } from "@/types/game";
import { User } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { BlockMath, InlineMath } from "react-katex";
import { MathMarkdown } from "@/components/MathMarkdown";
import { ReportIssueModal } from "@/components/ReportIssueModal";

interface SolutionModalProps {
  question: QuestionDoc;
  selectedChoice: number | null;
  user: User | null;
  character: Character | null;
  subArea?: SubArea | null;
  locationOrder?: number | null;
  onClose: () => void;
  onQuestionUpdated?: (updatedQ: QuestionDoc) => void;
}

function getEmbeddableVideoUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
    }
    if (parsed.hostname.includes("youtu.be")) {
      const v = parsed.pathname.slice(1);
      if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
    }
    if (parsed.hostname.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

const renderStructuredContent = (blocks: ContentBlock[] | undefined, isBlock = false) => {
  if (!blocks) return null;
  const MathComponent = isBlock ? BlockMath : InlineMath;
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "text":
            return <span key={index}>{block.value}</span>;
          case "latex":
            try {
              return (
                <span key={index} className="inline-block mx-1">
                  <MathComponent math={block.value} />
                </span>
              );
            } catch {
              return <span key={index} className="text-red-400 font-mono">{`$${block.value}$`}</span>;
            }
          case "image":
            return (
              <img
                key={index}
                src={block.value}
                alt="Question diagram"
                className="my-2 rounded-xl max-h-56 max-w-full object-contain mx-auto bg-black/40 border border-white/20 p-1 block shadow-lg"
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
};

function cleanErrorMessage(raw: string): string {
  if (!raw) return "";
  try {
    const match = raw.match(/"message":\s*"([^"]+)"/);
    if (match && match[1]) {
      return match[1].replace(/\\n/g, " ");
    }
  } catch {}
  return raw;
}

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

  // Look for either structured section header or legacy verification marker (case-insensitive)
  const markerMatch = fullText.match(/(?:###\s*Verification|##\s*Verification|---VERIFICATION---)/i);
  const markerIndex = markerMatch && markerMatch.index !== undefined ? markerMatch.index : -1;

  let displayText = fullText;
  let vBlock = "";

  if (markerIndex !== -1) {
    const candidateText = fullText.slice(0, markerIndex).trim();
    vBlock = fullText.slice(markerIndex);
    // Only strip the verification block if there actually is text before it!
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

export function SolutionModal({
  question,
  selectedChoice,
  user,
  character,
  subArea,
  locationOrder,
  onClose,
  onQuestionUpdated,
}: SolutionModalProps) {
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [solutionText, setSolutionText] = useState<string>("");
  const [solutionUrl, setSolutionUrl] = useState<string | null>(question.solutionUrl || null);
  const [source, setSource] = useState<"gm" | "cached_ai" | "gemini_generated" | null>(null);
  const [isDiscrepancy, setIsDiscrepancy] = useState(false);
  const [discrepancyNote, setDiscrepancyNote] = useState<string | null>(null);
  const [verifiedCorrectIndex, setVerifiedCorrectIndex] = useState<number>(question.correctIndex ?? 0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Effective location order for curriculum scoping
  const effectiveLoc =
    typeof locationOrder === "number" && locationOrder > 0
      ? locationOrder
      : typeof subArea?.order === "number" && subArea.order > 0
      ? subArea.order
      : null;

  // Custom Google AI Studio API Key support
  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [showApiKeyConfig, setShowApiKeyConfig] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedKey = localStorage.getItem("gemini_api_key_override") || "";
      setCustomApiKey(savedKey);
      setApiKeyInput(savedKey);
    }
  }, []);

  const fetchSolution = async (forceRefresh = false, overrideKey?: string) => {
    if (!question.id) return;

    // Cancel any previous in-flight stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setIsStreaming(false);
    setErrorMsg(null);

    const activeKey =
      overrideKey !== undefined
        ? overrideKey
        : (typeof window !== "undefined" ? localStorage.getItem("gemini_api_key_override") || "" : "");

    try {
      const res = await fetch("/api/questions/solve", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(activeKey.trim() ? { "x-gemini-api-key": activeKey.trim() } : {}),
        },
        body: JSON.stringify({
          questionId: question.id,
          questionData: question,
          forceRefresh,
          geminiApiKey: activeKey.trim() || undefined,
          locationOrder: effectiveLoc,
        }),
      });

      const contentType = res.headers.get("content-type") || "";

      // 1. If HTTP error (e.g. 504 Gateway Timeout, 403, 402, 500), handle immediately and show error UI
      if (!res.ok) {
        let msg = `Server returned error (${res.status})`;
        let needsKey = res.status === 402 || res.status === 403 || res.status === 504;
        let isBilling = res.status === 402;

        try {
          if (contentType.includes("application/json")) {
            const data = await res.json();
            msg = data.error || msg;
            if (data.needsApiKey) needsKey = true;
            if (data.isBillingError) isBilling = true;
          } else {
            const rawText = await res.text();
            if (rawText) {
              msg = `Server returned status ${res.status}${res.status === 504 ? " (Gateway Timeout)" : ""}: ${rawText.slice(0, 160)}`;
            }
          }
        } catch {}

        setErrorMsg(msg);
        setSource(null);
        setLoading(false);
        setIsStreaming(false);

        if (
          needsKey ||
          isBilling ||
          msg.toLowerCase().includes("denied") ||
          msg.toLowerCase().includes("api key") ||
          msg.toLowerCase().includes("timeout") ||
          msg.toLowerCase().includes("prepago")
        ) {
          setShowApiKeyConfig(true);
        }
        return;
      }

      // 2. JSON response: cached GM or AI solution
      if (contentType.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        setSolutionText(data.solutionText || "");
        if (data.solutionUrl) setSolutionUrl(data.solutionUrl);
        setSource(data.source);
        setIsDiscrepancy(Boolean(data.isDiscrepancy));
        setDiscrepancyNote(data.discrepancyNote || null);
        setVerifiedCorrectIndex(data.verifiedCorrectIndex ?? (question.correctIndex ?? 0));
        setLoading(false);
        return;
      }

      // 3. Real-Time Streaming mode (text/event-stream)
      setLoading(false); // Modal immediately transitions from loading to live stream
      setIsStreaming(true);
      setSolutionText("");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let rawAccumulated = "";
      let finalVerifiedIndex = question.correctIndex ?? 0;
      let finalIsDiscrepancy = false;
      let finalDiscrepancyNote: string | null = null;
      let streamHasError = false;

      if (reader) {
        let streamBuffer = "";
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
                  const parsed = parseStreamingContent(rawAccumulated);
                  setSolutionText(parsed.displayText);
                  if (parsed.verifiedIndex !== null) {
                    finalVerifiedIndex = parsed.verifiedIndex;
                    setVerifiedCorrectIndex(parsed.verifiedIndex);
                  }
                  if (parsed.hasVerification) {
                    finalIsDiscrepancy = parsed.isDiscrepancy;
                    setIsDiscrepancy(parsed.isDiscrepancy);
                    finalDiscrepancyNote = parsed.discrepancyNote || null;
                    setDiscrepancyNote(parsed.discrepancyNote || null);
                  }
                } else if (data.type === "error") {
                  streamHasError = true;
                  setErrorMsg(cleanErrorMessage(data.error || "Streaming error occurred"));
                  if (data.needsApiKey || data.isBillingError) {
                    setShowApiKeyConfig(true);
                  }
                }
              } catch {}
            }
          }
        }
      }

      setIsStreaming(false);

      const finalParsed = parseStreamingContent(rawAccumulated);
      const cleanSolutionText = (finalParsed.displayText || rawAccumulated).trim();

      // Guard: If no solution text was streamed (or an error occurred), do not show verified state
      if (!cleanSolutionText || streamHasError) {
        setSource(null);
        if (!errorMsg && !streamHasError) {
          setErrorMsg("No explanation could be generated. Please check your Google AI Studio API key.");
          setShowApiKeyConfig(true);
        }
        return;
      }

      setSource("gemini_generated");
      setSolutionText(cleanSolutionText);

      const aiPayload = {
        text: cleanSolutionText,
        verifiedCorrectIndex: finalParsed.verifiedIndex ?? finalVerifiedIndex,
        isDiscrepancy: finalParsed.isDiscrepancy ?? finalIsDiscrepancy,
        discrepancyNote: finalParsed.discrepancyNote || finalDiscrepancyNote || "",
        generatedAt: Date.now(),
        model: "gemini-3.8-flash",
        locationOrder: effectiveLoc,
      };

      // In-memory cache ensures immediate 0ms reload if the student closes and re-opens in the same battle
      question.aiSolution = aiPayload;

      // Cache to Firestore from client if question has an ID
      if (cleanSolutionText && question.id) {
        try {
          await updateDoc(doc(db, "questions", question.id), {
            aiSolution: aiPayload,
          });
        } catch (cacheErr) {
          console.warn("Client could not cache solution to Firestore:", cacheErr);
        }
      }

      if (onQuestionUpdated) {
        onQuestionUpdated({
          ...question,
          aiSolution: aiPayload,
        });
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // Stream aborted due to modal close or fresh retry
        return;
      }
      console.error("Failed to load solution:", err);
      setErrorMsg(err.message || "Unable to retrieve or generate solution right now. Please try again.");
      setLoading(false);
      setIsStreaming(false);
    }
  };

  useEffect(() => {
    // 1. If GM manual solution exists, use it immediately
    if (question.solutionText && question.solutionText.trim()) {
      setSolutionText(question.solutionText.trim());
      setSource("gm");
      setVerifiedCorrectIndex(question.correctIndex ?? 0);
      setIsDiscrepancy(false);
      setLoading(false);
      return;
    }

    // 2. If cached AI solution exists, use it immediately (0 tokens, instant 0ms retrieval)
    if (question.aiSolution && question.aiSolution.text && question.aiSolution.text.trim()) {
      setSolutionText(question.aiSolution.text.trim());
      setSource("cached_ai");
      setIsDiscrepancy(Boolean(question.aiSolution.isDiscrepancy));
      setDiscrepancyNote(question.aiSolution.discrepancyNote || null);
      setVerifiedCorrectIndex(question.aiSolution.verifiedCorrectIndex ?? (question.correctIndex ?? 0));
      setLoading(false);
      return;
    }

    // 3. Otherwise, fetch from server API with location constraint
    fetchSolution(false);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [question, effectiveLoc]);

  const handleSaveApiKey = () => {
    const key = apiKeyInput.trim();
    if (typeof window !== "undefined") {
      if (key) {
        localStorage.setItem("gemini_api_key_override", key);
      } else {
        localStorage.removeItem("gemini_api_key_override");
      }
    }
    setCustomApiKey(key);
    setShowApiKeyConfig(false);
    fetchSolution(true, key);
  };

  const embedUrl = solutionUrl ? getEmbeddableVideoUrl(solutionUrl) : null;
  const isDirectImage = solutionUrl ? /\.(jpeg|jpg|gif|png|svg|webp)($|\?)/i.test(solutionUrl) : false;
  const isDirectVideo = solutionUrl ? /\.(mp4|webm|ogg)($|\?)/i.test(solutionUrl) : false;

  const configuredLetter = String.fromCharCode(65 + (question.correctIndex ?? 0));
  const verifiedLetter =
    verifiedCorrectIndex >= 0 ? String.fromCharCode(65 + verifiedCorrectIndex) : "None (Problem Flawed)";

  return (
    <>
      <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-3 sm:p-4 animate-in fade-in duration-200">
        <div className="bg-gray-900 border-2 border-indigo-500/60 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl text-white overflow-hidden">
          {/* Header */}
          <div className="px-5 sm:px-6 py-3.5 border-b border-gray-800 flex justify-between items-center bg-gray-800/60">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">💡</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-black text-indigo-300">Question explanation</h2>
                  {source === "gm" && (
                    <span className="text-[10px] font-bold bg-amber-900/60 text-amber-300 border border-amber-500/50 px-2 py-0.5 rounded-full">
                      👑 GM Authored
                    </span>
                  )}
                  {source === "cached_ai" && (
                    <span className="text-[10px] font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded-full">
                      ⚡ Instant Cache (0 Tokens)
                    </span>
                  )}
                  {source === "gemini_generated" && !isStreaming && (
                    <span className="text-[10px] font-bold bg-blue-900/60 text-blue-300 border border-blue-500/50 px-2 py-0.5 rounded-full">
                      ✨ Google AI Verified
                    </span>
                  )}
                  {isStreaming && (
                    <span className="text-[10px] font-bold bg-indigo-900/70 text-indigo-200 border border-indigo-400/50 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse shadow-[0_0_12px_rgba(99,102,241,0.5)]">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>Writing Live...</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  Step-by-Step Problem Walkthrough
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowApiKeyConfig((prev) => !prev)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1 transition-colors ${
                  customApiKey
                    ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/60"
                    : "bg-indigo-950/60 text-indigo-300 border-indigo-500/40 hover:bg-indigo-900/60"
                }`}
                title="Configure Google AI Studio API Key"
              >
                <span>🔑</span>
                <span className="hidden sm:inline">{customApiKey ? "API Key Configured" : "Set API Key"}</span>
              </button>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-300 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* API Key Configuration Panel */}
          {showApiKeyConfig && (
            <div className="bg-indigo-950/80 border-b border-indigo-500/50 p-4 space-y-2 text-xs animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-200 flex items-center gap-1.5">
                  <span>🔑</span> Google AI Studio API Key
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-200 underline text-[11px]"
                >
                  Get free key at aistudio.google.com ↗
                </a>
              </div>
              <p className="text-gray-300 text-[11px] leading-relaxed">
                This project uses a free Google AI Studio API key of its own to access Google AI. If you want to use a key of yours, enter it below.
                <span className="text-amber-300 block mt-1">
                  💡 <strong>Free Tier Tip:</strong> If your project has &ldquo;Nivel 1 de facturación&rdquo; with a $0 budget, Google returns error 402. Create a key in a project <strong>WITHOUT billing attached</strong> to use Google&apos;s 100% Free Tier (1,500 daily requests free)!
                </span>
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="flex-1 bg-black/70 border border-indigo-500/40 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-400 font-mono"
                />
                <button
                  onClick={handleSaveApiKey}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition-colors shrink-0"
                >
                  Save & Solve
                </button>
                {customApiKey && (
                  <button
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        localStorage.removeItem("gemini_api_key_override");
                      }
                      setCustomApiKey("");
                      setApiKeyInput("");
                    }}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-xs"
                    title="Remove custom key"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Body */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
            {/* 1. Problem Statement Card */}
            <div className="bg-black/50 p-4 rounded-xl border border-gray-800 text-sm leading-relaxed text-gray-200 space-y-2">
              <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <span>Problem Statement:</span>
                <span className="text-emerald-400 font-mono text-xs">
                  Game Database Choice: Option ({configuredLetter})
                </span>
              </div>
              <div className="font-serif text-gray-100">
                {question.promptContent ? (
                  renderStructuredContent(question.promptContent, true)
                ) : question.promptType === "latex" ? (
                  <div className="overflow-x-auto py-1">
                    <BlockMath math={question.promptLatex || ""} />
                  </div>
                ) : question.promptType === "image" && question.promptImageUrl ? (
                  <img
                    src={question.promptImageUrl}
                    alt="Question"
                    className="max-h-48 rounded-xl border border-white/20 mx-auto bg-black/40 p-1 block shadow-md"
                  />
                ) : (
                  <div>{question.promptText}</div>
                )}
              </div>
            </div>

            {/* 2. Discrepancy or Verification Banner */}
            {isDiscrepancy ? (
              <div className="bg-amber-950/80 border-2 border-amber-500/70 p-4 rounded-xl space-y-2 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                <div className="flex items-center gap-2 text-amber-300 font-black text-sm">
                  <span className="text-xl">⚠️</span>
                  <span>Potential Author Mistake / Typo Detected</span>
                </div>
                <p className="text-xs text-amber-200 leading-relaxed">
                  The game database has Option <strong>({configuredLetter})</strong> registered as correct, but
                  independent mathematical derivation points to Option <strong>({verifiedLetter})</strong>.
                </p>
                {discrepancyNote && (
                  <div className="bg-black/40 p-2.5 rounded-lg border border-amber-500/30 text-xs text-amber-300/90 font-mono">
                    {discrepancyNote}
                  </div>
                )}
                <div className="text-[11px] text-amber-200/90 flex items-center justify-between pt-1">
                  <span>If you answered correctly, you can report this question below to claim a Gold Bounty!</span>
                </div>
              </div>
            ) : source && !loading && !isStreaming ? (
              <div className="bg-emerald-950/50 border border-emerald-500/50 p-3 rounded-xl flex items-center gap-2.5 text-emerald-200 text-xs">
                <span className="text-lg text-emerald-400">✓</span>
                <div>
                  <span className="font-bold text-emerald-300">Answer Verified: </span>
                  Independent mathematical calculation confirms Option ({configuredLetter}) is the correct solution.
                </div>
              </div>
            ) : null}

            {/* 3. Loading State (Connecting) */}
            {loading && (
              <div className="p-8 text-center space-y-3 bg-indigo-950/20 rounded-xl border border-indigo-800/40 animate-pulse">
                <div className="text-4xl animate-spin inline-block">🔮</div>
                <h4 className="text-sm font-black text-indigo-300">Connecting to Google AI...</h4>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Preparing step-by-step mathematical derivation scoped to your location syllabus.
                </p>
                <p className="text-[11px] text-amber-300/80 bg-black/40 border border-amber-500/20 rounded-lg px-3 py-1.5 max-w-md mx-auto">
                  ⏱️ If answer is not rendered after 30 seconds or an error occurs, wait a few seconds and try again.
                </p>
              </div>
            )}

            {/* 4. Error State */}
            {errorMsg && !loading && !isStreaming && (
              <div className="p-4 bg-red-950/60 border border-red-500/60 rounded-xl text-xs text-red-200 space-y-3">
                <div className="font-bold text-red-300 flex items-center gap-1.5">
                  <span>⚠️</span> Could not load automated solution
                </div>
                <p className="leading-relaxed">{errorMsg}</p>
                <div className="flex gap-2 pt-1 flex-wrap">
                  <button
                    onClick={() => fetchSolution(true)}
                    className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    Retry Request
                  </button>
                  <button
                    onClick={() => setShowApiKeyConfig(true)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    Enter Google AI Studio Key
                  </button>
                </div>
              </div>
            )}

            {/* 5. Step-by-Step Derivation (Live Streaming or Finished) */}
            {(solutionText || isStreaming) && !loading && (
              <div className="bg-indigo-950/30 p-4 sm:p-5 rounded-xl border border-indigo-800/40 text-sm leading-relaxed shadow-lg">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📝</span> Step-by-Step Derivation & Solution:
                  </h4>
                  {isStreaming && (
                    <span className="text-[10px] font-bold text-indigo-300 flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>Generating live...</span>
                    </span>
                  )}
                </div>
                {solutionText ? (
                  <div className="text-gray-200 font-serif">
                    <MathMarkdown content={solutionText} />
                    {isStreaming && (
                      <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse rounded-sm align-middle shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 italic py-2 flex items-center gap-2">
                    <span className="animate-spin text-sm">✨</span>
                    <span>AI is beginning to derive the solution...</span>
                  </div>
                )}

                {/* Fixed guidance notice */}
                <div className="mt-3.5 pt-2.5 border-t border-indigo-500/20 flex items-center gap-1.5 text-[11px] text-gray-400">
                  <span className="text-amber-400 shrink-0">⏱️</span>
                  <span>If answer is not rendered after 30 seconds or an error occurs, wait a few seconds and try again.</span>
                </div>
              </div>
            )}

            {/* 6. Embedded Video or Resources */}
            {embedUrl && (
              <div className="aspect-video w-full rounded-xl overflow-hidden border border-gray-700 shadow-lg">
                <iframe
                  src={embedUrl}
                  title="Video Walkthrough"
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}

            {isDirectVideo && solutionUrl && (
              <div className="w-full rounded-xl overflow-hidden border border-gray-700 shadow-lg">
                <video src={solutionUrl} controls className="w-full max-h-80 bg-black" />
              </div>
            )}

            {isDirectImage && solutionUrl && (
              <div className="w-full flex justify-center bg-black/30 p-2 rounded-xl border border-gray-800">
                <img src={solutionUrl} alt="Solution Diagram" className="max-h-96 rounded-lg object-contain shadow" />
              </div>
            )}

            {solutionUrl && !embedUrl && !isDirectImage && !isDirectVideo && (
              <div className="bg-indigo-950/40 border border-indigo-800/60 p-4 rounded-xl text-center space-y-2">
                <p className="text-xs text-indigo-200">Interactive walkthrough or external simulation:</p>
                <a
                  href={solutionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-md transition-transform hover:scale-105"
                >
                  <span>↗</span> Open Solution Resource in New Tab
                </a>
              </div>
            )}
          </div>

          {/* Footer with Report Button and Close Button */}
          <div className="px-5 sm:px-6 py-3 border-t border-gray-800 bg-gray-900/90 flex flex-wrap justify-between items-center gap-3">
            <button
              onClick={() => setShowReportModal(true)}
              className="px-3.5 py-2 bg-amber-950/70 hover:bg-amber-900 text-amber-300 hover:text-amber-200 border border-amber-600/50 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 shadow"
            >
              <span>🚩</span>
              <span>Report issue with question or answer</span>
              <span className="text-[10px] bg-yellow-400/20 text-yellow-300 px-1.5 py-0.5 rounded font-black border border-yellow-500/30">
                💰 Bounty
              </span>
            </button>

            <button
              onClick={onClose}
              className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-2 px-5 rounded-xl text-xs transition-colors"
            >
              Back to Battle
            </button>
          </div>
        </div>
      </div>

      {/* Flag / Report Modal */}
      {showReportModal && (
        <ReportIssueModal
          user={user}
          character={character}
          question={question}
          selectedChoice={selectedChoice}
          subArea={subArea}
          aiSolutionText={solutionText}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </>
  );
}
