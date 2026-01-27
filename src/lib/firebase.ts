// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, getIdToken } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, getDoc as getDocFirestore, updateDoc as updateDocFirestore, DocumentData } from "firebase/firestore";

// Your web app's Firebase configuration
// IMPORTANT: In a real-world app, use environment variables for this sensitive data
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// API and Function calling
const getFirebaseRegion = () => 'us-central1';
const getProjectId = () => 'mathquest1-b6223'; // Make sure this matches your project ID

/**
 * A helper function to call HTTP onRequest Cloud Functions.
 * It automatically handles authentication by sending the user's ID token.
 * @param functionName The name of the Cloud Function to call.
 * @param data Optional data to send in the request body.
 * @returns The JSON response from the function.
 */
export const callApi = async <T>(functionName: string, data?: object): Promise<T> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Authentication required to call API.");
  }

  const token = await getIdToken(user);
  const url = `https://${getFirebaseRegion()}-${getProjectId()}.cloudfunctions.net/${functionName}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API call to ${functionName} failed with status ${response.status}: ${errorText}`);
  }
  
  // Handle functions that might return no content (e.g., on a successful deletion)
  if (response.status === 204 || response.headers.get("content-length") === "0") {
      return null as T;
  }

  return response.json() as Promise<T>;
};


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
