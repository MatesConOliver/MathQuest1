"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
} from "firebase/firestore";

const GM_EMAIL = "oliveru1996@gmail.com"; // 👈 change to your GM email

// ---------- Types ----------

type QuestionDoc = {
  title?: string;
  promptType?: "text" | "latex" | "image";
  promptText?: string;
  promptLatex?: string;
  promptImageUrl?: string;
  choices: string[];
  choiceType?: "text" | "latex";
  correctIndex: number;
  rewardXp: number;
  rewardGold: number;
  difficulty?: number;
  tags: string[];
  order?: number;
};

type FoeDoc = {
  name: string;
  maxHp: number;
  attackDamage: number;
};

type EncounterDoc = {
  title: string;
  foeId: string;
  questionTag: string;
  damagePerCorrect: number;
  winRewardXp: number;
  winRewardGold: number;
  timeLimitSeconds?: number;
};

function cleanUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

// ---------- GM Questions Panel ----------

function GMQuestionsPanel() {
  const [list, setList] = useState<{ id: string; title?: string; tags?: string[] }[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [editingId, setEditingId] = useState("");
  const [title, setTitle] = useState("");
  const [promptType, setPromptType] = useState<"text" | "latex" | "image">("text");
  const [promptText, setPromptText] = useState("");
  const [promptLatex, setPromptLatex] = useState("");
  const [promptImageUrl, setPromptImageUrl] = useState("");
  const [choicesText, setChoicesText] = useState("1,2,3,4");
  const [choiceType, setChoiceType] = useState<"text" | "latex">("text");
  const [correctIndex, setCorrectIndex] = useState("0");
  const [rewardXp, setRewardXp] = useState("5");
  const [rewardGold, setRewardGold] = useState("1");
  const [difficulty, setDifficulty] = useState("1");
  const [tagsText, setTagsText] = useState("level1");
  const [order, setOrder] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Load some questions for convenience
  useEffect(() => {
    async function loadList() {
      setLoadingList(true);
      try {
        const q = query(collection(db, "questions"), limit(20));
        const snap = await getDocs(q);
        const items = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title,
            tags: data.tags,
          };
        });
        setList(items);
      } catch (e: any) {
        console.error(e);
      } finally {
        setLoadingList(false);
      }
    }
    loadList();
  }, []);

  function newQuestion() {
    setEditingId("");
    setTitle("");
    setPromptType("text");
    setPromptText("");
    setPromptLatex("");
    setPromptImageUrl("");
    setChoicesText("1,2,3,4");
    setChoiceType("text");
    setCorrectIndex("0");
    setRewardXp("5");
    setRewardGold("1");
    setDifficulty("1");
    setTagsText("level1");
    setOrder("");
    setMsg("");
  }

  async function loadQuestion(id: string) {
    setMsg("");
    setEditingId(id);
    try {
      const ref = doc(db, "questions", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setMsg(`No question found with id "${id}". You can create it.`);
        return;
      }
      const data = snap.data() as QuestionDoc;
      setTitle(data.title ?? "");
      setPromptType(data.promptType ?? "text");
      setPromptText(data.promptText ?? "");
      setPromptLatex(data.promptLatex ?? "");
      setPromptImageUrl(data.promptImageUrl ?? "");
      setChoicesText((data.choices ?? []).join(","));
      setChoiceType(data.choiceType ?? "text");
      setCorrectIndex(String(data.correctIndex ?? 0));
      setRewardXp(String(data.rewardXp ?? 0));
      setRewardGold(String(data.rewardGold ?? 0));
      setDifficulty(data.difficulty != null ? String(data.difficulty) : "");
      setTagsText((data.tags ?? []).join(","));
      setOrder(data.order != null ? String(data.order) : "");
    } catch (e: any) {
      setMsg(`Error loading question: ${e?.message ?? e}`);
    }
  }

  async function saveQuestion() {
    if (!editingId) {
      setMsg("Please enter a Question ID (for example: q1, q2...).");
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const choicesArray = choicesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const tagsArray = tagsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const docData: QuestionDoc = {
        title: title || "Untitled question",
        promptType,
        promptText: promptType === "text" ? promptText || undefined : undefined,
        promptLatex: promptType === "latex" ? promptLatex || undefined : undefined,
        promptImageUrl: promptType === "image" ? promptImageUrl || undefined : undefined,
        choices: choicesArray.length > 0 ? choicesArray : ["A", "B", "C", "D"],
        choiceType,
        correctIndex: Number(correctIndex) || 0,
        rewardXp: Number(rewardXp) || 0,
        rewardGold: Number(rewardGold) || 0,
        difficulty: difficulty ? Number(difficulty) : undefined,
        tags: tagsArray.length > 0 ? tagsArray : ["level1"],
        order: order ? parseInt(order) : undefined,
      };

      await setDoc(doc(db, "questions", editingId), cleanUndefined(docData), { merge: true });
      setMsg("✅ Question saved!");

      // refresh list (simple way)
      const q = query(collection(db, "questions"), limit(20));
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title,
          tags: data.tags,
        };
      });
      setList(items);
    } catch (e: any) {
      setMsg(`❌ Error saving question: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border p-4 shadow-sm space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Questions</h2>
        <button
          className="text-sm rounded-xl border px-3 py-1"
          type="button"
          onClick={newQuestion}
        >
          New question
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-[1.5fr,2fr]">
        {/* Left: list + choose ID */}
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Question ID</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="e.g. q1, q2..."
              value={editingId}
              onChange={(e) => setEditingId(e.target.value)}
            />
            <button
              className="mt-2 text-sm rounded-xl border px-3 py-1"
              type="button"
              onClick={() => editingId && loadQuestion(editingId)}
            >
              Load by ID
            </button>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">First questions (up to 20)</div>
            {loadingList ? (
              <p className="text-sm opacity-70">Loading list...</p>
            ) : list.length === 0 ? (
              <p className="text-sm opacity-70">No questions yet.</p>
            ) : (
              <ul className="space-y-1 max-h-64 overflow-auto text-sm">
                {list.map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg border px-2 py-1 hover:bg-gray-50"
                      onClick={() => loadQuestion(q.id)}
                    >
                      <span className="font-mono text-xs">{q.id}</span>{" "}
                      <span className="font-medium">{q.title ?? "(no title)"}</span>{" "}
                      <span className="opacity-60">
                        {(q.tags ?? []).join(", ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: form */}
        <div className="space-y-3 text-sm">
          <div>
            <label className="font-medium">Title (for lists)</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Additions 1"
            />
          </div>

          <div>
            <label className="font-medium">Prompt type</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={promptType}
              onChange={(e) => setPromptType(e.target.value as any)}
            >
              <option value="text">Text</option>
              <option value="latex">LaTeX</option>
              <option value="image">Image URL</option>
            </select>
          </div>

          {promptType === "text" && (
            <div>
              <label className="font-medium">Prompt text</label>
              <textarea
                className="mt-1 w-full rounded-xl border px-3 py-2"
                rows={3}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
            </div>
          )}

          {promptType === "latex" && (
            <div>
              <label className="font-medium">Prompt LaTeX</label>
              <textarea
                className="mt-1 w-full rounded-xl border px-3 py-2 font-mono text-xs"
                rows={3}
                placeholder="e.g. \int_0^1 x^2\,dx"
                value={promptLatex}
                onChange={(e) => setPromptLatex(e.target.value)}
              />
            </div>
          )}

          {promptType === "image" && (
            <div>
              <label className="font-medium">Prompt image URL</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
                placeholder="https://..."
                value={promptImageUrl}
                onChange={(e) => setPromptImageUrl(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="font-medium">Choices (comma-separated)</label>
            <textarea
              className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
              rows={2}
              value={choicesText}
              onChange={(e) => setChoicesText(e.target.value)}
            />
            <div className="mt-1 flex items-center gap-2">
              <span>Choice type:</span>
              <select
                className="rounded-xl border px-2 py-1"
                value={choiceType}
                onChange={(e) => setChoiceType(e.target.value as any)}
              >
                <option value="text">Text</option>
                <option value="latex">LaTeX</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium">Correct index (0-based)</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                type="number"
                value={correctIndex}
                onChange={(e) => setCorrectIndex(e.target.value)}
              />
            </div>
            <div>
              <label className="font-medium">Difficulty</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                type="number"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium">Reward XP</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                type="number"
                value={rewardXp}
                onChange={(e) => setRewardXp(e.target.value)}
              />
            </div>
            <div>
              <label className="font-medium">Reward gold</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                type="number"
                value={rewardGold}
                onChange={(e) => setRewardGold(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium">Tags (comma-separated)</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="e.g. level1, addition"
              />
            </div>
            <div>
              <label className="font-medium">Order (Optional)</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                type="number"
                placeholder="e.g. 1, 2, 3..."
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </div>
          </div>

          <button
            className="mt-2 w-full rounded-xl bg-black text-white py-2 font-medium disabled:opacity-50"
            disabled={saving}
            type="button"
            onClick={saveQuestion}
          >
            {saving ? "Saving..." : "Save question"}
          </button>

          {msg && <p className="mt-2 text-sm">{msg}</p>}
        </div>
      </div>
    </section>
  );
}

// ---------- GM Foes Panel ----------

function GMFoesPanel() {
  const [foeId, setFoeId] = useState("");
  const [name, setName] = useState("");
  const [maxHp, setMaxHp] = useState("10");
  const [attackDamage, setAttackDamage] = useState("3");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadFoe() {
    if (!foeId) return;
    setMsg("");
    try {
      const ref = doc(db, "foes", foeId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setMsg(`No foe with id "${foeId}". You can create it.`);
        return;
      }
      const data = snap.data() as FoeDoc;
      setName(data.name);
      setMaxHp(String(data.maxHp ?? 10));
      setAttackDamage(String(data.attackDamage ?? 1));
    } catch (e: any) {
      setMsg(`Error loading foe: ${e?.message ?? e}`);
    }
  }

  async function saveFoe() {
    if (!foeId) {
      setMsg("Please enter a foe ID (e.g. goblin).");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const data: FoeDoc = {
        name: name || foeId,
        maxHp: Number(maxHp) || 10,
        attackDamage: Number(attackDamage) || 1,
      };
      await setDoc(doc(db, "foes", foeId), data, { merge: true });
      setMsg("✅ Foe saved!");
    } catch (e: any) {
      setMsg(`❌ Error saving foe: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border p-4 shadow-sm space-y-3">
      <h2 className="text-lg font-semibold">Foes</h2>

      <div className="grid gap-3 md:grid-cols-2 text-sm">
        <div>
          <label className="font-medium">Foe ID</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2"
            placeholder="e.g. goblin"
            value={foeId}
            onChange={(e) => setFoeId(e.target.value)}
          />
          <button
            className="mt-2 text-sm rounded-xl border px-3 py-1"
            type="button"
            onClick={loadFoe}
          >
            Load foe
          </button>
        </div>

        <div className="space-y-2">
          <div>
            <label className="font-medium">Name</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Goblin"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-medium">Max HP</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                type="number"
                value={maxHp}
                onChange={(e) => setMaxHp(e.target.value)}
              />
            </div>
            <div>
              <label className="font-medium">Attack damage</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                type="number"
                value={attackDamage}
                onChange={(e) => setAttackDamage(e.target.value)}
              />
            </div>
          </div>
          <button
            className="mt-2 w-full rounded-xl bg-black text-white py-2 font-medium disabled:opacity-50"
            disabled={saving}
            type="button"
            onClick={saveFoe}
          >
            {saving ? "Saving..." : "Save foe"}
          </button>
        </div>
      </div>

      {msg && <p className="text-sm">{msg}</p>}
    </section>
  );
}

// ---------- GM Encounters Panel ----------

function GMEncountersPanel() {
  const [encounterId, setEncounterId] = useState("");
  const [title, setTitle] = useState("");
  const [foeId, setFoeId] = useState("");
  const [questionTag, setQuestionTag] = useState("");
  const [damagePerCorrect, setDamagePerCorrect] = useState("3");
  const [winRewardXp, setWinRewardXp] = useState("20");
  const [winRewardGold, setWinRewardGold] = useState("5");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState("15");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadEncounter() {
    if (!encounterId) return;
    setMsg("");
    try {
      const ref = doc(db, "encounters", encounterId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setMsg(`No encounter with id "${encounterId}". You can create it.`);
        return;
      }
      const data = snap.data() as EncounterDoc;
      setTitle(data.title);
      setFoeId(data.foeId);
      setQuestionTag(data.questionTag);
      setDamagePerCorrect(String(data.damagePerCorrect ?? 1));
      setWinRewardXp(String(data.winRewardXp ?? 0));
      setWinRewardGold(String(data.winRewardGold ?? 0));
      setTimeLimitSeconds(
        data.timeLimitSeconds != null ? String(data.timeLimitSeconds) : ""
      );
    } catch (e: any) {
      setMsg(`Error loading encounter: ${e?.message ?? e}`);
    }
  }

  async function saveEncounter() {
    if (!encounterId) {
      setMsg("Please enter an encounter ID (e.g. enc1).");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const data: EncounterDoc = {
        title: title || encounterId,
        foeId,
        questionTag,
        damagePerCorrect: Number(damagePerCorrect) || 1,
        winRewardXp: Number(winRewardXp) || 0,
        winRewardGold: Number(winRewardGold) || 0,
        timeLimitSeconds: timeLimitSeconds
          ? Number(timeLimitSeconds)
          : undefined,
      };
      await setDoc(doc(db, "encounters", encounterId), data, { merge: true });
      setMsg("✅ Encounter saved!");
    } catch (e: any) {
      setMsg(`❌ Error saving encounter: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border p-4 shadow-sm space-y-3">
      <h2 className="text-lg font-semibold">Encounters</h2>

      <div className="grid gap-3 md:grid-cols-2 text-sm">
        <div>
          <label className="font-medium">Encounter ID</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2"
            placeholder="e.g. enc1"
            value={encounterId}
            onChange={(e) => setEncounterId(e.target.value)}
          />
          <button
            className="mt-2 text-sm rounded-xl border px-3 py-1"
            type="button"
            onClick={loadEncounter}
          >
            Load encounter
          </button>
        </div>

        <div className="space-y-2">
          <div>
            <label className="font-medium">Title</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Goblin in the Woods"
            />
          </div>
          <div>
            <label className="font-medium">Foe ID</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={foeId}
              onChange={(e) => setFoeId(e.target.value)}
              placeholder="goblin"
            />
          </div>
          <div>
            <label className="font-medium">Question tag</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={questionTag}
              onChange={(e) => setQuestionTag(e.target.value)}
              placeholder="level1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-medium">Damage per correct</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                type="number"
                value={damagePerCorrect}
                onChange={(e) => setDamagePerCorrect(e.target.value)}
              />
            </div>
            <div>
              <label className="font-medium">Time limit (seconds, empty = none)</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                type="number"
                value={timeLimitSeconds}
                onChange={(e) => setTimeLimitSeconds(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-medium">Win reward XP</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                type="number"
                value={winRewardXp}
                onChange={(e) => setWinRewardXp(e.target.value)}
              />
            </div>
            <div>
              <label className="font-medium">Win reward gold</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                type="number"
                value={winRewardGold}
                onChange={(e) => setWinRewardGold(e.target.value)}
              />
            </div>
          </div>
          <button
            className="mt-2 w-full rounded-xl bg-black text-white py-2 font-medium disabled:opacity-50"
            disabled={saving}
            type="button"
            onClick={saveEncounter}
          >
            {saving ? "Saving..." : "Save encounter"}
          </button>
        </div>
      </div>

      {msg && <p className="text-sm">{msg}</p>}
    </section>
  );
}

// ---------- Main GM Page ----------

export default function GMPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingUser(false);
    });
    return () => unsub();
  }, []);

  if (loadingUser) {
    return (
      <main className="p-8">
        <p>Loading...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">GM Area</h1>
        <p className="mt-2 opacity-70">Please sign in as GM.</p>
        <a className="underline" href="/login">
          Go to login
        </a>
      </main>
    );
  }

  if (user.email !== GM_EMAIL) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">GM Area</h1>
        <p className="mt-2 opacity-70">
          You are signed in as <span className="font-mono">{user.email}</span>, but this is
          not the GM account.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GM Tools</h1>
          <p className="text-sm opacity-70">
            Create and edit questions, foes, and encounters without opening Firebase.
          </p>
        </div>
        <div className="text-xs rounded-xl border px-3 py-2">
          <div className="opacity-70">Signed in as GM</div>
          <div className="font-mono">{user.email}</div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <GMQuestionsPanel />
        <div className="space-y-6">
          <GMFoesPanel />
          <GMEncountersPanel />
        </div>
      </div>
    </main>
  );
}