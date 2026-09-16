"use strict";

const registerForm = document.getElementById("registerForm");
const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");
const strengthBar = document.getElementById("strengthBar");
const message = document.getElementById("message");
const btnText = document.getElementById("btnText");

// ==========================================
// SHOW / HIDE PASSWORD
// ==========================================

function showPassword() {
    if (!password) return;

    password.type =
        password.type === "password"
            ? "text"
            : "password";
}

// ==========================================
// PASSWORD STRENGTH
// ==========================================

function updatePasswordStrength() {
    if (!password || !strengthBar) return;

    const value = password.value;
    let width = 0;

    if (value.length >= 6) {
        width = 35;
    }

    if (value.length >= 8) {
        width = 60;
    }

    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) {
        width = 75;
    }

    if (
        /\d/.test(value) &&
        /[^A-Za-z0-9]/.test(value)
    ) {
        width = 100;
    }

    strengthBar.style.width = width + "%";

    strengthBar.style.background =
        width < 40
            ? "#dc2626"
            : width < 75
            ? "#f59e0b"
            : "#16a34a";
}

// ==========================================
// SHOW MESSAGE
// ==========================================

function showMessage(text, success = false) {
    if (!message) return;

    message.textContent = text;

    message.style.color = success
        ? "#15803d"
        : "#dc2626";
}

// ==========================================
// GET REGISTERED USERS
// ==========================================

function getUsers() {
    try {
        const users = JSON.parse(
            localStorage.getItem("smartCampusUsers") || "[]"
        );

        return Array.isArray(users)
            ? users
            : [];

    } catch (error) {
        console.error(
            "Could not read registered users:",
            error
        );

        return [];
    }
}

// ==========================================
// NORMALIZE PHONE
// ==========================================

function normalizePhone(phone) {
    return String(phone || "")
        .replace(/\s+/g, "");
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

// ==========================================
// PASSWORD EVENTS
// ==========================================

password?.addEventListener(
    "input",
    updatePasswordStrength
);

confirmPassword?.addEventListener(
    "input",
    () => {

        if (!confirmPassword) return;

        if (
            confirmPassword.value &&
            confirmPassword.value !== password?.value
        ) {
            confirmPassword.style.borderColor =
                "#dc2626";
        } else {
            confirmPassword.style.borderColor = "";
        }
    }
);

// ==========================================
// REGISTRATION
// ==========================================

registerForm?.addEventListener(
    "submit",
    event => {

        event.preventDefault();

        // --------------------------------------
        // GET FORM VALUES
        // --------------------------------------

        const name =
            document
                .getElementById("name")
                ?.value
                .trim();

        const phone =
            normalizePhone(
                document
                    .getElementById("phone")
                    ?.value
                    .trim()
            );

        const email = normalizeEmail(
            document.getElementById("email")?.value
        );

        const passwordValue =
            password?.value || "";

        const confirmValue =
            confirmPassword?.value || "";

        const terms =
            document.getElementById("terms");

        // --------------------------------------
        // REQUIRED FIELDS
        // --------------------------------------

        if (
            !name ||
            !phone ||
            !email ||
            !passwordValue ||
            !confirmValue
        ) {
            showMessage(
                "Please complete all required fields."
            );

            return;
        }

        if (!/^\S+@\S+\.\S+$/.test(email)) {
            showMessage("Enter a valid email address.");
            return;
        }

        // --------------------------------------
        // TERMS
        // --------------------------------------

        if (terms && !terms.checked) {

            showMessage(
                "Please agree to the SmartCard L.D.K terms."
            );

            return;
        }

        // --------------------------------------
        // NAME VALIDATION
        // --------------------------------------

        if (name.length < 3) {

            showMessage(
                "Please enter your full name."
            );

            return;
        }

        // --------------------------------------
        // PASSWORD VALIDATION
        // --------------------------------------

        if (passwordValue.length < 6) {

            showMessage(
                "Password must contain at least 6 characters."
            );

            return;
        }

        if (passwordValue !== confirmValue) {

            showMessage(
                "Passwords do not match."
            );

            return;
        }

        // --------------------------------------
        // RWANDA PHONE VALIDATION
        // --------------------------------------

        if (!/^07\d{8}$/.test(phone)) {

            showMessage(
                "Enter a valid Rwanda phone number."
            );

            return;
        }

        // --------------------------------------
        // GET EXISTING USERS
        // --------------------------------------

        const users = getUsers();

        // --------------------------------------
        // CHECK DUPLICATE PHONE
        // --------------------------------------

        const existingPhone =
            users.some(
                user =>
                    normalizePhone(
                        user.phone
                    ) === phone
            );

        if (existingPhone) {

            showMessage(
                "An account with this phone number already exists."
            );

            return;
        }

        const existingEmail = users.some(
            user => normalizeEmail(user.email) === email
        );

        if (existingEmail) {
            showMessage("An account with this email already exists.");
            return;
        }

        // --------------------------------------
        // CREATE USER
        // --------------------------------------

        const newUser = {

            id:
                "USR-" +
                Date.now(),

            name:
                name,

            phone:
                phone,

            email:
                email,

            username:
                phone,

            role:
                "Parent",

            password:
                passwordValue,

            wallet:
                0,

            balance:
                0,

            attendance:
                0,

            notifications:
                [],

            createdAt:
                new Date().toISOString()
        };

        // --------------------------------------
        // SAVE USER
        // --------------------------------------

        users.push(newUser);

        localStorage.setItem(
            "smartCampusUsers",
            JSON.stringify(users)
        );

        localStorage.setItem(
            "smartCampusUser",
            JSON.stringify(newUser)
        );

        // --------------------------------------
        // SUCCESS MESSAGE
        // --------------------------------------

        if (btnText) {

            btnText.textContent =
                "Account Created";
        }

        showMessage(
            "Account created successfully. Redirecting...",
            true
        );

        // --------------------------------------
        // DISABLE FORM
        // --------------------------------------

        registerForm
            .querySelectorAll(
                "input, select, button"
            )
            .forEach(element => {
                element.disabled = true;
            });

        // --------------------------------------
        // REDIRECT
        // --------------------------------------

        setTimeout(() => {

            window.location.href =
                "dashboard.html";

        }, 800);
    }
);

// ==========================================
// MAKE FUNCTIONS AVAILABLE TO HTML
// ==========================================

window.showPassword =
    showPassword;

// ==========================================
// SCROLL TO REGISTRATION
// ==========================================

function scrollRegister() {

    const register =
        document.getElementById("register");

    if (register) {

        register.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }
}

window.scrollRegister =
    scrollRegister;

// ==========================================
// GOOGLE LOGIN
// ==========================================

function continueWithGoogle() {
    showMessage(
        "Google sign-in is available from the login page."
    );
}

window.continueWithGoogle =
    continueWithGoogle;