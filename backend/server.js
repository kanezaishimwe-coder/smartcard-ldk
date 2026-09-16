const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
require("dotenv").config();
const sqlite3 = require("sqlite3").verbose();
const rfidRoutes = require("./routes/rfidRoutes");
const { hashPassword, verifyPassword, generateToken } = require("./utils/password");
const admin = require("firebase-admin");

const momoConfig = require("./config/momo");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();

const PORT = process.env.PORT || 3000;

// ==========================================
// SMARTCARD L.D.K CONFIGURATION
// ==========================================

const WALLET_CURRENCY = "RWF";
const MOMO_CURRENCY = momoConfig.currency;
const SERVICE_FEE = 200;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

// Initialize Firebase Admin SDK
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : null;

if (firebasePrivateKey && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
    admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: firebasePrivateKey
    });
    console.log("✅ Firebase Admin initialized");
} else {
    console.warn("⚠️ Firebase Admin not configured - Google sign-in may not work");
}

// ==========================================
// SECURITY: RATE LIMITING
// ==========================================

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 100;

function rateLimiter(req, res, next) {
    const key = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    const record = rateLimitStore.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

    if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + RATE_LIMIT_WINDOW_MS;
    }

    record.count++;
    rateLimitStore.set(key, record);

    if (record.count > RATE_LIMIT_MAX_REQUESTS) {
        return res.status(429).json({
            success: false,
            message: "Too many requests. Please try again later."
        });
    }

    next();
}

// Stricter rate limit for auth endpoints
const authRateLimitStore = new Map();
const AUTH_RATE_LIMIT_WINDOW_MS = 60000;
const AUTH_RATE_LIMIT_MAX_REQUESTS = 10;

function authRateLimiter(req, res, next) {
    const key = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    const record = authRateLimitStore.get(key) || { count: 0, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS };

    if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + AUTH_RATE_LIMIT_WINDOW_MS;
    }

    record.count++;
    authRateLimitStore.set(key, record);

    if (record.count > AUTH_RATE_LIMIT_MAX_REQUESTS) {
        return res.status(429).json({
            success: false,
            message: "Too many authentication attempts. Please try again later."
        });
    }

    next();
}

// ==========================================
// SECURITY: ADMIN AUTHORIZATION
// ==========================================

function requireAdmin(req, res, next) {
    const token = String(req.headers["x-admin-token"] || req.body.token || "").trim();
    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Administrator authentication required."
        });
    }
    req.adminToken = token;
    next();
}

async function verifyAdminToken(req, res, next) {
    const token = req.adminToken || String(req.headers["x-admin-token"] || "").trim();
    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Administrator authentication required."
        });
    }

    try {
        const admin = await get(
            `SELECT id, username, role, active FROM admin_users WHERE id = ?`,
            [token]
        );

        if (!admin || admin.active !== 1) {
            return res.status(401).json({
                success: false,
                message: "Invalid administrator session."
            });
        }

        req.admin = admin;
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Could not verify administrator session."
        });
    }
}

// Parent authorization middleware
async function verifyParentToken(req, res, next) {
    const token = String(req.headers["x-parent-token"] || req.body.token || "").trim();
    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Parent authentication required."
        });
    }

    try {
        const parent = await get(
            `SELECT id, name, phone, email, active FROM parents WHERE id = ?`,
            [token]
        );

        if (!parent) {
            return res.status(401).json({
                success: false,
                message: "Invalid parent session."
            });
        }

        req.parent = parent;
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Could not verify parent session."
        });
    }
}

// ==========================================
// SECURITY: INPUT SANITIZATION
// ==========================================

function sanitizeString(value, maxLength = 1000) {
    return String(value || "")
        .trim()
        .slice(0, maxLength)
        .replace(/[<>]/g, "");
}

function sanitizeInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const num = Number(value);
    if (!Number.isInteger(num)) return null;
    if (num < min || num > max) return null;
    return num;
}

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(rateLimiter);

app.post("/api/auth/google", async (req, res) => {
    try {
        const idToken = String(req.body.idToken || req.body.credential || "");

        if (!idToken) {
            return res.status(400).json({
                success: false,
                message: "No authentication token provided."
            });
        }

        // Verify Firebase ID token
        if (admin.apps.length > 0) {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const profile = {
                sub: decodedToken.uid,
                email: decodedToken.email,
                name: decodedToken.name || decodedToken.email.split("@")[0]
            };

            return res.json({
                success: true,
                profile: profile
            });
        }

        // Fallback: Verify as Google Identity Services token
        if (!GOOGLE_CLIENT_ID) {
            return res.status(503).json({
                success: false,
                message: "Google authentication is not configured."
            });
        }

        const response = await axios.get(
            "https://oauth2.googleapis.com/tokeninfo",
            { params: { id_token: idToken } }
        );

        const profile = response.data;

        if (
            profile.aud !== GOOGLE_CLIENT_ID ||
            profile.email_verified !== "true" ||
            !profile.email
        ) {
            return res.status(401).json({
                success: false,
                message: "Google account verification failed."
            });
        }

        return res.json({
            success: true,
            profile: {
                sub: profile.sub,
                email: profile.email,
                name: profile.name || profile.email.split("@")[0]
            }
        });
    } catch (error) {
        console.error("Google authentication error:", error.message);

        return res.status(401).json({
            success: false,
            message: "Google account verification failed."
        });
    }
});

// ==========================================
// SQLITE DATABASE
// ==========================================

const db = new sqlite3.Database(
    "./smartcard.db",
    (error) => {

        if (error) {

            console.error(
                "❌ Database connection failed:",
                error.message
            );

            return;
        }

        console.log(
            "✅ SQLite database connected."
        );
    }
);

// Connect database to payment routes.
paymentRoutes.setDatabase(db);

// Connect database to RFID routes.
rfidRoutes.setDatabase(db);

rfidRoutes.initializeRFIDDatabase()
  .then(() => {
    console.log("✅ RFID attendance table ready.");
  })
  .catch((error) => {
    console.error("❌ RFID database initialization failed:", error.message);
  });

// Mount payment routes.
app.use("/api", paymentRoutes);

app.use("/api/rfid", rfidRoutes);

// ==========================================
// DATABASE HELPERS
// ==========================================

function run(sql, params = []) {

    return new Promise(
        (resolve, reject) => {

            db.run(
                sql,
                params,
                function(error) {

                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve({
                        id: this.lastID,
                        changes: this.changes
                    });
                }
            );
        }
    );
}

function get(sql, params = []) {

    return new Promise(
        (resolve, reject) => {

            db.get(
                sql,
                params,
                (error, row) => {

                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(row);
                }
            );
        }
    );
}

function all(sql, params = []) {

    return new Promise(
        (resolve, reject) => {

            db.all(
                sql,
                params,
                (error, rows) => {

                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(rows || []);
                }
            );
        }
    );
}

// ==========================================
// DATABASE TABLES
// ==========================================

async function createDatabaseTables() {

   await run(`
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    class TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    rfid_card_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

await run(`
  ALTER TABLE students
  ADD COLUMN rfid_card_id TEXT
`).catch(error => {
  if (!error.message.includes("duplicate column name")) {
    throw error;
  }
});

    console.log(
        "✅ Students table ready."
    );

    await run(`
        CREATE TABLE IF NOT EXISTS parents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            email TEXT,
            password TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log(
        "✅ Parents table ready."
    );

    await run(`
        CREATE TABLE IF NOT EXISTS parent_student_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(parent_id),
            UNIQUE(student_id),
            FOREIGN KEY(parent_id) REFERENCES parents(id),
            FOREIGN KEY(student_id) REFERENCES students(id)
        )
    `);

    console.log(
        "✅ Parent-student links table ready."
    );

    await run(`
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            reference_id TEXT UNIQUE NOT NULL,

            external_id TEXT UNIQUE NOT NULL,

            student_id TEXT NOT NULL,

            payer_phone TEXT NOT NULL,

            payer_name TEXT,

            requested_amount INTEGER NOT NULL,

            service_fee INTEGER NOT NULL,

            charged_amount INTEGER NOT NULL,

            wallet_credit INTEGER NOT NULL,

            currency TEXT NOT NULL,

            status TEXT NOT NULL DEFAULT 'PENDING',

            credited INTEGER NOT NULL DEFAULT 0,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            completed_at DATETIME
        )
    `);

    console.log(
        "✅ Payments table ready."
    );

    // Add payer_name column if missing
    await run(`
        ALTER TABLE payments ADD COLUMN payer_name TEXT
    `).catch(error => {
        if (!error.message.includes("duplicate column name")) {
            throw error;
        }
    });

    await run(`
        CREATE TABLE IF NOT EXISTS wallet_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            student_id TEXT NOT NULL,

            payment_reference TEXT UNIQUE NOT NULL,

            type TEXT NOT NULL,

            amount INTEGER NOT NULL,

            balance_before INTEGER NOT NULL,

            balance_after INTEGER NOT NULL,

            description TEXT,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log(
        "✅ Wallet transactions table ready."
    );

    await run(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id TEXT NOT NULL,
            student_id TEXT,
            type TEXT NOT NULL DEFAULT 'GENERAL',
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            read_flag INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log(
        "✅ Notifications table ready."
    );

    // Add type column if missing
    await run(`
        ALTER TABLE notifications ADD COLUMN type TEXT NOT NULL DEFAULT 'GENERAL'
    `).catch(error => {
        if (!error.message.includes("duplicate column name")) {
            throw error;
        }
    });

    await run(`
        CREATE TABLE IF NOT EXISTS canteen_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            price INTEGER NOT NULL,
            description TEXT,
            category TEXT DEFAULT 'GENERAL',
            active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log(
        "✅ Canteen items table ready."
    );

    // Add category column if missing
    await run(`
        ALTER TABLE canteen_items ADD COLUMN category TEXT DEFAULT 'GENERAL'
    `).catch(error => {
        if (!error.message.includes("duplicate column name")) {
            throw error;
        }
    });

    await run(`
        CREATE TABLE IF NOT EXISTS canteen_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            item_id INTEGER NOT NULL,
            item_name TEXT NOT NULL,
            amount INTEGER NOT NULL,
            balance_before INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'SUCCESS',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log(
        "✅ Canteen transactions table ready."
    );

    await run(`
        CREATE TABLE IF NOT EXISTS library_books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            isbn TEXT,
            category TEXT DEFAULT 'GENERAL',
            quantity INTEGER NOT NULL DEFAULT 1,
            available INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log(
        "✅ Library books table ready."
    );

    // Add new columns if missing
    await run(`
        ALTER TABLE library_books ADD COLUMN category TEXT DEFAULT 'GENERAL'
    `).catch(error => {
        if (!error.message.includes("duplicate column name")) {
            throw error;
        }
    });

    await run(`
        ALTER TABLE library_books ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1
    `).catch(error => {
        if (!error.message.includes("duplicate column name")) {
            throw error;
        }
    });

    await run(`
        ALTER TABLE library_books ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'
    `).catch(error => {
        if (!error.message.includes("duplicate column name")) {
            throw error;
        }
    });

    await run(`
        CREATE TABLE IF NOT EXISTS library_loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            book_id INTEGER NOT NULL,
            book_title TEXT NOT NULL,
            borrow_date TEXT NOT NULL,
            expected_return_date TEXT,
            actual_return_date TEXT,
            status TEXT NOT NULL DEFAULT 'BORROWED',
            fine_amount INTEGER DEFAULT 0,
            fine_applied_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log(
        "✅ Library loans table ready."
    );

    // Add fine columns if they don't exist (for existing databases)
    await run(`
        ALTER TABLE library_loans ADD COLUMN fine_amount INTEGER DEFAULT 0
    `).catch(error => {
        if (!error.message.includes("duplicate column name")) {
            throw error;
        }
    });

    await run(`
        ALTER TABLE library_loans ADD COLUMN fine_applied_at DATETIME
    `).catch(error => {
        if (!error.message.includes("duplicate column name")) {
            throw error;
        }
    });

    await run(`
        CREATE TABLE IF NOT EXISTS school_activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            activity_type TEXT NOT NULL DEFAULT 'GENERAL',
            event_date TEXT NOT NULL,
            event_time TEXT DEFAULT '00:00',
            location TEXT,
            created_by TEXT,
            target_class TEXT,
            status TEXT NOT NULL DEFAULT 'UPCOMING',
            active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log(
        "✅ School activities table ready."
    );

    // Add status and event_time columns if missing
    await run(`
        ALTER TABLE school_activities ADD COLUMN status TEXT NOT NULL DEFAULT 'UPCOMING'
    `).catch(error => {
        if (!error.message.includes("duplicate column name")) {
            throw error;
        }
    });

    await run(`
        ALTER TABLE school_activities ADD COLUMN event_time TEXT DEFAULT '00:00'
    `).catch(error => {
        if (!error.message.includes("duplicate column name")) {
            throw error;
        }
    });

    await run(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            role TEXT NOT NULL DEFAULT 'ADMIN',
            active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME
        )
    `);

    console.log(
        "✅ Admin users table ready."
    );

    await run(`
        CREATE INDEX IF NOT EXISTS idx_admin_users_username
        ON admin_users(username)
    `);

    console.log(
        "✅ Admin users index ready."
    );
}

// ==========================================
// TEST STUDENT
// ==========================================

async function createTestStudent() {

    const student = await get(
        `
        SELECT id
        FROM students
        WHERE id = ?
        `,
        ["ST20260001"]
    );

    if (student) {

        console.log(
            "✅ Test student already exists."
        );

        return;
    }

    await run(
        `
        INSERT INTO students
        (id, name, class, balance)
        VALUES (?, ?, ?, ?)
        `,
        [
            "ST20260001",
            "Jean Claude",
            "S4 MPC",
            15000
        ]
    );

    console.log(
        "✅ Test student created: ST20260001"
    );
}

// ==========================================
// DATABASE INITIALIZATION
// ==========================================

async function initializeDatabase() {

    console.log(
        "=========================================="
    );

    console.log(
        "Initializing SmartCard L.D.K database..."
    );

    console.log(
        "=========================================="
    );

    await createDatabaseTables();

    await createTestStudent();

    await ensureDefaultAdmin();

    console.log(
        "=========================================="
    );

    console.log(
        "✅ SmartCard L.D.K database initialized."
    );

    console.log(
        "=========================================="
    );
}

// ==========================================
// ROOT ENDPOINT
// ==========================================

app.get("/", (req, res) => {

    res.json({

        success: true,

        message:
            "SmartCard L.D.K backend is running.",

        paymentProvider:
            "MTN MoMo",

        walletCurrency:
            WALLET_CURRENCY,

        momoCurrency:
            MOMO_CURRENCY,

        environment:
            momoConfig.targetEnvironment,

        serviceFee:
            SERVICE_FEE,

        port:
            PORT
    });
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get(
    "/api/health",
    async (req, res) => {

        try {

            const result =
                await get(
                    `SELECT 1 AS connected`
                );

            res.json({

                success: true,

                database:
                    result?.connected === 1
                        ? "SQLite connected"
                        : "SQLite unavailable",

                paymentProvider:
                    "MTN MoMo",

                walletCurrency:
                    WALLET_CURRENCY,

                momoCurrency:
                    MOMO_CURRENCY,

                environment:
                    momoConfig.targetEnvironment,

                serviceFee:
                    SERVICE_FEE
            });

        } catch (error) {

            console.error(
                "❌ Health check failed:",
                error.message
            );

            res.status(500).json({

                success: false,

                message:
                    "Database health check failed."
            });
        }
    }
);

app.post("/api/parents/register", async (req, res) => {
    try {
        const parentId = String(req.body.parentId || req.body.id || "").trim();
        const name = String(req.body.name || "").trim();
        const phone = String(req.body.phone || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!name || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: "Parent name, phone number and password are required."
            });
        }

        if (!/^07\d{8}$/.test(phone)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid Rwanda phone number."
            });
        }

        const parentRecordId = parentId || `PARENT-${Date.now()}`;

        const existingParent = await get(
            `SELECT id, name, phone, email FROM parents WHERE phone = ? OR id = ?`,
            [phone, parentRecordId]
        );

        if (existingParent) {
            return res.status(200).json({
                success: true,
                parent: {
                    id: existingParent.id,
                    name: existingParent.name,
                    phone: existingParent.phone,
                    email: existingParent.email || ""
                },
                message: "Parent account already exists."
            });
        }

        await run(
            `INSERT INTO parents (id, name, phone, email, password) VALUES (?, ?, ?, ?, ?)`,
            [parentRecordId, name, phone, email || null, hashPassword(password)]
        );

        return res.status(201).json({
            success: true,
            parent: {
                id: parentRecordId,
                name,
                phone,
                email
            },
            message: "Parent account created successfully."
        });
    } catch (error) {
        console.error("Parent registration error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not create the parent account."
        });
    }
});

// Parent login
app.post("/api/parents/login", async (req, res) => {
    try {
        const phone = String(req.body.phone || "").trim();
        const password = String(req.body.password || "");

        if (!phone || !password) {
            return res.status(400).json({
                success: false,
                message: "Phone and password are required."
            });
        }

        const parentRecord = await get(
            `SELECT id, name, phone, email, password FROM parents WHERE phone = ?`,
            [phone]
        );

        if (!parentRecord) {
            return res.status(401).json({
                success: false,
                message: "Invalid phone number or password."
            });
        }

        if (!verifyPassword(password, parentRecord.password)) {
            return res.status(401).json({
                success: false,
                message: "Invalid phone number or password."
            });
        }

        const token = generateToken();
        await run(
            `UPDATE parents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [parentRecord.id]
        );

        return res.json({
            success: true,
            token,
            parent: {
                id: parentRecord.id,
                name: parentRecord.name,
                phone: parentRecord.phone,
                email: parentRecord.email || ""
            }
        });
    } catch (error) {
        console.error("Parent login error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not process login request."
        });
    }
});

app.post("/api/parents/link-student", async (req, res) => {
    try {
        const parentId = String(req.body.parentId || req.body.parent_id || "").trim();
        const studentId = String(req.body.studentId || req.body.student_id || "").trim();

        if (!parentId || !studentId) {
            return res.status(400).json({
                success: false,
                message: "Parent ID and student ID are required."
            });
        }

        const parent = await get(
            `SELECT id, name, phone FROM parents WHERE id = ?`,
            [parentId]
        );

        if (!parent) {
            return res.status(404).json({
                success: false,
                message: "Parent account was not found."
            });
        }

        const student = await get(
            `SELECT id, name, class, balance FROM students WHERE id = ?`,
            [studentId]
        );

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        const existingParentLink = await get(
            `SELECT student_id FROM parent_student_links WHERE parent_id = ?`,
            [parentId]
        );

        if (existingParentLink && existingParentLink.student_id !== studentId) {
            return res.status(409).json({
                success: false,
                message: "This parent is already linked to another student."
            });
        }

        const studentAlreadyLinked = await get(
            `SELECT parent_id FROM parent_student_links WHERE student_id = ?`,
            [studentId]
        );

        if (studentAlreadyLinked && studentAlreadyLinked.parent_id !== parentId) {
            return res.status(409).json({
                success: false,
                message: "This student is already linked to another parent."
            });
        }

        const existingLink = await get(
            `SELECT id FROM parent_student_links WHERE parent_id = ? AND student_id = ?`,
            [parentId, studentId]
        );

        if (existingLink) {
            return res.status(200).json({
                success: true,
                message: "Student is already linked to this parent.",
                linkedStudent: {
                    studentId: student.id,
                    name: student.name,
                    class: student.class,
                    balance: Number(student.balance || 0)
                }
            });
        }

        await run(
            `INSERT INTO parent_student_links (parent_id, student_id) VALUES (?, ?)`,
            [parentId, studentId]
        );

        return res.status(200).json({
            success: true,
            message: "Student linked successfully.",
            linkedStudent: {
                studentId: student.id,
                name: student.name,
                class: student.class,
                balance: Number(student.balance || 0)
            }
        });
    } catch (error) {
        console.error("Parent-student link error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not link the student to the parent."
        });
    }
});

app.get("/api/parents/:parentId/student", async (req, res) => {
    try {
        const parentId = String(req.params.parentId || "").trim();

        if (!parentId) {
            return res.status(400).json({
                success: false,
                message: "Parent ID is required."
            });
        }

        const link = await get(
            `SELECT student_id FROM parent_student_links WHERE parent_id = ?`,
            [parentId]
        );

        if (!link) {
            return res.json({
                success: true,
                linkedStudent: null,
                message: "No student linked."
            });
        }

        const student = await get(
            `SELECT id, name, class, balance FROM students WHERE id = ?`,
            [link.student_id]
        );

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Linked student record was not found."
            });
        }

        return res.json({
            success: true,
            linkedStudent: {
                studentId: student.id,
                name: student.name,
                class: student.class,
                balance: Number(student.balance || 0)
            }
        });
    } catch (error) {
        console.error("Parent student lookup error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not fetch the linked student."
        });
    }
});

app.delete("/api/parents/:parentId/student", async (req, res) => {
    try {
        const parentId = String(req.params.parentId || "").trim();

        if (!parentId) {
            return res.status(400).json({
                success: false,
                message: "Parent ID is required."
            });
        }

        const link = await get(
            `SELECT student_id FROM parent_student_links WHERE parent_id = ?`,
            [parentId]
        );

        if (!link) {
            return res.json({
                success: true,
                message: "No student link to remove."
            });
        }

        await run(
            `DELETE FROM parent_student_links WHERE parent_id = ?`,
            [parentId]
        );

        return res.json({
            success: true,
            message: "Student link removed successfully."
        });
    } catch (error) {
        console.error("Remove parent-student link error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not remove the student link."
        });
    }
});

async function createParentNotification(parentId, studentId, title, message, type = "GENERAL") {
    if (!parentId) {
        return null;
    }

    try {
        const result = await run(
            `
            INSERT INTO notifications (parent_id, student_id, type, title, message, read_flag)
            VALUES (?, ?, ?, ?, ?, 0)
            `,
            [parentId, studentId || null, type, title, message]
        );

        return result;
    } catch (error) {
        console.error("Parent notification create error:", error.message);
        return null;
    }
}

app.get("/api/parents/me", verifyParentToken, async (req, res) => {
    try {
        const parent = req.parent;
        const link = await get(
            `SELECT student_id FROM parent_student_links WHERE parent_id = ?`,
            [parent.id]
        );

        let linkedStudent = null;
        if (link?.student_id) {
            const student = await get(
                `SELECT id, name, class, balance FROM students WHERE id = ?`,
                [link.student_id]
            );
            if (student) {
                linkedStudent = {
                    studentId: student.id,
                    name: student.name,
                    class: student.class,
                    balance: Number(student.balance || 0)
                };
            }
        }

        return res.json({
            success: true,
            parent: {
                id: parent.id,
                name: parent.name,
                phone: parent.phone,
                email: parent.email || ""
            },
            linkedStudent
        });
    } catch (error) {
        console.error("Parent me error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not retrieve parent information."
        });
    }
});

app.get("/api/parents/me/notifications", verifyParentToken, async (req, res) => {
    try {
        const parentId = req.parent.id;
        const notifications = await all(
            `SELECT id, parent_id, student_id, type, title, message, read_flag, created_at FROM notifications WHERE parent_id = ? ORDER BY created_at DESC LIMIT 50`,
            [parentId]
        );

        return res.json({
            success: true,
            notifications: notifications.map(n => ({
                id: n.id,
                parentId: n.parent_id,
                studentId: n.student_id,
                type: n.type,
                title: n.title,
                message: n.message,
                read: Boolean(n.read_flag),
                createdAt: n.created_at
            }))
        });
    } catch (error) {
        console.error("Parent notifications error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not retrieve notifications."
        });
    }
});

app.put("/api/notifications/:notificationId/read", verifyParentToken, async (req, res) => {
    try {
        const notificationId = Number(req.params.notificationId || 0);
        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: "Notification ID is required."
            });
        }

        const notification = await get(
            `SELECT id, parent_id FROM notifications WHERE id = ?`,
            [notificationId]
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found."
            });
        }

        if (notification.parent_id !== req.parent.id) {
            return res.status(403).json({
                success: false,
                message: "Access denied."
            });
        }

        await run(
            `UPDATE notifications SET read_flag = 1 WHERE id = ?`,
            [notificationId]
        );

        return res.json({
            success: true,
            message: "Notification marked as read."
        });
    } catch (error) {
        console.error("Mark read error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not mark notification as read."
        });
    }
});

app.put("/api/notifications/read-all", verifyParentToken, async (req, res) => {
    try {
        await run(
            `UPDATE notifications SET read_flag = 1 WHERE parent_id = ?`,
            [req.parent.id]
        );
        return res.json({
            success: true,
            message: "All notifications marked as read."
        });
    } catch (error) {
        console.error("Mark all read error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not mark notifications as read."
        });
    }
});

app.post("/api/parents/:parentId/notifications", async (req, res) => {
    try {
        const parentId = String(req.params.parentId || "").trim();
        const title = String(req.body.title || "").trim();
        const message = String(req.body.message || "").trim();
        const type = String(req.body.type || "GENERAL").trim();
        const studentId = String(req.body.studentId || "").trim() || null;

        if (!parentId || !title || !message) {
            return res.status(400).json({
                success: false,
                message: "Parent ID, title and message are required."
            });
        }

        const result = await run(
            `
            INSERT INTO notifications (parent_id, student_id, title, message, type, read_flag)
            VALUES (?, ?, ?, ?, ?, 0)
            `,
            [parentId, studentId, title, message, type]
        );

        return res.status(201).json({
            success: true,
            message: "Notification created successfully.",
            notification: {
                id: result.id,
                parentId,
                studentId,
                title,
                message,
                type,
                read: false
            }
        });
    } catch (error) {
        console.error("Create notification error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not create notification."
        });
    }
});

app.get("/api/canteen/items", async (req, res) => {
    try {
        const items = await all(
            `
            SELECT id, name, price, description, active, created_at
            FROM canteen_items
            WHERE active = 1
            ORDER BY name COLLATE NOCASE ASC
            `
        );

        return res.json({
            success: true,
            items: items.map((item) => ({
                id: item.id,
                name: item.name,
                price: Number(item.price || 0),
                description: item.description || "",
                active: Boolean(item.active),
                createdAt: item.created_at
            }))
        });
    } catch (error) {
        console.error("Canteen items fetch error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not fetch canteen items."
        });
    }
});

app.get("/api/library/books", async (req, res) => {
    try {
        const books = await all(
            `
            SELECT id, title, author, isbn, available, created_at
            FROM library_books
            ORDER BY title COLLATE NOCASE ASC
            `
        );

        return res.json({
            success: true,
            books: books.map((book) => ({
                id: book.id,
                title: book.title,
                author: book.author,
                isbn: book.isbn || "",
                available: Boolean(book.available),
                createdAt: book.created_at
            }))
        });
    } catch (error) {
        console.error("Library books fetch error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not fetch library books."
        });
    }
});

app.post("/api/library/books", async (req, res) => {
    try {
        const title = String(req.body.title || "").trim();
        const author = String(req.body.author || "").trim();
        const isbn = String(req.body.isbn || "").trim();

        if (!title || !author) {
            return res.status(400).json({
                success: false,
                message: "Book title and author are required."
            });
        }

        const result = await run(
            `
            INSERT INTO library_books (title, author, isbn, available)
            VALUES (?, ?, ?, 1)
            `,
            [title, author, isbn || null]
        );

        return res.status(201).json({
            success: true,
            book: {
                id: result.id,
                title,
                author,
                isbn: isbn || "",
                available: true
            },
            message: "Library book added successfully."
        });
    } catch (error) {
        console.error("Create library book error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not create library book."
        });
    }
});

app.post("/api/library/borrow", async (req, res) => {
    try {
        const studentId = String(req.body.studentId || "").trim();
        const bookId = Number(req.body.bookId || 0);

        if (!studentId || !bookId) {
            return res.status(400).json({
                success: false,
                message: "Student ID and book ID are required."
            });
        }

        const student = await get(
            `SELECT id, name, class FROM students WHERE id = ?`,
            [studentId]
        );

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        const book = await get(
            `SELECT id, title, author, available FROM library_books WHERE id = ?`,
            [bookId]
        );

        if (!book) {
            return res.status(404).json({
                success: false,
                message: "Book not found."
            });
        }

        if (book.available !== 1) {
            return res.status(400).json({
                success: false,
                message: "This book is currently unavailable."
            });
        }

        const borrowDate = new Date().toISOString().split("T")[0];
        const expectedReturnDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

        const result = await run(
            `
            INSERT INTO library_loans (student_id, book_id, book_title, borrow_date, expected_return_date, actual_return_date, status)
            VALUES (?, ?, ?, ?, ?, NULL, 'BORROWED')
            `,
            [studentId, bookId, book.title, borrowDate, expectedReturnDate]
        );

        await run(
            `UPDATE library_books SET available = 0 WHERE id = ?`,
            [bookId]
        );

        return res.status(201).json({
            success: true,
            loan: {
                id: result.id,
                studentId,
                studentName: student.name,
                bookId: book.id,
                bookTitle: book.title,
                borrowDate,
                expectedReturnDate,
                status: "BORROWED"
            },
            message: "Book borrowed successfully."
        });
    } catch (error) {
        console.error("Library borrow error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not borrow the book."
        });
    }
});

app.post("/api/library/return", async (req, res) => {
    try {
        const loanId = Number(req.body.loanId || 0);

        if (!loanId) {
            return res.status(400).json({
                success: false,
                message: "Loan ID is required."
            });
        }

        const loan = await get(
            `SELECT id, book_id, book_title, student_id, status FROM library_loans WHERE id = ?`,
            [loanId]
        );

        if (!loan) {
            return res.status(404).json({
                success: false,
                message: "Loan not found."
            });
        }

        if (loan.status === "RETURNED") {
            return res.status(400).json({
                success: false,
                message: "This book has already been returned."
            });
        }

        const returnDate = new Date().toISOString().split("T")[0];

        await run(
            `
            UPDATE library_loans
            SET actual_return_date = ?, status = 'RETURNED'
            WHERE id = ?
            `,
            [returnDate, loanId]
        );

        await run(
            `UPDATE library_books SET available = 1 WHERE id = ?`,
            [loan.book_id]
        );

        return res.json({
            success: true,
            message: "Book returned successfully.",
            loan: {
                id: loan.id,
                bookId: loan.book_id,
                bookTitle: loan.book_title,
                studentId: loan.student_id,
                status: "RETURNED",
                returnDate
            }
        });
    } catch (error) {
        console.error("Library return error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not return the book."
        });
    }
});

app.get("/api/students/:studentId/library", async (req, res) => {
    try {
        const studentId = String(req.params.studentId || "").trim();

        if (!studentId) {
            return res.status(400).json({
                success: false,
                message: "Student ID is required."
            });
        }

        const loans = await all(
            `
            SELECT id, book_id, book_title, borrow_date, expected_return_date, actual_return_date, status, fine_amount, fine_applied_at
            FROM library_loans
            WHERE student_id = ?
            ORDER BY id DESC
            `,
            [studentId]
        );

        const today = new Date().toISOString().split("T")[0];

        return res.json({
            success: true,
            loans: loans.map((loan) => {
                const expectedDate = new Date(loan.expected_return_date);
                const daysOverdue = Math.max(0, Math.floor((new Date(today) - expectedDate) / (1000 * 60 * 60 * 24)));
                const fine = daysOverdue * 50;
                return {
                    id: loan.id,
                    bookId: loan.book_id,
                    bookTitle: loan.book_title,
                    borrowDate: loan.borrow_date,
                    expectedReturnDate: loan.expected_return_date,
                    actualReturnDate: loan.actual_return_date,
                    status: daysOverdue > 0 ? "OVERDUE" : loan.status,
                    daysOverdue,
                    fine,
                    fineAmount: Number(loan.fine_amount || 0),
                    fineAppliedAt: loan.fine_applied_at || null
                };
            })
        });
    } catch (error) {
        console.error("Student library history error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not retrieve library history."
        });
    }
});

app.get("/api/library/loans", async (req, res) => {
    try {
        const loans = await all(
            `
            SELECT loans.id, loans.student_id, students.name AS student_name,
                   loans.book_id, loans.book_title, loans.borrow_date,
                   loans.expected_return_date, loans.actual_return_date, loans.status
            FROM library_loans AS loans
            LEFT JOIN students ON students.id = loans.student_id
            ORDER BY loans.id DESC
            `
        );

        return res.json({
            success: true,
            loans: loans.map((loan) => {
                const today = new Date().toISOString().split("T")[0];
                const expectedDate = new Date(loan.expected_return_date);
                const daysOverdue = Math.max(0, Math.floor((new Date(today) - expectedDate) / (1000 * 60 * 60 * 24)));
                const fine = daysOverdue * 50;
                return {
                    id: loan.id,
                    studentId: loan.student_id,
                    studentName: loan.student_name || loan.student_id,
                    bookId: loan.book_id,
                    bookTitle: loan.book_title,
                    borrowDate: loan.borrow_date,
                    expectedReturnDate: loan.expected_return_date,
                    actualReturnDate: loan.actual_return_date,
                    status: daysOverdue > 0 ? "OVERDUE" : loan.status,
                    daysOverdue,
                    fine,
                    fineAmount: Number(loan.fine_amount || 0)
                };
            })
        });
    } catch (error) {
        console.error("Library loans fetch error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not fetch library loans."
        });
    }
});

// ==========================================
// ADMIN PARENT MANAGEMENT
// ==========================================

app.get("/api/admin/parents", async (req, res) => {
    try {
        const parents = await all(`
            SELECT p.id, p.name, p.phone, p.email, p.created_at,
                   pls.student_id, s.name AS student_name, s.class AS student_class
            FROM parents p
            LEFT JOIN parent_student_links pls ON pls.parent_id = p.id
            LEFT JOIN students s ON s.id = pls.student_id
            ORDER BY p.name COLLATE NOCASE ASC
        `);

        return res.json({
            success: true,
            parents: parents.map(parent => ({
                id: parent.id,
                name: parent.name,
                phone: parent.phone,
                email: parent.email || "",
                status: "Active",
                linkedStudent: parent.student_id ? {
                    studentId: parent.student_id,
                    name: parent.student_name || "Unknown",
                    class: parent.student_class || "N/A"
                } : null,
                createdAt: parent.created_at
            }))
        });
    } catch (error) {
        console.error("Admin parents error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not retrieve parents."
        });
    }
});

app.put("/api/library/books/:bookId", async (req, res) => {
    try {
        const bookId = Number(req.params.bookId || 0);
        if (!bookId) {
            return res.status(400).json({
                success: false,
                message: "Book ID is required."
            });
        }

        const existing = await get(`SELECT id FROM library_books WHERE id = ?`, [bookId]);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Book not found."
            });
        }

        const title = String(req.body.title || "").trim();
        const author = String(req.body.author || "").trim();
        const isbn = String(req.body.isbn || "").trim();
        const available = req.body.available !== undefined ? Number(req.body.available) : 1;

        if (!title || !author) {
            return res.status(400).json({
                success: false,
                message: "Book title and author are required."
            });
        }

        await run(`
            UPDATE library_books
            SET title = ?, author = ?, isbn = ?, available = ?
            WHERE id = ?
        `, [title, author, isbn || null, available, bookId]);

        const updated = await get(`
            SELECT id, title, author, isbn, available, created_at
            FROM library_books WHERE id = ?
        `, [bookId]);

        return res.json({
            success: true,
            book: {
                id: updated.id,
                title: updated.title,
                author: updated.author,
                isbn: updated.isbn || "",
                available: Boolean(updated.available),
                createdAt: updated.created_at
            },
            message: "Book updated successfully."
        });
    } catch (error) {
        console.error("Library book update error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not update book."
        });
    }
});

app.delete("/api/library/books/:bookId", async (req, res) => {
    try {
        const bookId = Number(req.params.bookId || 0);
        if (!bookId) {
            return res.status(400).json({
                success: false,
                message: "Book ID is required."
            });
        }

        const existing = await get(`SELECT id FROM library_books WHERE id = ?`, [bookId]);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Book not found."
            });
        }

        const activeLoans = await get(`
            SELECT id FROM library_loans
            WHERE book_id = ? AND status = 'BORROWED'
        `, [bookId]);

        if (activeLoans) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete book with active loans. Return all copies first."
            });
        }

        await run(`DELETE FROM library_books WHERE id = ?`, [bookId]);

        return res.json({
            success: true,
            message: "Book deleted successfully."
        });
    } catch (error) {
        console.error("Library book delete error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not delete book."
        });
    }
});

app.get("/api/library/overdue", async (req, res) => {
    try {
        const today = new Date().toISOString().split("T")[0];
        const loans = await all(`
            SELECT loans.id, loans.student_id, students.name AS student_name,
                   loans.book_id, loans.book_title, loans.borrow_date,
                   loans.expected_return_date, loans.actual_return_date, loans.status
            FROM library_loans AS loans
            LEFT JOIN students ON students.id = loans.student_id
            WHERE loans.status = 'BORROWED'
            ORDER BY loans.expected_return_date ASC
        `);

        const overdue = loans.map(loan => {
            const expectedDate = new Date(loan.expected_return_date);
            const daysOverdue = Math.max(0, Math.floor((new Date(today) - expectedDate) / (1000 * 60 * 60 * 24)));
            const fine = daysOverdue * 50;
            return {
                id: loan.id,
                studentId: loan.student_id,
                studentName: loan.student_name || loan.student_id,
                bookId: loan.book_id,
                bookTitle: loan.book_title,
                borrowDate: loan.borrow_date,
                expectedReturnDate: loan.expected_return_date,
                daysOverdue,
                fine,
                status: daysOverdue > 0 ? "OVERDUE" : "BORROWED"
            };
        });

        return res.json({
            success: true,
            loans: overdue
        });
    } catch (error) {
        console.error("Library overdue error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not fetch overdue loans."
        });
    }
});

app.post("/api/library/loans/:loanId/fine", async (req, res) => {
    try {
        const loanId = Number(req.params.loanId || 0);
        if (!loanId) {
            return res.status(400).json({
                success: false,
                message: "Loan ID is required."
            });
        }

        const existing = await get(`SELECT id FROM library_loans WHERE id = ?`, [loanId]);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Loan not found."
            });
        }

        const fineAmount = Number(req.body.fineAmount || 0);
        if (!Number.isInteger(fineAmount) || fineAmount < 0) {
            return res.status(400).json({
                success: false,
                message: "Fine amount must be a non-negative whole number."
            });
        }

        const loan = await get(`
            SELECT student_id, book_title, expected_return_date
            FROM library_loans WHERE id = ?
        `, [loanId]);

        const today = new Date().toISOString().split("T")[0];
        const expectedDate = new Date(loan.expected_return_date);
        const daysOverdue = Math.max(0, Math.floor((new Date(today) - expectedDate) / (1000 * 60 * 60 * 24)));

        await run(`
            UPDATE library_loans
            SET fine_amount = ?, fine_applied_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [fineAmount, loanId]);

        return res.json({
            success: true,
            message: "Fine applied successfully.",
            loanId,
            fineAmount,
            daysOverdue
        });
    } catch (error) {
        console.error("Apply fine error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not apply fine."
        });
    }
});

app.post("/api/canteen/items", async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const price = Number(req.body.price || 0);
        const description = String(req.body.description || "").trim();

        if (!name || !Number.isInteger(price) || price <= 0) {
            return res.status(400).json({
                success: false,
                message: "Item name and valid price are required."
            });
        }

        const existingItem = await get(
            `SELECT id FROM canteen_items WHERE name = ?`,
            [name]
        );

        if (existingItem) {
            return res.status(409).json({
                success: false,
                message: "A canteen item with this name already exists."
            });
        }

        const result = await run(
            `
            INSERT INTO canteen_items (name, price, description, active)
            VALUES (?, ?, ?, 1)
            `,
            [name, price, description]
        );

        return res.status(201).json({
            success: true,
            item: {
                id: result.id,
                name,
                price,
                description,
                active: true
            },
            message: "Canteen item created successfully."
        });
    } catch (error) {
        console.error("Create canteen item error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not create the canteen item."
        });
    }
});

app.post("/api/canteen/purchase", async (req, res) => {
    try {
        const studentId = String(req.body.studentId || "").trim();
        const itemId = Number(req.body.itemId || 0);
        const itemName = String(req.body.itemName || "").trim();

        if (!studentId || (!itemId && !itemName)) {
            return res.status(400).json({
                success: false,
                message: "Student ID and item are required."
            });
        }

        const student = await get(
            `SELECT id, name, class, balance FROM students WHERE id = ?`,
            [studentId]
        );

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        const item = itemId
            ? await get(`SELECT id, name, price, description FROM canteen_items WHERE id = ? AND active = 1`, [itemId])
            : await get(`SELECT id, name, price, description FROM canteen_items WHERE name = ? AND active = 1`, [itemName]);

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Canteen item was not found."
            });
        }

        const amount = Number(item.price || 0);
        const balanceBefore = Number(student.balance || 0);

        if (amount > balanceBefore) {
            return res.status(400).json({
                success: false,
                message: "Insufficient wallet balance for this canteen purchase."
            });
        }

        const balanceAfter = balanceBefore - amount;

        await run(
            `UPDATE students SET balance = ? WHERE id = ?`,
            [balanceAfter, studentId]
        );

        const transactionResult = await run(
            `
            INSERT INTO canteen_transactions
            (student_id, item_id, item_name, amount, balance_before, balance_after, status)
            VALUES (?, ?, ?, ?, ?, ?, 'SUCCESS')
            `,
            [studentId, item.id, item.name, amount, balanceBefore, balanceAfter]
        );

        const walletReference = `CANTEEN-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

        await run(
            `
            INSERT INTO wallet_transactions
            (student_id, payment_reference, type, amount, balance_before, balance_after, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
                studentId,
                walletReference,
                "CANTEEN",
                amount,
                balanceBefore,
                balanceAfter,
                `Canteen purchase: ${item.name}`
            ]
        );

        const parentLink = await get(
            `SELECT parent_id FROM parent_student_links WHERE student_id = ?`,
            [studentId]
        );

        if (parentLink?.parent_id) {
            await createParentNotification(
                parentLink.parent_id,
                studentId,
                "Canteen purchase",
                `${student.name} purchased ${item.name} for ${amount.toLocaleString()} RWF. Remaining wallet: ${balanceAfter.toLocaleString()} RWF.`,
                "CANTEEN"
            );
        }

        return res.json({
            success: true,
            transactionId: transactionResult.id,
            message: "Canteen purchase successful.",
            purchase: {
                studentId,
                studentName: student.name,
                itemId: item.id,
                itemName: item.name,
                amount,
                balanceBefore,
                balanceAfter,
                status: "SUCCESS"
            }
        });
    } catch (error) {
        console.error("Canteen purchase error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not process the canteen purchase."
        });
    }
});

app.get("/api/canteen/transactions", async (req, res) => {
    try {
        const transactions = await all(
            `
            SELECT c.id, c.student_id, c.item_id, c.item_name, c.amount, c.balance_before, c.balance_after, c.status, c.created_at, s.name AS student_name, s.class
            FROM canteen_transactions c
            LEFT JOIN students s ON s.id = c.student_id
            ORDER BY c.id DESC
            `
        );

        return res.json({
            success: true,
            transactions: transactions.map((transaction) => ({
                id: transaction.id,
                studentId: transaction.student_id,
                studentName: transaction.student_name || "Unknown",
                class: transaction.class || "N/A",
                itemId: transaction.item_id,
                itemName: transaction.item_name,
                amount: Number(transaction.amount || 0),
                balanceBefore: Number(transaction.balance_before || 0),
                balanceAfter: Number(transaction.balance_after || 0),
                status: transaction.status,
                createdAt: transaction.created_at
            }))
        });
    } catch (error) {
        console.error("Canteen transaction fetch error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not fetch canteen transactions."
        });
    }
});

app.get("/api/students/:studentId/canteen", async (req, res) => {
    try {
        const studentId = String(req.params.studentId || "").trim();

        if (!studentId) {
            return res.status(400).json({
                success: false,
                message: "Student ID is required."
            });
        }

        const student = await get(
            `SELECT id, name, class FROM students WHERE id = ?`,
            [studentId]
        );

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        const transactions = await all(
            `
            SELECT id, item_id, item_name, amount, balance_before, balance_after, status, created_at
            FROM canteen_transactions
            WHERE student_id = ?
            ORDER BY id DESC
            `,
            [studentId]
        );

        return res.json({
            success: true,
            student: {
                studentId: student.id,
                name: student.name,
                class: student.class
            },
            transactions: transactions.map((transaction) => ({
                id: transaction.id,
                itemId: transaction.item_id,
                itemName: transaction.item_name,
                amount: Number(transaction.amount || 0),
                balanceBefore: Number(transaction.balance_before || 0),
                balanceAfter: Number(transaction.balance_after || 0),
                status: transaction.status,
                createdAt: transaction.created_at
            }))
        });
    } catch (error) {
        console.error("Student canteen history error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not retrieve student canteen history."
        });
    }
});

app.put("/api/parents/:parentId/notifications/:notificationId/read", async (req, res) => {
    try {
        const parentId = String(req.params.parentId || "").trim();
        const notificationId = Number(req.params.notificationId || 0);

        if (!parentId || !notificationId) {
            return res.status(400).json({
                success: false,
                message: "Parent ID and notification ID are required."
            });
        }

        const notification = await get(
            `SELECT id FROM notifications WHERE id = ? AND parent_id = ?`,
            [notificationId, parentId]
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found."
            });
        }

        await run(
            `UPDATE notifications SET read_flag = 1 WHERE id = ? AND parent_id = ?`,
            [notificationId, parentId]
        );

        return res.json({
            success: true,
            message: "Notification marked as read."
        });
    } catch (error) {
        console.error("Read notification error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not update notification."
        });
    }
});

// ==========================================
// SCHOOL ACTIVITIES - STATUS MANAGEMENT
// ==========================================

app.get("/api/activities", async (req, res) => {
    try {
        const status = String(req.query.status || "").toUpperCase();
        let sql = `
            SELECT id, title, description, activity_type, event_date, location, created_by, target_class, active, created_at
            FROM school_activities
            WHERE active = 1
        `;
        const params = [];

        if (status && ["UPCOMING", "ONGOING", "COMPLETED", "CANCELLED"].includes(status)) {
            sql += ` AND status = ?`;
            params.push(status);
        }

        sql += ` ORDER BY event_date DESC`;

        const activities = await all(sql, params);

        return res.json({
            success: true,
            activities: activities.map(activity => ({
                id: activity.id,
                title: activity.title,
                description: activity.description || "",
                activityType: activity.activity_type,
                eventDate: activity.event_date,
                location: activity.location || "",
                createdBy: activity.created_by || "",
                targetClass: activity.target_class || "",
                active: Boolean(activity.active),
                createdAt: activity.created_at
            }))
        });
    } catch (error) {
        console.error("Activities fetch error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not fetch school activities."
        });
    }
});

app.post("/api/activities", authRateLimiter, verifyAdminToken, async (req, res) => {
    try {
        const title = sanitizeString(req.body.title, 200);
        const description = sanitizeString(req.body.description, 1000);
        const activityType = sanitizeString(req.body.activityType || req.body.activity_type || "GENERAL", 50);
        const eventDate = sanitizeString(req.body.eventDate || req.body.event_date || "", 20);
        const eventTime = sanitizeString(req.body.eventTime || req.body.event_time || "00:00", 10);
        const location = sanitizeString(req.body.location, 200);
        const createdBy = sanitizeString(req.body.createdBy || req.body.created_by || "", 100);
        const targetClass = sanitizeString(req.body.targetClass || req.body.target_class || "", 100);
        const status = sanitizeString(req.body.status || "UPCOMING", 20);

        if (!title || !eventDate) {
            return res.status(400).json({
                success: false,
                message: "Activity title and event date are required."
            });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
            return res.status(400).json({
                success: false,
                message: "Event date must be in YYYY-MM-DD format."
            });
        }

        const result = await run(`
            INSERT INTO school_activities (title, description, activity_type, event_date, event_time, location, created_by, target_class, status, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `, [title, description || null, activityType, eventDate, eventTime, location || null, createdBy || null, targetClass || null, status]);

        return res.status(201).json({
            success: true,
            activity: {
                id: result.id,
                title,
                description: description || "",
                activityType,
                eventDate,
                eventTime,
                location: location || "",
                createdBy: createdBy || "",
                targetClass: targetClass || "",
                status,
                active: true
            },
            message: "School activity created successfully."
        });
    } catch (error) {
        console.error("Create activity error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not create school activity."
        });
    }
});

app.put("/api/activities/:activityId", async (req, res) => {
    try {
        const activityId = Number(req.params.activityId || 0);
        if (!activityId) {
            return res.status(400).json({
                success: false,
                message: "Activity ID is required."
            });
        }

        const existing = await get(`SELECT id FROM school_activities WHERE id = ?`, [activityId]);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Activity not found."
            });
        }

        const title = String(req.body.title || "").trim();
        const description = String(req.body.description || "").trim();
        const activityType = String(req.body.activityType || req.body.activity_type || "GENERAL").trim();
        const eventDate = String(req.body.eventDate || req.body.event_date || "").trim();
        const location = String(req.body.location || "").trim();
        const createdBy = String(req.body.createdBy || req.body.created_by || "").trim();
        const targetClass = String(req.body.targetClass || req.body.target_class || "").trim();
        const active = req.body.active !== undefined ? Number(req.body.active) : 1;

        if (title && !eventDate) {
            return res.status(400).json({
                success: false,
                message: "Event date is required when updating title."
            });
        }

        if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
            return res.status(400).json({
                success: false,
                message: "Event date must be in YYYY-MM-DD format."
            });
        }

        await run(`
            UPDATE school_activities
            SET title = COALESCE(?, title),
                description = COALESCE(?, description),
                activity_type = COALESCE(?, activity_type),
                event_date = COALESCE(?, event_date),
                location = COALESCE(?, location),
                created_by = COALESCE(?, created_by),
                target_class = COALESCE(?, target_class),
                active = ?
            WHERE id = ?
        `, [title || null, description || null, activityType || null, eventDate || null, location || null, createdBy || null, targetClass || null, active, activityId]);

        const updated = await get(`
            SELECT id, title, description, activity_type, event_date, location, created_by, target_class, active, created_at
            FROM school_activities WHERE id = ?
        `, [activityId]);

        return res.json({
            success: true,
            activity: {
                id: updated.id,
                title: updated.title,
                description: updated.description || "",
                activityType: updated.activity_type,
                eventDate: updated.event_date,
                location: updated.location || "",
                createdBy: updated.created_by || "",
                targetClass: updated.target_class || "",
                active: Boolean(updated.active),
                createdAt: updated.created_at
            },
            message: "Activity updated successfully."
        });
    } catch (error) {
        console.error("Update activity error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not update activity."
        });
    }
});

app.delete("/api/activities/:activityId", async (req, res) => {
    try {
        const activityId = Number(req.params.activityId || 0);
        if (!activityId) {
            return res.status(400).json({
                success: false,
                message: "Activity ID is required."
            });
        }

        const existing = await get(`SELECT id FROM school_activities WHERE id = ?`, [activityId]);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Activity not found."
            });
        }

        await run(`UPDATE school_activities SET active = 0 WHERE id = ?`, [activityId]);

        return res.json({
            success: true,
            message: "Activity deactivated successfully."
        });
    } catch (error) {
        console.error("Delete activity error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not delete activity."
        });
    }
});

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

async function ensureDefaultAdmin() {
    const username = process.env.ADMIN_USERNAME || "headmaster";
    const password = process.env.ADMIN_PASSWORD || "SmartCard@2026";
    const fullName = process.env.ADMIN_NAME || "Headmaster";

    const existing = await get(
        `SELECT id FROM admin_users WHERE username = ?`,
        [username]
    );

    if (existing) {
        return;
    }

    const passwordHash = hashPassword(password);
    await run(
        `INSERT INTO admin_users (username, password_hash, full_name, role, active) VALUES (?, ?, ?, 'ADMIN', 1)`,
        [username, passwordHash, fullName]
    );

    console.log(`✅ Default admin user '${username}' created.`);
}

app.post("/api/admin/login", authRateLimiter, async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required."
            });
        }

        const admin = await get(
            `SELECT id, username, password_hash, full_name, role, active FROM admin_users WHERE username = ?`,
            [username]
        );

        if (!admin || admin.active !== 1) {
            return res.status(401).json({
                success: false,
                message: "Invalid administrator credentials."
            });
        }

        if (!verifyPassword(password, admin.password_hash)) {
            return res.status(401).json({
                success: false,
                message: "Invalid administrator credentials."
            });
        }

        const token = generateToken();
        await run(
            `UPDATE admin_users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [admin.id]
        );

        return res.json({
            success: true,
            token,
            admin: {
                id: admin.id,
                username: admin.username,
                fullName: admin.full_name || admin.username,
                role: admin.role
            }
        });
    } catch (error) {
        console.error("Admin login error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not process login request."
        });
    }
});

app.post("/api/admin/change-password", async (req, res) => {
    try {
        const token = String(req.body.token || req.headers["x-admin-token"] || "").trim();
        const currentPassword = String(req.body.currentPassword || "").trim();
        const newPassword = String(req.body.newPassword || "").trim();

        if (!token || !currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Token, current password and new password are required."
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 6 characters."
            });
        }

        const admin = await get(
            `SELECT id, password_hash FROM admin_users WHERE id = ?`,
            [token]
        );

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: "Admin session is invalid."
            });
        }

        if (!verifyPassword(currentPassword, admin.password_hash)) {
            return res.status(401).json({
                success: false,
                message: "Current password is incorrect."
            });
        }

        const newHash = hashPassword(newPassword);
        await run(
            `UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [newHash, admin.id]
        );

        return res.json({
            success: true,
            message: "Password changed successfully."
        });
    } catch (error) {
        console.error("Admin password change error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not change password."
        });
    }
});

// ==========================================
// EXPANDED STUDENT MANAGEMENT
// ==========================================

app.put("/api/students/:studentId", async (req, res) => {
    try {
        const studentId = String(req.params.studentId || "").trim();

        if (!studentId) {
            return res.status(400).json({
                success: false,
                message: "Student ID is required."
            });
        }

        const existing = await get(
            `SELECT id FROM students WHERE id = ?`,
            [studentId]
        );

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        const name = String(req.body.name || "").trim();
        const studentClass = String(req.body.class || "").trim();
        const balance = Number(req.body.balance);

        if (name && !studentClass) {
            return res.status(400).json({
                success: false,
                message: "Class is required when updating name."
            });
        }

        if (studentClass && !name) {
            return res.status(400).json({
                success: false,
                message: "Name is required when updating class."
            });
        }

        if (balance !== undefined && (!Number.isInteger(balance) || balance < 0)) {
            return res.status(400).json({
                success: false,
                message: "Balance must be a non-negative whole number."
            });
        }

        await run(`
            UPDATE students
            SET name = COALESCE(?, name),
                class = COALESCE(?, class),
                balance = COALESCE(?, balance)
            WHERE id = ?
        `, [name || null, studentClass || null, balance !== undefined ? balance : null, studentId]);

        const updated = await get(
            `SELECT id, name, class, balance, rfid_card_id, created_at FROM students WHERE id = ?`,
            [studentId]
        );

        return res.json({
            success: true,
            student: {
                id: updated.id,
                studentId: updated.id,
                name: updated.name,
                class: updated.class,
                balance: Number(updated.balance || 0),
                cardId: updated.rfid_card_id || "",
                cardStatus: updated.rfid_card_id ? "Active" : "Not linked",
                createdAt: updated.created_at
            },
            message: "Student updated successfully."
        });
    } catch (error) {
        console.error("Student update error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not update student."
        });
    }
});

app.delete("/api/students/:studentId", async (req, res) => {
    try {
        const studentId = String(req.params.studentId || "").trim();

        if (!studentId) {
            return res.status(400).json({
                success: false,
                message: "Student ID is required."
            });
        }

        const existing = await get(
            `SELECT id FROM students WHERE id = ?`,
            [studentId]
        );

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        const linkedParent = await get(
            `SELECT parent_id FROM parent_student_links WHERE student_id = ?`,
            [studentId]
        );

        if (linkedParent) {
            await run(
                `DELETE FROM parent_student_links WHERE student_id = ?`,
                [studentId]
            );
        }

        await run(
            `DELETE FROM students WHERE id = ?`,
            [studentId]
        );

        return res.json({
            success: true,
            message: "Student deleted successfully."
        });
    } catch (error) {
        console.error("Student delete error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not delete student."
        });
    }
});

app.get("/api/students/:studentId/profile", async (req, res) => {
    try {
        const studentId = String(req.params.studentId || "").trim();

        if (!studentId) {
            return res.status(400).json({
                success: false,
                message: "Student ID is required."
            });
        }

        const student = await get(
            `SELECT id, name, class, balance, rfid_card_id, created_at FROM students WHERE id = ?`,
            [studentId]
        );

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        // Get attendance count
        const attendanceCount = await get(
            `SELECT COUNT(*) as count FROM rfid_attendance WHERE student_id = ? AND type = 'ENTRY'`,
            [studentId]
        );
        const totalScans = await get(
            `SELECT COUNT(*) as count FROM rfid_attendance WHERE student_id = ?`,
            [studentId]
        );

        // Get recent payments
        const payments = await all(
            `SELECT reference_id, requested_amount, service_fee, wallet_credit, status, credited, created_at FROM payments WHERE student_id = ? ORDER BY created_at DESC LIMIT 5`,
            [studentId]
        );

        // Get recent transactions
        const transactions = await all(
            `SELECT type, amount, balance_before, balance_after, description, created_at FROM wallet_transactions WHERE student_id = ? ORDER BY created_at DESC LIMIT 5`,
            [studentId]
        );

        // Get canteen history
        const canteenHistory = await all(
            `SELECT item_name, amount, balance_before, balance_after, status, created_at FROM canteen_transactions WHERE student_id = ? ORDER BY created_at DESC LIMIT 5`,
            [studentId]
        );

        // Get library history
        const libraryHistory = await all(
            `SELECT book_title, borrow_date, expected_return_date, actual_return_date, status FROM library_loans WHERE student_id = ? ORDER BY id DESC LIMIT 5`,
            [studentId]
        );

        // Get notifications
        const notifications = await all(
            `SELECT type, title, message, read_flag, created_at FROM notifications WHERE student_id = ? ORDER BY created_at DESC LIMIT 5`,
            [studentId]
        );

        return res.json({
            success: true,
            profile: {
                student: {
                    id: student.id,
                    studentId: student.id,
                    name: student.name,
                    class: student.class,
                    balance: Number(student.balance || 0),
                    rfidCardId: student.rfid_card_id || null,
                    createdAt: student.created_at
                },
                attendance: {
                    totalEntries: attendanceCount?.count || 0,
                    totalScans: totalScans?.count || 0
                },
                payments: payments.map(p => ({
                    referenceId: p.reference_id,
                    amount: Number(p.requested_amount || 0),
                    serviceFee: Number(p.service_fee || 0),
                    walletCredit: Number(p.wallet_credit || 0),
                    status: p.status,
                    credited: Boolean(p.credited),
                    createdAt: p.created_at
                })),
                transactions: transactions.map(t => ({
                    type: t.type,
                    amount: Number(t.amount || 0),
                    balanceBefore: Number(t.balance_before || 0),
                    balanceAfter: Number(t.balance_after || 0),
                    description: t.description || "",
                    createdAt: t.created_at
                })),
                canteen: canteenHistory.map(c => ({
                    itemName: c.item_name,
                    amount: Number(c.amount || 0),
                    balanceBefore: Number(c.balance_before || 0),
                    balanceAfter: Number(c.balance_after || 0),
                    status: c.status,
                    createdAt: c.created_at
                })),
                library: libraryHistory.map(l => ({
                    bookTitle: l.book_title,
                    borrowDate: l.borrow_date,
                    expectedReturnDate: l.expected_return_date,
                    actualReturnDate: l.actual_return_date,
                    status: l.status
                })),
                notifications: notifications.map(n => ({
                    type: n.type,
                    title: n.title,
                    message: n.message,
                    read: Boolean(n.read_flag),
                    createdAt: n.created_at
                }))
            }
        });
    } catch (error) {
        console.error("Student profile error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not retrieve student profile."
        });
    }
});

// Admin dashboard statistics
app.get("/api/admin/dashboard", async (req, res) => {
    try {
        const stats = {};

        // Student counts
        stats.students = await get(`SELECT COUNT(*) as count FROM students`).then(r => r?.count || 0);
        
        // Parent counts
        stats.parents = await get(`SELECT COUNT(*) as count FROM parents`).then(r => r?.count || 0);
        
        // RFID scans today
        const today = new Date().toISOString().split("T")[0];
        stats.todaysScans = await get(
            `SELECT COUNT(*) as count FROM rfid_attendance WHERE date = ?`,
            [today]
        ).then(r => r?.count || 0);
        
        // Total wallet balance
        stats.totalWalletBalance = await get(
            `SELECT SUM(balance) as total FROM students`
        ).then(r => Number(r?.total || 0));
        
        // Payments today
        stats.todaysPayments = await get(
            `SELECT COUNT(*) as count, SUM(requested_amount) as total FROM payments WHERE date(created_at) = ?`,
            [today]
        ).then(r => ({ count: r?.count || 0, total: Number(r?.total || 0) }));
        
        // Pending payments
        stats.pendingPayments = await get(
            `SELECT COUNT(*) as count FROM payments WHERE status = 'PENDING'`
        ).then(r => r?.count || 0);
        
        // Active canteen items
        stats.canteenItems = await get(
            `SELECT COUNT(*) as count FROM canteen_items WHERE active = 1`
        ).then(r => r?.count || 0);
        
        // Library books
        stats.libraryBooks = await get(
            `SELECT COUNT(*) as count FROM library_books WHERE status = 'ACTIVE'`
        ).then(r => r?.count || 0);
        
        // Active loans
        stats.activeLoans = await get(
            `SELECT COUNT(*) as count FROM library_loans WHERE status = 'BORROWED'`
        ).then(r => r?.count || 0);
        
        // Unread notifications
        stats.unreadNotifications = await get(
            `SELECT COUNT(*) as count FROM notifications WHERE read_flag = 0`
        ).then(r => r?.count || 0);

        return res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error("Admin dashboard error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not retrieve dashboard statistics."
        });
    }
});

app.use(express.static(path.join(__dirname, "..")));

// ==========================================
// START SERVER
// ==========================================

async function startServer() {

    try {

        console.log(
            "📦 Initializing SQLite database..."
        );

        await initializeDatabase();

        console.log(
            "✅ Database initialization complete."
        );

        const server =
            app.listen(
                PORT,
                () => {

                    console.log(
                        "=========================================="
                    );

                    console.log(
                        "🚀 SMARTCARD L.D.K SERVER ONLINE"
                    );

                    console.log(
                        "=========================================="
                    );

                    console.log(
                        "Database: SQLite"
                    );

                    console.log(
                        "Payment provider: MTN MoMo"
                    );

                    console.log(
                        "Wallet currency:",
                        WALLET_CURRENCY
                    );

                    console.log(
                        "MTN currency:",
                        MOMO_CURRENCY
                    );

                    console.log(
                        "MTN environment:",
                        momoConfig.targetEnvironment
                    );

                    console.log(
                        "Service fee:",
                        SERVICE_FEE,
                        WALLET_CURRENCY
                    );

                    console.log(
                        `Server: http://localhost:${PORT}`
                    );

                    console.log(
                        "=========================================="
                    );

                    console.log(
                        "Available API endpoints:"
                    );

                    console.log(
                        "GET  /"
                    );

                    console.log(
                        "GET  /api/health"
                    );

                    console.log(
                        "GET  /api/students/:studentId"
                    );

                    console.log(
                        "POST /api/payments"
                    );

                    console.log(
                        "GET  /api/payments/:referenceId/status"
                    );

                    console.log(
                        "GET  /api/students/:studentId/payments"
                    );

                    console.log(
                        "GET  /api/students/:studentId/transactions"
                    );

                    console.log(
                        "=========================================="
                    );

                    console.log(
                        "Server is listening. Keep this terminal open."
                    );
                }
            );

        server.on(
            "error",
            (error) => {

                console.error(
                    "❌ Server error:",
                    error.message
                );
            }
        );

    } catch (error) {

        console.error(
            "❌ SMARTCARD L.D.K SERVER FAILED"
        );

        console.error(
            error.message
        );

        db.close(
            (closeError) => {

                if (closeError) {

                    console.error(
                        "Database close error:",
                        closeError.message
                    );
                }

                process.exit(1);
            }
        );
    }
}

// ==========================================
// GLOBAL ERROR HANDLING
// ==========================================

process.on(
    "uncaughtException",
    (error) => {

        console.error(
            "❌ Uncaught exception:",
            error
        );
    }
);

process.on(
    "unhandledRejection",
    (error) => {

        console.error(
            "❌ Unhandled rejection:",
            error
        );
    }
);

// ==========================================
// START
// ==========================================

startServer();