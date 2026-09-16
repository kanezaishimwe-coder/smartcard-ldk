// ==========================================
// SMARTCARD L.D.K - ACTIVITIES & EVENTS
// ==========================================

"use strict";

const ACTIVITY_API_URL = "http://localhost:3000/api";

let activities = [];

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function showActivityMessage(text, success = false) {
    const message = document.getElementById("activityMessage");
    if (!message) return;
    message.textContent = text;
    message.style.color = success ? "#15803d" : "#dc2626";
}

async function loadActivities() {
    const body = document.getElementById("activityTableBody");
    if (!body) return;

    body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:25px;">Loading activities...</td></tr>`;

    try {
        const response = await fetch(`${ACTIVITY_API_URL}/activities`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        activities = Array.isArray(data.activities) ? data.activities : [];
        renderActivities(activities);
    } catch (error) {
        console.error("Unable to load activities:", error);
        body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:25px;color:#777;">Unable to load activities.</td></tr>`;
    }
}

function renderActivities(list) {
    const body = document.getElementById("activityTableBody");
    if (!body) return;
    body.innerHTML = "";

    if (!list.length) {
        body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#777;padding:25px;">No activities created yet.</td></tr>`;
        return;
    }

    list.forEach(activity => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>${escapeHTML(activity.title)}</strong></td>
            <td>${escapeHTML(activity.activityType)}</td>
            <td>${escapeHTML(activity.eventDate)}</td>
            <td>${escapeHTML(activity.location || "-")}</td>
            <td>${escapeHTML(activity.targetClass || "All")}</td>
            <td><span class="card-status ${activity.active ? "active" : "inactive"}">${activity.active ? "Active" : "Inactive"}</span></td>
            <td>
                <button class="view-btn edit-activity-btn" data-id="${activity.id}">Edit</button>
                <button class="view-btn delete-activity-btn" data-id="${activity.id}" data-active="${activity.active}">${activity.active ? "Deactivate" : "Activate"}</button>
            </td>
        `;
        body.appendChild(row);
    });

    body.querySelectorAll(".edit-activity-btn").forEach(btn => {
        btn.addEventListener("click", () => editActivity(Number(btn.dataset.id)));
    });
    body.querySelectorAll(".delete-activity-btn").forEach(btn => {
        btn.addEventListener("click", () => toggleActivity(Number(btn.dataset.id), btn.dataset.active === "true"));
    });
}

function editActivity(id) {
    const activity = activities.find(a => a.id === id);
    if (!activity) return;

    document.getElementById("activityTitle").value = activity.title;
    document.getElementById("activityDescription").value = activity.description || "";
    document.getElementById("activityType").value = activity.activityType;
    document.getElementById("activityDate").value = activity.eventDate;
    document.getElementById("activityLocation").value = activity.location || "";
    document.getElementById("activityTargetClass").value = activity.targetClass || "";

    const form = document.getElementById("activityForm");
    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) {
        submitBtn.textContent = "Update Activity";
        submitBtn.dataset.editingId = id;
    }
    showActivityMessage(`Editing: ${activity.title}`, true);
}

async function toggleActivity(id, currentlyActive) {
    const newActive = !currentlyActive;
    try {
        const response = await fetch(`${ACTIVITY_API_URL}/activities/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: newActive ? 1 : 0 })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await loadActivities();
    } catch (error) {
        console.error("Toggle activity error:", error);
    }
}

const activityForm = document.getElementById("activityForm");
activityForm?.addEventListener("submit", async function (event) {
    event.preventDefault();

    const title = document.getElementById("activityTitle").value.trim();
    const description = document.getElementById("activityDescription").value.trim();
    const activityType = document.getElementById("activityType").value;
    const eventDate = document.getElementById("activityDate").value;
    const location = document.getElementById("activityLocation").value.trim();
    const targetClass = document.getElementById("activityTargetClass").value.trim();
    const submitBtn = activityForm.querySelector("button[type='submit']");
    const editingId = submitBtn?.dataset.editingId;

    if (!title || !eventDate) {
        showActivityMessage("Title and event date are required.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    try {
        const method = editingId ? "PUT" : "POST";
        const url = editingId ? `${ACTIVITY_API_URL}/activities/${editingId}` : `${ACTIVITY_API_URL}/activities`;

        const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, description, activityType, eventDate, location, targetClass })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not save activity.");

        showActivityMessage(data.message, true);
        activityForm.reset();
        delete submitBtn.dataset.editingId;
        submitBtn.textContent = "Create Activity";
        await loadActivities();
    } catch (error) {
        showActivityMessage(error.message);
    } finally {
        submitBtn.disabled = false;
    }
});

document.getElementById("activitySearch")?.addEventListener("input", function (event) {
    const search = event.target.value.toLowerCase().trim();
    const filtered = activities.filter(a =>
        a.title.toLowerCase().includes(search) ||
        a.activityType.toLowerCase().includes(search) ||
        (a.location || "").toLowerCase().includes(search)
    );
    renderActivities(filtered);
});

function initializeActivitiesPage() {
    const authenticated = sessionStorage.getItem("smartCardAdminAuth") === "true";
    if (authenticated) {
        document.getElementById("adminLogin").classList.add("hidden");
        document.getElementById("adminPanel").classList.remove("hidden");
        document.getElementById("adminName").textContent = "Headmaster";
        loadActivities();
    }
}

window.toggleAdminPassword = function () {
    const input = document.getElementById("adminPassword");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
};

window.adminLogout = function () {
    sessionStorage.removeItem("smartCardAdminAuth");
    window.location.href = "admin-login.html";
};

initializeActivitiesPage();