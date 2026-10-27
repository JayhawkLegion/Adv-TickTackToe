// Card Clash online profiles: sign in with Google (Firebase Authentication)
// and keep the profile in Cloud Firestore, so it can be played from any
// device. While this is null the game stays offline-only and nothing is
// loaded from the network.
//
// To switch it on:
//   1. Firebase console (console.firebase.google.com): open your project, or
//      add one.
//   2. Build → Authentication → Get started → Sign-in method → Google → Enable.
//   3. Authentication → Settings → Authorized domains → Add domain:
//      jayhawklegion.github.io
//   4. Build → Firestore Database → Create database (production mode).
//   5. Firestore → Rules: add the rules in tools/firestore.rules, then Publish.
//      If the project already has rules for another app, add the
//      cardClashUsers block to them rather than replacing them.
//   6. Project settings → General → Your apps → Web app (</>) → copy the
//      firebaseConfig object and paste it below in place of null.
//
// The config isn't a secret: it only names the project. The Firestore rules
// decide who can read or write what (each player only their own profile).
const CARD_CLASH_FIREBASE_CONFIG = null;

// It looks like this:
// const CARD_CLASH_FIREBASE_CONFIG = {
//   apiKey: "AIza...",
//   authDomain: "your-project.firebaseapp.com",
//   projectId: "your-project",
//   storageBucket: "your-project.appspot.com",
//   messagingSenderId: "1234567890",
//   appId: "1:1234567890:web:abc123def456",
// };
