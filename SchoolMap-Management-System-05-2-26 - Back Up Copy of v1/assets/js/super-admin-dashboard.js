/* =========================================================
   SCHOOLMAP — super-admin-dashboard.js
   Super Admin Logic: Admin Mgmt, Backup, Logs, Archive, Reports, Settings
   ========================================================= */

"use strict";

document.addEventListener("DOMContentLoaded", async function () {
  // 1. Security Check
  var sessionResult = await apiRequest("me", "GET");
  if (!sessionResult.ok || !sessionResult.payload || !sessionResult.payload.user || sessionResult.payload.user.role !== "super_admin") {
    window.location.href = "login.html";
    return;
  }
  AppState.currentUser = sessionResult.payload.user;

  var user = AppState.currentUser;

  // 2. Init UI
  document.getElementById("sa-username-display").textContent = "Super Administrator";

  // 3. Load all data
  loadAdmins();
  loadLogs();
  loadSettings();
  loadBackupHistory();
  loadArchives();
  loadReports();

  // 4. Wire restore file input
  var restoreFile = document.getElementById("restore-file");
  if (restoreFile) {
    restoreFile.addEventListener("change", handleRestore);
  }
});

var API_BASE = typeof getApiBase === "function" ? getApiBase() : "../backend/api.php";
var saAdminsCache = [];
var passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;
var pendingAdminStatusChange = null;
var saArchiveItemsCache = [];
var currentArchiveFilter = "all";
var currentArchiveSearch = "";

function showSaActionConfirm(options) {
  var config = Object.assign({
    title: "Confirm Action",
    message: "Are you sure?",
    confirmText: "Confirm",
    danger: true,
  }, options || {});

  var overlay = document.getElementById("sa-action-confirm");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "sa-action-confirm";
    overlay.className = "app-action-confirm-overlay";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="app-action-confirm-card">' +
        '<h3 class="card-heading" data-confirm-title></h3>' +
        '<p data-confirm-message></p>' +
        '<div class="app-action-confirm-actions">' +
          '<button type="button" class="wobbly-btn wobbly-btn-secondary" data-confirm-cancel>Cancel</button>' +
          '<button type="button" class="wobbly-btn" data-confirm-ok>Confirm</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  overlay.querySelector("[data-confirm-title]").textContent = config.title;
  overlay.querySelector("[data-confirm-message]").textContent = config.message;
  var okBtn = overlay.querySelector("[data-confirm-ok]");
  var cancelBtn = overlay.querySelector("[data-confirm-cancel]");
  okBtn.textContent = config.confirmText;
  okBtn.className = "wobbly-btn " + (config.danger ? "wobbly-btn-danger" : "wobbly-btn-primary");
  overlay.hidden = false;

  return new Promise(function(resolve) {
    function close(value) {
      overlay.hidden = true;
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
      resolve(value);
    }
    function onOk() { close(true); }
    function onCancel() { close(false); }
    function onBackdrop(event) {
      if (event.target === overlay) close(false);
    }
    function onKeydown(event) {
      if (event.key === "Escape") close(false);
    }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

async function apiRequest(action, method, data, id) {
  try {
    var url = typeof apiUrl === "function" ? apiUrl(action, id) : API_BASE + "?action=" + encodeURIComponent(action);
    if (id && typeof apiUrl !== "function") {
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

function toggleSuperAdminMenu(button) {
  var dropdown = document.getElementById("sa-user-dropdown");
  if (!dropdown) return;

  if (dropdown.style.display !== "none") {
    dropdown.style.display = "none";
    return;
  }

  if (button) {
    var rect = button.getBoundingClientRect();
    dropdown.style.top = rect.bottom + 4 + "px";
    dropdown.style.right = window.innerWidth - rect.right + "px";
    dropdown.style.left = "auto";
  }
  dropdown.style.display = "";
}

document.addEventListener("click", function (event) {
  var dropdown = document.getElementById("sa-user-dropdown");
  var trigger = event.target.closest(".sa-user-actions");
  if (!dropdown || trigger || dropdown.contains(event.target)) return;
  dropdown.style.display = "none";
});

function togglePasswordVisibility(inputId, button) {
  var input = document.getElementById(inputId);
  if (!input || !button) return;

  var isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  button.innerHTML = isHidden
    ? '<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
}

/* ====================== 1. ADMIN MANAGEMENT ====================== */

async function loadAdmins() {
  var container = document.getElementById("admin-list-container");
  if (!container) return;
  var users = getStoredUsers();

  var admins = users.filter(function (u) {
    return u.role === "admin" || u.role === "super_admin";
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

  saAdminsCache = admins;
  renderAdminList();
}

function filterExistingAdmins() {
  renderAdminList();
}

function renderAdminList() {
  var container = document.getElementById("admin-list-container");
  if (!container) return;

  var searchInput = document.getElementById("admin-search");
  var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  var accounts = saAdminsCache.filter(function (admin) {
    if (!query) return true;
    return (
      String(admin.fullName || "").toLowerCase().indexOf(query) !== -1 ||
      String(admin.email || "").toLowerCase().indexOf(query) !== -1 ||
      String(admin.role || "").toLowerCase().indexOf(query) !== -1
    );
  });

  if (saAdminsCache.length === 0) {
    container.innerHTML = '<p style="opacity:0.5; text-align:center; padding:20px;">No accounts found yet. Create one using the form.</p>';
    return;
  }
  if (accounts.length === 0) {
    container.innerHTML = '<p style="opacity:0.5; text-align:center; padding:20px;">No accounts match your search.</p>';
    return;
  }

  var superAdmins = accounts.filter(function(admin) {
    return String(admin.role || "").toLowerCase() === "super_admin";
  });
  var regularAdmins = accounts.filter(function(admin) {
    return String(admin.role || "").toLowerCase() !== "super_admin";
  });

  var html = "";
  if (superAdmins.length) {
    html += '<div class="sa-account-group-label">Super Admin</div>';
    superAdmins.forEach(function(admin) {
      html += '<div class="sa-admin-item sa-super-admin-item">' +
        '<div class="sa-admin-info">' +
          '<strong>' + escHtml(admin.fullName || "Super Administrator") + ' <span class="sa-badge sa-badge-password">Super Admin</span></strong>' +
          '<small>' + escHtml(admin.email || "") + '</small>' +
        '</div>' +
        '<div class="sa-admin-actions">' +
          '<button class="wobbly-btn wobbly-btn-sm wobbly-btn-secondary" onclick="resetAdminPassword(\'' + admin.id + '\')">Reset Pass</button>' +
          '<span class="sa-protected-account">Protected Account</span>' +
        '</div>' +
      '</div>';
    });
  }

  if (regularAdmins.length) {
    html += '<div class="sa-account-group-label">Admin Accounts</div>';
  }
  regularAdmins.forEach(function (admin) {
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
        '<button class="wobbly-btn wobbly-btn-sm ' + (admin.isDisabled ? 'wobbly-btn-primary' : 'wobbly-btn-danger') + '" onclick="toggleAdminStatus(\'' + admin.id + '\', ' + (admin.isDisabled ? 'true' : 'false') + ')">' + (admin.isDisabled ? 'Enable' : 'Disable') + '</button>' +
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
  if (!passwordRegex.test(pass)) {
    showToast("Password needs 8+ chars with uppercase, lowercase, number, and symbol.");
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

async function deleteAdmin(id) {
  var confirmed = await showSaActionConfirm({
    title: "Delete Admin",
    message: "Are you sure? This will permanently remove this admin.",
    confirmText: "Delete Admin",
    danger: true,
  });
  if (!confirmed) return;
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
  var admin = saAdminsCache.find(function(u) { return String(u.id) === String(id); });
  var users = getStoredUsers();
  var localUser = users.find(function(u) { return String(u.id) === String(id); });
  var adminName = admin ? admin.fullName : (localUser ? localUser.fullName : "this admin");
  var adminEmail = admin ? admin.email : (localUser ? localUser.email : "");
  var newDisabledState = !currentlyDisabled;
  var actionLabel = currentlyDisabled ? "Enable" : "Disable";

  pendingAdminStatusChange = {
    id: id,
    currentlyDisabled: currentlyDisabled,
    newDisabledState: newDisabledState,
    adminName: adminName,
    adminEmail: adminEmail
  };

  showAdminStatusConfirm(actionLabel, adminName, adminEmail, currentlyDisabled);
}

function showAdminStatusConfirm(actionLabel, adminName, adminEmail, currentlyDisabled) {
  var box = document.getElementById("sa-admin-status-confirm");
  var title = document.getElementById("sa-admin-status-title");
  var message = document.getElementById("sa-admin-status-message");
  var confirmBtn = document.getElementById("sa-admin-status-confirm-btn");
  if (!box || !title || !message || !confirmBtn) return;

  title.textContent = actionLabel + " Admin Account";
  message.innerHTML =
    "<strong>" + escHtml(adminName) + "</strong>" +
    (adminEmail ? "<br><small>" + escHtml(adminEmail) + "</small>" : "") +
    "<br><span>" + (currentlyDisabled
      ? "This admin will be able to log in again."
      : "This admin will not be able to log in while disabled.") + "</span>";
  confirmBtn.textContent = actionLabel + " Account";
  confirmBtn.className = currentlyDisabled
    ? "wobbly-btn wobbly-btn-primary"
    : "wobbly-btn wobbly-btn-danger";
  confirmBtn.disabled = false;
  box.hidden = false;
}

function hideAdminStatusConfirm() {
  var box = document.getElementById("sa-admin-status-confirm");
  if (box) box.hidden = true;
  pendingAdminStatusChange = null;
}

function confirmAdminStatusChange() {
  if (!pendingAdminStatusChange) return;

  var change = pendingAdminStatusChange;
  var id = change.id;
  var adminName = change.adminName;
  var newDisabledState = change.newDisabledState;
  var confirmBtn = document.getElementById("sa-admin-status-confirm-btn");
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = newDisabledState ? "Disabling..." : "Enabling...";
  }

  var users = getStoredUsers();
  var user = users.find(function(u) { return String(u.id) === String(id); });
  var API_BASE = typeof getApiBase === "function" ? getApiBase() : "../backend/api.php";

  fetch(typeof apiUrl === "function" ? apiUrl("admins", id) : API_BASE + "?action=admins&id=" + encodeURIComponent(id), {
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
      hideAdminStatusConfirm();
      loadAdmins(); // Reload from DB to get fresh state
      showToast(newDisabledState
        ? adminName + " has been disabled."
        : adminName + " has been enabled.");
    } else {
      showToast("Failed: " + ((payload && payload.message) || "Server error"));
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = newDisabledState ? "Disable Account" : "Enable Account";
      }
    }
  })
  .catch(function() {
    showToast("Connection error. Could not update admin.");
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = newDisabledState ? "Disable Account" : "Enable Account";
    }
  });
}

function resetAdminPassword(id) {
  window.location.href = "super-admin-reset-password.html?id=" + encodeURIComponent(id);
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

async function handleRestore(e) {
  var file = e.target.files[0];
  if (!file) return;

  var confirmed = await showSaActionConfirm({
    title: "Restore Backup",
    message: "This will overwrite all current data with the selected backup.",
    confirmText: "Restore Backup",
    danger: true,
  });
  if (!confirmed) {
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
      showSaActionConfirm({
        title: "Invalid Backup File",
        message: "Invalid backup file: " + err.message,
        confirmText: "OK",
        danger: false,
      });
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
var currentLogSort = "newest";
var currentLogSearch = "";

function addLog(category, action, details) {
  var user = getCurrentUser();
  fetch(typeof apiUrl === "function" ? apiUrl("audit_log") : "../backend/api.php?action=audit_log", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action:      category.toUpperCase(),
      description: action + (details ? " — " + details : ""),
    })
  }).catch(function() {});
}

async function loadLogs() {
  var tbody = document.getElementById("logs-table-body");
  if (!tbody) return;

  tbody.innerHTML = "<tr><td colspan='5' style='padding:20px; text-align:center; opacity:0.5;'>Loading...</td></tr>";

  Promise.all([
    fetch("../backend/api.php?action=audit_log", { credentials: "same-origin", cache: "no-store" }).then(function(r) { return r.json(); }),
    fetch("../backend/api.php?action=visitor_logs", { credentials: "same-origin", cache: "no-store" }).then(function(r) { return r.json(); }).catch(function () { return null; })
  ])
    .then(function(results) {
      var auditData = results[0] || {};
      var visitorData = results[1] || {};
      var logs = normalizeAuditRows((auditData && auditData.audit_log) ? auditData.audit_log : [])
        .concat(normalizeVisitorRows((visitorData && visitorData.visitor_logs) ? visitorData.visitor_logs : []));

      var filtered = logs;
      if (currentLogFilter !== "all") {
        filtered = logs.filter(function(log) {
          return getLogFilterGroup(log.action) === currentLogFilter;
        });
      }
      if (currentLogSearch) {
        filtered = filtered.filter(function (log) {
          return getLogSearchText(log).indexOf(currentLogSearch) !== -1;
        });
      }
      filtered = sortLogRows(filtered);

      if (filtered.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='padding:20px; text-align:center; opacity:0.5;'>No logs found.</td></tr>";
        return;
      }

      var html = "";
      filtered.forEach(function(log) {
        var ts = new Date(log.timestamp).toLocaleString();
        var group = getLogFilterGroup(log.action);
        var isPasswordReset = group === "password_reset";
        var catLabel = getLogCategoryLabel(log.action);
        var catClass = getLogBadgeClass(log.action);
        var actionText = isPasswordReset ? "Password Reset" : getLogActionText(log.action, log.description);
        var detailText = isPasswordReset ? (log.description || "") : getLogDetailsText(log.action, log.description);
        var rowUser = log.admin_name || log.user || "";
        html += "<tr>" +
          "<td>" + ts + "</td>" +
          "<td><strong>" + escHtml(rowUser) + "</strong></td>" +
          "<td>" + escHtml(actionText) + "</td>" +
          "<td><span class='sa-badge " + catClass + "'>" + escHtml(catLabel) + "</span></td>" +
          "<td>" + escHtml(detailText) + "</td>" +
        "</tr>";
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) {
      tbody.innerHTML = "<tr><td colspan='5' style='padding:20px; text-align:center; opacity:0.5;'>Failed to load logs.</td></tr>";
      console.warn("Failed to load audit log:", err);
    });
}

function normalizeAuditRows(logs) {
  return (Array.isArray(logs) ? logs : []).filter(function (log) {
    var action = String(log.action || "").toLowerCase();
    var description = String(log.description || "").toLowerCase();
    if (action === "archive_item") {
      return false;
    }
    if (action === "visitor" || action.indexOf("visitor_") === 0) {
      return false;
    }
    return !(description.indexOf("visitor logged") === 0);
  });
}

function normalizeVisitorRows(logs) {
  var rows = [];
  (Array.isArray(logs) ? logs : []).forEach(function (log) {
    var date = log.date || new Date().toISOString().slice(0, 10);
    var name = log.name || "Visitor";
    var destination = log.destination || "Map";
    var purpose = log.purpose || "N/A";
    var plateNo = log.plate_no || "N/A";
    var timeIn = log.time_in || "00:00:00";
    var timeOut = log.time_out || "null";
    var baseDetails = "Visitor logged in: " + name +
      " | Purpose: " + purpose +
      " | Destination: " + destination +
      " | Plate No: " + plateNo +
      " | time_out: " + timeOut;

    rows.push({
      timestamp: date + " " + timeIn,
      user: name,
      admin_name: name,
      action: "VISITOR_LOGIN",
      description: baseDetails,
    });

    if (log.time_out) {
      rows.push({
        timestamp: date + " " + log.time_out,
        user: name,
        admin_name: name,
        action: "VISITOR_LOGOUT",
        description: "Visitor logged out: " + name +
          " | Purpose: " + purpose +
          " | Destination: " + destination +
          " | Plate No: " + plateNo +
          " | time_out: " + log.time_out,
      });
    }
  });
  return rows;
}

function sortLogs(sortMode) {
  currentLogSort = sortMode || "newest";
  loadLogs();
}

function searchLogs(query) {
  currentLogSearch = String(query || "").trim().toLowerCase();
  loadLogs();
}

function getLogSearchText(log) {
  return [
    log.timestamp || "",
    log.admin_name || "",
    log.user || "",
    log.action || "",
    getLogCategoryLabel(log.action),
    getLogActionText(log.action, log.description),
    log.description || ""
  ].join(" ").toLowerCase();
}

function sortLogRows(logs) {
  return logs.slice().sort(function (a, b) {
    if (currentLogSort === "oldest") {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    }
    if (currentLogSort === "category") {
      var catCompare = getLogCategoryLabel(a.action).localeCompare(getLogCategoryLabel(b.action));
      if (catCompare !== 0) return catCompare;
    }
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}

function getLogFilterGroup(action) {
  var cat = String(action || "").toLowerCase();
  if (cat === "login" || cat === "logout") return "login";
  if (cat === "map_edit" || cat === "archive") return "map";
  if (cat === "pin_update") return "pin";
  if (cat === "route_update") return "route";
  if (cat === "password_reset") return "password_reset";
  if (cat === "visitor" || cat.indexOf("visitor_") === 0) return "visitor";
  if (cat === "create" || cat === "update" || cat === "delete" || cat === "admin") return "pin";
  return cat;
}

function getLogCategoryLabel(action) {
  var cat = String(action || "system").toLowerCase();
  var labels = {
    login: "login",
    logout: "logout",
    map_edit: "map edit",
    pin_update: "pin update",
    route_update: "route update",
    password_reset: "password reset",
    visitor: "visitor",
    visitor_login: "visitor_login",
    visitor_logout: "visitor_logout",
    archive: "map edit",
    create: "created",
    update: "updated",
    delete: "deleted",
    admin: "admin"
  };
  return labels[cat] || cat;
}

function getLogBadgeClass(action) {
  var cat = String(action || "").toLowerCase();
  var classes = {
    login: "sa-badge-login",
    logout: "sa-badge-logout",
    map_edit: "sa-badge-map",
    archive: "sa-badge-map",
    pin_update: "sa-badge-pin",
    route_update: "sa-badge-route",
    password_reset: "sa-badge-password",
    visitor: "sa-badge-visitor",
    visitor_login: "sa-badge-visitor",
    visitor_logout: "sa-badge-visitor",
    admin: "sa-badge-danger",
    create: "sa-badge-success",
    delete: "sa-badge-danger",
    update: "sa-badge-map"
  };
  return classes[cat] || "";
}

function getLogActionText(action, description) {
  var cat = String(action || "").toLowerCase();
  var labels = {
    login: "Login",
    logout: "Logout",
    map_edit: "Map Edit",
    pin_update: "Pin/Legend Update",
    route_update: "Route Update",
    visitor: "Visitor Log",
    visitor_login: "Visitor Login",
    visitor_logout: "Visitor Logout",
    archive: "Map Archive",
    create: "Created",
    update: "Updated",
    delete: "Deleted",
    admin: "Admin Action"
  };
  return labels[cat] || (description || "");
}

function getLogDetailsText(action, description) {
  var cat = String(action || "").toLowerCase();
  if (["login", "logout", "map_edit", "pin_update", "route_update", "visitor", "visitor_login", "visitor_logout", "archive", "create", "update", "delete", "admin"].indexOf(cat) !== -1) {
    return description || "";
  }
  return "";
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

async function clearLogs() {
  var confirmed = await showSaActionConfirm({
    title: "Clear System Logs",
    message: "Delete all system logs?",
    confirmText: "Clear Logs",
    danger: true,
  });
  if (!confirmed) return;
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
  var name = "Map v" + (storageGet("schoolmap_archives", []).length + 1);

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

async function restoreArchive(idx) {
  var confirmed = await showSaActionConfirm({
    title: "Restore Archive",
    message: "This will replace current map data with the archived version.",
    confirmText: "Restore Archive",
    danger: true,
  });
  if (!confirmed) return;
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

async function deleteArchive(idx) {
  var confirmed = await showSaActionConfirm({
    title: "Delete Archive",
    message: "Delete this archived version?",
    confirmText: "Delete Archive",
    danger: true,
  });
  if (!confirmed) return;
  var archives = storageGet("schoolmap_archives", []);
  archives.splice(idx, 1);
  storageSet("schoolmap_archives", archives);
  loadArchives();
  showToast("Archive deleted.");
}

function loadArchives() {
  var container = document.getElementById("archive-list-container");
  if (!container) return;
  container.innerHTML = '<p style="text-align:center; opacity:0.55; padding:20px;">Loading archived items...</p>';
  updateArchiveFilterButtons();

  fetch("../backend/api.php?action=archive_items", {
    credentials: "same-origin",
    cache: "no-store",
  })
    .then(function(response) { return response.json(); })
    .then(function(data) {
      saArchiveItemsCache = (data && data.archive_items) ? data.archive_items : [];
      renderArchiveItems();
    })
    .catch(function(err) {
      console.warn("Failed to load archive items:", err);
      container.innerHTML = '<p style="text-align:center; opacity:0.6; padding:20px;">Could not load archived map items.</p>';
    });
}

function setArchiveFilter(filter) {
  currentArchiveFilter = filter || "all";
  updateArchiveFilterButtons();
  renderArchiveItems();
}

function searchArchives(query) {
  currentArchiveSearch = String(query || "").trim().toLowerCase();
  renderArchiveItems();
}

function updateArchiveFilterButtons() {
  document.querySelectorAll("[data-archive-filter]").forEach(function(button) {
    button.classList.toggle("active", button.getAttribute("data-archive-filter") === currentArchiveFilter);
  });
}

function renderArchiveItems() {
  var container = document.getElementById("archive-list-container");
  if (!container) return;

  var items = saArchiveItemsCache.filter(function(item) {
    if (currentArchiveFilter !== "all" && item.type !== currentArchiveFilter) {
      return false;
    }
    if (!currentArchiveSearch) {
      return true;
    }
    return getArchiveSearchText(item).indexOf(currentArchiveSearch) !== -1;
  });

  if (!items.length) {
    container.innerHTML = '<p style="text-align:center; opacity:0.55; padding:20px;">No archived ' + escHtml(getArchiveTypeLabel(currentArchiveFilter).toLowerCase()) + ' found.</p>';
    return;
  }

  container.innerHTML = items.map(function(item) {
    var idx = saArchiveItemsCache.indexOf(item);
    var restored = !!item.restored_at;
    var dateValue = item.deleted_at ? String(item.deleted_at).replace(" ", "T") : "";
    var date = dateValue ? new Date(dateValue).toLocaleString() : "Unknown date";
    return '<div class="sa-archive-item' + (restored ? ' restored' : '') + '">' +
      '<div class="sa-archive-main">' +
        '<div class="sa-archive-title">' +
          '<span class="sa-badge ' + getArchiveBadgeClass(item.type) + '">' + escHtml(getArchiveTypeLabel(item.type)) + '</span>' +
          '<strong>' + escHtml(item.label || "Archived item") + '</strong>' +
          (restored ? '<span class="sa-badge sa-badge-success">Restored</span>' : '') +
        '</div>' +
        '<div class="sa-archive-meta">Deleted: ' + escHtml(date) + ' | By: ' + escHtml(item.deleted_by || "Admin") + getArchiveDetail(item) + '</div>' +
      '</div>' +
      '<div class="sa-archive-actions">' +
        (restored ? '<button class="wobbly-btn wobbly-btn-sm wobbly-btn-secondary" disabled>Recovered</button>' : '<button class="wobbly-btn wobbly-btn-sm wobbly-btn-primary" onclick="restoreArchiveItem(' + idx + ')">Recover</button>') +
      '</div>' +
    '</div>';
  }).join("");
}

function getArchiveTypeLabel(type) {
  var labels = {
    all: "Items",
    floor: "Floor",
    pin: "Pin",
    route_location: "Route Location",
    route: "Route",
    point: "Point",
  };
  return labels[type] || "Item";
}

function getArchiveBadgeClass(type) {
  if (type === "floor") return "sa-badge-map";
  if (type === "pin") return "sa-badge-pin";
  if (type === "route" || type === "route_location") return "sa-badge-route";
  if (type === "point") return "sa-badge-visitor";
  return "sa-badge-map";
}

function getArchiveDetail(item) {
  var data = item && item.data ? item.data : {};
  if (item.type === "pin") {
    return ' | Floor: ' + escHtml(data.floor_name || data.map_id || "Unknown");
  }
  if (item.type === "route" || item.type === "route_location") {
    return ' | ' + escHtml((data.from_pin_name || data.from_pin_id || "Origin") + " to " + (data.to_pin_name || data.to_pin_id || "Destination"));
  }
  if (item.type === "point") {
    return ' | Route ID: ' + escHtml(data.route_id || "Unknown") + ' | Order: ' + escHtml(data.point_order || "1");
  }
  return "";
}

function getArchiveSearchText(item) {
  var data = item && item.data ? item.data : {};
  return [
    item.type,
    getArchiveTypeLabel(item.type),
    item.label,
    item.deleted_by,
    item.deleted_at,
    data.name,
    data.floor_name,
    data.map_id,
    data.from_pin_name,
    data.to_pin_name,
    data.from_pin_id,
    data.to_pin_id,
    data.route_id,
    data.point_order,
    data.direction,
    data.description,
    data.category_name,
  ].join(" ").toLowerCase();
}

async function restoreArchiveItem(idx) {
  var item = saArchiveItemsCache[idx];
  if (!item || item.restored_at) return;
  var confirmed = await showSaActionConfirm({
    title: "Recover " + getArchiveTypeLabel(item.type),
    message: "Recover " + (item.label || "this archived item") + " back to the map data?",
    confirmText: "Recover",
    danger: false,
  });
  if (!confirmed) return;

  fetch("../backend/api.php?action=archive_items", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_id: item.audit_id }),
  })
    .then(function(response) {
      return response.json().then(function(payload) {
        return { ok: response.ok, payload: payload };
      });
    })
    .then(function(result) {
      if (!result.ok || (result.payload && result.payload.error)) {
        showToast((result.payload && result.payload.message) || "Could not recover archived item");
        return;
      }
      showToast("Archived item recovered.");
      loadArchives();
      loadLogs();
    })
    .catch(function(err) {
      console.warn("Failed to restore archive item:", err);
      showToast("Could not recover archived item");
    });
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
  showSaActionConfirm({
    title: "System Reset Disabled",
    message: "System reset is disabled now that data is stored in school_map_db2. Use database backups or admin delete tools instead.",
    confirmText: "OK",
    danger: false,
  });
}
