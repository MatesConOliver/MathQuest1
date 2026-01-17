import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as cors from 'cors';

admin.initializeApp();

const db = admin.firestore();

// Pre-configure CORS for your Vercel app.
// This is the crucial step that allows your frontend to talk to your backend.
const corsHandler = cors({
  origin: "https://dungeonsandpapers.vercel.app",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// Helper function to get the UID from a request
const getUidFromRequest = (req: functions.Request, res: functions.Response): string | null => {
  if (req.method === "OPTIONS") {
    res.status(204).send();
    return null;
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).send("Unauthorized: No token provided.");
    return null;
  }
  
  const idToken = authHeader.split('Bearer ')[1];
  try {
    // This part is a placeholder for actual token verification if needed,
    // but for on-request functions, we often get UID after deployment from context.
    // For now, we'll proceed assuming the function is called within a secure context
    // and extract UID on the backend, or we must pass it securely.
    // Let's refine this to be more explicit for on-request functions.
    // The most secure way is to verify the token.
    
    // The logic to get UID from token needs to be async, which complicates this helper.
    // Let's adjust the pattern in each function.
    return "UID_NEEDS_VERIFICATION";

  } catch (error) {
    res.status(401).send("Unauthorized: Invalid token.");
    return null;
  }
};


export const newGame = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).send("Unauthorized");
            return;
        }
        const idToken = authHeader.split('Bearer ')[1];

        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            await db.collection("characters").doc(uid).delete();
            // Re-create the character after deleting
            const userRecord = await admin.auth().getUser(uid);
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

            res.status(200).send({ message: "New game started successfully." });
        } catch (error) {
            console.error("Error starting new game:", error);
            res.status(500).send("Internal server error.");
        }
    });
});

export const deleteUserAccount = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).send("Unauthorized");
            return;
        }
        const idToken = authHeader.split('Bearer ')[1];

        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            await admin.auth().deleteUser(uid);
            await db.collection("characters").doc(uid).delete();
            res.status(200).send({ message: "Account deleted successfully." });
        } catch (error) {
            console.error("Error deleting user account:", error);
            res.status(500).send("Internal server error.");
        }
    });
});

// Other functions using the same secure pattern...

export const getEncounter = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        // This is a read-only operation, but could still be protected
        // For simplicity, we'll leave it open for now as it doesn't modify data
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        
        const { encounterId } = req.body;
        if (!encounterId) {
            res.status(400).send("Encounter ID is required.");
            return;
        }

        try {
            const encounterDoc = await db.collection("encounters").doc(encounterId).get();
            if (!encounterDoc.exists) {
                res.status(404).send("Encounter not found.");
                return;
            }
            res.status(200).send({ ...encounterDoc.data(), id: encounterDoc.id });
        } catch (error) {
            console.error("Error getting encounter:", error);
            res.status(500).send("Internal server error.");
        }
    });
});

export const getStory = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const { storyId } = req.body;
        if (!storyId) {
            res.status(400).send("Story ID is required.");
            return;
        }

        try {
            const storyDoc = await db.collection("stories").doc(storyId).get();
            if (!storyDoc.exists) {
                res.status(404).send("Story not found.");
                return;
            }
            res.status(200).send({ ...storyDoc.data(), id: storyDoc.id });
        } catch (error) {
            console.error("Error getting story:", error);
            res.status(500).send("Internal server error.");
        }
    });
});
