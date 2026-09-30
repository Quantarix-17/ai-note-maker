// Pata AI — Firebase project config.
// These values only IDENTIFY the project (they are not secrets). Real access control is in firestore.rules
// plus the client-side encryption in pata-vault.js.
// NOTE: Google Analytics is intentionally NOT loaded (no measurementId, no analytics SDK) so nothing tracks users.
window.PATA_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBL0IBQeS6jDXzFX2ctf3CgtMBVt8elOlg',
  authDomain: 'ai-note-maker-16d3a.firebaseapp.com',
  projectId: 'ai-note-maker-16d3a',
  storageBucket: 'ai-note-maker-16d3a.firebasestorage.app',
  messagingSenderId: '1022728493395',
  appId: '1:1022728493395:web:9d687c2e4c21d1e2afe9a6'
};
// Firebase JS SDK version loaded from gstatic. Change only if you want a different one.
window.PATA_FIREBASE_SDK_VERSION = '10.14.1';
