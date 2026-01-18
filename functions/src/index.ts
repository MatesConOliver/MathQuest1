import { https } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, serverTimestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import * as cors from "cors";
import { Response } from "express";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

// CORS handler
const corsHandler = cors({ origin: true });

// Helper to create a new character object, based on the source of truth in login/page.tsx
const createNewCharacter = (name: string, uid: string) => {
  return {
    ownerUid: uid,
    name: name,
    className: "Apprentice",
    level: 1,
    xp: 0,
    gold: 0,
    maxHp: 15,
    hp: 15,
    stats: { a: 0, b: 0, c: 0, d: 0 },
    unspentPoints: 0,
    inventory: [],
    equipment: { mainHand: null, offHand: null, armor: null, head: null },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedStoryEvents: [],
    unlockedContinents: ["bSL1XkrzgqQxqtCLNumD"]
  };
};

// Authentication middleware
const authenticate = async (req: https.Request, res: Response, next: Function) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    res.status(403).send('Unauthorized');
    return;
  }
  const idToken = req.headers.authorization.split('Bearer ')[1];
  try {
    const decodedIdToken = await adminAuth.verifyIdToken(idToken);
    (req as any).user = decodedIdToken;
    next();
  } catch (error) {
    console.error("Error while verifying ID token:", error);
    res.status(403).send('Unauthorized');
  }
};

// Checks for login story, creating character if needed
export const checkAndGetLoginStory = https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    authenticate(req, res, async () => {
      const uid = (req as any).user.uid;
      try {
        const charDocRef = db.collection("characters").doc(uid);
        const charSnap = await charDocRef.get();

        if (!charSnap.exists) {
          // Create character since one doesn't exist
          const userRecord = await adminAuth.getUser(uid);
          const name = userRecord.displayName || "Adventurer";
          const newCharacter = createNewCharacter(name, uid);
          await db.collection("characters").doc(uid).set(newCharacter);

          // Now, find and send the login story.
          const storiesQuery = db.collection("stories").where("triggerType", "==", "ON_LOGIN").limit(1);
          const storiesSnap = await storiesQuery.get();
          if (storiesSnap.empty) {
            res.status(200).send(null); // No login story configured
          } else {
            const loginStory = { id: storiesSnap.docs[0].id, ...storiesSnap.docs[0].data() };
            res.status(200).send(loginStory);
          }
          return;
        }

        const character = charSnap.data();
        const completedStories = character?.completedStoryEvents || [];
        const storiesQuery = db.collection("stories")
          .where("triggerType", "==", "ON_LOGIN")
          .where("oneTime", "==", true);
        
        const storiesSnap = await storiesQuery.get();
        if (storiesSnap.empty) {
          res.status(200).send(null);
          return;
        }

        const loginStory = storiesSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .find(story => !completedStories.includes(story.id));

        res.status(200).send(loginStory || null);
      } catch (error) {
        console.error("Error in checkAndGetLoginStory:", error);
        res.status(500).send({ error: "An error occurred while fetching the story." });
      }
    });
  });
});

// Deletes user account and data
export const deleteUserAccount = https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    authenticate(req, res, async () => {
      const uid = (req as any).user.uid;
      try {
        const batch = db.batch();
        batch.delete(db.collection("characters").doc(uid));
        batch.delete(db.collection("activeEncounters").doc(uid));
        const subsSnap = await db.collection("submissions").where("ownerUid", "==", uid).get();
        subsSnap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        await adminAuth.deleteUser(uid);
        res.status(200).send({ success: true });
      } catch (error) {
        console.error("Error deleting user account:", error);
        res.status(500).send({ error: "An error occurred." });
      }
    });
  });
});

// Starts a new game
export const newGame = https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    authenticate(req, res, async () => {
      const uid = (req as any).user.uid;
      try {
        // Atomically delete old data
        const batch = db.batch();
        batch.delete(db.collection("characters").doc(uid));
        batch.delete(db.collection("activeEncounters").doc(uid));
        const subsSnap = await db.collection("submissions").where("ownerUid", "==", uid).get();
        subsSnap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        // Create a new character
        const userRecord = await adminAuth.getUser(uid);
        const name = userRecord.displayName || "Adventurer";
        const newCharacter = createNewCharacter(name, uid);
        await db.collection("characters").doc(uid).set(newCharacter);
        
        res.status(200).send({ success: true });
      } catch (error) {
        console.error("Error starting new game:", error);
        res.status(500).send({ error: "An error occurred." });
      }
    });
  });
});

// Public access functions
export const getEncounter = https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        // Implementation...
    });
});

export const getStory = https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        // Implementation...
    });
});
