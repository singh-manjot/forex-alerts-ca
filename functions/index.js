const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// Take the text parameter passed to this HTTP endpoint and insert it into
// Cloud Firestore under the path /messages/:documentId/original
exports.addMessage = functions.https.onRequest(async (req, res) => {
  // Grab the text parameter.
  const original = req.query.text;
  // Push the new message into Cloud Firestore using the Firebase Admin SDK.
  const writeResult = await admin
    .firestore()
    .collection("messages")
    .add({ original: original });
  // Send back a message that we've successfully written the message
  res.json({ result: `Message with ID: ${writeResult.id} added.` });
});

// Write own UpperCase function
exports.makeUpperCase = functions.firestore
  .document("/messages/{documentId}")
  .onCreate((snap, context) => {
    // Get the original value
    const value = snap.data().original;

    // Logging
    functions.logger.log(
      "Uppercase document ID: ",
      context.params.documentId,
      value
    );

    const uppercaseValue = value.toUpperCase();

    /* Take the snap which is the recently entered data, adds or "sets"
     * a property "capsValue" with value uppercaseValue
     */
    return snap.ref.set({ capsValue: uppercaseValue }, { merge: true });
  });

// Try a delete endpoint
exports.deleteAllMessages = functions.https.onRequest(async (req, res) => {
  // const note = req.query.note;
  await admin
    .firestore()
    .collection("messages/")
    .listDocuments()
    .then((documentRefs) => {
      for (let ref of documentRefs) {
        ref.delete();
      }
    });
  res.json({ result: "Done" });
});
