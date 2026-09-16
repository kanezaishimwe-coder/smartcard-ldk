"use strict";

const API_BASE_URL = "http://localhost:3000";

/*
======================================================
SMARTCARD L.D.K
RFID ATTENDANCE SYSTEM
Admin-side RFID management and attendance processing
======================================================
*/


/* ======================================================
   STORAGE HELPERS
====================================================== */

function getUsers() {

    try {

        const users = JSON.parse(
            localStorage.getItem("smartCampusUsers") || "[]"
        );

        return Array.isArray(users) ? users : [];

    } catch (error) {

        console.error("Unable to read users:", error);

        return [];
    }
}


function saveUsers(users) {

    localStorage.setItem(
        "smartCampusUsers",
        JSON.stringify(users)
    );
}


function getAttendanceRecords() {

    try {

        const records = JSON.parse(
            localStorage.getItem("smartCampusAttendance") || "[]"
        );

        return Array.isArray(records) ? records : [];

    } catch (error) {

        console.error(
            "Unable to read attendance records:",
            error
        );

        return [];
    }
}


function saveAttendanceRecords(records) {

    localStorage.setItem(
        "smartCampusAttendance",
        JSON.stringify(records)
    );
}


/* ======================================================
   FIND USER BY USER ID
====================================================== */

function findUserById(userId) {

    const cleanUserId =
        String(userId || "")
            .trim();

    if (!cleanUserId) {
        return null;
    }

    const users = getUsers();

    return users.find(
        user =>
            String(user.id || "").trim() === cleanUserId
    ) || null;
}


/* ======================================================
   FIND USER BY PHONE
====================================================== */

function findUserByPhone(phone) {

    const cleanPhone =
        String(phone || "")
            .replace(/\s+/g, "")
            .trim();

    if (!cleanPhone) {
        return null;
    }

    const users = getUsers();

    return users.find(
        user =>
            String(user.phone || "")
                .replace(/\s+/g, "")
                .trim() === cleanPhone
    ) || null;
}


/* ======================================================
   FIND USER BY USERNAME
====================================================== */

function findUserByUsername(username) {

    const cleanUsername =
        String(username || "")
            .trim()
            .toLowerCase();

    if (!cleanUsername) {
        return null;
    }

    const users = getUsers();

    return users.find(
        user =>
            String(user.username || "")
                .trim()
                .toLowerCase() === cleanUsername
    ) || null;
}


/* ======================================================
   FIND USER
   Accepts USER ID, PHONE or USERNAME
====================================================== */

function findUser(identifier) {

    const value =
        String(identifier || "").trim();

    if (!value) {
        return null;
    }

    return (
        findUserById(value) ||
        findUserByPhone(value) ||
        findUserByUsername(value)
    );
}


/* ======================================================
   FIND USER BY RFID CARD
====================================================== */

function findUserByRFID(cardId) {

    const cleanCardId =
        String(cardId || "")
            .trim()
            .toUpperCase();

    if (!cleanCardId) {
        return null;
    }

    const users = getUsers();

    return users.find(user => {

        const registeredCard =
            String(
                user.cardId ||
                user.rfid ||
                ""
            )
                .trim()
                .toUpperCase();

        return registeredCard === cleanCardId;

    }) || null;
}


/* ======================================================
   DETERMINE ENTRY / EXIT
====================================================== */

function getNextAttendanceType(userId) {

    const records =
        getAttendanceRecords();

    const userRecords =
        records.filter(record =>
            String(record.userId || "")
                === String(userId || "")
        );

    if (!userRecords.length) {

        return "ENTRY";
    }

    const lastRecord =
        userRecords[userRecords.length - 1];

    const lastType =
        String(lastRecord.type || "")
            .toUpperCase();

    if (lastType === "ENTRY") {

        return "EXIT";
    }

    return "ENTRY";
}


/* ======================================================
   PROCESS RFID SCAN
====================================================== */

function processRFIDScan(cardId) {

    const cleanCardId =
        String(cardId || "")
            .trim()
            .toUpperCase();

    if (!cleanCardId) {

        return {

            success: false,

            message:
                "RFID card ID is required."
        };
    }


    const user =
        findUserByRFID(cleanCardId);


    if (!user) {

        return {

            success: false,

            message:
                "RFID card is not registered."
        };
    }


    const type =
        getNextAttendanceType(user.id);


    const now =
        new Date();


    const record = {

        id:
            "ATT-" +
            Date.now(),

        userId:
            user.id,

        name:
            user.name || "Unknown User",

        phone:
            user.phone || "",

        cardId:
            cleanCardId,

        role:
            user.role || "Parent",

        type:
            type,

        date:
            now.toLocaleDateString(),

        time:
            now.toLocaleTimeString(),

        timestamp:
            now.toISOString()
    };


    const records =
        getAttendanceRecords();


    records.push(record);


    saveAttendanceRecords(records);


    updateUserAttendance(user.id);


    return {

        success: true,

        message:
            `${user.name} recorded as ${type}.`,

        record:
            record
    };
}


/* ======================================================
   UPDATE USER ATTENDANCE
====================================================== */

function updateUserAttendance(userId) {

    const users =
        getUsers();


    const userIndex =
        users.findIndex(
            user =>
                String(user.id || "") ===
                String(userId || "")
        );


    if (userIndex === -1) {

        return;
    }


    const records =
        getAttendanceRecords()
            .filter(
                record =>
                    String(record.userId || "") ===
                    String(userId || "")
            );


    const entries =
        records.filter(
            record =>
                String(record.type || "")
                    .toUpperCase() === "ENTRY"
        ).length;


    const exits =
        records.filter(
            record =>
                String(record.type || "")
                    .toUpperCase() === "EXIT"
        ).length;


    let attendance = 0;


    /*
    Attendance is calculated from completed
    entry/exit attendance cycles.
    */

    if (entries > 0) {

        attendance =
            Math.min(
                100,
                Math.round(
                    (
                        Math.min(entries, exits) /
                        entries
                    ) * 100
                )
            );
    }


    users[userIndex].attendance =
        attendance;


    saveUsers(users);


    /*
    Synchronize currently logged-in user.
    */

    try {

        const currentUser =
            JSON.parse(
                localStorage.getItem(
                    "smartCampusUser"
                ) || "null"
            );


        if (
            currentUser &&
            String(currentUser.id || "") ===
            String(userId || "")
        ) {

            currentUser.attendance =
                attendance;


            localStorage.setItem(
                "smartCampusUser",
                JSON.stringify(currentUser)
            );
        }

    } catch (error) {

        console.error(
            "Unable to synchronize current user:",
            error
        );
    }
}


/* ======================================================
   REGISTER RFID CARD
====================================================== */

async function registerRFIDCard(
    userIdentifier,
    cardId
) {

    const cleanIdentifier =
        String(userIdentifier || "")
            .trim();


    const cleanCardId =
        String(cardId || "")
            .trim()
            .toUpperCase();


    if (
        !cleanIdentifier ||
        !cleanCardId
    ) {

        return {

            success: false,

            message:
                "User ID and RFID card ID are required."
        };
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/rfid/link`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    studentId: cleanIdentifier,
                    cardId: cleanCardId
                })
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            return {
                success: false,
                message:
                    data?.message ||
                    "Unable to link RFID card."
            };
        }

        const users = getUsers();
        const user = findUser(cleanIdentifier);

        if (user) {
            user.cardId = cleanCardId;
            user.rfid = cleanCardId;
            user.cardStatus = "Active";
            user.cardLinkedAt = new Date().toISOString();
            saveUsers(users);
        }

        return {
            success: true,
            message:
                data?.message ||
                `RFID card ${cleanCardId} successfully linked.`,
            user: user || null,
            backend: true
        };
    } catch (error) {
        console.error("Backend RFID link failed:", error);
    }

    const users = getUsers();
    const user = findUser(cleanIdentifier);

    if (!user) {
        return {
            success: false,
            message: "User was not found."
        };
    }

    const cardAlreadyUsed =
        users.some(existingUser => {

            if (
                existingUser.id === user.id
            ) {

                return false;
            }

            const existingCard =
                String(
                    existingUser.cardId ||
                    existingUser.rfid ||
                    ""
                )
                    .trim()
                    .toUpperCase();

            return existingCard === cleanCardId;
        });

    if (cardAlreadyUsed) {
        return {
            success: false,
            message:
                "This RFID card is already linked to another user."
        };
    }

    user.cardId = cleanCardId;
    user.rfid = cleanCardId;
    user.cardStatus = "Active";
    user.cardLinkedAt = new Date().toISOString();

    saveUsers(users);

    try {
        const currentUser = JSON.parse(
            localStorage.getItem("smartCampusUser") || "null"
        );

        if (
            currentUser &&
            currentUser.id === user.id
        ) {
            localStorage.setItem(
                "smartCampusUser",
                JSON.stringify(user)
            );
        }
    } catch (error) {
        console.error("Unable to synchronize current user:", error);
    }

    return {
        success: true,
        message:
            `RFID card ${cleanCardId} successfully linked to ${user.name}.`,
        user: user
    };
}


/* ======================================================
   REMOVE RFID CARD
====================================================== */

async function removeRFIDCard(userIdentifier) {

    const cleanIdentifier =
        String(userIdentifier || "")
            .trim();


    if (!cleanIdentifier) {

        return {

            success: false,

            message:
                "User ID is required."
        };
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/rfid/unlink/${encodeURIComponent(cleanIdentifier)}`,
            {
                method: "DELETE"
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message =
                data?.message ||
                "Unable to remove RFID card.";

            return {
                success: false,
                message
            };
        }

        const users = getUsers();
        const user = findUser(cleanIdentifier);

        if (user) {
            delete user.cardId;
            delete user.rfid;
            user.cardStatus = "Not linked";
            delete user.cardLinkedAt;
            saveUsers(users);
        }

        return {
            success: true,
            message:
                data?.message ||
                "RFID card removed successfully.",
            backend: true
        };
    } catch (error) {
        console.error("Backend RFID unlink failed:", error);
    }

    const users = getUsers();
    const user = findUser(cleanIdentifier);

    if (!user) {
        return {
            success: false,
            message: "User was not found."
        };
    }

    if (!user.cardId && !user.rfid) {
        return {
            success: false,
            message:
                "This user does not have an RFID card linked."
        };
    }

    delete user.cardId;
    delete user.rfid;
    user.cardStatus = "Not linked";
    delete user.cardLinkedAt;

    saveUsers(users);

    try {
        const currentUser = JSON.parse(
            localStorage.getItem("smartCampusUser") || "null"
        );

        if (currentUser && currentUser.id === user.id) {
            localStorage.setItem(
                "smartCampusUser",
                JSON.stringify(user)
            );
        }
    } catch (error) {
        console.error("Unable to synchronize user:", error);
    }

    return {
        success: true,
        message: `RFID card removed from ${user.name}.`
    };
}


/* ======================================================
   GET USER RFID INFORMATION
====================================================== */

function getUserRFID(userIdentifier) {

    const user =
        findUser(userIdentifier);


    if (!user) {

        return null;
    }


    return {

        userId:
            user.id || "",

        name:
            user.name || "",

        phone:
            user.phone || "",

        role:
            user.role || "",

        cardId:
            user.cardId ||
            user.rfid ||
            "",

        status:
            user.cardStatus ||
            "Not linked"
    };
}


/* ======================================================
   GET ALL RFID ATTENDANCE RECORDS
====================================================== */

function getAllRFIDAttendance() {

    return getAttendanceRecords();
}


/* ======================================================
   GET LAST RFID SCAN
====================================================== */

function getLastRFIDScan() {

    const records =
        getAttendanceRecords();


    if (!records.length) {

        return null;
    }


    return records[
        records.length - 1
    ];
}


/* ======================================================
   CLEAR ATTENDANCE RECORDS
====================================================== */

function clearRFIDAttendanceRecords() {

    localStorage.removeItem(
        "smartCampusAttendance"
    );


    return {

        success: true,

        message:
            "Attendance records cleared."
    };
}


/* ======================================================
   EXPOSE FUNCTIONS
====================================================== */

window.findUserById =
    findUserById;

window.findUserByPhone =
    findUserByPhone;

window.findUserByUsername =
    findUserByUsername;

window.findUser =
    findUser;

window.findUserByRFID =
    findUserByRFID;

window.processRFIDScan =
    processRFIDScan;

window.registerRFIDCard =
    registerRFIDCard;

window.removeRFIDCard =
    removeRFIDCard;

window.getUserRFID =
    getUserRFID;

window.getAllRFIDAttendance =
    getAllRFIDAttendance;

window.getLastRFIDScan =
    getLastRFIDScan;

window.clearRFIDAttendanceRecords =
    clearRFIDAttendanceRecords;


/* ======================================================
   SYSTEM LOADED
====================================================== */

console.log(
    "SmartCard L.D.K RFID Admin System loaded successfully."
);