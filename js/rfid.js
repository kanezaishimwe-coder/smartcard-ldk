"use strict";

/* =========================================================
   SMARTCARD L.D.K — RFID ENGINE
   =========================================================

   RFID FLOW:

   RFID CARD
      ↓
   Find student
      ↓
   Check last scan
      ↓
   ENTRY / EXIT
      ↓
   Save date + time
      ↓
   Update student
      ↓
   Save attendance history

   Storage:
   smartCampusUsers
   smartCampusAttendance
========================================================= */


/* =========================================================
   STORAGE HELPERS
========================================================= */

function getUsers() {
    try {
        const users = JSON.parse(
            localStorage.getItem("smartCampusUsers") || "[]"
        );

        return Array.isArray(users) ? users : [];

    } catch (error) {

        console.error(
            "SmartCard L.D.K: Unable to read users.",
            error
        );

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
            localStorage.getItem(
                "smartCampusAttendance"
            ) || "[]"
        );

        return Array.isArray(records)
            ? records
            : [];

    } catch (error) {

        console.error(
            "SmartCard L.D.K: Unable to read attendance.",
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


/* =========================================================
   NORMALIZE RFID
========================================================= */

function normalizeCardId(cardId) {

    return String(cardId || "")
        .trim()
        .toUpperCase();
}


/* =========================================================
   FIND STUDENT BY RFID CARD
========================================================= */

function findStudentByCard(cardId) {

    const normalizedCard =
        normalizeCardId(cardId);

    if (!normalizedCard) {
        return null;
    }

    const users = getUsers();

    return users.find(user => {

        const registeredCard =
            normalizeCardId(
                user.cardId || user.rfid
            );

        return (
            registeredCard &&
            registeredCard === normalizedCard
        );

    }) || null;
}


/* =========================================================
   FIND STUDENT BY STUDENT ID
========================================================= */

function findStudentById(studentId) {

    const cleanStudentId =
        String(studentId || "")
            .trim()
            .toUpperCase();

    if (!cleanStudentId) {
        return null;
    }

    const users = getUsers();

    return users.find(user => {

        return (
            String(user.studentId || "")
                .trim()
                .toUpperCase() ===
            cleanStudentId
        );

    }) || null;
}


/* =========================================================
   GET LAST SCAN FOR STUDENT
========================================================= */

function getLastStudentScan(studentId) {

    const records =
        getAttendanceRecords();

    const cleanStudentId =
        String(studentId || "")
            .trim()
            .toUpperCase();

    const studentRecords =
        records.filter(record => {

            return (
                String(record.studentId || "")
                    .trim()
                    .toUpperCase() ===
                cleanStudentId
            );

        });

    if (!studentRecords.length) {
        return null;
    }

    return (
        studentRecords[
            studentRecords.length - 1
        ]
    );
}


/* =========================================================
   DETERMINE ENTRY / EXIT
========================================================= */

function determineScanType(studentId) {

    const lastScan =
        getLastStudentScan(studentId);

    /*
        First scan = ENTRY
    */

    if (!lastScan) {
        return "ENTRY";
    }

    /*
        ENTRY → EXIT
    */

    if (
        String(lastScan.type || "")
            .toUpperCase() === "ENTRY"
    ) {

        return "EXIT";
    }

    /*
        EXIT → ENTRY
    */

    return "ENTRY";
}


/* =========================================================
   CURRENT DATE AND TIME
========================================================= */

function getCurrentDateTime() {

    const now = new Date();

    return {

        date:
            now.toLocaleDateString(
                "en-GB"
            ),

        time:
            now.toLocaleTimeString(
                "en-GB",
                {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                }
            ),

        timestamp:
            now.toISOString()

    };
}


/* =========================================================
   RECORD RFID SCAN
========================================================= */

function recordRFIDScan(cardId) {

    const cleanCardId =
        normalizeCardId(cardId);

    /*
        Validate card
    */

    if (!cleanCardId) {

        return {

            success: false,

            message:
                "Please scan or enter an RFID card ID."

        };
    }


    /*
        Find student
    */

    const student =
        findStudentByCard(cleanCardId);


    if (!student) {

        return {

            success: false,

            message:
                "This RFID card is not registered to any student."

        };
    }


    /*
        Student must have an active card
    */

    if (
        student.cardStatus &&
        student.cardStatus !== "Active"
    ) {

        return {

            success: false,

            message:
                "This RFID card is not active."

        };
    }


    /*
        Determine ENTRY / EXIT
    */

    const type =
        determineScanType(
            student.studentId ||
            student.id
        );


    /*
        Get date and time
    */

    const current =
        getCurrentDateTime();


    /*
        Create attendance record
    */

    const record = {

        id:
            "ATT-" +
            Date.now(),

        studentId:
            student.studentId || "",

        userId:
            student.id || "",

        cardId:
            cleanCardId,

        name:
            student.name ||
            "Unknown Student",

        class:
            student.class ||
            "N/A",

        type:
            type,

        date:
            current.date,

        time:
            current.time,

        timestamp:
            current.timestamp

    };


    /*
        Save attendance
    */

    const records =
        getAttendanceRecords();

    records.push(record);

    saveAttendanceRecords(records);


    /*
        Update student
    */

    const users =
        getUsers();


    const studentIndex =
        users.findIndex(user => {

            return (
                String(user.id) ===
                String(student.id)
            );

        });


    if (studentIndex !== -1) {

        /*
            Card remains active
        */

        users[studentIndex].cardStatus =
            "Active";


        /*
            Last scan information
        */

        users[studentIndex].lastScanType =
            type;

        users[studentIndex].lastScanDate =
            current.date;

        users[studentIndex].lastScanTime =
            current.time;

        users[studentIndex].lastScanTimestamp =
            current.timestamp;


        /*
            Keep total scan counter
        */

        if (
            typeof users[studentIndex]
                .scanCount !== "number"
        ) {

            users[studentIndex].scanCount =
                0;
        }

        users[studentIndex].scanCount++;


        /*
            Count ENTRY scans
            as attendance visits.
        */

        if (
            typeof users[studentIndex]
                .attendanceCount !== "number"
        ) {

            users[studentIndex]
                .attendanceCount = 0;
        }


        if (type === "ENTRY") {

            users[studentIndex]
                .attendanceCount++;
        }


        /*
            Save updated student
        */

        saveUsers(users);
    }


    /*
        Update currently logged-in
        SmartCard user if necessary.
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
            String(currentUser.id) ===
            String(student.id)
        ) {

            const updatedStudent =
                users[studentIndex];

            if (updatedStudent) {

                localStorage.setItem(
                    "smartCampusUser",
                    JSON.stringify(
                        updatedStudent
                    )
                );
            }
        }

    } catch (error) {

        console.error(
            "Unable to update current user:",
            error
        );
    }


    /*
        Return result to scanner
    */

    return {

        success: true,

        message:
            `Student ${student.name || "Unknown"} recorded as ${type}.`,

        type:

            type,

        student: {

            id:
                student.id || "",

            studentId:
                student.studentId || "",

            name:
                student.name ||
                "Unknown Student",

            class:
                student.class ||
                "N/A",

            cardId:
                cleanCardId

        },

        record:
            record

    };
}


/* =========================================================
   REGISTER RFID CARD
========================================================= */

function registerRFIDCard(
    studentId,
    cardId
) {

    const cleanStudentId =
        String(studentId || "")
            .trim()
            .toUpperCase();

    const cleanCardId =
        normalizeCardId(cardId);


    /*
        Validate input
    */

    if (
        !cleanStudentId ||
        !cleanCardId
    ) {

        return {

            success: false,

            message:
                "Student ID and RFID card ID are required."

        };
    }


    const users =
        getUsers();


    /*
        Find student
    */

    const studentIndex =
        users.findIndex(user => {

            return (
                String(
                    user.studentId || ""
                )
                    .trim()
                    .toUpperCase() ===
                cleanStudentId
            );

        });


    if (studentIndex === -1) {

        return {

            success: false,

            message:
                "Student was not found."

        };
    }


    /*
        Check whether this card
        is already assigned.
    */

    const cardAlreadyUsed =
        users.some(
            (user, index) => {

                if (
                    index ===
                    studentIndex
                ) {

                    return false;
                }

                const existingCard =
                    normalizeCardId(
                        user.cardId ||
                        user.rfid
                    );

                return (
                    existingCard ===
                    cleanCardId
                );
            }
        );


    if (cardAlreadyUsed) {

        return {

            success: false,

            message:
                "This RFID card is already assigned to another student."

        };
    }


    /*
        If the student already has
        another card, replace it.
    */

    users[studentIndex].cardId =
        cleanCardId;

    users[studentIndex].rfid =
        cleanCardId;

    users[studentIndex].cardStatus =
        "Active";

    users[studentIndex].cardLinkedAt =
        new Date().toISOString();


    /*
        Save users
    */

    saveUsers(users);


    /*
        Return updated student
    */

    return {

        success: true,

        message:
            `RFID card ${cleanCardId} assigned successfully.`,

        student:
            users[studentIndex]

    };
}


/* =========================================================
   REMOVE RFID CARD
========================================================= */

function removeRFIDCard(studentId) {

    const cleanStudentId =
        String(studentId || "")
            .trim()
            .toUpperCase();


    if (!cleanStudentId) {

        return {

            success: false,

            message:
                "Student ID is required."

        };
    }


    const users =
        getUsers();


    /*
        Find student
    */

    const studentIndex =
        users.findIndex(user => {

            return (
                String(
                    user.studentId || ""
                )
                    .trim()
                    .toUpperCase() ===
                cleanStudentId
            );

        });


    if (studentIndex === -1) {

        return {

            success: false,

            message:
                "Student was not found."

        };
    }


    /*
        Check if a card exists
    */

    const oldCard =
        users[studentIndex].cardId ||
        users[studentIndex].rfid ||
        "";


    if (!oldCard) {

        return {

            success: false,

            message:
                "This student does not have an RFID card."

        };
    }


    /*
        Remove card
    */

    users[studentIndex].cardId =
        "";

    users[studentIndex].rfid =
        "";

    users[studentIndex].cardStatus =
        "Not linked";

    users[studentIndex].cardLinkedAt =
        null;


    /*
        Save
    */

    saveUsers(users);


    return {

        success: true,

        message:
            `RFID card ${oldCard} removed successfully.`

    };
}


/* =========================================================
   GET STUDENT ATTENDANCE
========================================================= */

function getStudentAttendance(
    studentId
) {

    const cleanStudentId =
        String(studentId || "")
            .trim()
            .toUpperCase();


    if (!cleanStudentId) {
        return [];
    }


    const records =
        getAttendanceRecords();


    return records.filter(record => {

        return (
            String(
                record.studentId || ""
            )
                .trim()
                .toUpperCase() ===
            cleanStudentId
        );

    });
}


/* =========================================================
   GET CARD STATUS
========================================================= */

function getCardStatus(
    studentId
) {

    const student =
        findStudentById(studentId);


    if (!student) {
        return null;
    }


    return {

        studentId:
            student.studentId || "",

        cardId:
            student.cardId ||
            student.rfid ||
            "",

        status:
            student.cardStatus ||
            "Not linked",

        lastScanType:
            student.lastScanType ||
            null,

        lastScanDate:
            student.lastScanDate ||
            null,

        lastScanTime:
            student.lastScanTime ||
            null,

        lastScanTimestamp:
            student.lastScanTimestamp ||
            null

    };
}


/* =========================================================
   GET ALL RFID ATTENDANCE
========================================================= */

function getAllRFIDAttendance() {

    return getAttendanceRecords();
}


/* =========================================================
   CLEAR RFID ATTENDANCE
   TESTING ONLY
========================================================= */

function clearRFIDAttendance() {

    localStorage.removeItem(
        "smartCampusAttendance"
    );


    /*
        Reset student scan information
    */

    const users =
        getUsers();


    users.forEach(user => {

        user.lastScanType =
            null;

        user.lastScanDate =
            null;

        user.lastScanTime =
            null;

        user.lastScanTimestamp =
            null;

        user.scanCount =
            0;

        user.attendanceCount =
            0;

    });


    saveUsers(users);


    return {

        success: true,

        message:
            "RFID attendance records cleared."

    };
}


/* =========================================================
   EXPORT FUNCTIONS
========================================================= */

window.recordRFIDScan =
    recordRFIDScan;

window.registerRFIDCard =
    registerRFIDCard;

window.removeRFIDCard =
    removeRFIDCard;

window.getStudentAttendance =
    getStudentAttendance;

window.getCardStatus =
    getCardStatus;

window.getAllRFIDAttendance =
    getAllRFIDAttendance;

window.clearRFIDAttendance =
    clearRFIDAttendance;

window.findStudentByCard =
    findStudentByCard;

window.findStudentById =
    findStudentById;

window.determineScanType =
    determineScanType;


/* =========================================================
   READY MESSAGE
========================================================= */

console.log(
    "SmartCard L.D.K RFID Engine loaded successfully."
);