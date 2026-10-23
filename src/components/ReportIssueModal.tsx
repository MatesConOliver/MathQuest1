"use client";

import React, { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { QuestionDoc, Character, SubArea } from "@/types/game";
import { User } from "firebase/auth";

interface ReportIssueModalProps {
  user: User | null;
  character: Character | null;
  question: QuestionDoc;
  selectedChoice: number | null;
  subArea?: SubArea | null;
  aiSolutionText?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function ReportIssueModal({
  user,
  character,
  question,
  selectedChoice,
  subArea,
  aiSolutionText,
  onClose,
  onSubmitted,
}: ReportIssueModalProps) {
  const [issueType, setIssueType] = useState<string>("answer_incorrect");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const issueOptions = [
    { id: "answer_incorrect", label: "The marked correct answer is wrong (developer error)" },
    { id: "typo_or_unclear", label: "Typo, broken LaTeX formula, or unclear question wording" },
    { id: "ai_explanation_issue", label: "The AI explanation has a mistake or is incomplete" },
    { id: "diagram_broken", label: "Image or diagram didn't load properly" },
    { id: "other_bug", label: "Other gameplay bug or problem" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMsg("Please provide a short description of the problem.");
      return;
    }
    if (!user) {
      setErrorMsg("You must be logged in to report an issue.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      // Build a prompt summary for GM preview
      let promptSummary = question.title || "Untitled Question";
      if (question.promptText) {
        promptSummary += `: ${question.promptText.slice(0, 80)}`;
      }

      const reportPayload = {
        category: "question",
        status: "pending",
        userId: user.uid,
        ownerUid: user.uid,
        type: "question_report",
        userEmail: user.email || "Unknown Email",
        characterName: character?.name || "Player",
        questionId: question.id || "unknown_q",
        questionTitle: question.title || "Untitled Question",
        questionPrompt: promptSummary,
        configuredCorrectIndex: question.correctIndex ?? 0,
        selectedChoiceIndex: selectedChoice,
        subAreaId: subArea?.id || null,
        locationId: subArea?.locationId || null,
        problemDescription: description.trim(),
        issueType,
        aiSolutionText: aiSolutionText || question.solutionText || null,
        rewardGold: 0,
        createdAt: serverTimestamp(),
      };

      try {
        await addDoc(collection(db, "reports"), reportPayload);
      } catch (primaryErr: any) {
        console.warn("Direct write to 'reports' blocked, falling back to 'submissions':", primaryErr);
        await addDoc(collection(db, "submissions"), reportPayload);
      }

      setSuccess(true);
      if (onSubmitted) onSubmitted();
      setTimeout(() => {
        onClose();
      }, 2200);
    } catch (err: any) {
      console.error("Failed to submit report:", err);
      setErrorMsg(err.message || "Failed to submit report. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 animate-in fade-in duration-150">
      <div className="bg-gray-900 border-2 border-amber-500/60 rounded-2xl w-full max-w-lg shadow-2xl text-white overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-800 bg-gray-800/60 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🚩</span>
            <div>
              <h3 className="font-black text-base text-amber-300">Flag & Report Issue</h3>
              <p className="text-[11px] text-gray-400">Help improve MathQuest • Bounty rewards awarded by GM</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        {success ? (
          <div className="p-8 text-center space-y-3">
            <div className="text-5xl animate-bounce">🎁</div>
            <h4 className="text-lg font-black text-emerald-400">Report Successfully Submitted!</h4>
            <p className="text-xs text-gray-300 max-w-md mx-auto leading-relaxed">
              Thank you for reporting! The Game Master reviews flagged questions. If a typo or answer mistake is
              verified, a <strong className="text-yellow-400">Gold Gift Pouch</strong> will be dispatched to your backpack!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Context Box */}
            <div className="bg-black/50 p-3 rounded-xl border border-gray-800 text-xs space-y-1">
              <div className="flex justify-between text-gray-400 font-bold uppercase text-[10px]">
                <span>Question: {question.title || "Current Battle Question"}</span>
                <span>Configured Correct: Option {String.fromCharCode(65 + (question.correctIndex ?? 0))}</span>
              </div>
              {selectedChoice !== null && (
                <div className="text-[11px] text-yellow-300">
                  Your Answer: Option {String.fromCharCode(65 + selectedChoice)}{" "}
                  {selectedChoice === question.correctIndex ? "(Marked Correct)" : "(Marked Incorrect)"}
                </div>
              )}
            </div>

            {/* Issue Category */}
            <div>
              <label className="block text-xs font-bold uppercase text-gray-300 mb-1.5 tracking-wider">
                What seems to be the issue?
              </label>
              <div className="space-y-1.5">
                {issueOptions.map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                      issueType === opt.id
                        ? "bg-amber-950/50 border-amber-500/80 text-amber-200"
                        : "bg-gray-800/40 border-gray-700/60 text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    <input
                      type="radio"
                      name="issueType"
                      value={opt.id}
                      checked={issueType === opt.id}
                      onChange={() => setIssueType(opt.id)}
                      className="accent-amber-400"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold uppercase text-gray-300 mb-1 tracking-wider">
                Explain the problem or how you solved it:
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="E.g., I solved the quadratic and got x = 3, but the game marked x = 5. I think the constant term was written with the wrong sign."
                rows={3}
                className="w-full bg-gray-950 border border-gray-700 rounded-xl p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400 custom-scrollbar"
                required
              />
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/50 text-red-300 text-xs">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Buttons */}
            <div className="flex justify-end gap-2.5 pt-2 border-t border-gray-800">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black rounded-xl text-xs transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <span>🚩</span>
                    <span>Submit Report</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
