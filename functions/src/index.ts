import { https } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import * as cors from "cors";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

// Initialize CORS middleware, restricted to your app's domain.
const corsHandler = cors({ origin: "https://dungeonsandpapers.vercel.app" });

// Helper function to verify the Firebase ID token and attach user to request
const authenticate = async (req: https.Request, res: https.Response, next: Function) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    res.status(403).send('Unauthorized');
    return;
  }
  const idToken = req.headers.authorization.split('Bearer ')[1];
  try {
    const decodedIdToken = await adminAuth.verifyIdToken(idToken);
    // Add the decoded token to the request object to use in the main function
    (req as any).user = decodedIdToken;
    next();
  } catch (error) {
    console.error("Error while verifying ID token:", error);
    res.status(403).send('Unauthorized');
  }
};

// Checks if the user needs to see the initial login story
export const checkAndGetLoginStory = https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    authenticate(req, res, async () => {
      const uid = (req as any).user.uid;
      try {
        const charDocRef = db.collection("characters").doc(uid);
        const charSnap = await charDocRef.get();

        if (!charSnap.exists) {
          // If character doesn't exist, they are a new user. Find and send the login story.
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

        // Find a login story that the user has NOT completed
        const loginStory = storiesSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .find(story => !completedStories.includes(story.id));

        if (loginStory) {
          res.status(200).send(loginStory);
        } else {
          // User has already seen all one-time login stories
          res.status(200).send(null);
        }
      } catch (error) {
        console.error("Error in checkAndGetLoginStory:", error);
        res.status(500).send({ error: "An error occurred while fetching the story." });
      }
    });
  });
});

// Deletes a user's account and all associated data
export const deleteUserAccount = https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    authenticate(req, res, async () => {
      const uid = (req as any).user.uid;
      try {
        const batch = db.batch();
        
        const characterRef = db.collection("characters").doc(uid);
        batch.delete(characterRef);

        const activeEncounterRef = db.collection("activeEncounters").doc(uid);
        batch.delete(activeEncounterRef);

        const submissionsQuery = db.collection("submissions").where("ownerUid", "==", uid);
        const submissionsSnap = await submissionsQuery.get();
        submissionsSnap.forEach((doc) => {
          batch.delete(doc.ref);
        });

        await batch.commit();
        await adminAuth.deleteUser(uid);

        res.status(200).send({ success: true });
      } catch (error) {
        console.error("Error deleting user account:", error);
        res.status(500).send({ error: "An error occurred while deleting the user account." });
      }
    });
  });
});

// Starts a new game by deleting old character data and creating a fresh one
export const newGame = https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    authenticate(req, res, async () => {
      const uid = (req as any).user.uid;
      try {
        const batch = db.batch();
        const characterRef = db.collection("characters").doc(uid);
        batch.delete(characterRef);

        const activeEncounterRef = db.collection("activeEncounters").doc(uid);
        batch.delete(activeEncounterRef);

        const submissionsQuery = db.collection("submissions").where("ownerUid", "==", uid);
        const submissionsSnap = await submissionsQuery.get();
        submissionsSnap.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();

        const userRecord = await adminAuth.getUser(uid);
        const name = userRecord.displayName || "Adventurer";
        const newCharacter = {
            name: name,
            hp: 100,
            maxHp: 100,
            gold: 0,
            completedStoryEvents: [],
            inventory: [],
            xp: 0,
            level: 1,
        };
        await db.collection("characters").doc(uid).set(newCharacter);
        
        res.status(200).send({ success: true });
      } catch (error) {
        console.error("Error starting new game:", error);
        res.status(500).send({ error: "An error occurred while starting a new game." });
      }
    });
  });
});

// These are public-access and do not need authentication
export const getEncounter = https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        const { encounterId } = req.body;
        if (!encounterId) {
            res.status(400).send("Encounter ID is required.");
            return;
        }
        try {
            const encounterDoc = await db.collection("encounters").doc(encounterId).get();
            if (!encounterDoc.exists) {
                res.status(404).send("Encounter not found.");
            } else {
                res.status(200).send({ ...encounterDoc.data(), id: encounterDoc.id });
            }
        } catch (error) {
            console.error("Error getting encounter:", error);
            res.status(500).send("Internal server error.");
        }
    });
});

export const getStory = https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        const { storyId } = req.body;
        if (!storyId) {
            res.status(400).send("Story ID is required.");
            return;
        }
        try {
            const storyDoc = await db.collection("stories").doc(storyId).get();
            if (!storyDoc.exists) {
                res.status(404).send("Story not found.");
            } else {
                res.status(200).send({ ...storyDoc.data(), id: storyDoc.id });
            }
        } catch (error) {
            console.error("Error getting story:", error);
            res.status(500).send("Internal server error.");
        }
    });
});
