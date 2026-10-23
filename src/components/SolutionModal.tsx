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

export function SolutionModal({
  question,
  selectedChoice,
  user,
  character,
  subArea,
  onClose,
  onQuestionUpdated,
}: SolutionModalProps) {
  const [loading, setLoading] = useState(false);
  const [solutionText, setSolutionText] = useState<string>("");
  const [solutionUrl, setSolutionUrl] = useState<string | null>(question.solutionUrl || null);
  const [source, setSource] = useState<"gm" | "cached_ai" | "gemini_generated" | null>(null);
  const [isDiscrepancy, setIsDiscrepancy] = useState(false);
  const [discrepancyNote, setDiscrepancyNote] = useState<string | null>(null);
  const [verifiedCorrectIndex, setVerifiedCorrectIndex] = useState<number>(question.correctIndex ?? 0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

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
    setLoading(true);
    setErrorMsg(null);

    const activeKey =
      overrideKey !== undefined
        ? overrideKey
        : (typeof window !== "undefined" ? localStorage.getItem("gemini_api_key_override") || "" : "");

    try {
      const res = await fetch("/api/questions/solve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(activeKey.trim() ? { "x-gemini-api-key": activeKey.trim() } : {}),
        },
        body: JSON.stringify({
          questionId: question.id,
          questionData: question,
          forceRefresh,
          geminiApiKey: activeKey.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.error || `Server returned error (${res.status})`;
        setErrorMsg(msg);
        if (
          data.needsApiKey ||
          data.isBillingError ||
          res.status === 402 ||
          res.status === 403 ||
          msg.toLowerCase().includes("denied") ||
          msg.toLowerCase().includes("api key") ||
          msg.toLowerCase().includes("prepago") ||
          msg.toLowerCase().includes("prepaid")
        ) {
          setShowApiKeyConfig(true);
        }
        setLoading(false);
        return;
      }

      setSolutionText(data.solutionText || "");
      if (data.solutionUrl) setSolutionUrl(data.solutionUrl);
      setSource(data.source);
      setIsDiscrepancy(Boolean(data.isDiscrepancy));
      setDiscrepancyNote(data.discrepancyNote || null);
      setVerifiedCorrectIndex(data.verifiedCorrectIndex ?? (question.correctIndex ?? 0));
      setLoading(false);

      const aiPayload = {
        text: data.solutionText,
        verifiedCorrectIndex: data.verifiedCorrectIndex,
        isDiscrepancy: data.isDiscrepancy,
        discrepancyNote: data.discrepancyNote,
        generatedAt: data.generatedAt || Date.now(),
        model: "gemini-3.8-flash",
      };

      // Cache to Firestore from client if user is signed in
      if (data.source === "gemini_generated" && question.id) {
        try {
          await updateDoc(doc(db, "questions", question.id), {
            aiSolution: aiPayload,
          });
        } catch (cacheErr) {
          console.warn("Client could not cache solution to Firestore:", cacheErr);
        }
      }

      if (onQuestionUpdated && data.source === "gemini_generated") {
        onQuestionUpdated({
          ...question,
          aiSolution: aiPayload,
        });
      }
    } catch (err: any) {
      console.error("Failed to load solution:", err);
      setErrorMsg(err.message || "Unable to retrieve or generate solution right now. Please try again.");
      setLoading(false);
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

    // 2. If cached AI solution exists on question doc, use it immediately (0 tokens)
    if (question.aiSolution && question.aiSolution.text) {
      setSolutionText(question.aiSolution.text);
      setSource("cached_ai");
      setIsDiscrepancy(Boolean(question.aiSolution.isDiscrepancy));
      setDiscrepancyNote(question.aiSolution.discrepancyNote || null);
      setVerifiedCorrectIndex(question.aiSolution.verifiedCorrectIndex ?? (question.correctIndex ?? 0));
      setLoading(false);
      return;
    }

    // 3. Otherwise, fetch from server API
    fetchSolution(false);
  }, [question]);

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
                  <h2 className="text-base sm:text-lg font-black text-indigo-300">Explanation & Derivation</h2>
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
                  {source === "gemini_generated" && (
                    <span className="text-[10px] font-bold bg-blue-900/60 text-blue-300 border border-blue-500/50 px-2 py-0.5 rounded-full">
                      ✨ Google AI Verified
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate max-w-md">
                  {question.title || "Mathematics Problem Walkthrough"}
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
                Enter your Google AI Studio API key below.
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
            ) : source && !loading ? (
              <div className="bg-emerald-950/50 border border-emerald-500/50 p-3 rounded-xl flex items-center gap-2.5 text-emerald-200 text-xs">
                <span className="text-lg text-emerald-400">✓</span>
                <div>
                  <span className="font-bold text-emerald-300">Answer Verified: </span>
                  Independent mathematical calculation confirms Option ({configuredLetter}) is the correct solution.
                </div>
              </div>
            ) : null}

            {/* 3. Loading State */}
            {loading && (
              <div className="p-8 text-center space-y-3 bg-indigo-950/20 rounded-xl border border-indigo-800/40">
                <div className="text-4xl animate-spin inline-block">🔮</div>
                <h4 className="text-sm font-black text-indigo-300">Solving & Checking Question with Google AI...</h4>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Performing independent step-by-step mathematical calculation and inspecting for developer authoring typos.
                </p>
              </div>
            )}

            {/* 4. Error State */}
            {errorMsg && !loading && (
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

            {/* 5. Step-by-Step Derivation */}
            {solutionText && !loading && (
              <div className="bg-indigo-950/30 p-4 sm:p-5 rounded-xl border border-indigo-800/40 text-sm leading-relaxed">
                <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span>📝</span> Step-by-Step Derivation & Solution:
                </h4>
                <div className="text-gray-200">
                  <MathMarkdown content={solutionText} />
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
              <span>Report Issue / Flag Question</span>
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
