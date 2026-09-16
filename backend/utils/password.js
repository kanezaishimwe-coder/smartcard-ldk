// ==========================================
// SMARTCARD L.D.K - PASSWORD HASHING UTILITIES
// ==========================================

const crypto = require("crypto");

const SALT_LENGTH = 16;
const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

function hashPassword(password) {
    if (!password) {
        throw new Error("Password is required.");
    }

    const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
    const hash = crypto.pbkdf2Sync(
        String(password),
        salt,
        ITERATIONS,
        KEY_LENGTH,
        DIGEST
    ).toString("hex");

    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    if (!password || !storedHash) {
        return false;
    }

    const parts = String(storedHash).split(":");
    if (parts.length !== 2) {
        return false;
    }

    const [salt, originalHash] = parts;
    const hash = crypto.pbkdf2Sync(
        String(password),
        salt,
        ITERATIONS,
        KEY_LENGTH,
        DIGEST
    ).toString("hex");

    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(originalHash));
}

function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}

module.exports = {
    hashPassword,
    verifyPassword,
    generateToken
};