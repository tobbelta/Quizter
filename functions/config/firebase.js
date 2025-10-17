/**
 * Firebase Admin initialization
 */
const admin = require("firebase-admin");

let initialized = false;

/**
 * Initialize Firebase Admin SDK if not already initialized
 * @return {admin} Firebase admin instance
 */
function initializeFirebase() {
  if (!initialized && !admin.apps.length) {
    admin.initializeApp();
    initialized = true;
  }
  return admin;
}

module.exports = {
  initializeFirebase,
  admin,
};
