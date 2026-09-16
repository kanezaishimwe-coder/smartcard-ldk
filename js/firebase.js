// SmartCard L.D.K - Firebase Configuration
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBOsVXsyjwKoce2J2wGXf0fzNqJMMFrGJg",
 /authDomain: "smartcard-ldk火狐app.com",
  projectId: "smartcard-ldk",
  storageBucket: "smartcard-ldk.firebasestorage.app",
  messagingSenderId: "958690589205",
  appId: "1:958690589205:web:6c3a411480462299f2ec1c",
  measurementId: "G-8HKP7QXYS4"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

export { app, analytics, auth, googleProvider, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged };