// ==========================================
// SMARTCARD L.D.K - MTN MOMO CONFIGURATION
// ==========================================

const env = process.env.MOMO_ENVIRONMENT || "sandbox";

const configs = {
    sandbox: {
        baseUrl: "https://sandbox.momodeveloper.mtn.com",
        currency: "RWF",
        targetEnvironment: "sandbox"
    },
    production: {
        baseUrl: "https://api.mtn.com",
        currency: "RWF",
        targetEnvironment: "production"
    }
};

const momoConfig = {
    ...configs[env],
    subscriptionKey: process.env.MOMO_SUBSCRIPTION_KEY || configs[env].subscriptionKey || "",
    apiUser: process.env.MOMO_API_USER || configs[env].apiUser || "",
    apiKey: process.env.MOMO_API_KEY || configs[env].apiKey || ""
};

module.exports = momoConfig;