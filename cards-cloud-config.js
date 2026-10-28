// WildFlip online play: Google sign-in, profiles kept on the WildFlip
// server, and games against other players. While this is null the game is
// offline-only and nothing is loaded from the network.
//
// To switch it on, follow ONLINE-SETUP.md: create the Firebase project, deploy
// the server (functions/ and firestore.rules), then paste the project's web
// app config below (null switches online play off).
//
// The config isn't a secret: it only names the project. The server and the
// Firestore rules decide who can read or change what.
const WILDFLIP_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDrJOiyhMsX0vE7kQ20utga7SevL6iF32A",
  authDomain: "wildflip.firebaseapp.com",
  projectId: "wildflip",
  storageBucket: "wildflip.firebasestorage.app",
  messagingSenderId: "436001956988",
  appId: "1:436001956988:web:85d4e71a7e0803dac755f9",
};

// The general shape, for reference:
// const WILDFLIP_FIREBASE_CONFIG = {
//   apiKey: "AIza...",
//   authDomain: "your-project.firebaseapp.com",
//   projectId: "your-project",
//   storageBucket: "your-project.firebasestorage.app",
//   messagingSenderId: "1234567890",
//   appId: "1:1234567890:web:abc123def456",
// };

// For testing on your own computer with the Firebase emulators
// (firebase emulators:start), uncomment this as well:
// const WILDFLIP_FIREBASE_EMULATORS = { host: "127.0.0.1", auth: 9099, firestore: 8080, functions: 5001 };
