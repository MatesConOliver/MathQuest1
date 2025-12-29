"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

type Exercise = {
  title: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  rewardXp: number;
  rewardGold: number;
};

export default function ExercisesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Array<{ id: string; data: Exercise }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const q = query(collection(db, "questions"), orderBy("title"));
      const snap = await getDocs(q);
      setItems(snap.docs.map((d) => ({ id: d.id, data: d.data() as Exercise })));
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (!user) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">Exercises</h1>
        <p className="mt-2 opacity-70">Please sign in first.</p>
        <a className="underline" href="/login">Go to login</a>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 flex items-start justify-center">
      <div className="w-full max-w-2xl space-y-4">
        <header className="rounded-2xl border p-5 shadow-sm flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Exercises</h1>
            <p className="text-sm opacity-70">Complete exercises to earn XP and gold.</p>
          </div>
          <a className="rounded-xl border px-3 py-2 text-sm" href="/character">Character</a>
        </header>

        {loading ? (
          <p className="opacity-70">Loading...</p>
        ) : items.length === 0 ? (
          <p className="opacity-70">No exercises yet. Add some in Firestore: collection “exercises”.</p>
        ) : (
          <div className="grid gap-3">
            {items.map(({ id, data }) => (
              <a key={id} href={`/exercise/${id}`} className="rounded-2xl border p-4 shadow-sm hover:shadow">
                <div className="font-semibold">{data.title}</div>
                <div className="mt-1 text-sm opacity-70 line-clamp-2">{data.prompt}</div>
                <div className="mt-2 text-xs opacity-70">
                  Reward: {data.rewardXp} XP · {data.rewardGold} gold
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}