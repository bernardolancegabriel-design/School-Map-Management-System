/* =========================================================
   SCHOOLMAP — super-admin-dashboard.js
   Super Admin Logic: Admin Mgmt, Backup, Logs, Archive, Reports, Settings
   ========================================================= */

"use strict";

document.addEventListener("DOMContentLoaded", function () {
  // 1. Security Check
  if (!requireSuperAdminPage()) return;

  var user = AppState.currentUser;

  // 2. Init UI
  document.getElementById("sa-username-display").textContent = user.fullName;

  // 3. Load all data
  loadAdmins();
  loadLogs();
  loadSettings();
  loadBackupHistory();
  loadArchives();
  loadReports();

  // Wire delete button clicks via delegation
  var adminList = document.getElementById("admin-list-container");
  if (adminList) {
    adminList.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-action='delete-admin']");
      if (!button) return;
      var id = button.getAttribute("data-admin-id");
      if (id) {
        console.log("deleteAdmin delegation", id);
        deleteAdmin(id);
      }
    });
  }

  // 4. Wire restore file input
  var restoreFile = document.getElementById("restore-file");
  if (restoreFile) {
    restoreFile.addEventListener("change", handleRestore);
  }
});

var API_BASE = "../backend/api.php";

async function apiRequest(action, method, data, id) {
  try {
    var url = API_BASE + "?action=" + encodeURIComponent(action);
    if (id) {
      url += "&id=" + encodeURIComponent(id);
    }

    var init = {
      method: method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {}
    };

    if (data != null && method !== "GET") {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(data);
    }

    var response = await fetch(url, init);
    var payload = null;
    try {
      payload = await response.json();
    } catch (err) {
      payload = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      payload: payload
    };
  } catch (err) {
    console.warn("Admin API request failed:", err);
    return {
      ok: false,
      status: 0,
      payload: null
    };
  }
}

async function createAdminOnServer(adminData) {
  return await apiRequest("admins", "POST", adminData);
}

/* ====================== TAB SWITCHING ====================== */

function switchTab(tabName) {
  // Update sidebar buttons
  document.querySelectorAll(".sa-nav-btn").forEach(function (btn) {
    btn.classList.remove("active");
    if (btn.getAttribute("data-target") === tabName) {
      btn.classList.add("active");
    }
  });

  // Update content panels
  document.querySelectorAll(".sa-tab-content").forEach(function (div) {
    div.style.display = "none";
  });

  var target = document.getElementById("tab-" + tabName);
  if (target) {
    target.style.display = "block";
  }

  // Refresh data on tab switch
  if (tabName === "admins") loadAdmins();
  if (tabName === "logs") loadLogs();
  if (tabName === "reports") loadReports();
  if (tabName === "archive") loadArchives();
  if (tabName === "backup") loadBackupHistory();
}

/* ====================== 1. ADMIN MANAGEMENT ====================== */

async function loadAdmins() {
  var container = document.getElementById("admin-list-container");
  if (!container) return;
  var users = getStoredUsers();

  var admins = users.filter(function (u) {
    return u.role === "admin";
  });

  var serverResult = await apiRequest("admins", "GET");
  if (serverResult.ok && serverResult.payload && Array.isArray(serverResult.payload.data?.admins)) {
    admins = serverResult.payload.data.admins.map(function (admin) {
      return {
        id: admin.user_id || admin.id || ("admin-" + Date.now()),
        fullName: admin.name || admin.fullName || "",
        email: admin.email || "",
        username: (admin.email || "").split("@")[0],
        role: admin.role || "admin",
        isDisabled: !!(admin.isDisabled || admin.is_disabled)
      };
    });
  } else if (serverResult.status === 401 || serverResult.status === 403) {
    showToast("Session expired or not authorized. Please log in again.");
    window.location.href = "login.html";
    return;
  }

  if (admins.length === 0) {
    container.innerHTML = '<p style="opacity:0.5; text-align:center; padding:20px;">No admin accounts yet. Create one using the form.</p>';
    return;
  }

  var html = "";
  admins.forEach(function (admin) {
    var statusBadge = admin.isDisabled
      ? '<span class="sa-badge sa-badge-danger">Disabled</span>'
      : '<span class="sa-badge sa-badge-success">Active</span>';

    html += '<div class="sa-admin-item">' +
      '<div class="sa-admin-info">' +
        '<strong>' + escHtml(admin.fullName) + ' ' + statusBadge + '</strong>' +
        '<small>' + escHtml(admin.email) + '</small>' +
      '</div>' +
      '<div class="sa-admin-actions">' +
        '<button class="wobbly-btn wobbly-btn-sm wobbly-btn-secondary" onclick="resetAdminPassword(\'' + admin.id + '\')">Reset Pass</button>' +
        '<button class="wobbly-btn wobbly-btn-sm ' + (admin.isDisabled ? 'wobbly-btn-primary' : 'wobbly-btn-secondary') + '" onclick="toggleAdminStatus(\'' + admin.id + '\', ' + (admin.isDisabled ? 'true' : 'false') + ')">' + (admin.isDisabled ? 'Enable' : 'Disable') + '</button>' +
        (admin.id !== AppState.currentUser.id ? '<button class="wobbly-btn wobbly-btn-sm wobbly-btn-danger" data-action="delete-admin" data-admin-id="' + escHtml(admin.id) + '">Delete</button>' : '') +
      '</div>' +
    '</div>';
  });
  container.innerHTML = html;
}

async function handleCreateAdmin(e) {
  e.preventDefault();
  var name = document.getElementById("new-admin-name").value.trim();
  var email = document.getElementById("new-admin-email").value.trim();
  var pass = document.getElementById("new-admin-pass").value;

  if (!name || !email || !pass) {
    showToast("Please fill all fields.");
    return;
  }
  if (pass.length < 6) {
    showToast("Password must be at least 6 characters.");
    return;
  }

  var users = getStoredUsers();

  if (users.some(function (u) { return u.email === email; })) {
    showToast("Email already exists.");
    return;
  }

  var newAdmin = {
    id: "admin-" + Date.now(),
    fullName: name,
    email: email,
    username: email.split("@")[0],
    role: "admin",
    password: pass,
    isDisabled: false,
  };

  var serverResponse = await createAdminOnServer({
    fullName: name,
    email: email,
    password: pass,
    role: "admin"
  });

  if (serverResponse.ok && serverResponse.payload && serverResponse.payload.success) {
    var serverAdmin = serverResponse.payload.data.admin;
    if (serverAdmin && serverAdmin.id) {
      newAdmin.id = serverAdmin.id;
    }
    showToast("Admin created in database and saved locally.");
  } else if (serverResponse.status === 401 || serverResponse.status === 403) {
    showToast("Session expired or not authorized. Please log in again.");
    window.location.href = "login.html";
    return;
  } else {
    if (serverResponse.payload && serverResponse.payload.message) {
      var msg = serverResponse.payload.message;
      if (serverResponse.status === 409 || /already/i.test(msg)) {
        showToast(msg);
        return;
      }
    }
    showToast("Database unavailable. Admin saved locally.");
  }

  users.push(newAdmin);
  storeUsers(users);
  addLog("admin", "Created admin account: " + name, "Admin Management");

  document.getElementById("create-admin-form").reset();
  loadAdmins();
}

function deleteAdmin(id) {
  if (!confirm("Are you sure? This will permanently remove this admin.")) return;
  console.log("deleteAdmin called", id);

  apiRequest("admins", "DELETE", null, id)
    .then(function(result) {
      console.log("deleteAdmin result", id, result);

      if (result.ok && result.payload && result.payload.success) {
        showToast("Admin deleted successfully.");
        var users = getStoredUsers();
        var admin = users.find(function(u) { return String(u.id) === String(id); });
        users = users.filter(function(u) { return String(u.id) !== String(id); });
        storeUsers(users);
        addLog("admin", "Deleted admin: " + (admin ? admin.fullName : id), "Admin Management");
        loadAdmins();
        return;
      }

      console.warn("Admin delete failed", result);
      if (result.status === 401 || result.status === 403) {
        showToast("Authorization error. Please log in again.");
        window.location.href = "login.html";
      } else {
        showToast("Failed to delete: " + ((result.payload && result.payload.message) || "Server error"));
      }
    })
    .catch(function(err) {
      console.error("Admin delete error", err);
      showToast("Connection error. Could not delete admin.");
    });
}

function toggleAdminStatus(id, currentlyDisabled) {
  // currentlyDisabled is passed directly from the button so we don't rely on localStorage
  var action = currentlyDisabled ? "enable" : "disable";
  var actionLabel = currentlyDisabled ? "Enable" : "Disable";
  var newDisabledState = !currentlyDisabled;

  // Get admin name for the confirmation message
  var users = getStoredUsers();
  var user = users.find(function(u) { return String(u.id) === String(id); });
  var adminName = user ? user.fullName : "this admin";

  // Confirmation dialog
  var confirmed = confirm(
    actionLabel + " account?\n\n" +
    "Admin: " + adminName + "\n\n" +
    (currentlyDisabled
      ? "This will allow the admin to log in again."
      : "This will prevent the admin from logging in.")
  );
  if (!confirmed) return;

  fetch("../backend/api.php?action=admins&id=" + encodeURIComponent(id), {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isDisabled: newDisabledState })
  })
  .then(function(response) { return response.json(); })
  .then(function(payload) {
    if (payload && payload.success) {
      // Update localStorage to stay in sync
      if (user) {
        user.isDisabled = newDisabledState;
        storeUsers(users);
      }
      addLog("admin",
        (newDisabledState ? "Disabled" : "Enabled") + " admin: " + adminName,
        "Admin Management");
      loadAdmins(); // Reload from DB to get fresh state
      showToast(newDisabledState
        ? adminName + " has been disabled."
        : adminName + " has been enabled.");
    } else {
      showToast("Failed: " + ((payload && payload.message) || "Server error"));
    }
  })
  .catch(function() {
    showToast("Connection error. Could not update admin.");
  });
}

function resetAdminPassword(id) {
  var newPass = prompt("Enter new password for this admin (min 6 characters):");
  if (newPass === null) return;
  if (newPass.trim().length < 6) {
    alert("Password must be at least 6 characters.");
    return;
  }

  var API_BASE = "../backend/api.php";
  fetch(API_BASE + "?action=admins&id=" + encodeURIComponent(id), {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPass.trim() })
  })
  .then(function(response) { return response.json(); })
  .then(function(payload) {
    if (payload && payload.success) {
      var users = getStoredUsers();
      var user = users.find(function(u) { return String(u.id) === String(id); });
      if (user) {
        user.password = newPass.trim();
        storeUsers(users);
      }
      addLog("admin", "Reset password for: " + (user ? user.fullName : id), "Admin Management");
      showToast("Password reset successfully.");
    } else {
      showToast("Failed to reset password: " + ((payload && payload.message) || "Server error"));
    }
  })
  .catch(function() {
    showToast("Connection error. Could not reset password.");
  });
}

/* ====================== 2. BACKUP & RESTORE ====================== */

function handleBackup() {
  var data = {
    timestamp: new Date().toISOString(),
    users: getStoredUsers(),
    locations: storageGet(APP_LOCATIONS_KEY, []),
    floors: storageGet(APP_FLOORS_KEY, []),
    legends: storageGet(APP_LEGENDS_KEY, []),
    logs: storageGet(APP_LOGS_KEY, []),
    settings: storageGet(APP_SETTINGS_KEY, {}),
    floorImages: storageGet(APP_FLOOR_IMAGES_KEY, {}),
  };

  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "schoolmap_backup_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);

  // Save to backup history
  var history = storageGet("schoolmap_backup_history", []);
  history.unshift({
    date: new Date().toISOString(),
    size: blob.size,
    filename: a.download,
  });
  if (history.length > 10) history = history.slice(0, 10);
  storageSet("schoolmap_backup_history", history);

  addLog("backup", "Created system backup", "Backup & Restore");
  loadBackupHistory();
  showToast("Backup downloaded successfully!");
}

function handleRestore(e) {
  var file = e.target.files[0];
  if (!file) return;

  if (!confirm("WARNING: This will overwrite ALL current data with the backup. Continue?")) {
    e.target.value = "";
    return;
  }

  var reader = new FileReader();
  reader.onload = function (evt) {
    try {
      var data = JSON.parse(evt.target.result);
      if (data.users) storageSet(APP_USERS_KEY, data.users);
      if (data.locations) storageSet(APP_LOCATIONS_KEY, data.locations);
      if (data.floors) storageSet(APP_FLOORS_KEY, data.floors);
      if (data.legends) storageSet(APP_LEGENDS_KEY, data.legends);
      if (data.logs) storageSet(APP_LOGS_KEY, data.logs);
      if (data.settings) storageSet(APP_SETTINGS_KEY, data.settings);
      if (data.floorImages) storageSet(APP_FLOOR_IMAGES_KEY, data.floorImages);

      addLog("backup", "Restored system from backup: " + file.name, "Backup & Restore");
      showToast("System restored from backup!");
      setTimeout(function () { location.reload(); }, 1000);
    } catch (err) {
      alert("Invalid backup file: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function loadBackupHistory() {
  var container = document.getElementById("backup-history-list");
  if (!container) return;
  var history = storageGet("schoolmap_backup_history", []);

  if (history.length === 0) {
    container.innerHTML = '<p style="text-align:center; opacity:0.5; padding:16px;">No backups created yet.</p>';
    return;
  }

  var html = "";
  history.forEach(function (b) {
    var date = new Date(b.date).toLocaleString();
    var size = (b.size / 1024).toFixed(1) + " KB";
    html += '<div class="sa-archive-item">' +
      '<div><strong>' + escHtml(b.filename) + '</strong><br><small style="opacity:0.6;">' + date + ' · ' + size + '</small></div>' +
    '</div>';
  });
  container.innerHTML = html;
}

/* ====================== 3. SYSTEM LOGS ====================== */

var currentLogFilter = "all";

function addLog(category, action, details) {
  // Save to localStorage
  var logs = storageGet(APP_LOGS_KEY, []);
  var user = getCurrentUser();
  logs.unshift({
    timestamp: new Date().toISOString(),
    user: user ? user.fullName : "System",
    action: action,
    category: category,
    details: details || "",
  });
  if (logs.length > 500) logs = logs.slice(0, 500);
  storageSet(APP_LOGS_KEY, logs);

  // Also save to DB audit_log
  fetch("../backend/api.php?action=audit_log", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action:      category.toUpperCase(),
      description: action + (details ? " — " + details : ""),
    })
  }).catch(function() {});
}

function loadLogs() {
  var tbody = document.getElementById("logs-table-body");
  if (!tbody) return;

  tbody.innerHTML = "<tr><td colspan='5' style='padding:20px; text-align:center; opacity:0.5;'>Loading...</td></tr>";

  fetch("../backend/api.php?action=audit_log", { credentials: "same-origin" })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var logs = (data && data.audit_log) ? data.audit_log : [];

      var filtered = logs;
      if (currentLogFilter !== "all") {
        filtered = logs.filter(function(log) {
          return log.action && log.action.toLowerCase() === currentLogFilter;
        });
      }

      if (filtered.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='padding:20px; text-align:center; opacity:0.5;'>No logs found.</td></tr>";
        return;
      }

      var html = "";
      filtered.forEach(function(log) {
        var ts = new Date(log.timestamp).toLocaleString();
        var cat = (log.action || "").toLowerCase();
        var catClass = cat === "login" ? "sa-badge-success" : (cat === "admin" ? "sa-badge-danger" : "");
        html += "<tr>" +
          "<td>" + ts + "</td>" +
          "<td><strong>" + escHtml(log.admin_name || "System") + "</strong></td>" +
          "<td>" + escHtml(log.description || "") + "</td>" +
          "<td><span class='sa-badge " + catClass + "'>" + escHtml(cat) + "</span></td>" +
          "<td></td>" +
        "</tr>";
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) {
      tbody.innerHTML = "<tr><td colspan='5' style='padding:20px; text-align:center; opacity:0.5;'>Failed to load logs.</td></tr>";
      console.warn("Failed to load audit log:", err);
    });
}

function filterLogs(filter) {
  currentLogFilter = filter;
  document.querySelectorAll(".log-filter-btn").forEach(function (btn) {
    btn.classList.remove("active");
    if (btn.getAttribute("data-filter") === filter) {
      btn.classList.add("active");
    }
  });
  loadLogs();
}

function clearLogs() {
  if (!confirm("Delete all system logs?")) return;
  fetch("../backend/api.php?action=audit_log", {
    method: "DELETE",
    credentials: "same-origin",
  }).then(function() {
    storageSet(APP_LOGS_KEY, []);
    loadLogs();
    showToast("Logs cleared.");
  }).catch(function(err) {
    console.warn("Failed to clear logs from DB:", err);
    storageSet(APP_LOGS_KEY, []);
    loadLogs();
    showToast("Logs cleared locally.");
  });
}

/* ====================== 4. ARCHIVE MANAGEMENT ====================== */

function loadArchives() {
  var container = document.getElementById("archive-list-container");
  if (!container) return;
  var archives = storageGet("schoolmap_archives", []);

  if (archives.length === 0) {
    container.innerHTML = '<p style="text-align:center; opacity:0.5; padding:20px;">No archived versions yet. Click "Archive Current" to save the current map layout.</p>';
    return;
  }

  var html = "";
  archives.forEach(function (arch, idx) {
    var date = new Date(arch.date).toLocaleString();
    var isActive = arch.isActive ? " active-version" : "";
    html += '<div class="sa-archive-item' + isActive + '">' +
      '<div>' +
        '<strong>' + escHtml(arch.name) + '</strong>' +
        (arch.isActive ? ' <span class="sa-badge sa-badge-success">Active</span>' : '') +
        '<br><small style="opacity:0.6;">' + date + ' · ' + arch.locationCount + ' pins · ' + arch.floorCount + ' floors</small>' +
      '</div>' +
      '<div style="display:flex; gap:6px;">' +
        (arch.isActive ? '' : '<button class="wobbly-btn wobbly-btn-sm wobbly-btn-primary" onclick="restoreArchive(' + idx + ')">Restore</button>') +
        (arch.isActive ? '' : '<button class="wobbly-btn wobbly-btn-sm wobbly-btn-secondary" onclick="setActiveArchive(' + idx + ')">Set Active</button>') +
        '<button class="wobbly-btn wobbly-btn-sm wobbly-btn-danger" onclick="deleteArchive(' + idx + ')">Delete</button>' +
      '</div>' +
    '</div>';
  });
  container.innerHTML = html;
}

function archiveCurrentVersion() {
  var name = prompt("Give this archive a name:", "Map v" + (storageGet("schoolmap_archives", []).length + 1));
  if (!name) return;

  var archives = storageGet("schoolmap_archives", []);
  archives.forEach(function (a) { a.isActive = false; });

  archives.unshift({
    name: name,
    date: new Date().toISOString(),
    isActive: true,
    locations: storageGet(APP_LOCATIONS_KEY, []),
    floors: storageGet(APP_FLOORS_KEY, []),
    legends: storageGet(APP_LEGENDS_KEY, []),
    floorImages: storageGet(APP_FLOOR_IMAGES_KEY, {}),
    locationCount: storageGet(APP_LOCATIONS_KEY, []).length,
    floorCount: storageGet(APP_FLOORS_KEY, []).length,
  });

  storageSet("schoolmap_archives", archives);
  addLog("archive", "Archived current map as: " + name, "Archive Management");
  loadArchives();
  showToast("Current version archived!");
}

function restoreArchive(idx) {
  if (!confirm("This will replace current map data with the archived version. Continue?")) return;
  var archives = storageGet("schoolmap_archives", []);
  var arch = archives[idx];
  if (!arch) return;

  storageSet(APP_LOCATIONS_KEY, arch.locations);
  storageSet(APP_FLOORS_KEY, arch.floors);
  storageSet(APP_LEGENDS_KEY, arch.legends);
  if (arch.floorImages) storageSet(APP_FLOOR_IMAGES_KEY, arch.floorImages);

  addLog("archive", "Restored archive: " + arch.name, "Archive Management");
  showToast("Archive restored: " + arch.name);
}

function setActiveArchive(idx) {
  var archives = storageGet("schoolmap_archives", []);
  archives.forEach(function (a) { a.isActive = false; });
  if (archives[idx]) archives[idx].isActive = true;
  storageSet("schoolmap_archives", archives);
  loadArchives();
  showToast("Active version updated.");
}

function deleteArchive(idx) {
  if (!confirm("Delete this archived version?")) return;
  var archives = storageGet("schoolmap_archives", []);
  archives.splice(idx, 1);
  storageSet("schoolmap_archives", archives);
  loadArchives();
  showToast("Archive deleted.");
}

/* ====================== 5. REPORTS ====================== */

function loadReports() {
  fetch("../backend/api.php?action=visitor_logs", { credentials: "same-origin" })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var logs = (data && data.visitor_logs) ? data.visitor_logs : [];
      var today = new Date().toDateString();

      var el1 = document.getElementById("report-total-visits");
      if (el1) el1.textContent = logs.length;

      var todayVisits = logs.filter(function(l) {
        return l.date && new Date(l.date).toDateString() === today;
      }).length;
      var el2 = document.getElementById("report-today-visits");
      if (el2) el2.textContent = todayVisits;
    })
    .catch(function(err) { console.warn("Failed to load visitor logs for reports:", err); });

  // Active admins — fetch from API
  fetch("../backend/api.php?action=admins", { credentials: "same-origin" })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var admins = (data && data.data && data.data.admins) ? data.data.admins : [];
      var activeAdmins = admins.filter(function(u) { return !u.isDisabled; }).length;
      var el3 = document.getElementById("report-active-admins");
      if (el3) el3.textContent = activeAdmins;
    })
    .catch(function(err) { console.warn("Failed to load admins for reports:", err); });

  // Top locations — fetch from API
  fetch("../backend/api.php?action=pins", { credentials: "same-origin" })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var locations = (data && data.pins) ? data.pins : [];
      var topContainer = document.getElementById("report-top-locations");
      if (!topContainer) return;
      if (locations.length === 0) {
        topContainer.innerHTML = '<p style="opacity:0.5; text-align:center; padding:16px;">No locations data available.</p>';
        return;
      }
      var html = "";
      locations.slice(0, 5).forEach(function(loc, i) {
        html += '<div class="sa-admin-item" style="padding:8px 0;">' +
          '<div class="sa-admin-info">' +
            '<strong>#' + (i + 1) + ' ' + escHtml(loc.name) + '</strong>' +
            '<small>Floor ' + (loc.map_id || loc.floor || "") + '</small>' +
          '</div>' +
        '</div>';
      });
      topContainer.innerHTML = html;
    })
    .catch(function(err) { console.warn("Failed to load pins for reports:", err); });
}

function exportReport(type) {
  fetch("../backend/api.php?action=visitor_logs", { credentials: "same-origin" })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var logs = (data && data.visitor_logs) ? data.visitor_logs : [];
      var now = new Date();
      var filtered = [];
      var label = "";

      if (type === "daily") {
        label = "Daily Report - " + now.toLocaleDateString();
        filtered = logs.filter(function(l) {
          return l.date && new Date(l.date).toDateString() === now.toDateString();
        });
      } else if (type === "weekly") {
        label = "Weekly Report";
        var weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = logs.filter(function(l) {
          return l.date && new Date(l.date) >= weekAgo;
        });
      } else {
        label = "Yearly Report - " + now.getFullYear();
        filtered = logs.filter(function(l) {
          return l.date && new Date(l.date).getFullYear() === now.getFullYear();
        });
      }

      var csv = "Date,Name,Category,Purpose,Destination,Time In,Time Out,Plate No\n";
      filtered.forEach(function(log) {
        csv += '"' + (log.date || "") + '","' +
          (log.name || "") + '","' +
          (log.category || "") + '","' +
          (log.purpose || "") + '","' +
          (log.destination || "") + '","' +
          (log.time_in || "") + '","' +
          (log.time_out || "") + '","' +
          (log.plate_no || "") + '"\n';
      });

      var blob = new Blob([csv], { type: "text/csv" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "schoolmap_visitors_" + type + "_" + now.toISOString().slice(0, 10) + ".csv";
      a.click();
      URL.revokeObjectURL(url);

      addLog("report", "Exported " + type + " visitor report (" + filtered.length + " records)", "Reports");
      showToast(label + " exported! (" + filtered.length + " records)");
    })
    .catch(function(err) {
      console.warn("Failed to export report:", err);
      showToast("Failed to export report. Please try again.");
    });
}

/* ====================== 6. SETTINGS ====================== */

function loadSettings() {
  var settings = storageGet(APP_SETTINGS_KEY, {
    guestModeEnabled: false,
    accessibilityEnabled: false,
    logRetention: 30,
    maxAttempts: 5,
    lockoutDuration: 15,
  });

  var guestMode = document.getElementById("set-guest-mode");
  var accessMode = document.getElementById("set-access-mode");
  var logRetention = document.getElementById("set-log-retention");
  var maxAttempts = document.getElementById("set-max-attempts");
  var lockoutDuration = document.getElementById("set-lockout-duration");

  if (guestMode) guestMode.checked = settings.guestModeEnabled || false;
  if (accessMode) accessMode.checked = settings.accessibilityEnabled || false;
  if (logRetention) logRetention.value = settings.logRetention || 30;
  if (maxAttempts) maxAttempts.value = settings.maxAttempts || 5;
  if (lockoutDuration) lockoutDuration.value = settings.lockoutDuration || 15;
}

function saveSettings() {
  var settings = {
    guestModeEnabled: document.getElementById("set-guest-mode") ? document.getElementById("set-guest-mode").checked : false,
    accessibilityEnabled: document.getElementById("set-access-mode") ? document.getElementById("set-access-mode").checked : false,
    logRetention: document.getElementById("set-log-retention") ? parseInt(document.getElementById("set-log-retention").value) : 30,
    maxAttempts: document.getElementById("set-max-attempts") ? parseInt(document.getElementById("set-max-attempts").value) : 5,
    lockoutDuration: document.getElementById("set-lockout-duration") ? parseInt(document.getElementById("set-lockout-duration").value) : 15,
  };
  storageSet(APP_SETTINGS_KEY, settings);
  showToast("Settings saved.");
}

function resetSystem() {
  if (!confirm("WARNING: This will wipe ALL data except the default Super Admin. Are you absolutely sure?")) return;
  if (!confirm("FINAL WARNING: This action CANNOT be undone. Proceed?")) return;

  var superAdmin = DEFAULT_USERS.find(function (u) {
    return u.role === "super_admin";
  });

  storageSet(APP_USERS_KEY, [superAdmin]);
  localStorage.removeItem(APP_LOCATIONS_KEY);
  localStorage.removeItem(APP_FLOORS_KEY);
  localStorage.removeItem(APP_LEGENDS_KEY);
  localStorage.removeItem(APP_LOGS_KEY);
  localStorage.removeItem(APP_FLOOR_IMAGES_KEY);
  localStorage.removeItem("schoolmap_archives");
  localStorage.removeItem("schoolmap_backup_history");

  alert("System Reset Complete. You will be redirected to login.");
  window.location.href = "login.html";
}