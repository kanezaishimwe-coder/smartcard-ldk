// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBOsVXsyjwKoce2J2wGXf0fzNqJMMFrGJg",
  authDomain: "smartcard-ldk.firebase.com",
  projectId: "smartcard-ldk",
  storageBucket: "smartcard-ldk.firebasestorage.app",
  messagingSenderId: "958690589205",
  appId: "1:958690589205:web:6c3a411480462299f2ec1c",
  measurementId: "G-8HKP7QXYS4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Firebase Authentication
const auth = getAuth(app);

// Create a new Google Auth provider
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

// Export Firebase services for use in other modules
export { app, analytics, auth, googleProvider, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged };