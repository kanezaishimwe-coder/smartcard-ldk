// ==========================================
// SMARTCARD L.D.K - PAYMENT ROUTES
// ==========================================

const express = require("express");

const momoConfig = require("../config/momo");

const {
    requestToPay,
    getPaymentStatus
} = require("../services/momoService");

const router = express.Router();

// ==========================================
// SMARTCARD CONFIGURATION
// ==========================================

// Student wallet currency.
// This is the currency stored inside SmartCard L.D.K.
const WALLET_CURRENCY = "RWF";

// MTN MoMo sandbox currency.
// This comes from backend/config/momo.js.
const MOMO_CURRENCY = momoConfig.currency;

// SmartCard service fee.
const SERVICE_FEE = 200;

// Maximum number of status checks allowed by the frontend.
const MAX_STATUS_ATTEMPTS = 40;

// Database connection.
let db = null;


// ==========================================
// DATABASE CONNECTION
// ==========================================

function setDatabase(database) {

    db = database;

    console.log(
        "SmartCard L.D.K payment routes connected to SQLite."
    );
}

router.setDatabase = setDatabase;

router.SERVICE_FEE = SERVICE_FEE;

router.get(
    "/students",
    async (req, res) => {
        try {
            const students = await all(`
                SELECT
                    id,
                    name,
                    class,
                    balance,
                    rfid_card_id,
                    created_at
                FROM students
                ORDER BY name COLLATE NOCASE ASC
            `);

            return res.json({
                success: true,
                students: students.map(student => ({
                    id: student.id,
                    studentId: student.id,
                    name: student.name,
                    class: student.class,
                    balance: Number(student.balance || 0),
                    cardId: student.rfid_card_id || "",
                    cardStatus: student.rfid_card_id
                        ? "Active"
                        : "Not linked",
                    createdAt: student.created_at
                }))
            });
        } catch (error) {
            console.error("Student list error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Could not retrieve students."
            });
        }
    }
);

router.post(
    "/students",
    async (req, res) => {
        try {
            const studentId = String(req.body.studentId || "")
                .trim()
                .toUpperCase();
            const name = String(req.body.name || "").trim();
            const studentClass = String(
                req.body.class || ""
            ).trim();

            if (!studentId || !name || !studentClass) {
                return res.status(400).json({
                    success: false,
                    message: "Student ID, name and class are required."
                });
            }

            await run(
                `
                INSERT INTO students (id, name, class, balance)
                VALUES (?, ?, ?, 0)
                `,
                [studentId, name, studentClass]
            );

            return res.status(201).json({
                success: true,
                student: {
                    id: studentId,
                    studentId,
                    name,
                    class: studentClass,
                    balance: 0,
                    cardId: "",
                    cardStatus: "Not linked"
                }
            });
        } catch (error) {
            if (error.message.includes("UNIQUE constraint failed")) {
                return res.status(409).json({
                    success: false,
                    message: "A student with this ID already exists."
                });
            }

            console.error("Student creation error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Could not create student."
            });
        }
    }
);


// ==========================================
// DATABASE HELPERS
// ==========================================

function run(sql, params = []) {

    return new Promise((resolve, reject) => {

        if (!db) {

            return reject(
                new Error(
                    "Database has not been initialized."
                )
            );
        }

        db.run(
            sql,
            params,
            function(error) {

                if (error) {
                    return reject(error);
                }

                resolve({
                    id: this.lastID,
                    changes: this.changes
                });
            }
        );
    });
}


function get(sql, params = []) {

    return new Promise((resolve, reject) => {

        if (!db) {

            return reject(
                new Error(
                    "Database has not been initialized."
                )
            );
        }

        db.get(
            sql,
            params,
            (error, row) => {

                if (error) {
                    return reject(error);
                }

                resolve(row);
            }
        );
    });
}


function all(sql, params = []) {

    return new Promise((resolve, reject) => {

        if (!db) {

            return reject(
                new Error(
                    "Database has not been initialized."
                )
            );
        }

        db.all(
            sql,
            params,
            (error, rows) => {

                if (error) {
                    return reject(error);
                }

                resolve(rows);
            }
        );
    });
}

async function recordWalletTransaction({
    studentId,
    paymentReference,
    type,
    amount,
    balanceBefore,
    balanceAfter,
    description
}) {
    const txnType = String(type || "TOP_UP").trim();
    const txnAmount = Number(amount || 0);
    const before = Number(balanceBefore || 0);
    const after = Number(balanceAfter || 0);

    if (!studentId || !paymentReference) {
        return;
    }

    try {
        await run(
            `
            INSERT INTO wallet_transactions
            (
                student_id,
                payment_reference,
                type,
                amount,
                balance_before,
                balance_after,
                description
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
                studentId,
                paymentReference,
                txnType,
                txnAmount,
                before,
                after,
                description || `${txnType} for student ${studentId}`
            ]
        );
    } catch (error) {
        if (!String(error.message || "").includes("UNIQUE constraint failed")) {
            throw error;
        }
    }
}


// ==========================================
// FIND STUDENT
// ==========================================

router.get(
    "/students/:studentId",
    async (req, res) => {

        try {

            const studentId =
                String(
                    req.params.studentId || ""
                ).trim();

            if (!studentId) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Student ID is required."
                });
            }

            const student =
                await get(
                    `
                    SELECT
                        id,
                        name,
                        class,
                        balance,
                        created_at
                    FROM students
                    WHERE id = ?
                    `,
                    [studentId]
                );

            if (!student) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Student not found."
                });
            }

            return res.json({

                success: true,

                student: {

                    id:
                        student.id,

                    name:
                        student.name,

                    class:
                        student.class,

                    balance:
                        Number(student.balance || 0),

                    currency:
                        WALLET_CURRENCY,

                    createdAt:
                        student.created_at
                }
            });

        } catch (error) {

            console.error(
                "Student lookup error:",
                error.message
            );

            return res.status(500).json({

                success: false,

                message:
                    "Could not retrieve student."
            });
        }
    }
);


// ==========================================
// CREATE PAYMENT
// ==========================================

router.post(
    "/payments",
    async (req, res) => {

        try {

            const {
                studentId,
                amount,
                payerPhone,
                payerName
            } = req.body;

            // ----------------------------------
            // BASIC VALIDATION
            // ----------------------------------

            if (
                !studentId ||
                amount === undefined ||
                !payerPhone
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "studentId, amount and payerPhone are required."
                });
            }

            const cleanStudentId =
                String(studentId).trim();

            const cleanPhone =
                String(payerPhone).trim();

            const walletAmount =
                Number(amount);


            // ----------------------------------
            // AMOUNT VALIDATION
            // ----------------------------------

            if (
                !Number.isInteger(walletAmount) ||
                walletAmount <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Amount must be a positive whole number."
                });
            }


            // ----------------------------------
            // PHONE VALIDATION
            // ----------------------------------

            if (
                !/^\d{10,15}$/.test(cleanPhone)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid MTN phone number."
                });
            }


            // ----------------------------------
            // FIND STUDENT
            // ----------------------------------

            const student =
                await get(
                    `
                    SELECT
                        id,
                        name,
                        class,
                        balance
                    FROM students
                    WHERE id = ?
                    `,
                    [cleanStudentId]
                );


            if (!student) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Student not found."
                });
            }


            // ==================================
            // SMARTCARD WALLET CALCULATION
            // ==================================

            const serviceFee =
                SERVICE_FEE;

            // Parent requests walletAmount for the student.
            // Student receives the full requested amount.
            const walletCredit =
                walletAmount;

            // Parent pays walletAmount + serviceFee to MTN.
            const walletTotal =
                walletAmount + serviceFee;


            // ==================================
            // MTN MOMO PAYMENT
            // ==================================

            console.log("");
            console.log(
                "=========================================="
            );

            console.log(
                "Creating SmartCard L.D.K payment"
            );

            console.log(
                "Student:",
                cleanStudentId
            );

            console.log(
                "Student name:",
                student.name
            );

            console.log(
                "Wallet credit after fee:",
                walletCredit,
                WALLET_CURRENCY
            );

            console.log(
                "Service fee:",
                serviceFee,
                WALLET_CURRENCY
            );

            console.log(
                "Wallet total:",
                walletTotal,
                WALLET_CURRENCY
            );

            console.log(
                "MTN sandbox amount:",
                walletAmount,
                MOMO_CURRENCY
            );

            console.log(
                "Payer phone:",
                cleanPhone
            );

            console.log(
                "=========================================="
            );


            // ----------------------------------
            // CREATE MTN PAYMENT REQUEST
            // ----------------------------------

            const momoPayment =
                await requestToPay({

                    amount:
                        walletTotal,

                    phone:
                        cleanPhone,

                    payerMessage:
                        "SmartCard L.D.K payment",

                    payeeNote:
                        `Wallet funding for student ${cleanStudentId}`
                });


            const referenceId =
                momoPayment.referenceId;

            const externalId =
                momoPayment.externalId;


            // ==================================
            // SAVE PAYMENT IN DATABASE
            // ==================================

            await run(
                `
                INSERT INTO payments
                (
                    reference_id,
                    external_id,
                    student_id,
                    payer_phone,
                    payer_name,
                    requested_amount,
                    service_fee,
                    charged_amount,
                    wallet_credit,
                    currency,
                    status,
                    credited
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [

                    referenceId,

                    externalId,

                    cleanStudentId,

                    cleanPhone,

                    String(payerName || "").trim() || null,

                    walletAmount,

                    serviceFee,

                    walletTotal,

                    walletCredit,

                    WALLET_CURRENCY,

                    "PENDING",

                    0
                ]
            );


            // ==================================
            // RESPONSE
            // ==================================

            return res.status(201).json({

                success: true,

                message:
                    "Payment request created. Waiting for MTN confirmation.",

                referenceId,

                externalId,

                studentId:
                    cleanStudentId,

                student: {

                    id:
                        student.id,

                    name:
                        student.name,

                    class:
                        student.class
                },

                amount:
                    walletAmount,

                serviceFee,

                chargedAmount:
                    walletTotal,

                walletCredit,

                currency:
                    WALLET_CURRENCY,

                momoCurrency:
                    MOMO_CURRENCY,

                momoChargedAmount:
                    walletTotal,

                status:
                    "PENDING"
            });


        } catch (error) {

            console.error(
                "Payment creation error:"
            );

            console.error(
                error.response?.data ||
                error.message ||
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Could not create payment request.",

                error:
                    error.response?.data ||
                    error.message
            });
        }
    }
);


// ==========================================
// CHECK PAYMENT STATUS
// ==========================================

router.get(
    "/payments/:referenceId/status",
    async (req, res) => {

        try {

            const referenceId =
                String(
                    req.params.referenceId || ""
                ).trim();


            if (!referenceId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment reference ID is required."
                });
            }


            // ----------------------------------
            // FIND LOCAL PAYMENT
            // ----------------------------------

            const payment =
                await get(
                    `
                    SELECT
                        reference_id,
                        external_id,
                        student_id,
                        payer_phone,
                        requested_amount,
                        service_fee,
                        charged_amount,
                        wallet_credit,
                        currency,
                        status,
                        credited
                    FROM payments
                    WHERE reference_id = ?
                    `,
                    [referenceId]
                );


            if (!payment) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Payment not found."
                });
            }


            // ----------------------------------
            // IF ALREADY CREDITED
            // ----------------------------------

            if (
                payment.credited === 1 &&
                payment.status === "SUCCESS"
            ) {

                const student =
                    await get(
                        `
                        SELECT
                            id,
                            name,
                            class,
                            balance
                        FROM students
                        WHERE id = ?
                        `,
                        [payment.student_id]
                    );


                const balanceBefore = Number(student?.balance || 0);
                const walletCredit = Number(payment.wallet_credit || 0);
                const chargedAmount = Number(payment.charged_amount || walletCredit);
                const requestedAmount = Number(payment.requested_amount || walletCredit);
                const serviceFee = Number(payment.service_fee || 0);

                return res.json({

                    success: true,

                    referenceId,

                    status:
                        "SUCCESS",

                    credited:
                        true,

                    walletCredit,

                    requestedAmount,

                    serviceFee,

                    chargedAmount,

                    balanceBefore,

                    newBalance:
                        balanceBefore + walletCredit,

                    payment: {
                        referenceId,
                        studentId: payment.student_id,
                        requestedAmount,
                        serviceFee,
                        chargedAmount,
                        walletCredit,
                        balanceBefore,
                        newBalance: balanceBefore + walletCredit,
                        status: "SUCCESS"
                    },

                    student: student
                        ? {
                            id:
                                student.id,

                            name:
                                student.name,

                            class:
                                student.class,

                            balance:
                                Number(
                                    student.balance || 0
                                ),

                            currency:
                                WALLET_CURRENCY
                        }
                        : null
                });
            }


            // ==================================
            // ASK MTN FOR CURRENT STATUS
            // ==================================

            const momoStatus =
                await getPaymentStatus(
                    referenceId
                );


            const momoStatusValue =
                String(
                    momoStatus.status || ""
                ).toUpperCase();


            console.log(
                "MTN payment status:",
                referenceId,
                momoStatusValue
            );


            // ==================================
            // SUCCESS
            // ==================================

            if (
                momoStatusValue === "SUCCESSFUL" ||
                momoStatusValue === "SUCCESS"
            ) {

                // --------------------------------
                // CREDIT STUDENT WALLET
                // --------------------------------

                const student =
                    await get(
                        `
                        SELECT
                            id,
                            name,
                            class,
                            balance
                        FROM students
                        WHERE id = ?
                        `,
                        [payment.student_id]
                    );


                if (!student) {

                    return res.status(404).json({

                        success: false,

                        message:
                            "Student associated with payment was not found."
                    });
                }


                const newBalance =
                    Number(student.balance || 0) +
                    Number(payment.wallet_credit);


                // --------------------------------
                // UPDATE STUDENT BALANCE
                // --------------------------------

                const balanceBefore = Number(student.balance || 0);

                await run(
                    `
                    UPDATE students
                    SET balance = ?
                    WHERE id = ?
                    `,
                    [
                        newBalance,
                        payment.student_id
                    ]
                );

                await recordWalletTransaction({
                    studentId: payment.student_id,
                    paymentReference: referenceId,
                    type: "TOP_UP",
                    amount: Number(payment.wallet_credit || 0),
                    balanceBefore,
                    balanceAfter: newBalance,
                    description: `Wallet funding via MTN MoMo for student ${payment.student_id}`
                });


                // --------------------------------
                // MARK PAYMENT AS CREDITED
                // --------------------------------

                await run(
                    `
                    UPDATE payments
                    SET
                        status = ?,
                        credited = 1
                    WHERE reference_id = ?
                    AND credited = 0
                    `,
                    [
                        "SUCCESS",
                        referenceId
                    ]
                );


                console.log(
                    "=========================================="
                );

                console.log(
                    "SmartCard wallet credited successfully."
                );

                console.log(
                    "Student:",
                    student.id
                );

                console.log(
                    "Wallet credit:",
                    payment.wallet_credit,
                    WALLET_CURRENCY
                );

                console.log(
                    "New balance:",
                    newBalance,
                    WALLET_CURRENCY
                );

console.log(
                    "=========================================="
                );

                // Create parent notification for successful payment
                try {
                    const parentLink = await get(
                        `SELECT parent_id FROM parent_student_links WHERE student_id = ?`,
                        [payment.student_id]
                    );
                    if (parentLink?.parent_id) {
                        await run(
                            `INSERT INTO notifications (parent_id, student_id, type, title, message, read_flag) VALUES (?, ?, ?, ?, ?, 0)`,
                            [
                                parentLink.parent_id,
                                payment.student_id,
                                "PAYMENT_SUCCESS",
                                "Payment successful",
                                `Your payment of ${Number(payment.requested_amount || 0).toLocaleString()} RWF was successful. ${Number(payment.wallet_credit || 0).toLocaleString()} RWF was credited to the student's wallet.`,
                            ]
                        );
                    }
                } catch (notifErr) {
                    console.error("Payment notification error:", notifErr.message);
                }

                const successPayment = {
                    referenceId,
                    studentId: payment.student_id,
                    requestedAmount: Number(payment.requested_amount || 0),
                    serviceFee: Number(payment.service_fee || 0),
                    chargedAmount: Number(payment.charged_amount || 0),
                    walletCredit: Number(payment.wallet_credit || 0),
                    balanceBefore: Number(student.balance || 0),
                    newBalance,
                    status: "SUCCESS"
                };

                return res.json({

                    success: true,

                    referenceId,

                    status:
                        "SUCCESS",

                    credited:
                        true,

                    walletCredit:
                        successPayment.walletCredit,

                    requestedAmount:
                        successPayment.requestedAmount,

                    serviceFee:
                        successPayment.serviceFee,

                    chargedAmount:
                        successPayment.chargedAmount,

                    balanceBefore:
                        successPayment.balanceBefore,

                    newBalance,

                    payment: successPayment,

                    student: {

                        id:
                            student.id,

                        name:
                            student.name,

                        class:
                            student.class,

                        balance:
                            newBalance,

                        currency:
                            WALLET_CURRENCY
                    }
                });
            }


            // ==================================
            // FAILED
            // ==================================

            if (
                momoStatusValue === "FAILED"
            ) {

                await run(
                    `
                    UPDATE payments
                    SET status = ?
                    WHERE reference_id = ?
                    `,
                    [
                        "FAILED",
                        referenceId
                    ]
                );


                return res.json({

                    success: false,

                    referenceId,

                    status:
                        "FAILED",

                    credited:
                        false,

                    message:
                        "MTN payment failed."
                });
            }


            // ==================================
            // PENDING
            // ==================================

            await run(
                `
                UPDATE payments
                SET status = ?
                WHERE reference_id = ?
                `,
                [
                    "PENDING",
                    referenceId
                ]
            );

            const pendingPayment = {
                referenceId,
                studentId: payment.student_id,
                requestedAmount: Number(payment.requested_amount || 0),
                serviceFee: Number(payment.service_fee || 0),
                chargedAmount: Number(payment.charged_amount || 0),
                walletCredit: Number(payment.wallet_credit || 0),
                status: "PENDING"
            };

            return res.json({

                success: true,

                referenceId,

                status:
                    "PENDING",

                credited:
                    false,

                walletCredit:
                    pendingPayment.walletCredit,

                requestedAmount:
                    pendingPayment.requestedAmount,

                serviceFee:
                    pendingPayment.serviceFee,

                chargedAmount:
                    pendingPayment.chargedAmount,

                payment: pendingPayment,

                message:
                    "Payment is still waiting for MTN confirmation."
            });


        } catch (error) {

            console.error(
                "Payment status error:"
            );

            console.error(
                error.response?.data ||
                error.message ||
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Could not check payment status.",

                error:
                    error.response?.data ||
                    error.message
            });
        }
    }
);


// ==========================================
// GET STUDENT PAYMENT HISTORY
// ==========================================

router.get(
    "/students/:studentId/payments",
    async (req, res) => {

        try {

            const studentId =
                String(
                    req.params.studentId || ""
                ).trim();


            if (!studentId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Student ID is required."
                });
            }


            const payments =
                await all(
                    `
                    SELECT
                        reference_id,
                        external_id,
                        student_id,
                        payer_phone,
                        requested_amount,
                        service_fee,
                        charged_amount,
                        wallet_credit,
                        currency,
                        status,
                        credited,
                        created_at
                    FROM payments
                    WHERE student_id = ?
                    ORDER BY created_at DESC
                    `,
                    [studentId]
                );


            return res.json({

                success: true,

                studentId,

                payments:
                    payments.map(payment => ({

                        referenceId:
                            payment.reference_id,

                        externalId:
                            payment.external_id,

                        studentId:
                            payment.student_id,

                        payerPhone:
                            payment.payer_phone,

                        amount:
                            Number(
                                payment.requested_amount
                            ),

                        serviceFee:
                            Number(
                                payment.service_fee
                            ),

                        chargedAmount:
                            Number(
                                payment.charged_amount
                            ),

                        walletCredit:
                            Number(
                                payment.wallet_credit
                            ),

                        currency:
                            payment.currency ||
                            WALLET_CURRENCY,

                        status:
                            payment.status,

                        credited:
                            Boolean(
                                payment.credited
                            ),

                        createdAt:
                            payment.created_at
                    }))
            });


        } catch (error) {

            console.error(
                "Payment history error:",
                error.message
            );


            return res.status(500).json({

                success: false,

                message:
                    "Could not retrieve payment history."
            });
        }
    }
);


// ==========================================
// GET STUDENT TRANSACTIONS
// ==========================================
//
// For now SmartCard L.D.K uses the payments
// table as the transaction history.
//

router.get(
    "/students/:studentId/transactions",
    async (req, res) => {

        try {

            const studentId =
                String(
                    req.params.studentId || ""
                ).trim();


            if (!studentId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Student ID is required."
                });
            }


            const walletTransactions =
                await all(
                    `
                    SELECT
                        id,
                        payment_reference,
                        type,
                        amount,
                        balance_before,
                        balance_after,
                        description,
                        created_at
                    FROM wallet_transactions
                    WHERE student_id = ?
                    ORDER BY created_at DESC
                    `,
                    [studentId]
                );

            const legacyTransactions =
                await all(
                    `
                    SELECT
                        reference_id,
                        requested_amount,
                        service_fee,
                        charged_amount,
                        wallet_credit,
                        currency,
                        status,
                        credited,
                        created_at
                    FROM payments
                    WHERE student_id = ?
                    ORDER BY created_at DESC
                    `,
                    [studentId]
                );

            const transactions =
                walletTransactions.length > 0
                    ? walletTransactions.map(transaction => ({
                        referenceId: transaction.payment_reference,
                        type: transaction.type || "TOP_UP",
                        amount: Number(transaction.amount || 0),
                        balanceBefore: Number(transaction.balance_before || 0),
                        balanceAfter: Number(transaction.balance_after || 0),
                        description: transaction.description || "Wallet funding",
                        currency: WALLET_CURRENCY,
                        status: "SUCCESS",
                        credited: true,
                        createdAt: transaction.created_at
                    }))
                    : legacyTransactions.map(transaction => ({
                        referenceId: transaction.reference_id,
                        type: "TOP_UP",
                        amount: Number(transaction.wallet_credit || 0),
                        requestedAmount: Number(transaction.requested_amount || 0),
                        serviceFee: Number(transaction.service_fee || 0),
                        chargedAmount: Number(transaction.charged_amount || 0),
                        currency: transaction.currency || WALLET_CURRENCY,
                        status: transaction.status,
                        credited: Boolean(transaction.credited),
                        createdAt: transaction.created_at
                    }));


            return res.json({

                success: true,

                studentId,

                transactions
            });


        } catch (error) {

            console.error(
                "Transaction history error:",
                error.message
            );


            return res.status(500).json({

                success: false,

                message:
                    "Could not retrieve transactions."
            });
        }
    }
);


// ==========================================
// EXPORT ROUTER
// ==========================================

// MTN MoMo webhook endpoint for payment callbacks
router.post("/webhook/momo", async (req, res) => {
    try {
        const body = req.body;
        const referenceId = body?.referenceId || body?.reference_id || body?.X-Reference-Id;

        if (!referenceId) {
            return res.status(400).json({
                success: false,
                message: "Payment reference ID is required."
            });
        }

        const payment = await get(
            `SELECT * FROM payments WHERE reference_id = ?`,
            [referenceId]
        );

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found."
            });
        }

        const status = String(body?.status || "").toUpperCase();
        if (status === "SUCCESSFUL" || status === "SUCCESS") {
            if (payment.credited === 0) {
                const student = await get(
                    `SELECT id, name, class, balance FROM students WHERE id = ?`,
                    [payment.student_id]
                );

                if (student) {
                    const newBalance = Number(student.balance || 0) + Number(payment.wallet_credit);
                    await run(
                        `UPDATE students SET balance = ? WHERE id = ?`,
                        [newBalance, payment.student_id]
                    );
                    await run(
                        `UPDATE payments SET status = 'SUCCESS', credited = 1, completed_at = CURRENT_TIMESTAMP WHERE reference_id = ?`,
                        [referenceId]
                    );
                    await run(
                        `INSERT INTO wallet_transactions (student_id, payment_reference, type, amount, balance_before, balance_after, description) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            payment.student_id,
                            referenceId,
                            "TOP_UP",
                            Number(payment.wallet_credit),
                            Number(student.balance || 0),
                            newBalance,
                            `Wallet funding via MTN MoMo for student ${payment.student_id}`
                        ]
                    );
                }
            }
        } else if (status === "FAILED" || status === "FAILURE") {
            await run(
                `UPDATE payments SET status = 'FAILED' WHERE reference_id = ?`,
                [referenceId]
            );
        }

        return res.json({ success: true, message: "Webhook processed." });
    } catch (error) {
        console.error("MoMo webhook error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not process webhook."
        });
    }
});

// ==========================================
// ADMIN WALLET MANAGEMENT
// ==========================================

// Get all payments (admin)
router.get("/payments", async (req, res) => {
    try {
        const payments = await all(`
            SELECT p.*, s.name AS student_name, s.class AS student_class
            FROM payments p
            LEFT JOIN students s ON s.id = p.student_id
            ORDER BY p.created_at DESC
            LIMIT 100
        `);

        return res.json({
            success: true,
            payments: payments.map(payment => ({
                referenceId: payment.reference_id,
                externalId: payment.external_id,
                studentId: payment.student_id,
                studentName: payment.student_name || "Unknown",
                studentClass: payment.student_class || "N/A",
                payerPhone: payment.payer_phone,
                requestedAmount: Number(payment.requested_amount || 0),
                serviceFee: Number(payment.service_fee || 0),
                chargedAmount: Number(payment.charged_amount || 0),
                walletCredit: Number(payment.wallet_credit || 0),
                currency: payment.currency || WALLET_CURRENCY,
                status: payment.status,
                credited: Boolean(payment.credited),
                createdAt: payment.created_at
            }))
        });
    } catch (error) {
        console.error("Admin payments fetch error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not retrieve payments."
        });
    }
});

// Get all wallet transactions (admin)
router.get("/transactions", async (req, res) => {
    try {
        const transactions = await all(`
            SELECT wt.*, s.name AS student_name, s.class AS student_class
            FROM wallet_transactions wt
            LEFT JOIN students s ON s.id = wt.student_id
            ORDER BY wt.created_at DESC
            LIMIT 100
        `);

        return res.json({
            success: true,
            transactions: transactions.map(t => ({
                id: t.id,
                studentId: t.student_id,
                studentName: t.student_name || "Unknown",
                studentClass: t.student_class || "N/A",
                type: t.type,
                amount: Number(t.amount || 0),
                balanceBefore: Number(t.balance_before || 0),
                balanceAfter: Number(t.balance_after || 0),
                description: t.description || "",
                referenceId: t.payment_reference,
                createdAt: t.created_at
            }))
        });
    } catch (error) {
        console.error("Admin transactions fetch error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not retrieve transactions."
        });
    }
});

// Admin wallet adjustment
router.post("/students/:studentId/wallet/adjust", async (req, res) => {
    try {
        const studentId = String(req.params.studentId || "").trim();
        const amount = Number(req.body.amount || 0);
        const type = String(req.body.type || "ADJUSTMENT").trim();
        const description = String(req.body.description || "").trim();

        if (!studentId) {
            return res.status(400).json({
                success: false,
                message: "Student ID is required."
            });
        }

        if (!Number.isInteger(amount) || amount === 0) {
            return res.status(400).json({
                success: false,
                message: "Amount must be a non-zero whole number."
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

        const balanceBefore = Number(student.balance || 0);
        let newBalance = balanceBefore + amount;

        if (newBalance < 0) {
            return res.status(400).json({
                success: false,
                message: "Wallet balance cannot go negative."
            });
        }

        await run(
            `UPDATE students SET balance = ? WHERE id = ?`,
            [newBalance, studentId]
        );

        await run(
            `INSERT INTO wallet_transactions (student_id, payment_reference, type, amount, balance_before, balance_after, description) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                studentId,
                `ADJ-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                type,
                amount,
                balanceBefore,
                newBalance,
                description || `Wallet adjustment: ${amount} RWF`
            ]
        );

        return res.json({
            success: true,
            message: "Wallet adjusted successfully.",
            studentId,
            balanceBefore,
            adjustment: amount,
            newBalance
        });
    } catch (error) {
        console.error("Wallet adjustment error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not adjust wallet."
        });
    }
});

module.exports = router;