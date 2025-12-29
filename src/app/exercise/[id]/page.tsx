"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { QuestionPrompt } from "@/components/QuestionPrompt";
import { ChoiceLabel } from "@/components/ChoiceLabel";
import {
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
  increment,
  updateDoc,
  getDocs,
  query,
  where,
  limit,
} from "firebase/firestore";

type Question = {
  title: string;
  promptType?: "text" | "latex" | "image";
  promptText?: string;
  promptLatex?: string;
  promptImageUrl?: string;
  choices: string[];
  choiceType?: "text" | "latex";
  correctIndex: number;
  rewardXp: number;
  rewardGold: number;
};


export default function ExercisePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [user, setUser] = useState<User | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setMsg("");
      setSelected(null);

      if (!u) {
        setQuestion(null);
        setLoading(false);
        return;
      }

      if (!id || typeof id !== "string") return;

      setLoading(true);
      const ref = doc(db, "questions", id); // ✅ changed
      const snap = await getDoc(ref);
      setQuestion(snap.exists() ? (snap.data() as Question) : null);
      setLoading(false);
    });

    return () => unsub();
  }, [id]);

  async function submitAnswer() {
    if (!user || !question || selected === null) return;
    setSubmitting(true);
    setMsg("");

    try {
      const isCorrect = selected === question.correctIndex;

      // ✅ Stop repeat rewards: check submissions for an earlier correct
      const alreadyCorrectQ = query(
        collection(db, "submissions"),
        where("ownerUid", "==", user.uid),
        where("questionId", "==", id),
        where("isCorrect", "==", true),
        limit(1)
      );
      const alreadyCorrectSnap = await getDocs(alreadyCorrectQ);
      const alreadyCorrect = !alreadyCorrectSnap.empty;

      // ✅ 1) create submission record in submissions
      await addDoc(collection(db, "submissions"), {
        ownerUid: user.uid,
        questionId: id,
        selectedIndex: selected,
        isCorrect,
        createdAt: serverTimestamp(),
      });

      // ✅ 2) reward if correct (only once)
      if (isCorrect) {
        if (alreadyCorrect) {
          setMsg("✅ Correct — but you already earned the reward for this question.");
        } else {
          const charRef = doc(db, "characters", user.uid);
          await updateDoc(charRef, {
            xp: increment(question.rewardXp ?? 0),
            gold: increment(question.rewardGold ?? 0),
            updatedAt: serverTimestamp(),
          });
          setMsg(`✅ Correct! +${question.rewardXp} XP, +${question.rewardGold} gold`);
        }
      } else {
        setMsg("❌ Not quite. Try another question!");
      }
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? "Could not submit"}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="p-8">
        <p>Loading...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">Question</h1>
        <p className="mt-2 opacity-70">Please sign in.</p>
        <a className="underline" href="/login">
          Go to login
        </a>
      </main>
    );
  }

  if (!question) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">Question not found</h1>
        <p className="mt-2 opacity-70">No question exists with id: {String(id)}</p>
        <a className="underline" href="/exercises">
          Back to list
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 flex items-start justify-center">
      <div className="w-full max-w-2xl space-y-4">
        <header className="rounded-2xl border p-5 shadow-sm flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{question.title}</h1>
            <p className="text-sm opacity-70">
              Reward: {question.rewardXp} XP · {question.rewardGold} gold
            </p>
          </div>
          <div className="flex gap-2">
            <a className="rounded-xl border px-3 py-2 text-sm" href="/exercises">
              List
            </a>
            <a className="rounded-xl border px-3 py-2 text-sm" href="/character">
              Character
            </a>
          </div>
        </header>

        <section className="rounded-2xl border p-5 shadow-sm">
          <div className="text-lg font-medium">
            <QuestionPrompt q={question} />
          </div>

          <div className="mt-4 grid gap-2">
            {question.choices.map((_, idx) => (
            <label key={idx} className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer">
              <input
                type="radio"
                name="choice"
                checked={selected === idx}
                onChange={() => setSelected(idx)}
              />
              <ChoiceLabel question={question} index={idx} />
            </label>
          ))}
          </div>

          <button
            className="mt-4 w-full rounded-xl bg-black text-white py-2 font-medium disabled:opacity-50"
            disabled={selected === null || submitting}
            onClick={submitAnswer}
          >
            {submitting ? "Submitting..." : "Submit answer"}
          </button>

          {msg ? <p className="mt-3 text-sm">{msg}</p> : null}
        </section>
      </div>
    </main>
  );
}