const RFID_SCANNER_INPUT_ID = "rfidScannerInput";
const RFID_SCAN_TIMEOUT = 100;
const RFID_DUPLICATE_DELAY = 3000;

let rfidScannerBuffer = "";
let rfidScannerTimer = null;
let lastScannedCard = null;
let lastScannedAt = 0;

function getScannerInput() {
 	return document.getElementById(RFID_SCANNER_INPUT_ID);
}

function normalizeCardId(cardId) {
	return String(cardId || "")
		.trim()
		.toUpperCase()
		.replace(/\s+/g, "");
}

function showScannerMessage(message, type = "info") {
	const element =
		document.getElementById("rfidScannerMessage") ||
		document.getElementById("cardMessage");

	if (!element) return;

	element.textContent = message;
	element.className = `rfid-message ${type}`;
}

function displayScanResult(result) {
	if (!result) return;

	const studentName =
		result.studentName ||
		result.name ||
		result.student?.name ||
		"Unknown student";

	const studentClass =
		result.class ||
		result.studentClass ||
		result.student?.class ||
		"N/A";

	const scanType =
		result.type ||
		result.scanType ||
		result.attendanceType ||
		"UNKNOWN";

	const time =
		result.time ||
		result.timestamp ||
		result.dateTime ||
		new Date().toLocaleString();

	const message =
		`${studentName} | ${studentClass} | ${scanType} | ${time}`;

	showScannerMessage(message, scanType === "ENTRY" ? "entry" : "exit");
}

function processScannedCard(cardId) {
	const normalizedCardId = normalizeCardId(cardId);

	if (!normalizedCardId) return;

	const now = Date.now();

	if (
		lastScannedCard === normalizedCardId &&
		now - lastScannedAt < RFID_DUPLICATE_DELAY
	) {
		showScannerMessage(
			`Card ${normalizedCardId} was already scanned.`,
			"warning"
		);
		return;
	}

	lastScannedCard = normalizedCardId;
	lastScannedAt = now;

	let result = null;

	try {
		if (typeof window.processRFIDScan === "function") {
			result = window.processRFIDScan(normalizedCardId);
		} else if (typeof window.recordRFIDScan === "function") {
			result = window.recordRFIDScan(normalizedCardId);
		} else {
			throw new Error("RFID attendance engine is unavailable.");
		}

		if (result && typeof result.then === "function") {
			result
				.then(displayScanResult)
				.catch(error => {
					console.error(error);
					showScannerMessage(
						error.message || "RFID scan failed.",
						"error"
					);
				});
		} else {
			displayScanResult(result);
		}
	} catch (error) {
		console.error("RFID scan error:", error);

		showScannerMessage(
			error.message || "Unable to process RFID card.",
			"error"
		);
	}
}

function handleRFIDKey(event) {
	const key = event.key;

	if (key === "Enter") {
		event.preventDefault();

		const cardId = rfidScannerBuffer;
		rfidScannerBuffer = "";

		if (rfidScannerTimer) {
			clearTimeout(rfidScannerTimer);
			rfidScannerTimer = null;
		}

		processScannedCard(cardId);
		return;
	}

	if (key.length !== 1) return;

	rfidScannerBuffer += key;

	if (rfidScannerTimer) {
		clearTimeout(rfidScannerTimer);
	}

	rfidScannerTimer = setTimeout(() => {
		if (rfidScannerBuffer.length > 0) {
			processScannedCard(rfidScannerBuffer);
			rfidScannerBuffer = "";
		}
	}, RFID_SCAN_TIMEOUT);
}

function activateRFIDScanner() {
	const input = getScannerInput();

	if (input) {
		input.focus();
		showScannerMessage("RFID scanner ready.", "ready");
		return;
	}

	showScannerMessage(
		"RFID scanner input is not available.",
		"error"
	);
}

function openRfidScanner() {
	const input = getScannerInput();

	if (input) {
		input.style.display = "block";
		input.focus();
		showScannerMessage("RFID scanner ready.", "ready");
		return;
	}

	const scanner = document.createElement("input");

	scanner.id = RFID_SCANNER_INPUT_ID;
	scanner.type = "text";
	scanner.autocomplete = "off";
	scanner.placeholder = "Scan RFID card...";
	scanner.style.position = "fixed";
	scanner.style.left = "-9999px";
	scanner.style.opacity = "0";

	document.body.appendChild(scanner);

	scanner.addEventListener("keydown", handleRFIDKey);

	scanner.focus();

	showScannerMessage("RFID scanner ready.", "ready");
}

function simulateRFIDScan(cardId) {
	processScannedCard(cardId);
}

function closeRfidScanner() {
	const input = getScannerInput();

	if (input) {
		input.blur();
	}

	showScannerMessage("RFID scanner paused.", "info");
}

document.addEventListener("DOMContentLoaded", () => {
	let input = getScannerInput();

	if (!input) {
		input = document.createElement("input");

		input.id = RFID_SCANNER_INPUT_ID;
		input.type = "text";
		input.autocomplete = "off";
		input.placeholder = "Scan RFID card...";
		input.style.position = "fixed";
		input.style.left = "-9999px";
		input.style.opacity = "0";

		document.body.appendChild(input);
	}

	input.addEventListener("keydown", handleRFIDKey);

	window.activateRFIDScanner = activateRFIDScanner;
	window.openRfidScanner = openRfidScanner;
	window.closeRfidScanner = closeRfidScanner;
	window.simulateRFIDScan = simulateRFIDScan;

	showScannerMessage("RFID scanner offline.", "info");
});