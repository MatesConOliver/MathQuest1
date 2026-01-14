import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  getDoc as getFirebaseDoc, 
  collection, 
  getDocs as getFirebaseDocs, 
  updateDoc as updateFirebaseDoc,
  setDoc,
  DocumentData
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const getDoc = async (collectionPath: string, docId: string): Promise<DocumentData | null> => {
  const docRef = doc(db, collectionPath, docId);
  const docSnap = await getFirebaseDoc(docRef);
  if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
}
export const getAllDocs = async (collectionPath: string): Promise<DocumentData[]> => {
  const collectionRef = collection(db, collectionPath);
  const snapshot = await getFirebaseDocs(collectionRef);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}
export const updateDoc = async (collectionPath: string, docId: string, data: Partial<DocumentData>) => {
  const docRef = doc(db, collectionPath, docId);
  return await updateFirebaseDoc(docRef, data);
}
export const createDoc = async (collectionPath: string, docId: string, data: DocumentData) => {
  const docRef = doc(db, collectionPath, docId);
  return await setDoc(docRef, data);
}