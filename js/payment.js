// ==========================================
// SMARTCARD L.D.K — PAYMENT SYSTEM
// ==========================================

"use strict";

// ==========================================
// CONFIGURATION
// ==========================================

const BACKEND_URL = "http://localhost:3000";
const SERVICE_FEE = 200;

const STATUS_CHECK_INTERVAL = 3000;
const MAX_STATUS_ATTEMPTS = 15;
const SUCCESS_DISPLAY_TIME = 10000;

// ==========================================
// STATE
// ==========================================

let student = null;
let currentPaymentReference = null;
let statusTimer = null;
let statusAttempts = 0;

let paymentInProgress = false;
let paymentSuccessHandled = false;
let statusCheckInProgress = false;

// ==========================================
// DOM HELPER
// ==========================================

function getElement(id) {
    return document.getElementById(id);
}

// ==========================================
// WAIT
// ==========================================

function wait(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

// ==========================================
// FIND STUDENT
// ==========================================

async function findStudent() {
    const input = getElement("studentNumber");

    if (!input) {
        console.error("studentNumber input not found.");
        return;
    }

    const studentId = input.value.trim();

    if (!studentId) {
        alert("Please enter the student number.");
        return;
    }

    const button = document.querySelector(".form-group button");

    if (button) {
        button.disabled = true;
        button.innerText = "Searching...";
    }

    try {
        const response = await fetch(
            `${BACKEND_URL}/api/students/${encodeURIComponent(studentId)}`
        );

        const data = await response.json();

        if (!response.ok || !data.success || !data.student) {
            student = null;

            const details = getElement("studentDetails");

            if (details) {
                details.classList.add("hidden");
            }

            alert(data.message || "Student not found.");
            return;
        }

        student = data.student;

        const details = getElement("studentDetails");

        if (details) {
            details.classList.remove("hidden");
        }

        const foundName = getElement("foundName");
        const foundClass = getElement("foundClass");
        const balance = getElement("balance");

        if (foundName) {
            foundName.innerText = student.name || "Unknown";
        }

        if (foundClass) {
            foundClass.innerText = student.class || "Unknown";
        }

        if (balance) {
            balance.innerText =
                `${Number(student.balance || 0).toLocaleString()} RWF`;
        }

        updatePaymentTotal();

        console.log("Student found:", student);

    } catch (error) {
        console.error("Student lookup error:", error);

        student = null;

        const details = getElement("studentDetails");

        if (details) {
            details.classList.add("hidden");
        }

        alert(
            error.message ||
            "Could not connect to the SmartCard L.D.K server."
        );

    } finally {
        if (button) {
            button.disabled = false;
            button.innerText = "Find Student";
        }
    }
}

// ==========================================
// AMOUNT INPUT
// ==========================================

function setupAmountInput() {
    const amountInput = getElement("amount");

    if (!amountInput) {
        return;
    }

    amountInput.addEventListener("input", updatePaymentTotal);
}

// ==========================================
// UPDATE TOTAL
// ==========================================

function updatePaymentTotal() {
    const amountInput = getElement("amount");
    const totalElement = getElement("total");

    if (!totalElement) {
        return;
    }

    const amount = Number(amountInput?.value || 0);

    if (!Number.isInteger(amount) || amount <= 0) {
        totalElement.innerText = "0 RWF";
        return;
    }

    const walletCredit = Math.max(0, amount - SERVICE_FEE);
    const total = amount + SERVICE_FEE;

    totalElement.innerText =
        `${total.toLocaleString()} RWF`;

    const summary = getElement("paymentSummary");

    if (summary) {
        summary.innerText =
            `Wallet credit: ${walletCredit.toLocaleString()} RWF • Service fee: ${SERVICE_FEE.toLocaleString()} RWF`;
    }
}

// ==========================================
// OPEN MOMO MODAL
// ==========================================

function openMoMo() {
    if (paymentInProgress) {
        return;
    }

    if (!student) {
        alert("Please find the student first.");
        return;
    }

    const amountInput = getElement("amount");
    const amount = Number(amountInput?.value || 0);

    if (!Number.isInteger(amount) || amount <= 0) {
        alert("Please enter a valid whole-number amount.");
        return;
    }

    const modal = getElement("momoModal");

    if (!modal) {
        console.error("momoModal not found.");
        return;
    }

    modal.style.display = "flex";

    const statusElement = getElement("paymentStatus");

    if (statusElement) {
        statusElement.style.color = "#333";

        statusElement.innerHTML = `
            <strong>Ready for payment.</strong>
            <br><br>
            Enter the MTN number that will make the payment.
        `;
    }

    const loader = getElement("paymentLoader");

    if (loader) {
        loader.style.display = "none";
    }

    const payerPhone = getElement("payerPhone");

    if (payerPhone) {
        payerPhone.focus();
    }
}

// ==========================================
// CLOSE MOMO MODAL
// ==========================================

function closeMoMo() {
    if (paymentInProgress) {
        return;
    }

    stopStatusChecking();

    currentPaymentReference = null;
    statusAttempts = 0;
    paymentSuccessHandled = false;
    statusCheckInProgress = false;

    const modal = getElement("momoModal");

    if (modal) {
        modal.style.display = "none";
    }

    const statusElement = getElement("paymentStatus");

    if (statusElement) {
        statusElement.innerHTML = "Ready for payment.";
        statusElement.style.color = "#333";
    }

    const loader = getElement("paymentLoader");

    if (loader) {
        loader.style.display = "none";
    }

    resetPaymentButton();
}

// ==========================================
// START PAYMENT
// ==========================================

async function startPayment() {

    if (paymentInProgress) {
        return;
    }

    if (!student) {
        alert("Please find the student first.");
        return;
    }

    const amountInput = getElement("amount");
    const payerPhoneInput = getElement("payerPhone");

    const amount = Number(amountInput?.value || 0);
    const payerPhone = payerPhoneInput?.value.trim() || "";

    // --------------------------------------
    // VALIDATE AMOUNT
    // --------------------------------------

    if (!Number.isInteger(amount) || amount <= 0) {
        alert("Amount must be a positive whole number.");
        return;
    }

    // --------------------------------------
    // VALIDATE PHONE
    // --------------------------------------

    if (!payerPhone) {
        alert("Please enter the MTN phone number.");
        return;
    }

    if (!/^\d{10,15}$/.test(payerPhone)) {
        alert("Please enter a valid MTN phone number.");
        return;
    }

    // --------------------------------------
    // LOCK PAYMENT
    // --------------------------------------

    paymentInProgress = true;
    paymentSuccessHandled = false;
    statusAttempts = 0;
    currentPaymentReference = null;
    statusCheckInProgress = false;

    const button = document.querySelector(
        "#momoModal .pay-btn"
    );

    if (button) {
        button.disabled = true;
        button.innerText = "Processing...";
    }

    const loader = getElement("paymentLoader");

    if (loader) {
        loader.style.display = "block";
    }

    const statusElement = getElement("paymentStatus");

    if (statusElement) {
        statusElement.style.color = "#333";

        statusElement.innerHTML = `
            <strong>Processing payment...</strong>
            <br><br>
            Please wait while we send your payment request.
        `;
    }

    try {

        console.log("================================");
        console.log("SMARTCARD L.D.K PAYMENT");
        console.log("Student:", student.id);
        console.log("Amount:", amount, "RWF");
        console.log("Service fee:", SERVICE_FEE, "RWF");
        console.log("Total:", amount + SERVICE_FEE, "RWF");
        console.log("Phone:", payerPhone);
        console.log("================================");

        // --------------------------------------
        // CREATE PAYMENT
        // --------------------------------------

        const response = await fetch(
            `${BACKEND_URL}/api/payments`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    studentId: student.id,
                    amount: amount,
                    payerPhone: payerPhone
                })
            }
        );

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                "The payment server returned an invalid response."
            );
        }

        console.log(
            "Payment creation response:",
            data
        );

        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                "Payment request could not be created."
            );
        }

        // --------------------------------------
        // SAVE PAYMENT REFERENCE
        // --------------------------------------

        currentPaymentReference =
            data.referenceId ||
            data.reference ||
            data.paymentReference;

        if (!currentPaymentReference) {
            throw new Error(
                "Payment was created but no payment reference was returned."
            );
        }

        console.log(
            "Payment reference:",
            currentPaymentReference
        );

        // --------------------------------------
        // PAYMENT REQUEST SENT
        // --------------------------------------

        if (statusElement) {
            statusElement.style.color = "#92400e";

            statusElement.innerHTML = `
                <div class="payment-status-box">

                    <strong class="payment-status-title">
                        📱 Payment request sent
                    </strong>

                    <p>
                        Please confirm the payment on your MTN phone.
                    </p>

                    <small>
                        Waiting for MTN confirmation...
                    </small>

                </div>
            `;
        }

        // --------------------------------------
        // WAIT BEFORE STATUS CHECKING
        // --------------------------------------

        await wait(2000);

        if (
            !paymentInProgress ||
            !currentPaymentReference
        ) {
            return;
        }

        // --------------------------------------
        // SHOW WAITING MESSAGE
        // --------------------------------------

        showWaitingMessage();

        // --------------------------------------
        // START STATUS CHECKING
        // --------------------------------------

        startPaymentStatusChecking();

    } catch (error) {

        console.error(
            "Payment creation error:",
            error
        );

        if (statusElement) {
            statusElement.style.color = "#dc2626";

            statusElement.innerHTML = `
                <strong>❌ Payment request failed.</strong>

                <br><br>

                ${escapeHtml(
                    error.message ||
                    "Unable to create payment."
                )}

                <br><br>

                <small>
                    Please try again.
                </small>
            `;
        }

        resetPaymentButton();
    }
}

// ==========================================
// WAITING MESSAGE
// ==========================================

function showWaitingMessage() {

    const statusElement = getElement("paymentStatus");

    if (!statusElement) {
        return;
    }

    statusElement.style.color = "#92400e";

    statusElement.innerHTML = `
        <div class="payment-waiting">

            <strong class="payment-status-title">
                ⏳ Waiting for MTN confirmation...
            </strong>

            <p>
                Please confirm the payment on your MTN phone.
            </p>

            <small>
                SmartCard L.D.K is checking automatically.
            </small>

            <div
                id="paymentCheckCounter"
                class="payment-counter"
            >
                Checking payment status...
            </div>

        </div>
    `;
}

// ==========================================
// START STATUS CHECKING
// ==========================================

function startPaymentStatusChecking() {

    stopStatusChecking();

    statusAttempts = 0;
    statusCheckInProgress = false;

    console.log(
        "MTN payment monitoring started."
    );

    checkPaymentStatus();

    statusTimer = setInterval(
        checkPaymentStatus,
        STATUS_CHECK_INTERVAL
    );
}

// ==========================================
// CHECK PAYMENT STATUS
// ==========================================

async function checkPaymentStatus() {

    if (!currentPaymentReference) {
        return;
    }

    if (paymentSuccessHandled) {
        return;
    }

    if (!paymentInProgress) {
        return;
    }

    if (statusCheckInProgress) {
        return;
    }

    statusCheckInProgress = true;
    statusAttempts++;

    try {

        const response = await fetch(
            `${BACKEND_URL}/api/payments/${encodeURIComponent(
                currentPaymentReference
            )}/status`
        );

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                "Invalid payment status response."
            );
        }

        console.log(
            "MTN status response:",
            data
        );

        // --------------------------------------
        // SUCCESS
        // --------------------------------------

        if (
            response.ok &&
            data.success &&
            (
                data.status === "SUCCESSFUL" ||
                data.status === "SUCCESS"
            )
        ) {

            if (paymentSuccessHandled) {
                return;
            }

            paymentSuccessHandled = true;

            stopStatusChecking();

            await paymentSuccessful(data);

            return;
        }

        // --------------------------------------
        // FAILED
        // --------------------------------------

        if (
            response.ok &&
            data.success &&
            (
                data.status === "FAILED" ||
                data.status === "FAILURE"
            )
        ) {

            stopStatusChecking();

            paymentFailed(data);

            return;
        }

        // --------------------------------------
        // PENDING
        // --------------------------------------

        updateWaitingCounter();

        // --------------------------------------
        // TIMEOUT
        // --------------------------------------

        if (
            statusAttempts >= MAX_STATUS_ATTEMPTS
        ) {

            stopStatusChecking();

            paymentTimeout();

            return;
        }

    } catch (error) {

        console.error(
            "Payment status error:",
            error
        );

        const counter =
            getElement("paymentCheckCounter");

        if (counter) {
            counter.innerText =
                `Connection issue. Retrying... (${statusAttempts}/${MAX_STATUS_ATTEMPTS})`;
        }

        if (
            statusAttempts >= MAX_STATUS_ATTEMPTS
        ) {

            stopStatusChecking();

            paymentTimeout();
        }

    } finally {

        statusCheckInProgress = false;
    }
}

// ==========================================
// UPDATE WAITING COUNTER
// ==========================================

function updateWaitingCounter() {

    const counter =
        getElement("paymentCheckCounter");

    if (!counter) {
        return;
    }

    counter.innerText =
        `Checking payment status: ${statusAttempts} of ${MAX_STATUS_ATTEMPTS}`;
}

// ==========================================
// PAYMENT SUCCESSFUL
// ==========================================

async function paymentSuccessful(data) {

    const loader = getElement("paymentLoader");

    if (loader) {
        loader.style.display = "none";
    }

    const payment = data.payment || {};

    const walletCredit = Number(
        payment.walletCredit ??
        data.walletCredit ??
        Math.max(0, (Number(payment.requestedAmount ?? data.requestedAmount ?? payment.amount ?? amount ?? 0) - SERVICE_FEE))
        ??
        0
    );

    const requestedAmount = Number(
        payment.requestedAmount ??
        data.requestedAmount ??
        payment.amount ??
        walletCredit
    );

    const serviceFee = Number(
        payment.serviceFee ??
        data.serviceFee ??
        SERVICE_FEE
    );

    const chargedAmount = Number(
        payment.chargedAmount ??
        data.chargedAmount ??
        requestedAmount + serviceFee
    );

    const balanceBefore = Number(
        payment.balanceBefore ??
        data.balanceBefore ??
        student?.balance ??
        0
    );

    const newBalance = Number(
        payment.newBalance ??
        data.newBalance ??
        balanceBefore + walletCredit
    );

    // --------------------------------------
    // UPDATE STUDENT
    // --------------------------------------

    if (student) {
        student.balance = newBalance;
    }

    const balanceElement =
        getElement("balance");

    if (balanceElement) {
        balanceElement.innerText =
            `${newBalance.toLocaleString()} RWF`;
    }

    // --------------------------------------
    // SUCCESS SCREEN
    // --------------------------------------

    const statusElement =
        getElement("paymentStatus");

    if (statusElement) {

        statusElement.style.color = "#15803d";

        statusElement.innerHTML = `
            <div class="payment-success">

                <div class="success-icon">
                    ✓
                </div>

                <h3>
                    Payment Successful!
                </h3>

                <p>
                    Your payment has been confirmed.
                </p>

                <div class="success-details">

                    <div>
                        <span>Wallet Credit</span>
                        <strong>
                            ${walletCredit.toLocaleString()} RWF
                        </strong>
                    </div>

                    <div>
                        <span>Service Fee</span>
                        <strong>
                            ${serviceFee.toLocaleString()} RWF
                        </strong>
                    </div>

                    <div>
                        <span>Total Paid</span>
                        <strong>
                            ${chargedAmount.toLocaleString()} RWF
                        </strong>
                    </div>

                    <div>
                        <span>Previous Balance</span>
                        <strong>
                            ${balanceBefore.toLocaleString()} RWF
                        </strong>
                    </div>

                    <div>
                        <span>New Balance</span>
                        <strong>
                            ${newBalance.toLocaleString()} RWF
                        </strong>
                    </div>

                </div>

                <small id="successCountdown">
                    Returning to dashboard in 10 seconds...
                </small>

            </div>
        `;
    }

    // --------------------------------------
    // COUNTDOWN
    // --------------------------------------

    const secondsTotal =
        Math.floor(SUCCESS_DISPLAY_TIME / 1000);

    for (
        let seconds = secondsTotal;
        seconds > 0;
        seconds--
    ) {

        const countdown =
            getElement("successCountdown");

        if (countdown) {
            countdown.innerText =
                `Returning to dashboard in ${seconds} second${seconds === 1 ? "" : "s"}...`;
        }

        await wait(1000);
    }

    // --------------------------------------
    // DASHBOARD
    // --------------------------------------

    window.location.href = "dashboard.html";
}

// ==========================================
// PAYMENT FAILED
// ==========================================

function paymentFailed(data) {

    const loader =
        getElement("paymentLoader");

    if (loader) {
        loader.style.display = "none";
    }

    const statusElement =
        getElement("paymentStatus");

    if (statusElement) {

        statusElement.style.color = "#dc2626";

        statusElement.innerHTML = `
            <div class="payment-failed">

                <div class="failed-icon">
                    ✕
                </div>

                <h3>
                    Payment Failed
                </h3>

                <p>
                    The MTN payment was not completed.
                </p>

                <small>
                    No money was added to the student's wallet.
                </small>

                <br><br>

                <small>
                    You can try again.
                </small>

            </div>
        `;
    }

    console.error(
        "MTN payment failed:",
        data
    );

    resetPaymentButton();
}

// ==========================================
// PAYMENT TIMEOUT
// ==========================================

function paymentTimeout() {

    const loader =
        getElement("paymentLoader");

    if (loader) {
        loader.style.display = "none";
    }

    const statusElement =
        getElement("paymentStatus");

    if (statusElement) {

        statusElement.style.color = "#b45309";

        statusElement.innerHTML = `
            <div class="payment-timeout">

                <div class="timeout-icon">
                    ⏱
                </div>

                <h3>
                    Confirmation Timed Out
                </h3>

                <p>
                    We could not confirm the MTN payment
                    within the expected time.
                </p>

                <small>
                    Your payment may still be processing.
                </small>

                <br><br>

                <small>
                    Check your payment history before
                    trying again.
                </small>

            </div>
        `;
    }

    console.warn(
        "MTN payment confirmation timed out."
    );

    resetPaymentButton();
}

// ==========================================
// STOP STATUS CHECKING
// ==========================================

function stopStatusChecking() {

    if (statusTimer !== null) {

        clearInterval(statusTimer);

        statusTimer = null;
    }

    statusCheckInProgress = false;
}

// ==========================================
// RESET PAYMENT BUTTON
// ==========================================

function resetPaymentButton() {

    paymentInProgress = false;
    paymentSuccessHandled = false;
    statusCheckInProgress = false;

    const button =
        document.querySelector(
            "#momoModal .pay-btn"
        );

    if (button) {

        button.disabled = false;

        button.innerText =
            "Pay with MTN MoMo";
    }

    const loader =
        getElement("paymentLoader");

    if (loader) {
        loader.style.display = "none";
    }
}

// ==========================================
// BACK TO DASHBOARD
// ==========================================

function backDashboard() {

    if (paymentInProgress) {
        return;
    }

    stopStatusChecking();

    window.location.href =
        "dashboard.html";
}

// ==========================================
// ESCAPE HTML
// ==========================================

function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// ==========================================
// MODAL EVENTS
// ==========================================

function setupModalEvents() {

    const modal =
        getElement("momoModal");

    if (!modal) {
        return;
    }

    modal.addEventListener(
        "click",
        (event) => {

            if (
                event.target === modal &&
                !paymentInProgress
            ) {
                closeMoMo();
            }
        }
    );
}

// ==========================================
// INITIALIZE
// ==========================================

function initializePaymentPage() {

    setupAmountInput();

    setupModalEvents();

    const storedUser = JSON.parse(
        localStorage.getItem("smartCampusUser") || "null"
    );

    const studentNumberInput = getElement("studentNumber");

    if (
        storedUser?.linkedStudent?.studentId &&
        studentNumberInput
    ) {
        studentNumberInput.value = storedUser.linkedStudent.studentId;
        findStudent();
    }

    updatePaymentTotal();

    console.log(
        "SmartCard L.D.K payment system initialized."
    );

    console.log(
        "Backend:",
        BACKEND_URL
    );
}

// ==========================================
// CLEANUP
// ==========================================

window.addEventListener(
    "beforeunload",
    () => {
        stopStatusChecking();
    }
);

// ==========================================
// MAKE FUNCTIONS AVAILABLE TO HTML
// ==========================================

window.findStudent = findStudent;
window.openMoMo = openMoMo;
window.closeMoMo = closeMoMo;
window.startPayment = startPayment;
window.backDashboard = backDashboard;
window.updatePaymentTotal = updatePaymentTotal;

// ==========================================
// START
// ==========================================

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        initializePaymentPage
    );

} else {

    initializePaymentPage();
}