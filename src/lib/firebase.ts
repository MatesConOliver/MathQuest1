// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, getDoc as getDocFirestore, updateDoc as updateDocFirestore, DocumentData } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAxoPOoeJSdYHD92RqYQNvXjlt8cVKptpE",
  authDomain: "mathquest1-b6223.firebaseapp.com",
  projectId: "mathquest1-b6223",
  storageBucket: "mathquest1-b6223.firebasestorage.app",
  messagingSenderId: "565631820722",
  appId: "1:565631820722:web:ee17f44b05471f7b0dbaab"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// Generic function to get all documents from a collection
export const getAllDocs = async <T extends DocumentData>(collectionName: string): Promise<T[]> => {
  const querySnapshot = await getDocs(collection(db, collectionName));
  const documents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as T));
  return documents;
};

// Generic function to get a single document from a collection
export const getDoc = async <T extends DocumentData>(collectionName: string, docId: string): Promise<T | null> => {
  const docRef = doc(db, collectionName, docId);
  const docSnap = await getDocFirestore(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as unknown as T;
  } else {
    console.log("No such document!");
    return null;
  }
};

// Custom updateDoc function
export const updateDoc = async (collectionName: string, docId: string, data: any) => {
  const docRef = doc(db, collectionName, docId);
  return await updateDocFirestore(docRef, data);
};
