// ==========================================
// SMARTCARD L.D.K - MTN MOMO AUTH UTILITIES
// ==========================================

const axios = require("axios");
const crypto = require("crypto");
const momoConfig = require("../config/momo");

async function getAccessToken() {
    const auth = Buffer.from(
        `${momoConfig.apiUser}:${momoConfig.apiKey}`
    ).toString("base64");

    const response = await axios.get(
        `${momoConfig.baseUrl}/collection/token`,
        {
            headers: {
                Authorization: `Basic ${auth}`,
                "Ocp-Apim-Subscription-Key": momoConfig.subscriptionKey,
                "Content-Type": "application/json"
            }
        }
    );

    return response.data.access_token;
}

function generateSecretKey() {
    return crypto.randomBytes(32).toString("hex");
}

module.exports = {
    getAccessToken,
    generateSecretKey
};