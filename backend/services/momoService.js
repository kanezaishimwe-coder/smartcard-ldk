// ==========================================
// SMARTCARD L.D.K - MTN MOMO SERVICE
// ==========================================

const axios = require("axios");
const crypto = require("crypto");

const momoConfig = require("../config/momo");
const { getAccessToken } = require("../utils/momoAuth");

// ==========================================
// CREATE MTN MOMO PAYMENT
// ==========================================

async function requestToPay({
    amount,
    phone,
    externalId,
    payerMessage = "SmartCard L.D.K payment",
    payeeNote = "SmartCard L.D.K wallet funding"
}) {
    if (!amount) {
        throw new Error("Payment amount is required.");
    }

    if (!phone) {
        throw new Error("Payer phone number is required.");
    }

    const token = await getAccessToken();

    // MTN requires a UUID for X-Reference-Id
    const referenceId = crypto.randomUUID();

    const paymentData = {
        amount: String(amount),

        currency: momoConfig.currency,

        externalId:
            externalId ||
            `LDK-${Date.now()}-${crypto
                .randomBytes(4)
                .toString("hex")}`,

        payer: {
            partyIdType: "MSISDN",
            partyId: String(phone).trim()
        },

        payerMessage,

        payeeNote
    };

    console.log("----------------------------------");
    console.log("MTN MoMo requestToPay");
    console.log("Amount:", paymentData.amount);
    console.log("Currency:", paymentData.currency);
    console.log("Phone:", paymentData.payer.partyId);
    console.log("Reference ID:", referenceId);
    console.log("----------------------------------");

    const response = await axios.post(
        `${momoConfig.baseUrl}/collection/v1_0/requesttopay`,
        paymentData,
        {
            headers: {
                Authorization: `Bearer ${token}`,

                "X-Reference-Id":
                    referenceId,

                "X-Target-Environment":
                    momoConfig.targetEnvironment,

                "Ocp-Apim-Subscription-Key":
                    momoConfig.subscriptionKey,

                "Content-Type":
                    "application/json"
            }
        }
    );

    return {
        referenceId,
        externalId: paymentData.externalId,
        statusCode: response.status,
        data: response.data
    };
}

// ==========================================
// CHECK MTN MOMO PAYMENT STATUS
// ==========================================

async function getPaymentStatus(referenceId) {
    if (!referenceId) {
        throw new Error(
            "Payment reference ID is required."
        );
    }

    const token = await getAccessToken();

    const response = await axios.get(
        `${momoConfig.baseUrl}/collection/v1_0/requesttopay/${referenceId}`,
        {
            headers: {
                Authorization: `Bearer ${token}`,

                "X-Target-Environment":
                    momoConfig.targetEnvironment,

                "Ocp-Apim-Subscription-Key":
                    momoConfig.subscriptionKey,

                "Content-Type":
                    "application/json"
            }
        }
    );

    return response.data;
}

// ==========================================
// EXPORT SERVICE
// ==========================================

module.exports = {
    requestToPay,
    getPaymentStatus
};