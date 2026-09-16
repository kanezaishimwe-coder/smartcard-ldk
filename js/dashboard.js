"use strict";

const API_BASE_URL = "http://localhost:3000";

let user = JSON.parse(
  localStorage.getItem("smartCampusUser") || "null"
);

if (!user) {
  window.location.href = "login.html";
}

if (user && user.role !== "Parent") {
  window.location.href = "admin.html";
}

function loadElement(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value ?? "";
  }
}

function saveUser() {
  localStorage.setItem(
    "smartCampusUser",
    JSON.stringify(user)
  );
}

async function refreshLinkedStudentBalance() {
  if (!user?.id) {
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/parents/${encodeURIComponent(user.id)}/student`
    );

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const linkedStudent = data.linkedStudent || null;

    if (!linkedStudent) {
      user.linkedStudent = null;
      saveUser();
      return;
    }

    const balance = Number(linkedStudent.balance ?? 0);

    user.balance = balance;
    user.wallet = balance;
    user.linkedStudent = {
      studentId: linkedStudent.studentId || linkedStudent.id || "",
      name: linkedStudent.name || "",
      class: linkedStudent.class || "",
      balance
    };

    saveUser();
  } catch (error) {
    console.error("Unable to refresh linked student balance:", error);
  }
}

async function loadDashboard() {
  if (!user) return;

  await refreshLinkedStudentBalance();

  loadElement("username", user.name || "Parent");

  const linkedStudent = user.linkedStudent || null;

  if (linkedStudent) {
    loadElement(
      "studentName",
      linkedStudent.name || ""
    );

    loadElement(
      "studentId",
      linkedStudent.studentId || ""
    );

    loadElement(
      "studentClass",
      linkedStudent.class || ""
    );
  } else {
    loadElement("studentName", "No student linked");
    loadElement("studentId", "");
    loadElement("studentClass", "");
  }

  loadElement("userRole", "Parent");

  const balance = Number(
    user.balance ?? user.wallet ?? 0
  );

  loadElement(
    "walletBalance",
    balance.toLocaleString() + " RWF"
  );

  loadElement(
    "attendanceRate",
    Number(user.attendance || 0) + "%"
  );

  await loadParentNotifications();
  await loadSchoolActivities();
  loadLinkedStudentBox();
  await loadLibraryHistory();
}

async function loadSchoolActivities() {
  const container = document.getElementById("activitiesList");
  if (!container) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/activities`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const activities = Array.isArray(data.activities) ? data.activities : [];

    if (!activities.length) {
      container.innerHTML = `
        <div class="activity">
          <span>📅</span>
          <div>
            <strong>No upcoming activities</strong>
            <small>School activities will appear here.</small>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = "";
    activities.slice(0, 5).forEach(activity => {
      const item = document.createElement("div");
      item.className = "activity";
      const typeIcons = {
        "ACADEMIC": "📚",
        "SPORTS": "⚽",
        "CULTURAL": "🎭",
        "MEETING": "👥",
        "EXAM": "📝",
        "HOLIDAY": "🏖️"
      };
      const typeIcon = typeIcons[activity.activityType] || "📅";
      item.innerHTML = `
        <span>${typeIcon}</span>
        <div>
          <strong>${escapeHtml(activity.title)}</strong>
          <small>${escapeHtml(activity.eventDate)}${activity.location ? " • " + escapeHtml(activity.location) : ""}</small>
        </div>
      `;
      container.appendChild(item);
    });
  } catch (error) {
    console.error("Unable to load school activities:", error);
    container.innerHTML = `
      <div class="activity">
        <span>📅</span>
        <div>
          <strong>Activities unavailable</strong>
          <small>Could not load school activities.</small>
        </div>
      </div>
    `;
  }
}

async function loadLibraryHistory() {
  const studentId = user?.linkedStudent?.studentId;
  if (!studentId) return;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/students/${encodeURIComponent(studentId)}/library`
    );
    if (!response.ok) return;

    const data = await response.json();
    const loans = Array.isArray(data.loans) ? data.loans : [];
    document.getElementById("libraryHistorySection")?.remove();

    const section = document.createElement("section");
    section.id = "libraryHistorySection";
    section.className = "panel library-panel";
    section.innerHTML = `
      <div class="panel-header">
        <div><span class="panel-icon">📚</span><h2>Library History</h2></div>
      </div>
      <div class="library-list">
        ${loans.length ? loans.slice(0, 5).map((loan) => `
          <div class="library-row">
            <div><strong>${escapeHtml(loan.bookTitle)}</strong><small>Borrowed ${escapeHtml(loan.borrowDate)}</small></div>
            <span class="library-status ${loan.status === "RETURNED" ? "returned" : "borrowed"}">${escapeHtml(loan.status)}</span>
          </div>
        `).join("") : `<div class="empty-library">No library loans yet.</div>`}
      </div>
    `;

    document.querySelector(".dashboard-container")?.appendChild(section);
  } catch (error) {
    console.error("Unable to load library history:", error);
  }
}

async function loadParentNotifications() {
  const notificationCount = document.getElementById("notificationCount");
  const activityBox = document.getElementById("activities");

  if (!user?.id) {
    if (notificationCount) {
      notificationCount.textContent = "0";
    }
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/parents/${encodeURIComponent(user.id)}/notifications`
    );

    const data = await response.json();
    const notifications = Array.isArray(data.notifications) ? data.notifications : [];

    if (notificationCount) {
      notificationCount.textContent = String(notifications.length);
    }

    if (activityBox) {
      activityBox.innerHTML = "";

      if (notifications.length === 0) {
        const empty = document.createElement("div");
        empty.className = "activity";
        empty.innerHTML = `
          <span>🔔</span>
          <div>
            <strong>No notifications yet</strong>
            <small>School updates will appear here.</small>
          </div>
        `;
        activityBox.appendChild(empty);
        return;
      }

      notifications.slice(0, 4).forEach((notification) => {
        const item = document.createElement("div");
        item.className = "activity";
        item.innerHTML = `
          <span>${notification.type === "PAYMENT" ? "💳" : notification.type === "ATTENDANCE" ? "📅" : "🔔"}</span>
          <div>
            <strong>${escapeHtml(notification.title || "School update")}</strong>
            <small>${escapeHtml(notification.message || "No message")}</small>
          </div>
        `;
        activityBox.appendChild(item);
      });
    }
  } catch (error) {
    console.error("Unable to load notifications:", error);
    if (notificationCount) {
      notificationCount.textContent = "0";
    }
  }
}

function loadLinkedStudentBox() {
  const existing = document.getElementById(
    "studentLinkSection"
  );

  if (existing) {
    existing.remove();
  }

  const container =
    document.querySelector(".dashboard-container") ||
    document.querySelector("main") ||
    document.body;

  const section = document.createElement("section");

  section.id = "studentLinkSection";
  section.className = "student-link-section";

  if (user.linkedStudent) {
    section.innerHTML = `
      <div class="student-link-card">
        <div>
          <h3>Linked Student</h3>
          <p class="linked-student-name">
            ${escapeHtml(user.linkedStudent.name)}
          </p>
          <p>
            Student ID:
            <strong>
              ${escapeHtml(user.linkedStudent.studentId)}
            </strong>
          </p>
          <p>
            Class:
            <strong>
              ${escapeHtml(user.linkedStudent.class)}
            </strong>
          </p>
        </div>

        <button
          type="button"
          id="changeStudentBtn"
        >
          Change Student
        </button>
      </div>
    `;

    container.appendChild(section);

    const changeButton =
      document.getElementById("changeStudentBtn");

    if (changeButton) {
      changeButton.addEventListener(
        "click",
        showStudentLinkForm
      );
    }

    return;
  }

  showStudentLinkForm();
}

function showStudentLinkForm() {
  const section =
    document.getElementById("studentLinkSection");

  if (!section) return;

  section.innerHTML = `
    <div class="student-link-card">
      <h3>Link Your Student</h3>

      <p>
        Enter your student's Student ID to connect
        their school information to your account.
      </p>

      <form id="studentLinkForm">

        <div class="form-group">
          <label for="studentIdInput">
            Student ID
          </label>

          <input
            type="text"
            id="studentIdInput"
            placeholder="Example: ST20260001"
            autocomplete="off"
            required
          >
        </div>

        <button
          type="submit"
          id="findStudentBtn"
        >
          Find Student
        </button>

        <div
          id="studentLinkMessage"
          class="student-link-message"
        ></div>

      </form>

      <div
        id="studentPreview"
        class="student-preview"
        style="display:none;"
      >
        <h4>Student Found</h4>

        <p>
          Name:
          <strong id="previewName"></strong>
        </p>

        <p>
          Student ID:
          <strong id="previewId"></strong>
        </p>

        <p>
          Class:
          <strong id="previewClass"></strong>
        </p>

        <button
          type="button"
          id="confirmStudentBtn"
        >
          Confirm & Link Student
        </button>
      </div>
    </div>
  `;

  const form =
    document.getElementById("studentLinkForm");

  if (form) {
    form.addEventListener(
      "submit",
      findStudent
    );
  }
}

let studentToLink = null;

async function findStudent(event) {
  event.preventDefault();

  const input =
    document.getElementById("studentIdInput");

  const message =
    document.getElementById("studentLinkMessage");

  const preview =
    document.getElementById("studentPreview");

  const button =
    document.getElementById("findStudentBtn");

  if (!input || !message || !preview) return;

  const studentId =
    input.value.trim().toUpperCase();

  if (!studentId) {
    message.textContent =
      "Please enter a Student ID.";

    return;
  }

  button.disabled = true;
  button.textContent = "Searching...";

  message.textContent = "";
  preview.style.display = "none";

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/students/${encodeURIComponent(studentId)}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        data.error ||
        "Student not found."
      );
    }

    const student =
      data.student || data;

    studentToLink = {
      studentId:
        student.studentId ||
        student.id ||
        student.student_id ||
        studentId,

      name:
        student.name ||
        student.fullName ||
        student.full_name ||
        "",

      class:
        student.class ||
        student.studentClass ||
        student.student_class ||
        ""
    };

    if (!studentToLink.name) {
      throw new Error(
        "Student information is incomplete."
      );
    }

    document.getElementById(
      "previewName"
    ).textContent =
      studentToLink.name;

    document.getElementById(
      "previewId"
    ).textContent =
      studentToLink.studentId;

    document.getElementById(
      "previewClass"
    ).textContent =
      studentToLink.class || "Not available";

    preview.style.display = "block";

    message.textContent =
      "Student found successfully.";

    const confirmButton =
      document.getElementById(
        "confirmStudentBtn"
      );

    if (confirmButton) {
      confirmButton.onclick =
        confirmStudentLink;
    }

  } catch (error) {
    console.error(
      "Student lookup error:",
      error
    );

    message.textContent =
      error.message ||
      "Unable to find student.";

    studentToLink = null;

  } finally {
    button.disabled = false;
    button.textContent = "Find Student";
  }
}

async function confirmStudentLink() {
  if (!studentToLink || !user?.id) return;

  const messageBox =
    document.getElementById("studentLinkMessage");

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/parents/link-student`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: user.id,
          studentId: studentToLink.studentId
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to link student.");
    }

    const linkedStudent = data.linkedStudent || {
      studentId: studentToLink.studentId,
      name: studentToLink.name,
      class: studentToLink.class,
      balance: 0
    };

    user.linkedStudent = {
      studentId: linkedStudent.studentId,
      name: linkedStudent.name,
      class: linkedStudent.class,
      balance: Number(linkedStudent.balance || 0)
    };

    user.balance = Number(linkedStudent.balance || 0);
    user.wallet = Number(linkedStudent.balance || 0);
    saveUser();

    studentToLink = null;
    await loadDashboard();

    if (messageBox) {
      messageBox.textContent = data.message || "Student linked successfully.";
    }
  } catch (error) {
    console.error("Student link error:", error);

    if (messageBox) {
      messageBox.textContent = error.message || "Unable to link student.";
    }
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const paymentStatus =
  localStorage.getItem("notification");

if (paymentStatus) {
  const activityBox =
    document.getElementById("activities");

  if (activityBox) {
    const activity =
      document.createElement("div");

    activity.className =
      "activity success";

    activity.textContent =
      "✔ " + paymentStatus;

    activityBox.prepend(activity);
  }

  localStorage.removeItem(
    "notification"
  );
}

function openPayment() {
  window.location.href =
    "payment.html";
}

function openAttendance() {
  window.location.href =
    "attendance.html";
}

function logout() {
  localStorage.removeItem(
    "smartCampusUser"
  );

  localStorage.removeItem(
    "smartCampusRemember"
  );

  localStorage.removeItem(
    "notification"
  );

  window.location.href =
    "login.html";
}

window.openPayment =
  openPayment;

window.openAttendance =
  openAttendance;

window.logout =
  logout;

loadDashboard();