"use strict";

const API_BASE_URL = "http://localhost:3000";

const user = JSON.parse(
  localStorage.getItem("smartCampusUser") || "null"
);

if (!user) {
  window.location.href = "login.html";
}

if (user && user.role !== "Parent") {
  window.location.href = "admin.html";
}

const linkedStudent = user?.linkedStudent || null;

function getElement(...ids) {
  for (const id of ids) {
    const element = document.getElementById(id);

    if (element) {
      return element;
    }
  }

  return null;
}

function setText(ids, value) {
  const element = getElement(...ids);

  if (element) {
    element.textContent = value ?? "";
  }
}

function formatDateTime(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function calculateAttendance(records) {
  if (!records.length) {
    return 0;
  }

  const entries = records.filter(
    record =>
      String(
        record.type ||
        record.scanType ||
        record.action ||
        ""
      ).toUpperCase() === "ENTRY"
  );

  const exits = records.filter(
    record =>
      String(
        record.type ||
        record.scanType ||
        record.action ||
        ""
      ).toUpperCase() === "EXIT"
  );

  if (!entries.length) {
    return 0;
  }

  const days = new Set();

  entries.forEach(record => {
    const value =
      record.timestamp ||
      record.scannedAt ||
      record.date ||
      record.createdAt;

    if (value) {
      const date = new Date(value);

      if (!Number.isNaN(date.getTime())) {
        days.add(
          date.toISOString().split("T")[0]
        );
      }
    }
  });

  if (!days.size) {
    return Math.min(
      100,
      Math.round(
        (entries.length /
          Math.max(entries.length, exits.length)) *
          100
      )
    );
  }

  return 100;
}

function renderStudentInfo(studentProfile = null) {
  if (!linkedStudent) {
    setText(
      ["studentName", "student-name"],
      "No student linked"
    );

    setText(
      ["studentId", "student-id"],
      ""
    );

    setText(
      ["studentClass", "student-class"],
      ""
    );

    setText(
      ["cardStatus"],
      "Not Linked"
    );

    return;
  }

  setText(
    ["studentName", "student-name"],
    linkedStudent.name
  );

  setText(
    ["studentId", "student-id"],
    linkedStudent.studentId
  );

  setText(
    ["studentClass", "student-class"],
    linkedStudent.class
  );

  const cardId =
    studentProfile?.rfidCardId ||
    studentProfile?.cardId ||
    "";

  setText(
    ["cardStatus"],
    cardId ? `Linked (${cardId})` : "Not Linked"
  );
}

function renderAttendance(records) {
  const container =
    getElement(
      "attendanceList",
      "attendance-list",
      "attendanceTableBody",
      "attendanceRecords"
    );

  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!records.length) {
    container.innerHTML = `
      <div class="no-attendance">
        No RFID attendance records found.
      </div>
    `;

    return;
  }

  records.forEach(record => {
    const type = String(
      record.type ||
      record.scanType ||
      record.action ||
      ""
    ).toUpperCase();

    const timestamp =
      record.timestamp ||
      record.scannedAt ||
      record.date ||
      record.createdAt;

    const cardId =
      record.cardId ||
      record.rfid ||
      record.rfidCardId ||
      "—";

    const row = document.createElement("div");

    row.className =
      "attendance-record " +
      (type === "ENTRY"
        ? "attendance-entry"
        : "attendance-exit");

    row.innerHTML = `
      <div class="attendance-type">
        <span>
          ${type === "ENTRY" ? "🟢" : "🔴"}
        </span>

        <strong>
          ${type || "SCAN"}
        </strong>
      </div>

      <div class="attendance-time">
        ${formatDateTime(timestamp)}
      </div>

      <div class="attendance-card">
        Card: ${cardId}
      </div>
    `;

    container.appendChild(row);
  });
}

function renderTable(records, studentProfile = null) {
  const tbody =
    document.getElementById(
      "attendanceTableBody"
    );

  if (!tbody) {
    return false;
  }

  tbody.innerHTML = "";

  if (!records.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          No attendance records found.
        </td>
      </tr>
    `;

    return true;
  }

  records.forEach(record => {
    const type = String(
      record.type ||
      record.scanType ||
      record.action ||
      ""
    ).toUpperCase();

    const timestamp =
      record.timestamp ||
      record.scannedAt ||
      record.date ||
      record.createdAt;

    const dateValue =
      timestamp
        ? new Date(timestamp)
        : null;

    const cardId =
      record.cardId ||
      record.rfid ||
      record.rfidCardId ||
      "—";

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        ${dateValue && !Number.isNaN(dateValue.getTime())
          ? dateValue.toLocaleDateString()
          : "—"}
      </td>

      <td>
        ${dateValue && !Number.isNaN(dateValue.getTime())
          ? dateValue.toLocaleTimeString()
          : "—"}
      </td>

      <td>
        ${linkedStudent?.name || studentProfile?.name || "—"}
      </td>

      <td>
        ${linkedStudent?.studentId || studentProfile?.studentId || "—"}
      </td>

      <td>
        ${linkedStudent?.class || studentProfile?.class || "—"}
      </td>

      <td>
        ${type === "ENTRY" ? "🟢 ENTRY" : type === "EXIT" ? "🔴 EXIT" : "📡 SCAN"}
      </td>
    `;

    tbody.appendChild(row);
  });

  return true;
}

async function loadStudentProfile() {
  if (!linkedStudent?.studentId) {
    return null;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/students/${encodeURIComponent(linkedStudent.studentId)}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.student || data || null;
  } catch (error) {
    console.error("Student profile loading error:", error);
    return null;
  }
}

async function loadAttendance() {
  if (!linkedStudent?.studentId) {
    renderStudentInfo();

    setText(
      ["attendanceRate", "attendance-rate"],
      "0%"
    );

    const container =
      getElement(
        "attendanceList",
        "attendance-list",
        "attendanceTableBody"
      );

    if (container) {
      container.innerHTML = `
        <div class="no-attendance">
          Please link a student first.
        </div>
      `;
    }

    return;
  }

  const studentProfile = await loadStudentProfile();

  renderStudentInfo(studentProfile);

  const studentId =
    encodeURIComponent(
      linkedStudent.studentId
    );

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/rfid/student/${studentId}/history`
    );

    if (!response.ok) {
      throw new Error(
        `Attendance request failed: ${response.status}`
      );
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(
        data.message ||
        "Unable to load attendance."
      );
    }

    const records =
      Array.isArray(data.attendance)
        ? data.attendance
        : [];

    renderAttendance(records);

    const renderedTable =
      renderTable(records, studentProfile);

    if (!renderedTable) {
      renderAttendance(records);
    }

    const rate =
      calculateAttendance(records);

    setText(
      ["attendanceRate", "attendance-rate"],
      `${rate}%`
    );

    setText(
      ["totalScans", "total-scans"],
      records.length
    );

    setText(
      ["entryCount", "entry-count"],
      records.filter(
        record =>
          String(
            record.type ||
            record.scanType ||
            record.action ||
            ""
          ).toUpperCase() === "ENTRY"
      ).length
    );

    setText(
      ["exitCount", "exit-count"],
      records.filter(
        record =>
          String(
            record.type ||
            record.scanType ||
            record.action ||
            ""
          ).toUpperCase() === "EXIT"
      ).length
    );

  } catch (error) {
    console.error(
      "Attendance loading error:",
      error
    );

    const container =
      getElement(
        "attendanceList",
        "attendance-list",
        "attendanceTableBody"
      );

    if (container) {
      container.innerHTML = `
        <div class="attendance-error">
          Unable to load attendance from the school server.
          Please try again.
        </div>
      `;
    }
  }
}

function refreshAttendance() {
  loadAttendance();
}

function goBack() {
  window.location.href =
    "dashboard.html";
}

function logout() {
  localStorage.removeItem(
    "smartCampusUser"
  );

  localStorage.removeItem(
    "smartCampusRemember"
  );

  window.location.href =
    "login.html";
}

window.refreshAttendance =
  refreshAttendance;

window.goBack =
  goBack;

window.logout =
  logout;

document.addEventListener(
  "DOMContentLoaded",
  () => {
    loadAttendance();
  }
);