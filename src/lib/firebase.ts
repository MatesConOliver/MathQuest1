// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, getDoc as getDocFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

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

// Function to get all documents from a collection
export const getAllDocs = async (collectionName: string) => {
  const querySnapshot = await getDocs(collection(db, collectionName));
  const documents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return documents;
};

// Function to get a single document from a collection
export const getDoc = async (collectionName: string, docId: string) => {
  const docRef = doc(db, collectionName, docId);
  const docSnap = await getDocFirestore(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  } else {
    console.log("No such document!");
    return null;
  }
};
