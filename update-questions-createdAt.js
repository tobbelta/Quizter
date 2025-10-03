/**
 * Skript för att uppdatera alla befintliga frågor i Firestore med createdAt-fält
 * Kör från functions-mappen: cd functions && node ../update-questions-createdAt.js
 */

const admin = require('./functions/node_modules/firebase-admin');

// Initiera Firebase Admin
admin.initializeApp({
  projectId: 'geoquest2-7e45c'
});

const db = admin.firestore();

async function updateQuestionsWithCreatedAt() {
  console.log('🔍 Hämtar alla frågor från Firestore...');

  const questionsRef = db.collection('questions');
  const snapshot = await questionsRef.get();

  if (snapshot.empty) {
    console.log('❌ Inga frågor hittades i Firestore.');
    return;
  }

  console.log(`📊 Hittade ${snapshot.size} frågor.`);

  let updatedCount = 0;
  let alreadyHasCount = 0;
  const batch = db.batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    if (data.createdAt) {
      alreadyHasCount++;
      console.log(`✓ Fråga ${doc.id} har redan createdAt`);
      continue;
    }

    // Använd generatedAt om det finns, annars använd nuvarande timestamp
    const createdAt = data.generatedAt
      ? admin.firestore.Timestamp.fromDate(new Date(data.generatedAt))
      : admin.firestore.FieldValue.serverTimestamp();

    batch.update(doc.ref, { createdAt });
    updatedCount++;
    batchCount++;

    console.log(`📝 Uppdaterar fråga ${doc.id}...`);

    // Firestore batch limit är 500, commita varje 400 för att vara säker
    if (batchCount >= 400) {
      console.log('💾 Committar batch...');
      await batch.commit();
      batchCount = 0;
    }
  }

  // Commita eventuella kvarvarande uppdateringar
  if (batchCount > 0) {
    console.log('💾 Committar sista batch...');
    await batch.commit();
  }

  console.log('\n✅ Klart!');
  console.log(`   - ${updatedCount} frågor uppdaterades med createdAt`);
  console.log(`   - ${alreadyHasCount} frågor hade redan createdAt`);
  console.log(`   - Totalt: ${snapshot.size} frågor`);

  process.exit(0);
}

updateQuestionsWithCreatedAt().catch(error => {
  console.error('❌ Fel vid uppdatering:', error);
  process.exit(1);
});
