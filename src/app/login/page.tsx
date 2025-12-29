// ARCHIVO: src/app/login/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged 
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// Tipo para el personaje inicial
type Character = {
  ownerUid: string;
  name: string;
  className: string;
  level: number;
  xp: number;
  gold: number;
  maxHp: number;
  inventory: any[];
  equipment: {
    mainHand: string | null;
    armor: string | null;
    head: string | null;
  };
  createdAt: any;
  updatedAt: any;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");

  // Si el usuario ya está logueado, lo sacamos de aquí
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push("/character");
      }
    });
    return () => unsub();
  }, [router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault(); // Evita que la página se recargue
    setError("");

    try {
      if (isRegistering) {
        // --- REGISTRO ---
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;

        // Crear personaje con inventario vacío
        const starter: Character = {
          ownerUid: uid,
          name: "New Adventurer",
          className: "Apprentice",
          level: 1,
          xp: 0,
          gold: 0,
          maxHp: 15,
          inventory: [], // Importante: Array vacío
          equipment: {
            mainHand: null,
            armor: null,
            head: null,
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(doc(db, "characters", uid), starter);
        // La redirección ocurre en el useEffect
      } else {
        // --- LOGIN ---
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message || "Error al iniciar sesión");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-md border">
        <h1 className="text-2xl font-bold mb-2">
          {isRegistering ? "Crear Cuenta" : "Iniciar Sesión"}
        </h1>

        <form onSubmit={handleAuth} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              required
              className="mt-1 block w-full rounded-xl border p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Contraseña</span>
            <input
              type="password"
              required
              className="mt-1 block w-full rounded-xl border p-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full bg-black text-white py-2 rounded-xl font-semibold hover:opacity-80 transition"
          >
            {isRegistering ? "Registrarse" : "Entrar"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-blue-600 underline"
          >
            {isRegistering
              ? "¿Ya tienes cuenta? Inicia sesión"
              : "¿No tienes cuenta? Regístrate"}
          </button>
        </div>
      </div>
    </main>
  );
}