// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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
