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
} from "firebase/firestore";

import { FoeDoc } from "@/types/game";
import { Input } from "@/app/gm/components/Input";

export function FoesPanel() {
  const [foes, setFoes] = useState<FoeDoc[]>([]);
  const [msg, setMsg] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const visibleFoes = foes.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Form State
  const [foeId, setFoeId] = useState("");
  const [originalFoeId, setOriginalFoeId] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [emoji, setEmoji] = useState("👾");
  const [maxHp, setMaxHp] = useState<number | "">("");
  const [attack, setAttack] = useState<number | "">("");
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    loadFoes();
  }, []);

  async function loadFoes() {
    try {
      const snap = await getDocs(collection(db, "foes"));
      setFoes(snap.docs.map((d) => ({ ...(d.data() as FoeDoc), id: d.id })));
    } catch (e) {
      console.error(e);
    }
  }

  function resetForm() {
    setFoeId("");
    setOriginalFoeId("");
    setName("");
    setDesc("");
    setEmoji("👾");
    setMaxHp("");
    setAttack("");
    setImageUrl("");
    setMsg("");
  }

  function loadFoeToEdit(f: FoeDoc) {
    setFoeId(f.id || "");
    setOriginalFoeId(f.id || "");
    setName(f.name);
    setDesc(f.description || "");
    setEmoji(f.emoji || "👾");
    setMaxHp(f.maxHp || "");
    setAttack(f.attackDamage ?? "");
    setImageUrl(f.imageUrl || "");
    setMsg(`✏️ Editing: ${f.name}`);
  }

  async function saveFoe() {
    if (!name) {
      setMsg("❌ Name is required");
      return;
    }

    // Determine target ID: custom input, or slugified name, or auto doc ID
    const sanitizedInputId = foeId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const targetId = sanitizedInputId || name.toLowerCase().replace(/[^a-z0-9_-]/g, "-") || doc(collection(db, "foes")).id;

    setMsg("Saving...");

    const docData: Partial<FoeDoc> = {
      name,
      description: desc,
      emoji,
      maxHp: Number(maxHp) || 20,
      attackDamage: Number(attack) || 5,
      imageUrl,
    };

    try {
      await setDoc(doc(db, "foes", targetId), docData, { merge: true });

      // If ID changed during edit, clean up the old doc
      if (originalFoeId && originalFoeId !== targetId) {
        await deleteDoc(doc(db, "foes", originalFoeId));
      }

      setFoeId(targetId);
      setOriginalFoeId(targetId);
      setMsg(originalFoeId ? "✅ Updated Foe!" : "✅ Created New Foe!");
      loadFoes();
    } catch (e: any) {
      setMsg("Error: " + e.message);
    }
  }

  async function deleteFoe(idToDelete: string) {
    if (!confirm(`Delete foe '${idToDelete}'?`)) return;
    await deleteDoc(doc(db, "foes", idToDelete));
    resetForm();
    loadFoes();
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-xl border dark:border-gray-700 shadow-sm transition-colors">
      {/* FORM SIDE */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">{originalFoeId ? "✏️ Edit Foe" : "👾 New Foe"}</h2>
          {originalFoeId && (
            <button
              onClick={resetForm}
              className="text-xs text-blue-500 hover:text-blue-400 font-bold"
            >
              + Create New Foe
            </button>
          )}
        </div>

        {msg && (
          <div className="text-center bg-blue-50 dark:bg-blue-900/30 p-2 rounded text-blue-800 dark:text-blue-200 font-bold text-sm">
            {msg}
          </div>
        )}

        <div>
          <Input
            label="Foe ID (Editable)"
            value={foeId}
            onChange={(e: any) => setFoeId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
            placeholder="e.g. slime-king, dark-mage (auto-slugs if empty)"
          />
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            Unique identifier referenced by encounters and subarea spawns.
          </span>
        </div>

        <Input
          label="Name"
          value={name}
          onChange={(e: any) => setName(e.target.value)}
        />
        <Input
          label="Description"
          value={desc}
          onChange={(e: any) => setDesc(e.target.value)}
        />
        <Input
          label="Image URL"
          value={imageUrl}
          onChange={(e: any) => setImageUrl(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Emoji"
            value={emoji}
            onChange={(e: any) => setEmoji(e.target.value)}
          />
          <Input
            type="number"
            label="Max HP"
            value={maxHp}
            onChange={(e: any) => setMaxHp(Number(e.target.value))}
          />
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-900/50">
          <Input
            type="number"
            label="Attack Dmg"
            value={attack}
            onChange={(e: any) => setAttack(Number(e.target.value))}
            placeholder="5"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={saveFoe}
            className="btn-primary flex-1 bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 py-2 rounded-lg font-bold"
          >
            {originalFoeId ? "Update Foe" : "Create Foe"}
          </button>
          {originalFoeId && (
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 dark:text-white rounded font-bold hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* LIST SIDE */}
      <div className="space-y-4 border-l dark:border-gray-700 pl-4">
        <input
          className="input w-full text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          placeholder="🔍 Filter Foes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <h3 className="font-bold text-gray-500 dark:text-gray-400 text-xs uppercase">
          Existing Foes
        </h3>
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
          {visibleFoes.map((f) => (
            <div
              key={f.id}
              onClick={() => loadFoeToEdit(f)}
              className={`p-3 border rounded-xl flex justify-between items-center cursor-pointer transition-colors 
                      ${
                        originalFoeId === f.id
                          ? "border-purple-500 bg-purple-50 ring-2 ring-purple-500 dark:bg-purple-900/30 dark:border-purple-400"
                          : "dark:border-gray-600 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                      }`}
            >
              <div className="min-w-0 flex items-center gap-3">
                {f.imageUrl ? (
                  <img
                    src={f.imageUrl}
                    alt={f.name}
                    className="w-10 h-10 rounded-md object-cover"
                  />
                ) : (
                  <div className="text-2xl">{f.emoji || "👾"}</div>
                )}
                <div>
                  <div className="font-bold text-sm dark:text-gray-100 flex items-center gap-2">
                    <span>{f.name}</span>
                    <span className="font-mono text-[10px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-200 dark:border-purple-800">
                      {f.id}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    ❤️{f.maxHp} ⚔️{f.attackDamage ?? "?"}
                  </div>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (f.id) deleteFoe(f.id);
                }}
                className="text-red-400 hover:text-red-600 dark:hover:text-red-300 text-xs font-bold px-2 ml-2"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}