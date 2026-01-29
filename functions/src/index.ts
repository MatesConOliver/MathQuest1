import { https } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import * as cors from "cors";
import { Response } from "express";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

// CORS handler
const allowedOrigins = [
  'https://dungeonsandpapers.vercel.app',
  'http://localhost:3000',
  'https://mathquest1.web.app',
  'https://mathquest1.firebaseapp.com',
  'https://math-quest1-8pmprtdfs-mates-con-olivers-projects.vercel.app',
  'https://9000-firebase-mathquest1-1768313495270.cluster-fbfjltn375c6wqxlhoehbz44sk.cloudworkstations.dev',
];

const corsHandler = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
});

// Helper to create a new character object
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
    skills: {
      algebra: 0,
      functions: 0,
      geometry: 0,
      probabilityAndStatistics: 0,
      calculus: 0,
    },
    unspentPoints: 0,
    inventory: [],
    equipment: { mainHand: null, offHand: null, armor: null, head: null },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    completedStoryEvents: [],
    unlockedContinents: ["bSL1XkrzgqQxqtCLNumD"],
    encounterWins: {},
    imageUrl: "https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Owl_Sprites%2Fowl%20back.png?alt=media&token=c929fa4d-02f2-4da6-bf6f-12fd88656298"
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

// Gets a story for a given trigger, if available
export const getStoryForTrigger = https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    authenticate(req, res, async () => {
      const uid = (req as any).user.uid;
      const { trigger } = req.body;

      if (!trigger) {
        res.status(400).send({ error: "Trigger not specified." });
        return;
      }

      try {
        const charDocRef = db.collection("characters").doc(uid);
        const charSnap = await charDocRef.get();

        if (!charSnap.exists) {
          res.status(404).send({ error: "Character not found." });
          return;
        }

        const character = charSnap.data();
        const completedStories = character?.completedStoryEvents || [];
        
        const storiesQuery = db.collection("stories")
          .where("triggerType", "==", trigger)
          .where("oneTime", "==", true);
        
        const storiesSnap = await storiesQuery.get();
        if (storiesSnap.empty) {
          res.status(200).send(null);
          return;
        }

        // Find the first story that hasn't been completed yet
        const storyToDo = storiesSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .find(story => !completedStories.includes(story.id));

        res.status(200).send(storyToDo || null);
      } catch (error) {
        console.error(`Error in getStoryForTrigger for trigger ${trigger}:`, error);
        res.status(500).send({ error: "An error occurred while fetching the story." });
      }
    });
  });
});


// Deletes user account and data
export const deleteUserAccount = https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
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
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    authenticate(req, res, async () => {
      const uid = (req as any).user.uid;
      try {
        // Delete old data
        const batch = db.batch();
        batch.delete(db.collection("characters").doc(uid));
        batch.delete(db.collection("activeEncounters").doc(uid));
        const subsSnap = await db.collection("submissions").where("ownerUid", "==", uid).get();
        subsSnap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        // Create a new character with a default name
        const newCharacterData = createNewCharacter("Nameless", uid);
        await db.collection("characters").doc(uid).set(newCharacterData);

        const newCharDoc = await db.collection("characters").doc(uid).get();
        const finalCharacter = newCharDoc.data();
        
        res.status(200).send(finalCharacter);
      } catch (error) {
        console.error("Error starting new game:", error);
        res.status(500).send({ error: "An error occurred." });
      }
    });
  });
});

// Updates a character's name
export const updateCharacterName = https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    authenticate(req, res, async () => {
      const uid = (req as any).user.uid;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 50) {
        res.status(400).send({ error: "Invalid name provided." });
        return;
      }

      try {
        await db.collection("characters").doc(uid).update({
          name: name,
          updatedAt: FieldValue.serverTimestamp()
        });
        res.status(200).send({ success: true });
      } catch (error) {
        console.error("Error updating character name:", error);
        res.status(500).send({ error: "An error occurred." });
      }
    });
  });
});


// Public access functions
export const getEncounter = https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        if (req.method === 'OPTIONS') {
          res.status(204).send('');
          return;
        }
        // Public implementation...
        res.status(501).send({ error: "Not implemented" });
    });
});

export const getStory = https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        if (req.method === 'OPTIONS') {
          res.status(204).send('');
          return;
        }
        // Public implementation...
        res.status(501).send({ error: "Not implemented" });
    });
});
