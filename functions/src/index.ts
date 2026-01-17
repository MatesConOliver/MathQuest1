
import { https } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import * as cors from "cors";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

// Initialize CORS middleware
// The { origin: true } option allows the function to accept requests from any origin.
// For production, you might want to restrict this to your app's domain:
// const corsHandler = cors({ origin: '''https://dungeonsandpapers.vercel.app''' });
const corsHandler = cors({ origin: true });

// Helper function to verify the Firebase ID token
const authenticate = async (req: https.Request, res: https.Response, next: Function) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    res.status(403).send('Unauthorized');
    return;
  }
  const idToken = req.headers.authorization.split('Bearer ')[1];
  try {
    const decodedIdToken = await adminAuth.verifyIdToken(idToken);
    // Add the decoded token to the request object so we can use it in the main function
    (req as any).user = decodedIdToken;
    next();
  } catch (error) {
    res.status(403).send('Unauthorized');
  }
};

export const checkAndGetLoginStory = https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    authenticate(req, res, async () => {
      const uid = (req as any).user.uid;

      try {
        const charDocRef = db.collection("characters").doc(uid);
        const charSnap = await charDocRef.get();

        if (!charSnap.exists) {
          throw new https.HttpsError("not-found", "Character not found for this user.");
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

        if (loginStory) {
          res.status(200).send(loginStory);
        } else {
          res.status(200).send(null);
        }

      } catch (error) {
        console.error("Error in checkAndGetLoginStory:", error);
        res.status(500).send({ error: "An error occurred while fetching the story." });
      }
    });
  });
});

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

        res.status(200).send({ success: true });
      } catch (error) {
        console.error("Error starting new game:", error);
        res.status(500).send({ error: "An error occurred while starting a new game." });
      }
    });
  });
});
