"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndGetLoginStory = void 0;
const firebase_functions_1 = require("firebase-functions");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
// Callable function to check for and return an ON_LOGIN story
exports.checkAndGetLoginStory = firebase_functions_1.https.onCall(async (data, context) => {
    // Check for authentication
    if (!context.auth) {
        throw new firebase_functions_1.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const uid = context.auth.uid;
    try {
        // 1. Get the character document
        const charDocRef = db.collection("characters").doc(uid);
        const charSnap = await charDocRef.get();
        if (!charSnap.exists) {
            // This case should be handled by the client (redirect to character creation)
            // but we can throw an error for safety.
            throw new firebase_functions_1.https.HttpsError("not-found", "Character not found for this user.");
        }
        const character = charSnap.data();
        const completedStories = character?.completedStoryEvents || [];
        // 2. Query the stories collection for uncompleted ON_LOGIN stories
        const storiesQuery = db.collection("stories")
            .where("triggerType", "==", "ON_LOGIN")
            .where("oneTime", "==", true);
        const storiesSnap = await storiesQuery.get();
        if (storiesSnap.empty) {
            return null; // No login stories found at all
        }
        // 3. Find the first story that the user has not completed
        const loginStory = storiesSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .find(story => !completedStories.includes(story.id));
        if (loginStory) {
            return loginStory; // Return the full story object
        }
        return null; // User has completed all available login stories
    }
    catch (error) {
        console.error("Error in checkAndGetLoginStory:", error);
        throw new firebase_functions_1.https.HttpsError("internal", "An error occurred while fetching the story.", error);
    }
});
//# sourceMappingURL=index.js.map