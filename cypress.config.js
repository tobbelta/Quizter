const { defineConfig } = require("cypress");
const admin = require("firebase-admin");

let serviceAccount;
try {
  serviceAccount = require("./firebase-adminsdk.json");
} catch (e) {
  console.error("VIKTIGT: firebase-adminsdk.json saknas i projektets rotmapp.");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: false,
    setupNodeEvents(on, config) {
      on("task", {
        getUserByEmail(email) {
          return admin.auth().getUserByEmail(email).then(userRecord => userRecord.uid).catch(() => null);
        },
        updateGameState({ gameId, updateData }) {
          if (updateData.playersAtFinish?.type === 'arrayUnion') {
              updateData.playersAtFinish = admin.firestore.FieldValue.arrayUnion(updateData.playersAtFinish.value);
          }
          if (updateData.solvedBy?.type === 'arrayUnion') {
              updateData.solvedBy = admin.firestore.FieldValue.arrayUnion(updateData.solvedBy.value);
          }
          return db.collection("games").doc(gameId).update(updateData).then(() => null);
        },
        // NY TASK: Hämtar all speldata direkt från databasen
        async getGameData(gameId) {
            console.log(`Hämtar all data för spel: ${gameId}`);
            const gameSnap = await db.collection('games').doc(gameId).get();
            if (!gameSnap.exists) return null;
            
            const gameData = gameSnap.data();
            const teamSnap = await db.collection('teams').doc(gameData.teamId).get();
            const courseSnap = await db.collection('courses').doc(gameData.courseId).get();

            const detailedObstacles = await Promise.all(
                (courseSnap.data().obstacles || []).map(async (obs) => {
                    const obstacleDoc = await db.collection('obstacles').doc(obs.obstacleId).get();
                    return {
                        position: { lat: obs.lat, lng: obs.lng },
                        details: obstacleDoc.exists ? obstacleDoc.data() : { error: "Hinder hittades ej" }
                    };
                })
            );

            return {
                gameDetails: gameData,
                teamDetails: teamSnap.exists ? teamSnap.data() : null,
                courseDetails: { ...courseSnap.data(), obstacles: detailedObstacles },
            };
        }
      });
    },
  },
});
