"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut, User, deleteUser } from "firebase/auth";
import { doc, getDoc, updateDoc, arrayUnion, onSnapshot, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StoryEvent, Character } from "@/types/game";
import { StoryPlayer } from "@/components/StoryPlayer";

const LOGIN_STORY_ID = "login";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [storyToPlay, setStoryToPlay] = useState<StoryEvent | null>(null);
  const [isGM, setIsGM] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);
      setIsGM(u.email === "oliveru1996@gmail.com");
      setLoading(true);

      const unsubChar = onSnapshot(doc(db, "characters", u.uid), async (charSnap) => {
        if (charSnap.exists()) {
          const charData = charSnap.data() as Character;
          setCharacter(charData);

          const hasCompletedIntro = charData.completedStoryEvents?.includes(LOGIN_STORY_ID);

          if (!hasCompletedIntro) {
            if (!storyToPlay) {
              const storyDoc = await getDoc(doc(db, "stories", LOGIN_STORY_ID));
              if (storyDoc.exists()) {
                setStoryToPlay({ ...storyDoc.data(), id: storyDoc.id } as StoryEvent);
              }
            }
          }
        } else {
          console.log("Waiting for character creation...");
        }
        setLoading(false);
      }, (error) => {
        console.error("Error listening to character data:", error);
        setLoading(false);
      });

      return () => unsubChar();
    });

    return () => unsubAuth();
  }, [router, storyToPlay]);

  const handleStoryComplete = async () => {
    if (!user || !storyToPlay) return;

    try {
        await updateDoc(doc(db, "characters", user.uid), {
            completedStoryEvents: arrayUnion(storyToPlay.id)
        });
    } catch(e) {
        console.error("Error updating completed stories", e);
    } finally {
        setStoryToPlay(null);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  const handleNewGame = async () => {
    if (!user) return;
    if (window.confirm("Are you sure you want to start a new game? Your current progress will be lost.")) {
      try {
        // Now also deletes the active encounter
        await deleteDoc(doc(db, "activeEncounters", user.uid));
        // Delete all submissions by the user
        const submissionsRef = collection(db, "submissions");
        const q = query(submissionsRef, where("ownerUid", "==", user.uid));
        const querySnapshot = await getDocs(q);
        const deletePromises: Promise<void>[] = [];
        querySnapshot.forEach((doc) => {
          deletePromises.push(deleteDoc(doc.ref));
        });
        await Promise.all(deletePromises);
        
        await deleteDoc(doc(db, "characters", user.uid));
        router.push('/login'); // Redirect to login to re-trigger character creation
      } catch (error) {
        console.error("Error starting a new game:", error);
        alert("There was an error starting a new game. Please try again.");
      }
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (window.confirm("Are you sure you want to delete your account? This action is irreversible.")) {
      try {
        // Now also deletes the active encounter
        await deleteDoc(doc(db, "activeEncounters", user.uid));
        
        // Delete all submissions by the user
        const submissionsRef = collection(db, "submissions");
        const q = query(submissionsRef, where("ownerUid", "==", user.uid));
        const querySnapshot = await getDocs(q);
        const deletePromises: Promise<void>[] = [];
        querySnapshot.forEach((doc) => {
          deletePromises.push(deleteDoc(doc.ref));
        });
        await Promise.all(deletePromises);
        
        await deleteDoc(doc(db, "characters", user.uid));
        if (auth.currentUser) {
          await deleteUser(auth.currentUser);
        }
        router.push("/login");
      } catch (error) {
        console.error("Error deleting account:", error);
        alert("There was an error deleting your account. You might need to log in again to complete this action.");
      }
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 animate-pulse font-bold">
      Loading World...
    </div>
  );

  if (storyToPlay) {
    return <StoryPlayer story={storyToPlay} onComplete={handleStoryComplete} />
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center py-12 px-6 transition-colors duration-300">
      <div className="max-w-md w-full space-y-8 text-center">

        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">The Primordial Equation</h1>
          <p className="text-gray-600 dark:text-gray-300">
            Welcome back, <span className="font-bold text-blue-600 dark:text-blue-400">{character?.name || "Hero"}</span>.
          </p>
        </div>

        <div className="grid gap-4">

          <Link
            href="/map"
            className="group relative p-6 bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-500 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
          >
            <div className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-300">🗺️</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">World Map</h3>
          </Link>

          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/character"
              className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <div className="text-2xl mb-1">🦉</div>
              <div className="font-bold text-gray-900 dark:text-gray-200">Character</div>
            </Link>

            <Link
              href="/shop"
              className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <div className="text-2xl mb-1">🔮</div>
              <div className="font-bold text-gray-900 dark:text-gray-200">Store</div>
            </Link>
          </div>

          {isGM && (
            <Link href="/gm" className="p-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
               (GM Panel)
            </Link>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="text-red-500 dark:text-red-400 text-sm font-bold hover:underline mt-8"
        >
          Logout
        </button>

      </div>
      <div className="fixed bottom-4 right-4 flex flex-col items-end space-y-2">
        <button
          onClick={handleNewGame}
          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          New Game
        </button>
        <button
          onClick={handleDeleteAccount}
          className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
        >
          Delete Account
        </button>
      </div>
    </main>
  );
}