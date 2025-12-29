"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { QuestionPrompt } from "@/components/QuestionPrompt";
import { ChoiceLabel } from "@/components/ChoiceLabel";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

type Foe = {
  name: string;
  maxHp: number;
  attackDamage: number;
};

type Encounter = {
  title: string;
  foeId: string;
  questionTag: string; // one tag for now (e.g. "level1")
  damagePerCorrect: number;
  winRewardXp: number;
  winRewardGold: number;
  timeLimitSeconds?: number; // optional
};

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

type ActiveEncounter = {
  encounterId: string;
  foeId: string;
  foeHp: number;
  playerHp: number;
  currentQuestionId: string;
  usedQuestionIds: string[];
  status: "inProgress" | "won" | "lost";
  updatedAt?: any;
  questionShownAt?: any;
};

export default function EncounterPage() {
  const params = useParams<{ id: string }>();
  const encounterId = params?.id;

  const [user, setUser] = useState<User | null>(null);

  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [foe, setFoe] = useState<Foe | null>(null);
  const [playerMaxHp, setPlayerMaxHp] = useState<number>(15);

  const [state, setState] = useState<ActiveEncounter | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);

  const [selected, setSelected] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const stateRef = useMemo(() => (user ? doc(db, "activeEncounters", user.uid) : null), [user]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setMsg("");
      setSelected(null);

      if (!u || !encounterId || typeof encounterId !== "string") {
        setLoading(false);
        return;
      }

      setLoading(true);

      // Load encounter
      const encSnap = await getDoc(doc(db, "encounters", encounterId));
      if (!encSnap.exists()) {
        setEncounter(null);
        setFoe(null);
        setState(null);
        setQuestion(null);
        setLoading(false);
        return;
      }

      const enc = encSnap.data() as Encounter;
      setEncounter(enc);

      // Load foe
      const foeSnap = await getDoc(doc(db, "foes", enc.foeId));
      const foeData = foeSnap.exists() ? (foeSnap.data() as Foe) : null;
      setFoe(foeData);

      // Load character (for max HP)
      const charSnap = await getDoc(doc(db, "characters", u.uid));
      const charData = charSnap.exists() ? (charSnap.data() as any) : null;
      const maxHpFromChar = Number(charData?.maxHp ?? 15);
      setPlayerMaxHp(maxHpFromChar);

      // Load or start state
      const stRef = doc(db, "activeEncounters", u.uid);
      const stSnap = await getDoc(stRef);

      let st: ActiveEncounter | null = stSnap.exists() ? (stSnap.data() as ActiveEncounter) : null;

      const needsNew =
        !st ||
        st.encounterId !== encounterId ||
        st.status === "won" ||
        st.status === "lost";

      if (needsNew) {
        const firstQ = await pickRandomQuestionId(enc.questionTag, []);
        if (!firstQ) {
          setMsg("❌ No questions found for this encounter tag. Add questions with tags including: " + enc.questionTag);
          setLoading(false);
          return;
        }

        st = {
          encounterId,
          foeId: enc.foeId,
          foeHp: foeData?.maxHp ?? 10,
          playerHp: maxHpFromChar,
          currentQuestionId: firstQ,
          usedQuestionIds: [],
          status: "inProgress",
          updatedAt: serverTimestamp(),
          questionShownAt: serverTimestamp(),
        };

        await setDoc(stRef, st);
      }

      if (!st) {
        setMsg("❌ Could not start encounter state.");
        setLoading(false);
        return;
        }

      setState(st);

      // Load current question
      const qSnap = await getDoc(doc(db, "questions", st.currentQuestionId));
      setQuestion(qSnap.exists() ? (qSnap.data() as Question) : null);

      setLoading(false);
    });

    return () => unsub();
  }, [encounterId]);

  async function pickRandomQuestionId(tag: string, used: string[]) {
    const q = query(collection(db, "questions"), where("tags", "array-contains", tag));
    const snap = await getDocs(q);
    const all = snap.docs.map((d) => d.id);

    if (all.length === 0) return null;

    const unused = all.filter((id) => !used.includes(id));
    const pool = unused.length > 0 ? unused : all;

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    return chosen;
  }

  async function restartEncounter() {
    if (!user || !encounter || !foe) return;
    setMsg("");
    setSelected(null);

    const firstQ = await pickRandomQuestionId(encounter.questionTag, []);
    if (!firstQ) {
      setMsg("❌ No questions found for this encounter tag.");
      return;
    }

    const st: ActiveEncounter = {
      encounterId: encounterId as string,
      foeId: encounter.foeId,
      foeHp: foe.maxHp,
      playerHp: playerMaxHp,
      currentQuestionId: firstQ,
      usedQuestionIds: [],
      status: "inProgress",
      updatedAt: serverTimestamp(),
      questionShownAt: serverTimestamp(),
    };

    await setDoc(doc(db, "activeEncounters", user.uid), st);
    setState(st);

    const qSnap = await getDoc(doc(db, "questions", firstQ));
    setQuestion(qSnap.exists() ? (qSnap.data() as Question) : null);
  }

  async function handleTimeout() {
    if (submitting) return;
    if (!user || !encounter || !foe || !state) return;
    if (state.status !== "inProgress") return;

    try {
        // Record a "no answer" submission
        await addDoc(collection(db, "submissions"), {
        ownerUid: user.uid,
        questionId: state.currentQuestionId,
        encounterId: state.encounterId,
        selectedIndex: null,
        isCorrect: false,
        createdAt: serverTimestamp(),
        });

        let newFoeHp = state.foeHp;
        let newPlayerHp = Math.max(0, state.playerHp - (foe.attackDamage ?? 1));
        let newStatus: ActiveEncounter["status"] =
        newPlayerHp === 0 ? "lost" : "inProgress";

        const used = [...(state.usedQuestionIds ?? []), state.currentQuestionId];

        // Pick next question only if still fighting
        let nextQuestionId = state.currentQuestionId;
        if (newStatus === "inProgress") {
        const picked = await pickRandomQuestionId(encounter.questionTag, used);
        nextQuestionId = picked ?? state.currentQuestionId;
        }

        const updated: Partial<ActiveEncounter> = {
        foeHp: newFoeHp,
        playerHp: newPlayerHp,
        usedQuestionIds: used,
        currentQuestionId: nextQuestionId,
        status: newStatus,
        updatedAt: serverTimestamp(),
        questionShownAt: serverTimestamp(),
        };

        await updateDoc(doc(db, "activeEncounters", user.uid), updated);
        setState((s) => (s ? ({ ...s, ...updated } as ActiveEncounter) : s));

        if (newStatus === "lost") {
        setMsg("⏰ Time's up! The foe attacked and you were defeated.");
        return;
        }

        // Load next question if still going
        if (newStatus === "inProgress") {
        const qSnap = await getDoc(doc(db, "questions", nextQuestionId));
        setQuestion(qSnap.exists() ? (qSnap.data() as Question) : null);
        setSelected(null);
        setMsg("⏰ Time's up! The foe hit you.");
        }
    } catch (e: any) {
        setMsg(`❌ ${e?.message ?? "Timeout handling failed"}`);
    } 
  }

  async function submitAnswer() {
    if (!user || !encounter || !foe || !state || !question || selected === null) return;
    if (state.status !== "inProgress") return;

    setSubmitting(true);
    setMsg("");

    try {
      const isCorrect = selected === question.correctIndex;

      // Record submission (history)
      await addDoc(collection(db, "submissions"), {
        ownerUid: user.uid,
        questionId: state.currentQuestionId,
        encounterId: state.encounterId,
        selectedIndex: selected,
        isCorrect,
        createdAt: serverTimestamp(),
      });

      let newFoeHp = state.foeHp;
      let newPlayerHp = state.playerHp;
      let newStatus: ActiveEncounter["status"] = "inProgress";

      if (isCorrect) {
        newFoeHp = Math.max(0, state.foeHp - (encounter.damagePerCorrect ?? 1));
      } else {
        newPlayerHp = Math.max(0, state.playerHp - (foe.attackDamage ?? 1));
      }

      if (newFoeHp === 0) newStatus = "won";
      if (newPlayerHp === 0) newStatus = "lost";

      const used = [...(state.usedQuestionIds ?? []), state.currentQuestionId];

      // Pick next question only if still fighting
      let nextQuestionId = state.currentQuestionId;
      if (newStatus === "inProgress") {
        const picked = await pickRandomQuestionId(encounter.questionTag, used);
        nextQuestionId = picked ?? state.currentQuestionId;
      }

      const updated: Partial<ActiveEncounter> = {
        foeHp: newFoeHp,
        playerHp: newPlayerHp,
        usedQuestionIds: used,
        currentQuestionId: nextQuestionId,
        status: newStatus,
        updatedAt: serverTimestamp(),
        questionShownAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "activeEncounters", user.uid), updated);
      setState((s) => (s ? ({ ...s, ...updated } as ActiveEncounter) : s));

      if (newStatus === "won") {
        // Victory reward (once per win)
        await updateDoc(doc(db, "characters", user.uid), {
          xp: increment(encounter.winRewardXp ?? 0),
          gold: increment(encounter.winRewardGold ?? 0),
          updatedAt: serverTimestamp(),
        });
        setMsg(`🏆 You won! +${encounter.winRewardXp} XP, +${encounter.winRewardGold} gold`);
        return;
      }

      if (newStatus === "lost") {
        setMsg("💀 You were defeated. Try again!");
        return;
      }

      // Load next question
      const qSnap = await getDoc(doc(db, "questions", nextQuestionId));
      setQuestion(qSnap.exists() ? (qSnap.data() as Question) : null);

      setSelected(null);
      setMsg(isCorrect ? "✅ Hit! You dealt damage." : "❌ Miss! The foe hit you.");
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? "Could not submit"}`);
    } finally {
      setSubmitting(false);
    }
  }

    useEffect(() => {
        if (!encounter || !state) {
            setTimeLeft(null);
            return;
        }

        // If no time limit, no timer.
        if (!encounter.timeLimitSeconds || state.status !== "inProgress") {
            setTimeLeft(null);
            return;
        }

        // Start/restart timer for this question
        setTimeLeft(encounter.timeLimitSeconds);

        const interval = setInterval(() => {
            setTimeLeft((prev) => {
            if (prev === null) return prev;
            if (prev <= 1) {
                clearInterval(interval);
                // Time's up! Let the foe attack.
                handleTimeout();
                return 0;
            }
            return prev - 1;
            });
        }, 1000);

        return () => {
            clearInterval(interval);
        };
        // restart timer whenever question changes or status changes
    }, [encounter?.timeLimitSeconds, state?.currentQuestionId, state?.status, state?.usedQuestionIds?.length]);

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
        <h1 className="text-2xl font-bold">Encounter</h1>
        <p className="mt-2 opacity-70">Please sign in.</p>
        <a className="underline" href="/login">Go to login</a>
      </main>
    );
  }

  if (!encounter || !foe || !state) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">Encounter not found</h1>
        <p className="mt-2 opacity-70">Check your Firestore encounters/foes setup.</p>
        <a className="underline" href="/exercises">Back</a>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 flex items-start justify-center">
      <div className="w-full max-w-2xl space-y-4">
        <header className="rounded-2xl border p-5 shadow-sm flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{encounter.title}</h1>
            <p className="text-sm opacity-70">Tag pool: <span className="font-mono">{encounter.questionTag}</span></p>
          </div>
          <div className="flex gap-2">
            <a className="rounded-xl border px-3 py-2 text-sm" href="/character">Character</a>
            <a className="rounded-xl border px-3 py-2 text-sm" href="/exercises">Questions</a>
          </div>
        </header>

        <section className="rounded-2xl border p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">{foe.name}</div>
              <div className="text-sm opacity-70">Foe HP: <span className="font-mono">{state.foeHp}</span> / {foe.maxHp}</div>
              <div className="text-sm opacity-70">Your HP: <span className="font-mono">{state.playerHp}</span> / {playerMaxHp}</div>
            </div>

            <div className="text-right text-sm opacity-70">
              Status: <span className="font-mono">{state.status}</span>
            </div>
          </div>

          <div className="mt-4 text-sm opacity-70">
            Correct = deal <span className="font-mono">{encounter.damagePerCorrect}</span> dmg · Wrong = take <span className="font-mono">{foe.attackDamage}</span> dmg
          </div>

          {encounter.timeLimitSeconds ? (
            <div className="mt-1 text-sm opacity-70">
                Time limit:{" "}
                <span className="font-mono">
                {timeLeft !== null ? timeLeft : encounter.timeLimitSeconds}s
                </span>
            </div>
          ) : null}

          {state.status !== "inProgress" ? (
            <button
              className="mt-4 w-full rounded-xl bg-black text-white py-2 font-medium"
              onClick={restartEncounter}
            >
              Restart encounter
            </button>
          ) : (
            <>
              <div className="mt-6 rounded-xl border p-4">
                <div className="font-medium">Question</div>

                <div className="mt-2">
                    {question ? <QuestionPrompt q={question} /> : "Loading question..."}
                </div>

                <div className="mt-4 grid gap-2">
                    {(question?.choices ?? []).map((_, idx) => (
                    <label
                        key={idx}
                        className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer"
                    >
                        <input
                        type="radio"
                        name="choice"
                        checked={selected === idx}
                        onChange={() => setSelected(idx)}
                        />
                        {question && <ChoiceLabel question={question} index={idx} />}
                    </label>
                    ))}
                </div>

                <button
                    className="mt-4 w-full rounded-xl bg-black text-white py-2 font-medium disabled:opacity-50"
                    disabled={selected === null || submitting}
                    onClick={submitAnswer}
                >
                    {submitting ? "Submitting..." : "Attack!"}
                </button>
              </div>
            </>
          )}

          {msg ? <p className="mt-3 text-sm">{msg}</p> : null}
        </section>
      </div>
    </main>
  );
}