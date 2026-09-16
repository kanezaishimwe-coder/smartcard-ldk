const express = require("express");

const router = express.Router();

let db = null;

function setDatabase(database) {
  db = database;
}

function normalizeCardId(cardId) {
  return String(cardId || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database is not connected."));
      return;
    }

    db.run(sql, params, function (error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        id: this.lastID,
        changes: this.changes
      });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database is not connected."));
      return;
    }

    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database is not connected."));
      return;
    }

    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows || []);
    });
  });
}

function getStudentId(student) {
  return student.student_id ||
    student.studentId ||
    student.id ||
    "";
}

function getStudentName(student) {
  return student.name ||
    student.full_name ||
    student.fullName ||
    "Unknown Student";
}

function getStudentClass(student) {
  return student.class ||
    student.class_name ||
    student.className ||
    "N/A";
}

function getStudentCard(student) {
  return normalizeCardId(
    student.rfid_card_id ||
    student.rfidCardId ||
    student.rfid ||
    student.card_id ||
    student.cardId ||
    ""
  );
}

async function getTableColumns(table) {
  const rows = await all(`PRAGMA table_info("${table}")`);
  return rows.map(row => row.name);
}

async function ensureRFIDColumn() {
  const columns = await getTableColumns("students");

  const possibleColumns = [
    "rfid_card_id",
    "rfidCardId",
    "rfid",
    "card_id",
    "cardId"
  ];

  const existingColumn = possibleColumns.find(column =>
    columns.includes(column)
  );

  if (existingColumn) {
    return existingColumn;
  }

  await run(
    `ALTER TABLE students ADD COLUMN rfid_card_id TEXT`
  );

  return "rfid_card_id";
}

async function findStudentByCard(cardId) {
  const normalizedCardId = normalizeCardId(cardId);

  if (!normalizedCardId) {
    return null;
  }

  try {
    const students = await all(`SELECT * FROM students`);

    for (const student of students) {
      if (getStudentCard(student) === normalizedCardId) {
        return student;
      }
    }
  } catch (error) {
    if (!error.message.includes("no such table")) {
      throw error;
    }
  }

  return null;
}

async function findStudentById(studentId) {
  const normalizedStudentId = String(studentId || "").trim();

  if (!normalizedStudentId) {
    return null;
  }

  try {
    const students = await all(`SELECT * FROM students`);

    for (const student of students) {
      if (
        String(getStudentId(student)) === normalizedStudentId
      ) {
        return {
          student,
          table: "students"
        };
      }
    }
  } catch (error) {
    if (!error.message.includes("no such table")) {
      throw error;
    }
  }

  return null;
}

async function getLastScan(studentId) {
  return get(
    `
    SELECT *
    FROM rfid_attendance
    WHERE student_id = ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [String(studentId)]
  );
}

function nextScanType(lastScan) {
  if (!lastScan) {
    return "ENTRY";
  }

  return String(lastScan.type).toUpperCase() === "ENTRY"
    ? "EXIT"
    : "ENTRY";
}

function getCurrentDateTime() {
  const now = new Date();

  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join(":");

  return {
    date,
    time,
    timestamp: now.toISOString()
  };
}

async function updateAttendanceCount(student) {
  const columns = Object.keys(student);

  let attendanceColumn = null;

  if (columns.includes("attendance_count")) {
    attendanceColumn = "attendance_count";
  } else if (columns.includes("attendanceCount")) {
    attendanceColumn = "attendanceCount";
  }

  if (!attendanceColumn) {
    return;
  }

  const currentValue = Number(student[attendanceColumn]) || 0;

  await run(
    `UPDATE students SET "${attendanceColumn}" = ? WHERE id = ?`,
    [
      currentValue + 1,
      student.id
    ]
  );
}

async function createRFIDNotification(studentId, type, date, time) {
  try {
    const link = await get(
      `SELECT parent_id FROM parent_student_links WHERE student_id = ?`,
      [studentId]
    );
    
    if (!link?.parent_id) return;

    const student = await findStudentById(studentId);
    if (!student) return;

    const studentData = student.student || student;
    const studentName = getStudentName(studentData);
    
    const notifType = type === "ENTRY" ? "STUDENT_ENTRY" : "STUDENT_EXIT";
    const action = type === "ENTRY" ? "entered" : "exited";
    
    await run(
      `INSERT INTO notifications (parent_id, student_id, type, title, message, read_flag) VALUES (?, ?, ?, ?, ?, 0)`,
      [
        link.parent_id,
        studentId,
        notifType,
        `${studentName} ${action} school`,
        `${studentName} ${action} school at ${time} on ${date}.`,
      ]
    );
  } catch (error) {
    console.error("RFID notification error:", error.message);
  }
}

router.post("/scan", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        ok: false,
        message: "Database is not connected."
      });
    }

    const cardId = normalizeCardId(
      req.body.cardId ||
      req.body.rfid ||
      req.body.rfidCardId
    );

    if (!cardId) {
      return res.status(400).json({
        ok: false,
        message: "RFID card ID is required."
      });
    }

    const student = await findStudentByCard(cardId);

    if (!student) {
      return res.status(404).json({
        ok: false,
        message: "RFID card is not registered."
      });
    }

    const studentId = getStudentId(student);

    if (!studentId) {
      return res.status(500).json({
        ok: false,
        message: "Student ID is missing."
      });
    }

    const lastScan = await getLastScan(studentId);

    if (lastScan) {
      const lastTimestamp = new Date(lastScan.timestamp).getTime();

      if (
        !Number.isNaN(lastTimestamp) &&
        Date.now() - lastTimestamp < 3000
      ) {
        return res.status(429).json({
          ok: false,
          message: "Card scanned too quickly. Please wait."
        });
      }
    }

    const type = nextScanType(lastScan);
    const { date, time, timestamp } = getCurrentDateTime();

    await run(
      `
      INSERT INTO rfid_attendance
      (
        student_id,
        card_id,
        type,
        date,
        time,
        timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        String(studentId),
        cardId,
        type,
        date,
        time,
        timestamp
      ]
    );

    await updateAttendanceCount(student);

    // Create parent notification for RFID scan
    await createRFIDNotification(String(studentId), type, date, time);

    return res.json({
      ok: true,
      message: `RFID ${type.toLowerCase()} recorded successfully.`,
      scan: {
        cardId,
        studentId,
        name: getStudentName(student),
        class: getStudentClass(student),
        type,
        date,
        time,
        timestamp
      }
    });
  } catch (error) {
    console.error("RFID scan error:", error);

    return res.status(500).json({
      ok: false,
      message: "Unable to process RFID scan.",
      error: error.message
    });
  }
});

router.post("/link", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        ok: false,
        message: "Database is not connected."
      });
    }

    const studentId = String(
      req.body.studentId || ""
    ).trim();

    const cardId = normalizeCardId(
      req.body.cardId ||
      req.body.rfid ||
      req.body.rfidCardId
    );

    if (!studentId || !cardId) {
      return res.status(400).json({
        ok: false,
        message: "Student ID and RFID card ID are required."
      });
    }

    const studentResult = await findStudentById(studentId);

    if (!studentResult) {
      return res.status(404).json({
        ok: false,
        message: "Student not found."
      });
    }

    const existingStudent = await findStudentByCard(cardId);

    if (
      existingStudent &&
      String(getStudentId(existingStudent)) !== studentId
    ) {
      return res.status(409).json({
        ok: false,
        message: "This RFID card is already linked to another student."
      });
    }

    const currentStudentCard = getStudentCard(studentResult.student || studentResult);

    if (
      currentStudentCard &&
      currentStudentCard !== cardId
    ) {
      return res.status(409).json({
        ok: false,
        message: "This student already has another RFID card assigned. Remove the existing card first."
      });
    }

    const cardColumn = await ensureRFIDColumn();

    await run(
      `UPDATE students SET "${cardColumn}" = ? WHERE id = ?`,
      [
        cardId,
        studentId
      ]
    );

    return res.json({
      ok: true,
      message: "RFID card linked successfully.",
      studentId,
      cardId
    });
  } catch (error) {
    console.error("RFID link error:", error);

    return res.status(500).json({
      ok: false,
      message: "Unable to link RFID card.",
      error: error.message
    });
  }
});

router.delete("/unlink/:studentId", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        ok: false,
        message: "Database is not connected."
      });
    }

    const studentId = String(
      req.params.studentId || ""
    ).trim();

    const studentResult = await findStudentById(studentId);

    if (!studentResult) {
      return res.status(404).json({
        ok: false,
        message: "Student not found."
      });
    }

    const cardColumn = await ensureRFIDColumn();

    await run(
      `UPDATE students SET "${cardColumn}" = NULL WHERE id = ?`,
      [studentId]
    );

    return res.json({
      ok: true,
      message: "RFID card removed successfully.",
      studentId
    });
  } catch (error) {
    console.error("RFID unlink error:", error);

    return res.status(500).json({
      ok: false,
      message: "Unable to remove RFID card.",
      error: error.message
    });
  }
});

router.get("/student/:studentId", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        ok: false,
        message: "Database is not connected."
      });
    }

    const studentId = String(
      req.params.studentId || ""
    ).trim();

    if (!studentId) {
      return res.status(400).json({
        ok: false,
        message: "Student ID is required."
      });
    }

    const studentResult = await findStudentById(studentId);

    if (!studentResult) {
      return res.status(404).json({
        ok: false,
        message: "Student not found."
      });
    }

    const student = studentResult.student;

    return res.json({
      ok: true,
      student: {
        studentId: getStudentId(student),
        name: getStudentName(student),
        class: getStudentClass(student),
        balance: Number(student.balance || 0),
        rfidCardId: getStudentCard(student) || null
      }
    });

  } catch (error) {
    console.error("Student lookup error:", error);

    return res.status(500).json({
      ok: false,
      message: "Unable to find student.",
      error: error.message
    });
  }
});

router.get("/student/:studentId/history", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        ok: false,
        message: "Database is not connected."
      });
    }

    const studentId = String(
      req.params.studentId || ""
    ).trim();

    const student = await findStudentById(studentId);

    if (!student) {
      return res.status(404).json({
        ok: false,
        message: "Student not found."
      });
    }

    const records = await all(
      `
      SELECT
        id,
        student_id,
        card_id,
        type,
        date,
        time,
        timestamp
      FROM rfid_attendance
      WHERE student_id = ?
      ORDER BY id DESC
      `,
      [studentId]
    );

    return res.json({
      ok: true,
      student: {
        studentId,
        name: getStudentName(student.student),
        class: getStudentClass(student.student)
      },
      attendance: records
    });
  } catch (error) {
    console.error("RFID history error:", error);

    return res.status(500).json({
      ok: false,
      message: "Unable to load RFID attendance.",
      error: error.message
    });
  }
});

router.get("/card/:cardId", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        ok: false,
        message: "Database is not connected."
      });
    }

    const cardId = normalizeCardId(
      req.params.cardId
    );

    if (!cardId) {
      return res.status(400).json({
        ok: false,
        message: "RFID card ID is required."
      });
    }

    const student = await findStudentByCard(cardId);

    if (!student) {
      return res.status(404).json({
        ok: false,
        message: "RFID card is not registered."
      });
    }

    return res.json({
      ok: true,
      cardId,
      student: {
        studentId: getStudentId(student),
        name: getStudentName(student),
        class: getStudentClass(student)
      }
    });
  } catch (error) {
    console.error("RFID card lookup error:", error);

    return res.status(500).json({
      ok: false,
      message: "Unable to find RFID card.",
      error: error.message
    });
  }
});

router.get("/attendance", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({
        ok: false,
        message: "Database is not connected."
      });
    }

    const records = await all(`
      SELECT
        a.id,
        a.student_id,
        a.card_id,
        a.type,
        a.date,
        a.time,
        a.timestamp,
        s.name,
        s.class
      FROM rfid_attendance a
      LEFT JOIN students s
        ON s.id = a.student_id
      ORDER BY a.id DESC
    `);

    return res.json({
      ok: true,
      attendance: records
    });
  } catch (error) {
    console.error("RFID attendance error:", error);

    return res.status(500).json({
      ok: false,
      message: "Unable to load RFID attendance.",
      error: error.message
    });
  }
});

async function initializeRFIDDatabase() {
  if (!db) {
    throw new Error("Database is not connected.");
  }

  await ensureRFIDColumn();

  await run(`
    CREATE TABLE IF NOT EXISTS rfid_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_rfid_attendance_student
    ON rfid_attendance(student_id)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_rfid_attendance_card
    ON rfid_attendance(card_id)
  `);

  console.log("RFID attendance table ready.");
  console.log("RFID student card column ready.");
}

router.setDatabase = setDatabase;
router.initializeRFIDDatabase = initializeRFIDDatabase;

module.exports = router;