"use strict";

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");
const loginButtonText = document.getElementById("loginButtonText");

let firebaseAuth = null;
let firebaseReady = false;

// Wait for Firebase to load
async function initFirebaseAuth() {
    try {
        const module = await import("./firebase.js");
        firebaseAuth = module.auth;
        firebaseReady = true;
        console.log("Firebase Auth initialized");
    } catch (error) {
        console.error("Failed to load Firebase:", error);
        showLoginMessage("Firebase failed to load. Please refresh the page.");
    }
}

function showLoginMessage(text, success = false) {
    if (!loginMessage) return;
    loginMessage.textContent = text;
    loginMessage.style.color = success ? "#15803d" : "#dc2626";
}

function togglePassword() {
    const input = document.getElementById("loginPassword");
    if (input) {
        input.type = input.type === "password" ? "text" : "password";
    }
}

function normalizePhone(phone) {
    return String(phone || "").replace(/\s+/g, "");
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

// Google sign-in using Firebase Auth
async function googleLogin() {
    if (!firebaseReady || !firebaseAuth) {
        showLoginMessage("Firebase is still loading. Please wait.");
        return;
    }

    try {
        const { signInWithRedirect, GoogleAuthProvider } = await import("./firebase.js");
        const provider = new GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        
        await signInWithRedirect(firebaseAuth, provider);
        // Redirect happens automatically; no need to do anything else here
    } catch (error) {
        console.error("Google sign-in error:", error);
        showLoginMessage(error.message || "Google sign-in failed. Please try again.");
    }
}

// Handle redirect result after Google sign-in
async function handleRedirectResult() {
    if (!firebaseReady || !firebaseAuth) return;

    try {
        const { getRedirectResult } = await import("./firebase.js");
        const result = await getRedirectResult(firebaseAuth);
        
        if (!result) return; // No redirect result, user hasn't signed in yet

        const user = result.user;
        const idToken = await user.getIdToken();

        // Send ID token to backend for verification
        const verification = await fetch("http://localhost:3000/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken })
        });

        const data = await verification.json();

        if (!verification.ok) {
            throw new Error(data.message || "Google account could not be verified.");
        }

        // Prompt for phone number
        const phone = window.prompt("Enter your Rwanda phone number to continue:");
        const normalizedPhone = normalizePhone(phone);

        if (!/^07\d{8}$/.test(normalizedPhone)) {
            showLoginMessage("Enter a valid Rwanda phone number.");
            return;
        }

        const email = normalizeEmail(user.email);
        const users = getUsers();
        let existingUser = users.find(item =>
            normalizeEmail(item.email) === email &&
            normalizePhone(item.phone) === normalizedPhone
        );

        if (!existingUser) {
            const sameEmail = users.some(item => normalizeEmail(item.email) === email);
            const samePhone = users.some(item => normalizePhone(item.phone) === normalizedPhone);

            if (sameEmail || samePhone) {
                showLoginMessage("That email and phone number do not match the existing account.");
                return;
            }

            existingUser = {
                id: "USR-" + Date.now(),
                name: user.displayName || email.split("@")[0],
                email,
                phone: normalizedPhone,
                username: email,
                role: "Parent",
                password: "",
                googleId: user.uid,
                wallet: 0,
                balance: 0,
                attendance: 0,
                notifications: [],
                createdAt: new Date().toISOString()
            };
            users.push(existingUser);
            localStorage.setItem("smartCampusUsers", JSON.stringify(users));
        }

        localStorage.setItem("smartCampusUser", JSON.stringify(existingUser));
        showLoginMessage("Google sign-in successful. Redirecting...", true);
        setTimeout(() => { window.location.href = "dashboard.html"; }, 700);
    } catch (error) {
        console.error("Redirect result error:", error);
        showLoginMessage(error.message || "Google sign-in failed.");
    }
}

function forgotPassword(event) {
    event.preventDefault();
    showLoginMessage("Password recovery will be available soon.");
}

function getUsers() {
    try {
        const users = JSON.parse(localStorage.getItem("smartCampusUsers") || "[]");
        return Array.isArray(users) ? users : [];
    } catch {
        return [];
    }
}

loginForm?.addEventListener("submit", event => {
    event.preventDefault();

    const identifier = normalizeEmail(document.getElementById("loginEmail")?.value);
    const phone = normalizePhone(document.getElementById("loginPhone")?.value);
    const password = document.getElementById("loginPassword")?.value || "";
    const remember = document.getElementById("rememberMe")?.checked;

    if (!identifier || !phone || !password) {
        showLoginMessage("Enter your email, phone number and password.");
        return;
    }

    if (!/^07\d{8}$/.test(phone)) {
        showLoginMessage("Enter a valid Rwanda phone number.");
        return;
    }

    const users = getUsers();
    const user = users.find(item => normalizeEmail(item.email) === identifier);

    if (!user) {
        showLoginMessage("Account not found.");
        return;
    }

    if (user.role !== "Parent") {
        showLoginMessage("This portal is restricted to Parent accounts.");
        return;
    }

    if (normalizePhone(user.phone) !== phone) {
        showLoginMessage("Email and phone number do not match.");
        return;
    }

    if (user.password !== password) {
        showLoginMessage("Incorrect password.");
        return;
    }

    if (loginButton) {
        loginButton.disabled = true;
        if (loginButtonText) loginButtonText.textContent = "Signing in...";
    }

    localStorage.setItem("smartCampusUser", JSON.stringify(user));

    if (remember) {
        localStorage.setItem("smartCampusRemember", "true");
    } else {
        localStorage.removeItem("smartCampusRemember");
    }

    showLoginMessage("Login successful. Redirecting...", true);
    setTimeout(() => { window.location.href = "dashboard.html"; }, 700);
});

window.togglePassword = togglePassword;
window.googleLogin = googleLogin;
window.forgotPassword = forgotPassword;

function checkExistingLogin() {
    const savedUser = localStorage.getItem("smartCampusUser");
    if (!savedUser) return;
    try {
        const user = JSON.parse(savedUser);
        if (user?.role === "Parent") {
            window.location.href = "dashboard.html";
        }
    } catch {
        localStorage.removeItem("smartCampusUser");
    }
}

// Initialize Firebase and handle redirect
initFirebaseAuth().then(() => {
    handleRedirectResult();
});
checkExistingLogin();