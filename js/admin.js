"use strict";

const API_BASE_URL = "http://localhost:3000";

const adminLogin = document.getElementById("adminLogin");
const adminPanel = document.getElementById("adminPanel");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminLoginMessage = document.getElementById("adminLoginMessage");
const cardForm = document.getElementById("cardForm");
const removeCardBtn = document.getElementById("removeCardBtn");

let backendAttendance = [];
let backendStudents = [];
let adminToken = null;

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

function getPayments() {
    try {
        const payments = JSON.parse(
            localStorage.getItem("smartCampusPayments") || "[]"
        );

        return Array.isArray(payments) ? payments : [];
    } catch (error) {
        console.error("Unable to read payments:", error);
        return [];
    }
}

function getAttendanceRecords() {
    try {
        const records = JSON.parse(
            localStorage.getItem("smartCampusAttendance") || "[]"
        );

        return Array.isArray(records) ? records : [];
    } catch (error) {
        console.error("Unable to read attendance:", error);
        return [];
    }
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function toggleAdminPassword() {
    const input =
        document.getElementById("adminPassword");

    if (!input) return;

    input.type =
        input.type === "password"
            ? "text"
            : "password";
}

function showAdminMessage(
    message,
    success = false
) {
    if (!adminLoginMessage) return;

    adminLoginMessage.textContent =
        message;

    adminLoginMessage.style.color =
        success
            ? "#15803d"
            : "#dc2626";
}

function openAdminPanel() {
    if (!adminLogin || !adminPanel) {
        return;
    }

    adminLogin.classList.add("hidden");
    adminPanel.classList.remove("hidden");

    const adminName =
        document.getElementById("adminName");

    if (adminName) {
        adminName.textContent =
            "Headmaster";
    }

    loadAdminData();
    loadCardStudents();
}

adminLoginForm?.addEventListener(
    "submit",
    async function (event) {
        event.preventDefault();

        const username =
            document
                .getElementById("adminUsername")
                ?.value
                .trim() || "";

        const password =
            document
                .getElementById("adminPassword")
                ?.value || "";

        if (!username || !password) {
            showAdminMessage(
                "Username and password are required."
            );

            return;
        }

        try {
            const response = await fetch(
                `${API_BASE_URL}/api/admin/login`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ username, password })
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                showAdminMessage(
                    data.message ||
                    "Invalid administrator credentials."
                );

                return;
            }

            adminToken = data.token;
            sessionStorage.setItem(
                "smartCardAdminToken",
                data.token
            );
            sessionStorage.setItem(
                "smartCardAdminAuth",
                "true"
            );
            if (data.admin) {
                sessionStorage.setItem(
                    "smartCardAdminInfo",
                    JSON.stringify(data.admin)
                );
            }

            showAdminMessage(
                "Login successful.",
                true
            );

            openAdminPanel();
        } catch (error) {
            console.error("Admin login error:", error);
            showAdminMessage(
                "Could not connect to the server."
            );
        }
    }
);

function adminLogout() {
    sessionStorage.removeItem(
        "smartCardAdminAuth"
    );

    sessionStorage.removeItem(
        "smartCardAdminToken"
    );

    localStorage.removeItem(
        "smartCampusAdmin"
    );

    adminToken = null;

    window.location.href =
        "admin-login.html";
}

function getStudents() {
    if (backendStudents.length) {
        return backendStudents;
    }

    return getUsers().filter(user => {
        const role =
            String(user.role || "")
                .trim()
                .toLowerCase();

        return role === "student";
    });
}

function findUserById(userId) {
    const cleanId =
        String(userId || "").trim();

    if (!cleanId) return null;

    return (
        getUsers().find(user => {
            return (
                String(user.id || "").trim() ===
                cleanId
            );
        }) || null
    );
}

function calculateTotalBalance(
    students = getStudents()
) {
    let total = 0;

    students.forEach(student => {
        const balance = Number(
            student.balance ??
            student.wallet ??
            0
        );

        if (Number.isFinite(balance)) {
            total += balance;
        }
    });

    return total;
}

function calculateActiveCards(
    students = getStudents()
) {
    let count = 0;

    students.forEach(student => {
        const active =
            String(
                student.cardStatus || ""
            )
                .trim()
                .toLowerCase() === "active" ||
            Boolean(student.cardId) ||
            Boolean(student.rfid);

        if (active) {
            count++;
        }
    });

    return count;
}

async function loadAdminData() {
    await loadBackendStudents();

    const students = getStudents();

    const totalStudentsElement =
        document.getElementById(
            "totalStudents"
        );

    if (totalStudentsElement) {
        totalStudentsElement.textContent =
            students.length;
    }

    const totalBalanceElement =
        document.getElementById(
            "totalBalance"
        );

    if (totalBalanceElement) {
        totalBalanceElement.textContent =
            `${calculateTotalBalance(
                students
            ).toLocaleString()} RWF`;
    }

    const activeCardsElement =
        document.getElementById(
            "activeCards"
        );

    if (activeCardsElement) {
        activeCardsElement.textContent =
            calculateActiveCards(
                students
            );
    }

    renderStudents(students);
    renderPayments();

    loadRFIDAttendance();
    loadLibraryLoans();
}

async function loadLibraryLoans() {
    const container = document.getElementById("libraryLoans");
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/library/loans`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const loans = Array.isArray(data.loans) ? data.loans : [];
        container.innerHTML = loans.length ? loans.slice(0, 10).map((loan) => `
            <div class="activity-item library-loan-item">
                <strong>${escapeHTML(loan.bookTitle)}</strong>
                <span>${escapeHTML(loan.studentName)} | Due ${escapeHTML(loan.expectedReturnDate || "-")}</span>
                <span class="library-status ${loan.status === "RETURNED" ? "returned" : loan.status === "OVERDUE" ? "overdue" : "borrowed"}">${escapeHTML(loan.status)}</span>
                ${loan.status === "BORROWED" || loan.status === "OVERDUE" ? `
                    <button class="view-btn library-return-btn" data-loan-id="${loan.id}">Return</button>
                    ${loan.status === "OVERDUE" ? `<button class="view-btn library-fine-btn" data-loan-id="${loan.id}" data-fine="${loan.fine || 50}">Apply Fine</button>` : ""}
                ` : ""}
            </div>
        `).join("") : '<div class="empty-item">No library loans yet.</div>';

        container.querySelectorAll(".library-return-btn").forEach((button) => {
            button.addEventListener("click", async () => {
                button.disabled = true;
                try {
                    const returnResponse = await fetch(`${API_BASE_URL}/api/library/return`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ loanId: Number(button.dataset.loanId) })
                    });
                    if (!returnResponse.ok) throw new Error(`HTTP ${returnResponse.status}`);
                    await loadLibraryLoans();
                } catch (error) {
                    console.error("Unable to return library book:", error);
                    button.disabled = false;
                }
            });
        });

        container.querySelectorAll(".library-fine-btn").forEach((button) => {
            button.addEventListener("click", async () => {
                button.disabled = true;
                try {
                    const fineResponse = await fetch(`${API_BASE_URL}/api/library/loans/${button.dataset.loanId}/fine`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fineAmount: Number(button.dataset.fine) })
                    });
                    if (!fineResponse.ok) throw new Error(`HTTP ${fineResponse.status}`);
                    await loadLibraryLoans();
                } catch (error) {
                    console.error("Unable to apply fine:", error);
                    button.disabled = false;
                }
            });
        });
    } catch (error) {
        console.error("Unable to load library loans:", error);
        container.innerHTML = '<div class="empty-item">Library data is unavailable.</div>';
    }
}

async function loadBackendStudents() {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/students`
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        backendStudents = Array.isArray(data.students)
            ? data.students
            : [];

        loadCardStudents();
    } catch (error) {
        console.error("Unable to load backend students:", error);
        backendStudents = [];
    }
}

function renderStudents(
    students = getStudents()
) {
    const body =
        document.getElementById(
            "studentTableBody"
        );

    if (!body) return;

    body.innerHTML = "";

    if (!students.length) {
        body.innerHTML = `
            <tr>
                <td
                    colspan="7"
                    style="text-align:center;color:#777;padding:25px;"
                >
                    No students registered yet.
                </td>
            </tr>
        `;

        return;
    }

    students.forEach(student => {
        const row =
            document.createElement("tr");

        const balance = Number(
            student.balance ??
            student.wallet ??
            0
        );

        const attendance = Number(
            student.attendance || 0
        );

        const cardActive =
            String(
                student.cardStatus || ""
            )
                .trim()
                .toLowerCase() === "active" ||
            Boolean(student.cardId) ||
            Boolean(student.rfid);

        const cardStatus =
            cardActive
                ? "Active"
                : "Not linked";

        row.innerHTML = `
            <td>
                <strong>
                    ${escapeHTML(
                        student.name ||
                        "Unknown"
                    )}
                </strong>

                ${
                    student.phone
                        ? `
                            <small>
                                ${escapeHTML(
                                    student.phone
                                )}
                            </small>
                        `
                        : ""
                }
            </td>

            <td>
                ${escapeHTML(
                    student.studentId ||
                    "N/A"
                )}
            </td>

            <td>
                ${escapeHTML(
                    student.class ||
                    "N/A"
                )}
            </td>

            <td>
                ${
                    Number.isFinite(balance)
                        ? balance.toLocaleString()
                        : "0"
                }
                RWF
            </td>

            <td>
                ${
                    Number.isFinite(attendance)
                        ? attendance
                        : 0
                }%
            </td>

            <td>
                <span
                    class="card-status ${
                        cardActive
                            ? "active"
                            : "inactive"
                    }"
                >
                    ${cardStatus}
                </span>
            </td>

            <td>
                <button
                    class="view-btn"
                    type="button"
                    data-student-id="${escapeHTML(
                        student.id || ""
                    )}"
                >
                    View
                </button>
                <button
                    class="view-btn edit-student-btn"
                    type="button"
                    data-student-id="${escapeHTML(
                        student.id || ""
                    )}"
                >
                    Edit
                </button>
                <button
                    class="view-btn delete-student-btn"
                    type="button"
                    data-student-id="${escapeHTML(
                        student.id || ""
                    )}"
                >
                    Delete
                </button>
            </td>
        `;

        body.appendChild(row);
    });
}

function viewStudent(id) {
    const student =
        findUserById(id);

    if (!student) {
        alert(
            "Student not found."
        );

        return;
    }

    const balance = Number(
        student.balance ??
        student.wallet ??
        0
    );

    const card =
        student.cardId ||
        student.rfid ||
        "Not linked";

    alert(
        "Student: " +
        (student.name ||
            "Unknown") +

        "\nStudent ID: " +
        (student.studentId ||
            "N/A") +

        "\nClass: " +
        (student.class ||
            "N/A") +

        "\nPhone: " +
        (student.phone ||
            "N/A") +

        "\nBalance: " +
        balance.toLocaleString() +
        " RWF" +

        "\nAttendance: " +
        Number(
            student.attendance || 0
        ) +
        "%" +

        "\nRFID Card: " +
        card
    );
}

function editStudent(id) {
    const student = findUserById(id);
    if (!student) {
        alert("Student not found.");
        return;
    }

    const newName = prompt("Edit student name:", student.name || "");
    if (newName === null) return;

    const newClass = prompt("Edit student class:", student.class || "");
    if (newClass === null) return;

    const newBalanceStr = prompt("Edit student balance:", String(Number(student.balance ?? student.wallet ?? 0)));
    if (newBalanceStr === null) return;

    const newBalance = Number(newBalanceStr);
    if (!Number.isInteger(newBalance) || newBalance < 0) {
        alert("Balance must be a non-negative whole number.");
        return;
    }

    updateStudent(id, newName.trim(), newClass.trim(), newBalance);
}

async function updateStudent(studentId, name, studentClass, balance) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/students/${encodeURIComponent(studentId)}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...(adminToken ? { "X-Admin-Token": adminToken } : {})
                },
                body: JSON.stringify({ name, class: studentClass, balance })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            alert(data.message || "Could not update student.");
            return;
        }

        alert("Student updated successfully.");
        loadAdminData();
    } catch (error) {
        console.error("Update student error:", error);
        alert("Could not connect to the server.");
    }
}

async function deleteStudent(id) {
    const student = findUserById(id);
    const confirmMsg = student
        ? `Permanently delete ${student.name} (ID: ${student.studentId || id})? This cannot be undone.`
        : "Permanently delete this student? This cannot be undone.";

    if (!confirm(confirmMsg)) return;

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/students/${encodeURIComponent(id)}`,
            {
                method: "DELETE",
                headers: {
                    ...(adminToken ? { "X-Admin-Token": adminToken } : {})
                }
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            alert(data.message || "Could not delete student.");
            return;
        }

        alert("Student deleted successfully.");
        loadAdminData();
    } catch (error) {
        console.error("Delete student error:", error);
        alert("Could not connect to the server.");
    }
}

document
    .getElementById(
        "studentTableBody"
    )
    ?.addEventListener(
        "click",
        function (event) {
            const button =
                event.target.closest(
                    ".view-btn, .edit-student-btn, .delete-student-btn"
                );

            if (!button) return;

            const id =
                button.dataset
                    .studentId;

            if (!id) return;

            if (button.classList.contains("view-btn")) {
                viewStudent(id);
            } else if (button.classList.contains("edit-student-btn")) {
                editStudent(id);
            } else if (button.classList.contains("delete-student-btn")) {
                deleteStudent(id);
            }
        }
    );

document
    .getElementById(
        "studentSearch"
    )
    ?.addEventListener(
        "input",
        function (event) {
            const search =
                event.target.value
                    .toLowerCase()
                    .trim();

            const students =
                getStudents().filter(
                    student => {
                        const name =
                            String(
                                student.name ||
                                ""
                            ).toLowerCase();

                        const studentId =
                            String(
                                student.studentId ||
                                ""
                            ).toLowerCase();

                        const className =
                            String(
                                student.class ||
                                ""
                            ).toLowerCase();

                        return (
                            name.includes(
                                search
                            ) ||
                            studentId.includes(
                                search
                            ) ||
                            className.includes(
                                search
                            )
                        );
                    }
                );

            renderStudents(
                students
            );
        }
    );

function renderPayments() {
    const box =
        document.getElementById(
            "paymentList"
        );

    if (!box) return;

    const payments =
        getPayments();

    box.innerHTML = "";

    if (!payments.length) {
        box.innerHTML = `
            <div class="empty-item">
                No payments recorded yet.
            </div>
        `;

        return;
    }

    payments
        .slice(-8)
        .reverse()
        .forEach(payment => {
            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "activity-item";

            const amount =
                Number(
                    payment.amount ||
                    0
                ).toLocaleString();

            const studentId =
                escapeHTML(
                    payment.studentId ||
                    "Unknown student"
                );

            const status =
                escapeHTML(
                    payment.status ||
                    "Recorded"
                );

            item.innerHTML = `
                <strong>
                    ${amount} RWF
                </strong>

                <span>
                    ${studentId}
                    •
                    ${status}
                </span>
            `;

            box.appendChild(item);
        });
}

async function loadRFIDAttendance() {
    const box =
        document.getElementById(
            "attendanceList"
        );

    if (!box) return;

    box.innerHTML = `
        <div class="empty-item">
            Loading RFID attendance...
        </div>
    `;

    try {
        const response =
            await fetch(
                `${API_BASE_URL}/api/rfid/attendance`
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        if (
            data &&
            data.ok === false
        ) {
            throw new Error(
                data.message ||
                "Unable to load RFID attendance."
            );
        }

        const records =
            Array.isArray(
                data.attendance
            )
                ? data.attendance
                : Array.isArray(
                    data.records
                )
                    ? data.records
                    : Array.isArray(
                        data
                    )
                        ? data
                        : [];

        backendAttendance =
            records;

        await renderRFIDAttendance(
            records
        );

        updateSchoolAttendance(
            records
        );

    } catch (error) {
        console.error(
            "RFID attendance error:",
            error
        );

        backendAttendance = [];

        box.innerHTML = `
            <div class="empty-item">
                Unable to load RFID attendance.
            </div>
        `;

        updateSchoolAttendance(
            []
        );
    }
}

async function renderRFIDAttendance(
    records
) {
    const box =
        document.getElementById(
            "attendanceList"
        );

    if (!box) return;

    box.innerHTML = "";

    if (!records.length) {
        box.innerHTML = `
            <div class="empty-item">
                No RFID attendance records yet.
            </div>
        `;

        return;
    }

    const recentRecords =
        records
            .slice()
            .sort(
                (a, b) =>
                    Number(
                        b.id || 0
                    ) -
                    Number(
                        a.id || 0
                    )
            )
            .slice(0, 8);

    const studentCache =
        {};

    const studentIds =
        [
            ...new Set(
                recentRecords
                    .map(
                        record =>
                            record.student_id ||
                            record.studentId
                    )
                    .filter(Boolean)
            )
        ];

    await Promise.all(
        studentIds.map(
            async studentId => {
                try {
                    const response =
                        await fetch(
                            `${API_BASE_URL}/api/students/${encodeURIComponent(
                                studentId
                            )}`
                        );

                    if (!response.ok) {
                        return;
                    }

                    const data =
                        await response.json();

                    const student =
                        data.student ||
                        data;

                    studentCache[
                        studentId
                    ] = {
                        name:
                            student.name ||
                            student.fullName ||
                            student.full_name ||
                            studentId,

                        class:
                            student.class ||
                            student.studentClass ||
                            student.student_class ||
                            "N/A"
                    };
                } catch (error) {
                    console.error(
                        `Unable to load student ${studentId}:`,
                        error
                    );
                }
            }
        )
    );

    recentRecords.forEach(
        record => {
            const studentId =
                record.student_id ||
                record.studentId ||
                "Unknown";

            const student =
                studentCache[
                    studentId
                ];

            const name =
                student?.name ||
                findStudentName(
                    studentId
                );

            const className =
                student?.class ||
                findStudentClass(
                    studentId
                );

            const type =
                String(
                    record.type ||
                    "SCAN"
                ).toUpperCase();

            const date =
                record.date ||
                "";

            const time =
                record.time ||
                "";

            const cardId =
                record.card_id ||
                record.cardId ||
                "N/A";

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "activity-item";

            const typeIcon =
                type === "ENTRY"
                    ? "🟢"
                    : type === "EXIT"
                        ? "🔴"
                        : "📡";

            item.innerHTML = `
                <strong>
                    ${typeIcon}
                    ${escapeHTML(
                        name
                    )}
                </strong>

                <span>
                    ${escapeHTML(
                        studentId
                    )}
                    •
                    ${escapeHTML(
                        className
                    )}
                    •
                    ${escapeHTML(
                        type
                    )}
                    •
                    ${escapeHTML(
                        date
                    )}
                    ${
                        time
                            ? ` • ${escapeHTML(
                                time
                            )}`
                            : ""
                    }
                    • Card:
                    ${escapeHTML(
                        cardId
                    )}
                </span>
            `;

            box.appendChild(
                item
            );
        }
    );
}

function findStudentName(
    studentId
) {
    const student =
        getStudents().find(
            item =>
                String(
                    item.studentId ||
                    ""
                ).trim() ===
                String(
                    studentId ||
                    ""
                ).trim()
        );

    return (
        student?.name ||
        studentId ||
        "Unknown student"
    );
}

function findStudentClass(
    studentId
) {
    const student =
        getStudents().find(
            item =>
                String(
                    item.studentId ||
                    ""
                ).trim() ===
                String(
                    studentId ||
                    ""
                ).trim()
        );

    return (
        student?.class ||
        "N/A"
    );
}

function updateSchoolAttendance(
    records
) {
    const element =
        document.getElementById(
            "schoolAttendance"
        );

    if (!element) return;

    const students =
        getStudents();

    if (!students.length) {
        element.textContent =
            "0%";

        return;
    }

    const today =
        new Date()
            .toISOString()
            .split("T")[0];

    const presentStudents =
        new Set();

    records.forEach(
        record => {
            const type =
                String(
                    record.type ||
                    ""
                ).toUpperCase();

            const studentId =
                record.student_id ||
                record.studentId;

            if (
                type === "ENTRY" &&
                studentId
            ) {
                const timestamp =
                    record.timestamp;

                let recordDate =
                    record.date ||
                    "";

                if (
                    timestamp
                ) {
                    const parsed =
                        new Date(
                            timestamp
                        );

                    if (
                        !Number.isNaN(
                            parsed.getTime()
                        )
                    ) {
                        recordDate =
                            parsed
                                .toISOString()
                                .split(
                                    "T"
                                )[0];
                    }
                }

                if (
                    recordDate ===
                    today
                ) {
                    presentStudents.add(
                        String(
                            studentId
                        )
                    );
                }
            }
        }
    );

    const percentage =
        Math.round(
            (
                presentStudents.size /
                students.length
            ) *
            100
        );

    element.textContent =
        `${Math.min(
            percentage,
            100
        )}%`;
}

function loadCardStudents() {
    const select =
        document.getElementById(
            "cardStudent"
        );

    if (!select) return;

    const students =
        getStudents();

    select.innerHTML = `
        <option value="">
            Select student
        </option>
    `;

    students.forEach(
        student => {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                student.id || "";

            option.textContent =
                `${
                    student.name ||
                    "Unknown"
                } • ${
                    student.studentId ||
                    "No ID"
                } • ${
                    student.class ||
                    "No class"
                }`;

            select.appendChild(
                option
            );
        }
    );
}

function showCardMessage(
    text,
    success = false
) {
    const message =
        document.getElementById(
            "cardMessage"
        );

    if (!message) return;

    message.textContent =
        text;

    message.style.color =
        success
            ? "#15803d"
            : "#dc2626";
}

cardForm?.addEventListener(
    "submit",
    async function (event) {
        event.preventDefault();

        const studentId =
            document
                .getElementById(
                    "cardStudent"
                )
                ?.value
                .trim() || "";

        const rfid =
            document
                .getElementById(
                    "rfidCardId"
                )
                ?.value
                .trim()
                .toUpperCase() || "";

        if (!studentId) {
            showCardMessage(
                "Please select a student."
            );

            return;
        }

        if (!rfid) {
            showCardMessage(
                "Please enter the RFID card ID."
            );

            return;
        }

        if (
            typeof window.registerRFIDCard !==
            "function"
        ) {
            showCardMessage(
                "RFID administration module is not loaded."
            );

            return;
        }

        const result =
            await window.registerRFIDCard(
                studentId,
                rfid
            );

        if (
            !result ||
            !result.success
        ) {
            showCardMessage(
                result?.message ||
                "Unable to link RFID card."
            );

            return;
        }

        showCardMessage(
            result.message ||
            "RFID card linked successfully.",
            true
        );

        cardForm.reset();

        loadCardStudents();
        loadAdminData();
    }
);

removeCardBtn?.addEventListener(
    "click",
    async function () {
        const studentId =
            document
                .getElementById(
                    "cardStudent"
                )
                ?.value
                .trim() || "";

        if (!studentId) {
            showCardMessage(
                "Select a student first."
            );

            return;
        }

        const student =
            findUserById(
                studentId
            );

        if (!student) {
            showCardMessage(
                "Student not found."
            );

            return;
        }

        const cardId =
            student.cardId ||
            student.rfid ||
            "";

        if (!cardId) {
            showCardMessage(
                "This student does not have an RFID card linked."
            );

            return;
        }

        const confirmed =
            confirm(
                `Remove RFID card ${cardId} from ${
                    student.name ||
                    "this student"
                }?`
            );

        if (!confirmed) return;

        if (
            typeof window.removeRFIDCard !==
            "function"
        ) {
            showCardMessage(
                "RFID administration module is not loaded."
            );

            return;
        }

        const result =
            await window.removeRFIDCard(
                studentId
            );

        if (
            !result ||
            !result.success
        ) {
            showCardMessage(
                result?.message ||
                "Unable to remove RFID card."
            );

            return;
        }

        showCardMessage(
            result.message ||
            "RFID card removed successfully.",
            true
        );

        cardForm?.reset();

        loadCardStudents();
        loadAdminData();
    }
);

function openRfidScanner() {
    if (
        typeof window.activateRFIDScanner ===
        "function"
    ) {
        window.activateRFIDScanner();
        return;
    }

    if (
        typeof window.startRFIDScanner ===
        "function"
    ) {
        window.startRFIDScanner();
        return;
    }

    if (
        typeof window.openRFIDScanner ===
        "function"
    ) {
        window.openRFIDScanner();
        return;
    }

    alert(
        "RFID Scanner module is not loaded."
    );
}

function refreshAdminDashboard() {
    loadAdminData();
    loadCardStudents();
}

function initializeAdmin() {
    const authenticated =
        sessionStorage.getItem(
            "smartCardAdminAuth"
        ) === "true";

    adminToken = sessionStorage.getItem("smartCardAdminToken");

    if (authenticated && adminToken) {
        openAdminPanel();
    }
}

window.toggleAdminPassword =
    toggleAdminPassword;

window.adminLogout =
    adminLogout;

window.viewStudent =
    viewStudent;

window.editStudent =
    editStudent;

window.deleteStudent =
    deleteStudent;

window.updateStudent =
    updateStudent;

window.showCardMessage =
    showCardMessage;

window.loadAdminData =
    loadAdminData;

window.loadCardStudents =
    loadCardStudents;

window.openRfidScanner =
    openRfidScanner;

window.refreshAdminDashboard =
    refreshAdminDashboard;

window.getStudents =
    getStudents;

window.findUserById =
    findUserById;

initializeAdmin();

console.log(
    "SmartCard L.D.K Admin Dashboard loaded successfully."
);