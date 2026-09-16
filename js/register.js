"use strict";

// ======================================================
// SMARTCARD L.D.K — REGISTRATION
// ======================================================

const registerForm = document.getElementById("registerForm");
const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");
const strengthBar = document.getElementById("strengthBar");
const message = document.getElementById("message");
const btnText = document.getElementById("btnText");

// ======================================================
// SHOW / HIDE PASSWORD
// ======================================================

function showPassword() {
    if (!password) return;

    password.type =
        password.type === "password"
            ? "text"
            : "password";
}

// ======================================================
// PASSWORD STRENGTH
// ======================================================

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

    if (
        /[A-Z]/.test(value) &&
        /[a-z]/.test(value)
    ) {
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

// ======================================================
// SHOW MESSAGE
// ======================================================

function showMessage(text, success = false) {
    if (!message) return;

    message.textContent = text;

    message.style.color =
        success
            ? "#15803d"
            : "#dc2626";
}

// ======================================================
// GET USERS
// ======================================================

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
            "Unable to read users:",
            error
        );

        return [];
    }
}

// ======================================================
// NORMALIZE PHONE
// ======================================================

function normalizePhone(phone) {
    return String(phone || "")
        .replace(/\s+/g, "");
}

// ======================================================
// PASSWORD EVENTS
// ======================================================

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

            confirmPassword.style.borderColor =
                "";
        }
    }
);

// ======================================================
// REGISTRATION
// ======================================================

registerForm?.addEventListener(
    "submit",
    event => {

        event.preventDefault();

        // ------------------------------------------------
        // GET FORM VALUES
        // ------------------------------------------------

        const name =
            document
                .getElementById("name")
                ?.value
                .trim();

        const studentId =
            document
                .getElementById("studentId")
                ?.value
                .trim()
                .toUpperCase();

        const className =
            document
                .getElementById("className")
                ?.value
                .trim();

        const phone =
            normalizePhone(
                document
                    .getElementById("phone")
                    ?.value
                    .trim() || ""
            );

        const email =
            document
                .getElementById("email")
                ?.value
                .trim()
                .toLowerCase();

        const passwordValue =
            password?.value || "";

        const confirmValue =
            confirmPassword?.value || "";

        const terms =
            document.getElementById("terms");

        // ------------------------------------------------
        // REQUIRED FIELDS
        // ------------------------------------------------

        if (
            !name ||
            !studentId ||
            !className ||
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

        // ------------------------------------------------
        // TERMS
        // ------------------------------------------------

        if (terms && !terms.checked) {

            showMessage(
                "Please agree to the SmartCard L.D.K terms."
            );

            return;
        }

        // ------------------------------------------------
        // NAME
        // ------------------------------------------------

        if (name.length < 3) {

            showMessage(
                "Please enter your full name."
            );

            return;
        }

        // ------------------------------------------------
        // PASSWORD
        // ------------------------------------------------

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

        // ------------------------------------------------
        // RWANDA PHONE NUMBER
        // ------------------------------------------------

        if (!/^07\d{8}$/.test(phone)) {

            showMessage(
                "Enter a valid Rwanda phone number."
            );

            return;
        }

        // ------------------------------------------------
        // EMAIL
        // ------------------------------------------------

        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {

            showMessage(
                "Enter a valid email address."
            );

            return;
        }

        // ------------------------------------------------
        // LOAD USERS
        // ------------------------------------------------

        const users = getUsers();

        // ------------------------------------------------
        // CHECK EMAIL
        // ------------------------------------------------

        const existingEmail =
            users.some(
                user =>
                    String(user.email || "")
                        .toLowerCase() === email
            );

        if (existingEmail) {

            showMessage(
                "An account with this email already exists."
            );

            return;
        }

        // ------------------------------------------------
        // CHECK PHONE
        // ------------------------------------------------

        const existingPhone =
            users.some(
                user =>
                    normalizePhone(
                        String(user.phone || "")
                    ) === phone
            );

        if (existingPhone) {

            showMessage(
                "An account with this phone number already exists."
            );

            return;
        }

        // ------------------------------------------------
        // CHECK STUDENT ID
        // ------------------------------------------------

        const existingStudent =
            users.some(
                user =>
                    String(user.studentId || "")
                        .toUpperCase() === studentId
            );

        if (existingStudent) {

            showMessage(
                "This student number is already registered."
            );

            return;
        }

        // ------------------------------------------------
        // CREATE USERNAME
        // ------------------------------------------------

        const username =
            email.split("@")[0];

        const existingUsername =
            users.some(
                user =>
                    String(user.username || "")
                        .toLowerCase() ===
                    username.toLowerCase()
            );

        if (existingUsername) {

            showMessage(
                "This username is already taken. Use another email address."
            );

            return;
        }

        // ------------------------------------------------
        // CREATE USER
        // ------------------------------------------------

        const newUser = {

            id:
                "USR-" +
                Date.now(),

            name:
                name,

            studentId:
                studentId,

            class:
                className,

            phone:
                phone,

            email:
                email,

            username:
                username,

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

            cardId:
                "",

            rfid:
                "",

            cardStatus:
                "Not linked",

            notifications:
                [],

            createdAt:
                new Date().toISOString()
        };

        // ------------------------------------------------
        // SAVE USER
        // ------------------------------------------------

        users.push(newUser);

        localStorage.setItem(
            "smartCampusUsers",
            JSON.stringify(users)
        );

        // ------------------------------------------------
        // SAVE CURRENT USER
        // ------------------------------------------------

        localStorage.setItem(
            "smartCampusUser",
            JSON.stringify(newUser)
        );

        // ------------------------------------------------
        // SUCCESS
        // ------------------------------------------------

        if (btnText) {

            btnText.textContent =
                "Account Created";
        }

        showMessage(
            "Account created successfully. Redirecting...",
            true
        );

        // ------------------------------------------------
        // DISABLE FORM
        // ------------------------------------------------

        registerForm
            .querySelectorAll(
                "input, select, button"
            )
            .forEach(
                element =>
                    element.disabled = true
            );

        // ------------------------------------------------
        // REDIRECT
        // ------------------------------------------------

        setTimeout(
            () => {

                window.location.href =
                    "dashboard.html";

            },
            800
        );
    }
);

// ======================================================
// SCROLL TO REGISTER
// ======================================================

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

// ======================================================
// GOOGLE LOGIN PLACEHOLDER
// ======================================================

function continueWithGoogle() {

    showMessage(
        "Google sign-in will be connected when authentication is enabled."
    );
}

// ======================================================
// EXPOSE FUNCTIONS
// ======================================================

window.showPassword =
    showPassword;

window.scrollRegister =
    scrollRegister;

window.continueWithGoogle =
    continueWithGoogle;