"use strict";

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");
const loginButtonText = document.getElementById("loginButtonText");
const googleButton = document.querySelector(".google-btn");

let firebaseReady = false;

const firebaseConfig = {
  apiKey: "AIzaSyBOsVXsyjwKoce2J2wGXf0fzNqJMMFrGJg",
  authDomain: "smartcard-ldk.firebaseapp.com",
  projectId: "smartcard-ldk",
  storageBucket: "smartcard-ldk.firebasestorage.app",
  messagingSenderId: "958690589205",
  appId: "1:958690589205:web:6c3a411480462299f2ec1c",
  measurementId: "G-8HKP7QXYS4"
};

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

function getUsers() {
    try {
        const users = JSON.parse(localStorage.getItem("smartCampusUsers") || "[]");
        return Array.isArray(users) ? users : [];
    } catch {
        return [];
    }
}

function saveUsers(users) {
    localStorage.setItem("smartCampusUsers", JSON.stringify(users));
}

function initFirebase() {
    try {
        if (typeof firebase === "undefined") {
            setTimeout(initFirebase, 200);
            return;
        }
        firebase.initializeApp(firebaseConfig);
        firebaseReady = true;
        console.log("Firebase initialized");
        if (googleButton) {
            googleButton.disabled = false;
            googleButton.textContent = "Continue with Google";
        }
        checkRedirectResult();
    } catch (error) {
        console.error("Firebase init error:", error);
        showLoginMessage("Firebase failed to initialize.");
    }
}

async function googleLogin() {
    if (!firebaseReady) {
        showLoginMessage("Firebase is still loading. Please wait.");
        return;
    }
    try {
        const auth = firebase.auth();
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        if (googleButton) {
            googleButton.disabled = true;
            googleButton.textContent = "Signing in...";
        }
        await auth.signInWithRedirect(provider);
    } catch (error) {
        console.error("Google sign-in error:", error);
        showLoginMessage(error.message || "Google sign-in failed.");
        if (googleButton) {
            googleButton.disabled = false;
            googleButton.textContent = "Continue with Google";
        }
    }
}

async function checkRedirectResult() {
    try {
        const auth = firebase.auth();
        const result = await auth.getRedirectResult();
        if (!result || !result.user) return;

        const user = result.user;
        const idToken = await user.getIdToken();

        const response = await fetch("http://localhost:3000/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken })
        });

        const data = await response.json();
        if (!response.ok) {
            showLoginMessage(data.message || "Google verification failed.");
            return;
        }

        const phone = window.prompt("Enter your Rwanda phone number:");
        const normalizedPhone = normalizePhone(phone);
        if (!/^07\d{8}$/.test(normalizedPhone)) {
            showLoginMessage("Enter a valid Rwanda phone number.");
            return;
        }

        const email = normalizeEmail(user.email);
        const users = getUsers();
        let existingUser = users.find(u =>
            normalizeEmail(u.email) === email &&
            normalizePhone(u.phone) === normalizedPhone
        );

        if (!existingUser) {
            const sameEmail = users.some(u => normalizeEmail(u.email) === email);
            const samePhone = users.some(u => normalizePhone(u.phone) === normalizedPhone);
            if (sameEmail || samePhone) {
                showLoginMessage("Email and phone do not match.");
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
            saveUsers(users);
        }

        localStorage.setItem("smartCampusUser", JSON.stringify(existingUser));
        showLoginMessage("Google sign-in successful. Redirecting...", true);
        setTimeout(() => { window.location.href = "dashboard.html"; }, 700);
    } catch (error) {
        console.error("Redirect error:", error);
        showLoginMessage(error.message || "Google sign-in failed.");
    }
}

function forgotPassword(event) {
    event.preventDefault();
    showLoginMessage("Password recovery will be available soon.");
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
    const user = users.find(u => normalizeEmail(u.email) === identifier);

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

checkExistingLogin();
initFirebase();