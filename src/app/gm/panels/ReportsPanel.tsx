"use client";

import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  getDoc,
  serverTimestamp,
  arrayUnion,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { GameReport, ReportStatus, InventoryItem } from "@/types/game";
import { MathMarkdown } from "@/components/MathMarkdown";

interface ReportsPanelProps {
  onSwitchToQuestions?: (questionId: string) => void;
}

export function ReportsPanel({ onSwitchToQuestions }: ReportsPanelProps) {
  const [reports, setReports] = useState<GameReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReportStatus | "all">("pending");
  const [msg, setMsg] = useState("");

  // Reward Modal State
  const [rewardReport, setRewardReport] = useState<GameReport | null>(null);
  const [rewardGold, setRewardGold] = useState<number>(100);
  const [rewardReason, setRewardReason] = useState<string>("Bug Bounty: Thank you for helping improve the game!");
  const [isRewarding, setIsRewarding] = useState(false);

  // Expanded report for full solution preview
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modal to view/copy Firestore rules for deployment to Firebase Console
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);

  // Local overrides storage for resilience when remote Firestore rules are pending deployment
  const getLocalOverrides = (): Record<string, ReportStatus> => {
    try {
      if (typeof window === "undefined") return {};
      const raw = localStorage.getItem("mq_report_status_overrides");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const saveLocalOverride = (id: string, status: ReportStatus) => {
    try {
      if (typeof window === "undefined") return;
      const current = getLocalOverrides();
      current[id] = status;
      localStorage.setItem("mq_report_status_overrides", JSON.stringify(current));
    } catch (e) {
      console.warn("Could not save local override:", e);
    }
  };

  useEffect(() => {
    let reportsList: GameReport[] = [];
    let submissionsList: GameReport[] = [];

    const updateCombined = () => {
      const overrides = getLocalOverrides();
      const mergedMap = new Map<string, GameReport>();
      [...reportsList, ...submissionsList].forEach((r) => {
        const finalStatus = overrides[r.id] || r.status;
        mergedMap.set(r.id, { ...r, status: finalStatus });
      });
      const combined = Array.from(mergedMap.values()).sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : a.createdAt || 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : b.createdAt || 0;
        return timeB - timeA;
      });
      setReports(combined);
      setLoading(false);
    };

    // 1. Primary listener on 'reports'
    const qReports = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsubReports = onSnapshot(
      qReports,
      (snapshot) => {
        reportsList = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          _collectionName: "reports",
        })) as any[];
        updateCombined();
      },
      (err) => {
        console.warn("Primary reports listener warning (falling back to submissions):", err);
        setLoading(false);
      }
    );

    // 2. Secondary listener on 'submissions' (already permitted for all players in firestore.rules)
    const qSubmissions = query(collection(db, "submissions"), orderBy("createdAt", "desc"));
    const unsubSubmissions = onSnapshot(
      qSubmissions,
      (snapshot) => {
        submissionsList = snapshot.docs
          .filter((d) => d.data().type === "question_report" || d.data().category === "question")
          .map((d) => ({
            id: d.id,
            ...d.data(),
            _collectionName: "submissions",
          })) as any[];
        updateCombined();
      },
      (err) => {
        console.warn("Submissions listener warning:", err);
        setLoading(false);
      }
    );

    return () => {
      unsubReports();
      unsubSubmissions();
    };
  }, []);

  const pendingCount = reports.filter((r) => r.status === "pending").length;

  const filteredReports = reports.filter((r) => {
    if (filter === "all") return true;
    return r.status === filter;
  });

  // Action: Compensate student with in-game gold delivered as a consumable item to their backpack
  const handleSendReward = async () => {
    if (!rewardReport || !rewardReport.userId) return;
    if (rewardGold <= 0) {
      alert("Please enter a positive gold amount.");
      return;
    }

    setIsRewarding(true);
    setMsg("Sending reward to player's backpack...");

    try {
      // 1. Ensure the item template exists in the 'items' collection so the shop/inventory can resolve its metadata
      const giftItemId = "gift_gold_bounty";
      const itemRef = doc(db, "items", giftItemId);
      const itemSnap = await getDoc(itemRef);

      if (!itemSnap.exists()) {
        await setDoc(itemRef, {
          name: "Gold Bounty Pouch",
          description: "A special compensation pouch sent directly by the Game Master for reporting an issue. Open it in your backpack to claim your gold!",
          type: "misc",
          price: 0,
          goldValue: 100,
          imageUrl: "https://cdn-icons-png.flaticon.com/512/272/272525.png",
          inShop: false,
        });
      }

      // 2. Create the unique consumable item instance for the player's backpack
      const instanceId = `gift_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newInventoryItem: InventoryItem = {
        itemId: giftItemId,
        instanceId,
        obtainedAt: Date.now(),
        customData: {
          goldAmount: rewardGold,
          reason: rewardReason,
          title: `Gold Bounty Pouch (+${rewardGold} G)`,
        },
      };

      // 3. Add to player character inventory in Firestore
      const charRef = doc(db, "characters", rewardReport.userId);
      await updateDoc(charRef, {
        inventory: arrayUnion(newInventoryItem),
      });

      // 4. Update the report status to 'rewarded'
      saveLocalOverride(rewardReport.id, "rewarded");
      setReports((prev) =>
        prev.map((r) => (r.id === rewardReport.id ? { ...r, status: "rewarded", rewardGold } : r))
      );

      const targetCol = (rewardReport as any)._collectionName || "reports";
      try {
        const reportRef = doc(db, targetCol, rewardReport.id);
        await updateDoc(reportRef, {
          status: "rewarded",
          rewardGold,
          rewardItemInstanceId: instanceId,
          gmNotes: rewardReason,
          resolvedAt: serverTimestamp(),
        });
      } catch (remoteErr) {
        console.warn("Could not sync rewarded status to remote Firestore:", remoteErr);
      }

      setMsg(`✅ Dispatched ${rewardGold} Gold Pouch to ${rewardReport.characterName || "player"}'s backpack!`);
      setRewardReport(null);
      setTimeout(() => setMsg(""), 3500);
    } catch (err: any) {
      console.error("Error sending reward:", err);
      setMsg(`Error: ${err.message || "Failed to deliver reward"}`);
    } finally {
      setIsRewarding(false);
    }
  };

  // Action: Mark resolved or dismissed
  const handleUpdateStatus = async (reportId: string, status: ReportStatus, collectionName: string = "reports") => {
    // 1. Optimistically update local state & browser storage so GM is never blocked
    saveLocalOverride(reportId, status);
    setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));

    // 2. Attempt remote Firestore update
    try {
      await updateDoc(doc(db, collectionName, reportId), {
        status,
        resolvedAt: serverTimestamp(),
      });
      setMsg(`Report marked as ${status}.`);
      setTimeout(() => setMsg(""), 2000);
    } catch (err: any) {
      console.warn("Primary collection update blocked:", err);
      // Try alternate collection fallback (reports <-> submissions)
      const altCol = collectionName === "reports" ? "submissions" : "reports";
      try {
        await updateDoc(doc(db, altCol, reportId), {
          status,
          resolvedAt: serverTimestamp(),
        });
        setMsg(`Report marked as ${status}.`);
        setTimeout(() => setMsg(""), 2000);
      } catch (altErr) {
        // Status is already preserved locally
        setMsg(`Status updated to "${status}" locally. (Deploy Firestore rules to sync with other devices)`);
        setTimeout(() => setMsg(""), 4000);
      }
    }
  };

  // Action: Delete report
  const handleDeleteReport = async (reportId: string, collectionName: string = "reports") => {
    if (!confirm("Are you sure you want to delete this report?")) return;
    saveLocalOverride(reportId, "dismissed");
    setReports((prev) => prev.filter((r) => r.id !== reportId));

    try {
      await deleteDoc(doc(db, collectionName, reportId));
      setMsg("Report deleted.");
      setTimeout(() => setMsg(""), 2000);
    } catch (err: any) {
      const altCol = collectionName === "reports" ? "submissions" : "reports";
      try {
        await deleteDoc(doc(db, altCol, reportId));
        setMsg("Report deleted.");
        setTimeout(() => setMsg(""), 2000);
      } catch {
        setMsg("Report dismissed locally.");
        setTimeout(() => setMsg(""), 2500);
      }
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b dark:border-gray-700">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
            <span>🚩</span> Student Reports & Bug Tracker
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2.5 py-0.5 rounded-full font-black animate-pulse">
                {pendingCount} Pending
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Review question errors, student solution feedback, and award in-game Gold bounties directly to student backpacks.
          </p>
        </div>

        {/* Filter Tabs & Rules Helper */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5 bg-gray-200 dark:bg-gray-800 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setFilter("pending")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                filter === "pending"
                  ? "bg-amber-500 text-black shadow"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Pending ({reports.filter((r) => r.status === "pending").length})
            </button>
            <button
              onClick={() => setFilter("rewarded")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                filter === "rewarded"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Rewarded ({reports.filter((r) => r.status === "rewarded").length})
            </button>
            <button
              onClick={() => setFilter("resolved")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                filter === "resolved"
                  ? "bg-blue-600 text-white shadow"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Resolved ({reports.filter((r) => r.status === "resolved").length})
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                filter === "all"
                  ? "bg-black text-white dark:bg-white dark:text-black shadow"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              All ({reports.length})
            </button>
          </div>

          <button
            onClick={() => setShowRulesModal(true)}
            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
            title="View Firebase Security Rules"
          >
            <span>🛡️</span> Rules Snippet
          </button>
        </div>
      </div>

      {msg && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold border border-blue-200 dark:border-blue-800 flex justify-between items-center">
          <span>{msg}</span>
          <button onClick={() => setMsg("")} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* Reports List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading player reports...</div>
      ) : filteredReports.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 space-y-2">
          <div className="text-4xl">🎉</div>
          <div className="font-bold text-gray-700 dark:text-gray-200">No {filter} reports found!</div>
          <div className="text-xs text-gray-500">All student question flags and bug reports have been handled.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((report) => {
            const isPending = report.status === "pending";
            const isRewarded = report.status === "rewarded";
            const formattedDate = report.createdAt?.toDate
              ? report.createdAt.toDate().toLocaleString()
              : "Recent";

            return (
              <div
                key={report.id}
                className={`bg-white dark:bg-gray-800/90 rounded-2xl border p-5 transition-all shadow-sm ${
                  isPending
                    ? "border-amber-400 dark:border-amber-500/60 ring-1 ring-amber-400/30"
                    : isRewarded
                    ? "border-emerald-400 dark:border-emerald-500/50"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b dark:border-gray-700/60">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">
                      {isRewarded ? "🎁" : isPending ? "🚩" : "✓"}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-gray-900 dark:text-white">
                          {report.characterName || "Student"}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          ({report.userEmail || report.userId.slice(0, 8)})
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400">{formattedDate}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-black uppercase px-2.5 py-1 rounded-full border ${
                        isPending
                          ? "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                          : isRewarded
                          ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600"
                      }`}
                    >
                      {report.status}
                      {report.rewardGold ? ` (+${report.rewardGold}G)` : ""}
                    </span>

                    <button
                      onClick={() => handleDeleteReport(report.id, (report as any)._collectionName || "reports")}
                      className="text-gray-400 hover:text-red-500 text-sm px-2 py-1"
                      title="Delete Report"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Question and problem context */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-3 text-xs">
                  {/* Left: What was reported */}
                  <div className="space-y-2">
                    <div className="font-bold uppercase tracking-wider text-[10px] text-amber-600 dark:text-amber-400">
                      Issue Type: {report.issueType || "Question Feedback"}
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900/60 p-3 rounded-xl border dark:border-gray-700 text-gray-800 dark:text-gray-200 leading-relaxed font-sans">
                      <p className="font-semibold text-gray-900 dark:text-white mb-1">Student&apos;s Description:</p>
                      &ldquo;{report.problemDescription}&rdquo;
                    </div>

                    {report.gmNotes && (
                      <div className="bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 text-[11px] text-emerald-800 dark:text-emerald-300">
                        <strong>GM Note:</strong> {report.gmNotes}
                      </div>
                    )}
                  </div>

                  {/* Right: Question reference */}
                  <div className="space-y-1.5 bg-gray-100/70 dark:bg-gray-900/40 p-3 rounded-xl border dark:border-gray-700/80">
                    <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 uppercase">
                      <span>Question Reference</span>
                      <span className="font-mono">{report.questionId}</span>
                    </div>

                    <div className="font-bold text-sm text-gray-900 dark:text-white truncate">
                      {report.questionTitle || "Untitled Question"}
                    </div>

                    {report.questionPrompt && (
                      <div className="text-gray-600 dark:text-gray-300 text-[11px] line-clamp-2">
                        {report.questionPrompt}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                      <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-mono font-bold">
                        Configured Correct: Option {String.fromCharCode(65 + (report.configuredCorrectIndex ?? 0))}
                      </span>
                      {report.selectedChoiceIndex !== undefined && report.selectedChoiceIndex !== null && (
                        <span className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded font-mono">
                          Player Pick: Option {String.fromCharCode(65 + report.selectedChoiceIndex)}
                        </span>
                      )}
                    </div>

                    {/* Quick link to question editor */}
                    {onSwitchToQuestions && report.questionId && (
                      <button
                        onClick={() => onSwitchToQuestions(report.questionId!)}
                        className="text-blue-600 dark:text-blue-400 text-[11px] font-bold hover:underline mt-1 block"
                      >
                        ✏️ Edit this Question in GM Questions tab →
                      </button>
                    )}
                  </div>
                </div>

                {/* Collapsible Solution / AI Derivation preview */}
                {report.aiSolutionText && (
                  <div className="mt-3 pt-2 border-t dark:border-gray-700/60">
                    <button
                      onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <span>{expandedId === report.id ? "▼" : "▶"}</span>
                      <span>
                        {expandedId === report.id ? "Hide" : "View"} Stored Solution / AI Derivation
                      </span>
                    </button>

                    {expandedId === report.id && (
                      <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-950 rounded-xl border dark:border-gray-800 text-xs">
                        <MathMarkdown content={report.aiSolutionText} />
                      </div>
                    )}
                  </div>
                )}

                {/* Bottom Action Bar */}
                <div className="mt-4 pt-3 border-t dark:border-gray-700 flex flex-wrap justify-between items-center gap-2">
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">
                    {isRewarded
                      ? `✓ Rewarded with ${report.rewardGold} Gold (delivered to backpack)`
                      : "Review answer accuracy or award a Gold Bounty pouch."}
                  </div>

                  <div className="flex gap-2">
                    {isPending && (
                      <>
                        <button
                          onClick={() => {
                            setRewardReport(report);
                            setRewardGold(100);
                            setRewardReason(
                              `Bug Bounty: Thank you for identifying an issue in ${report.questionTitle || "our questions"}!`
                            );
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-xs rounded-xl shadow transition-transform hover:scale-105 active:scale-95 flex items-center gap-1.5"
                        >
                          <span>💰</span>
                          <span>Compensate with Gold Pouch</span>
                        </button>

                        <button
                          onClick={() => handleUpdateStatus(report.id, "resolved", (report as any)._collectionName || "reports")}
                          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs font-bold rounded-xl transition-colors"
                        >
                          Mark Resolved
                        </button>

                        <button
                          onClick={() => handleUpdateStatus(report.id, "dismissed", (report as any)._collectionName || "reports")}
                          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-500 dark:text-gray-400 text-xs font-semibold rounded-xl transition-colors"
                        >
                          Dismiss
                        </button>
                      </>
                    )}

                    {!isPending && (
                      <button
                        onClick={() => handleUpdateStatus(report.id, "pending", (report as any)._collectionName || "reports")}
                        className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-semibold"
                      >
                        Reopen Report
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* REWARD / COMPENSATION MODAL */}
      {rewardReport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 border-2 border-amber-500 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 text-gray-900 dark:text-white animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎁</span>
              <div>
                <h3 className="font-black text-lg text-amber-500">Send Gold Bounty to Player</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Deliver a consumable reward pouch directly into {rewardReport.characterName}&apos;s backpack.
                </p>
              </div>
            </div>

            <div className="space-y-3 bg-gray-50 dark:bg-gray-800/60 p-3.5 rounded-xl border dark:border-gray-700 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Recipient:</span>
                <span className="font-bold">{rewardReport.characterName} ({rewardReport.userEmail})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Related Question:</span>
                <span className="font-bold truncate max-w-[200px]">{rewardReport.questionTitle}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-gray-600 dark:text-gray-300 mb-1">
                Gold Amount (Delivered via Pouch):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={rewardGold}
                  onChange={(e) => setRewardGold(Math.max(1, parseInt(e.target.value) || 0))}
                  className="flex-1 p-2.5 rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-950 font-mono font-bold text-base focus:ring-2 focus:ring-amber-400 outline-none"
                />
                <span className="font-black text-yellow-500 text-sm">GOLD</span>
              </div>

              {/* Quick presets */}
              <div className="flex gap-2 mt-2">
                {[50, 100, 200, 500].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRewardGold(preset)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition-colors ${
                      rewardGold === preset
                        ? "bg-amber-400 text-black border-amber-500"
                        : "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                    }`}
                  >
                    +{preset} G
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-gray-600 dark:text-gray-300 mb-1">
                Note / Description on Pouch:
              </label>
              <textarea
                value={rewardReason}
                onChange={(e) => setRewardReason(e.target.value)}
                rows={2}
                className="w-full p-2.5 rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-950 text-xs focus:ring-2 focus:ring-amber-400 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t dark:border-gray-800">
              <button
                type="button"
                onClick={() => setRewardReport(null)}
                disabled={isRewarding}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendReward}
                disabled={isRewarding}
                className="px-5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black shadow-lg shadow-amber-500/20 transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
              >
                {isRewarding ? "Delivering..." : `Dispatch ${rewardGold}G Pouch`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Firebase Rules Snippet Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl text-gray-900 dark:text-white">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>🛡️</span> Firebase Console Security Rules
              </h3>
              <button
                onClick={() => setShowRulesModal(false)}
                className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              To allow marking reports as resolved/dismissed across all devices, paste this snippet into your{" "}
              <a
                href="https://console.firebase.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-500 underline font-bold"
              >
                Firebase Console ↗
              </a>{" "}
              under <strong>Firestore Database → Rules</strong> tab:
            </p>
            <div className="relative">
              <pre className="p-3 bg-gray-950 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-60 border border-gray-800 leading-relaxed">
{`// 1. In isGM() helper, allow both GM emails:
function isGM() {
  return signedIn() && (
    request.auth.token.email == "oliveru1996@gmail.com" ||
    request.auth.token.email == "oliverozcariz@britanico-aragon.edu"
  );
}

// 2. Add reports collection rules:
match /reports/{reportId} {
  allow create: if signedIn();
  allow read: if isGM() || (signedIn() && (resource.data.userId == request.auth.uid || resource.data.ownerUid == request.auth.uid));
  allow update, delete: if isGM();
}

// 3. Update submissions collection rule:
match /submissions/{submissionId} {
  allow create: if signedIn() && request.resource.data.ownerUid == request.auth.uid;
  allow read: if (signedIn() && resource.data.ownerUid == request.auth.uid) || isGM();
  allow update, delete: if isGM();
}`}
              </pre>
              <button
                onClick={() => {
                  const rulesText = `function isGM() {\n  return signedIn() && (\n    request.auth.token.email == "oliveru1996@gmail.com" ||\n    request.auth.token.email == "oliverozcariz@britanico-aragon.edu"\n  );\n}\n\nmatch /reports/{reportId} {\n  allow create: if signedIn();\n  allow read: if isGM() || (signedIn() && (resource.data.userId == request.auth.uid || resource.data.ownerUid == request.auth.uid));\n  allow update, delete: if isGM();\n}\n\nmatch /submissions/{submissionId} {\n  allow create: if signedIn() && request.resource.data.ownerUid == request.auth.uid;\n  allow read: if (signedIn() && resource.data.ownerUid == request.auth.uid) || isGM();\n  allow update, delete: if isGM();\n}`;
                  navigator.clipboard.writeText(rulesText);
                  setCopiedRules(true);
                  setTimeout(() => setCopiedRules(false), 2000);
                }}
                className="absolute top-2 right-2 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-[10px] font-bold border border-gray-700 transition-colors"
              >
                {copiedRules ? "✓ Copied!" : "Copy Rules"}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowRulesModal(false)}
                className="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 rounded-xl text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
