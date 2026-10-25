"use client";

import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { DEFAULT_LOADING_TIPS } from "@/components/LoadingScreen";

const SETTINGS_REF = doc(db, "settings", "loadingTips");
const LOCATIONS_FALLBACK_REF = doc(db, "locations", "loading_screen_settings");

export function LoadingTipsPanel() {
  const [tips, setTips] = useState<string[]>([]);
  const [newTip, setNewTip] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const currentUserEmail = auth.currentUser?.email || "";
  const isGM = currentUserEmail.toLowerCase() === "oliveru1996@gmail.com";

  useEffect(() => {
    async function loadTips() {
      setLoading(true);
      try {
        let snap = await getDoc(SETTINGS_REF).catch(() => null);
        if (!snap || !snap.exists()) {
          snap = await getDoc(LOCATIONS_FALLBACK_REF).catch(() => null);
        }

        if (snap && snap.exists() && Array.isArray(snap.data()?.tips)) {
          setTips(snap.data()!.tips);
        } else {
          setTips(DEFAULT_LOADING_TIPS);
        }
      } catch (err: any) {
        setMsg("Could not load tips from database: " + err.message);
        setTips(DEFAULT_LOADING_TIPS);
      } finally {
        setLoading(false);
      }
    }
    loadTips();
  }, []);

  const saveTipsToDb = async (updated: string[]) => {
    setSaving(true);
    setMsg("Saving to database...");

    const payload = {
      tips: updated,
      updatedAt: serverTimestamp(),
    };

    let saved = false;
    let lastError = "";

    // 1. Try locations collection first (existing production Firestore rules already allow locations for GM)
    try {
      await setDoc(LOCATIONS_FALLBACK_REF, payload, { merge: true });
      saved = true;
    } catch (err: any) {
      lastError = err.message;
    }

    // 2. Also save to settings collection (if rules permit it)
    try {
      await setDoc(SETTINGS_REF, payload, { merge: true });
      saved = true;
    } catch (err: any) {
      if (!saved) lastError = err.message;
    }

    if (saved) {
      setTips(updated);
      setMsg("✅ Loading screen sentences saved successfully!");
      setTimeout(() => setMsg(""), 3500);
    } else {
      setMsg(`❌ Error saving: ${lastError}. Make sure you are signed in as oliveru1996@gmail.com.`);
    }

    setSaving(false);
  };

  const handleAddTip = () => {
    const trimmed = newTip.trim();
    if (!trimmed) return;
    const updated = [...tips, trimmed];
    setNewTip("");
    saveTipsToDb(updated);
  };

  const handleDeleteTip = (index: number) => {
    if (!confirm("Remove this sentence from loading screens?")) return;
    const updated = tips.filter((_, i) => i !== index);
    saveTipsToDb(updated);
  };

  const handleSaveEdit = (index: number) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    const updated = [...tips];
    updated[index] = trimmed;
    setEditingIdx(null);
    saveTipsToDb(updated);
  };

  const handleResetDefaults = () => {
    if (!confirm("Reset to default 10 MathQuest adventure sentences?")) return;
    saveTipsToDb(DEFAULT_LOADING_TIPS);
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading screen tips configuration...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b dark:border-gray-700 pb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>💭</span>
            <span>Loading Screen Sentences & Tips</span>
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            The game picks one of these sentences at random whenever a student enters a battle or loads a new world site.
          </p>
          <div className="mt-2 text-[11px] flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400">Signed in as:</span>
            <span className="font-mono font-bold text-gray-800 dark:text-gray-200">
              {currentUserEmail || "Not signed in"}
            </span>
            {isGM ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-[10px]">
                GM Verified
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-bold text-[10px]">
                ⚠️ Only oliveru1996@gmail.com has GM permissions
              </span>
            )}
          </div>
        </div>

        <button
          onClick={handleResetDefaults}
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors shrink-0"
        >
          🔄 Restore Defaults
        </button>
      </div>

      {msg && (
        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 rounded-xl text-xs font-bold text-center animate-in fade-in">
          {msg}
        </div>
      )}

      {/* Add New Sentence */}
      <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border dark:border-gray-700 space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 block">
          ➕ Add New Loading Sentence:
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTip}
            onChange={(e) => setNewTip(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTip()}
            placeholder="e.g. Remember to check if the discriminant is positive before calculating roots..."
            className="input flex-1 text-sm dark:bg-gray-800 dark:text-white"
          />
          <button
            onClick={handleAddTip}
            disabled={saving || !newTip.trim()}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 shrink-0"
          >
            Add Sentence
          </button>
        </div>
      </div>

      {/* List of Sentences */}
      <div className="space-y-2.5">
        <div className="flex justify-between items-center text-xs font-bold text-gray-500 dark:text-gray-400 px-1">
          <span>Active Sentences ({tips.length})</span>
          <span>Random Rotation</span>
        </div>

        {tips.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400 border border-dashed rounded-xl">
            No sentences configured. The game will default to &ldquo;Loading your adventure...&rdquo;.
          </div>
        ) : (
          tips.map((item, idx) => (
            <div
              key={idx}
              className="p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl border dark:border-gray-700 flex items-center justify-between gap-3 group hover:border-indigo-400/50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono text-xs flex items-center justify-center font-bold shrink-0">
                  {idx + 1}
                </span>

                {editingIdx === idx ? (
                  <div className="flex gap-2 flex-1">
                    <input
                      type="text"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="input flex-1 text-xs dark:bg-gray-800 dark:text-white"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveEdit(idx)}
                      className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingIdx(null)}
                      className="px-2 py-1 bg-gray-600 text-white rounded text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm text-gray-800 dark:text-gray-200 truncate">
                    &ldquo;{item}&rdquo;
                  </p>
                )}
              </div>

              {editingIdx !== idx && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setEditingIdx(idx);
                      setEditingText(item);
                    }}
                    className="p-1.5 text-gray-400 hover:text-indigo-400 text-xs"
                    title="Edit sentence"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteTip(idx)}
                    className="p-1.5 text-gray-400 hover:text-red-400 text-xs font-bold"
                    title="Delete sentence"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
