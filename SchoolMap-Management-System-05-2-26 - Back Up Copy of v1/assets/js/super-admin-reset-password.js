/* =========================================================
   SCHOOLMAP - super-admin-reset-password.js
   Dedicated Super Admin password reset flow
   ========================================================= */

"use strict";

var resetPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;
var resetAdminId = "";
var resetAdmin = null;
var resetDirty = false;
var resetFinished = false;
var pendingExitUrl = "super-admin-dashboard.html";

document.addEventListener("DOMContentLoaded", async function () {
  var sessionResult = await resetApiRequest("me", "GET");
  if (!sessionResult.ok || !sessionResult.payload || !sessionResult.payload.user || sessionResult.payload.user.role !== "super_admin") {
    window.location.href = "login.html";
    return;
  }
  AppState.currentUser = sessionResult.payload.user;

  resetAdminId = new URLSearchParams(window.location.search).get("id") || "";
  if (!resetAdminId) {
    showResetError("Admin account was not selected.");
    return;
  }

  await loadResetAdmin();

  var form = document.getElementById("sa-reset-form");
  var cancelBtn = document.getElementById("sa-reset-cancel");
  var confirmBtn = document.getElementById("sa-reset-confirm-btn");
  var oldPassInput = document.getElementById("reset-old-pass");
  var newPassInput = document.getElementById("reset-new-pass");
  var exitCancelBtn = document.getElementById("sa-reset-exit-cancel");
  var exitConfirmBtn = document.getElementById("sa-reset-exit-confirm-btn");

  if (form) {
    form.addEventListener("submit", handleResetSubmit);
  }
  [oldPassInput, newPassInput].forEach(function (input) {
    if (!input) return;
    input.addEventListener("input", function () {
      resetDirty = hasPasswordInput();
      hideExitConfirmation();
    });
  });
  if (cancelBtn) {
    cancelBtn.addEventListener("click", hideResetConfirmation);
  }
  if (confirmBtn) {
    confirmBtn.addEventListener("click", confirmResetPassword);
  }
  if (exitCancelBtn) {
    exitCancelBtn.addEventListener("click", hideExitConfirmation);
  }
  if (exitConfirmBtn) {
    exitConfirmBtn.addEventListener("click", function () {
      resetDirty = false;
      window.location.href = pendingExitUrl;
    });
  }

  window.addEventListener("beforeunload", function (event) {
    if (!resetFinished && resetDirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
});

async function resetApiRequest(action, method, data, id) {
  try {
    var url = typeof apiUrl === "function" ? apiUrl(action, id) : "../backend/api.php?action=" + encodeURIComponent(action || "");
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

    return { ok: response.ok, status: response.status, payload: payload };
  } catch (err) {
    return { ok: false, status: 0, payload: null };
  }
}

async function loadResetAdmin() {
  var result = await resetApiRequest("admins", "GET");
  if (!result.ok || !result.payload || !result.payload.data || !Array.isArray(result.payload.data.admins)) {
    showResetError("Unable to load admin account details.");
    return;
  }

  resetAdmin = result.payload.data.admins.find(function (admin) {
    return String(admin.id || admin.user_id) === String(resetAdminId);
  });

  if (!resetAdmin) {
    showResetError("Selected admin account was not found.");
    return;
  }

  document.getElementById("reset-admin-name").value = resetAdmin.fullName || resetAdmin.name || "";
  document.getElementById("reset-admin-email").value = resetAdmin.email || "";
  document.getElementById("confirm-admin-name").textContent = resetAdmin.fullName || resetAdmin.name || "this admin";
}

function togglePasswordVisibility(inputId, button) {
  var input = document.getElementById(inputId);
  if (!input || !button) return;

  var isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  button.innerHTML = isHidden
    ? '<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
}

function handleResetSubmit(event) {
  event.preventDefault();
  var oldPass = document.getElementById("reset-old-pass").value;
  var newPass = document.getElementById("reset-new-pass").value;

  showResetError("");

  if (!oldPass || !newPass) {
    showResetError("Please enter both old and new passwords.");
    return;
  }
  if (!resetPasswordRegex.test(newPass)) {
    showResetError("New password needs 8+ chars with uppercase, lowercase, number, and symbol.");
    return;
  }

  showResetConfirmation();
}

function showResetConfirmation() {
  var confirmBox = document.getElementById("sa-reset-confirm");
  if (confirmBox) {
    confirmBox.hidden = false;
  }
  hideExitConfirmation();
}

function hideResetConfirmation() {
  var confirmBox = document.getElementById("sa-reset-confirm");
  if (confirmBox) {
    confirmBox.hidden = true;
  }
}

async function confirmResetPassword() {
  var confirmBtn = document.getElementById("sa-reset-confirm-btn");
  var oldPass = document.getElementById("reset-old-pass").value;
  var newPass = document.getElementById("reset-new-pass").value;

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Resetting...";
  }

  var result = await resetApiRequest("admins", "PUT", {
    oldPassword: oldPass,
    password: newPass
  }, resetAdminId);

  if (result.ok && result.payload && result.payload.success) {
    resetFinished = true;
    resetDirty = false;
    showToast("Password reset successfully.");
    window.setTimeout(function () {
      window.location.href = "super-admin-dashboard.html";
    }, 700);
    return;
  }

  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirm Reset";
  }
  hideResetConfirmation();
  showResetError((result.payload && result.payload.message) || "Password reset failed.");
}

function showResetError(message) {
  var error = document.getElementById("sa-reset-error");
  if (error) {
    error.textContent = message || "";
  }
}

function handleResetBack(url) {
  pendingExitUrl = url || "super-admin-dashboard.html";
  if (hasPasswordInput()) {
    resetDirty = true;
  }
  if (resetDirty && !resetFinished) {
    hideResetConfirmation();
    showExitConfirmation();
    return;
  }
  window.location.href = pendingExitUrl;
}

function hasPasswordInput() {
  var oldPass = document.getElementById("reset-old-pass");
  var newPass = document.getElementById("reset-new-pass");
  return !!((oldPass && oldPass.value) || (newPass && newPass.value));
}

function showExitConfirmation() {
  var form = document.getElementById("sa-reset-form");
  var exitBox = document.getElementById("sa-reset-exit-confirm");
  if (form) {
    form.hidden = true;
  }
  if (exitBox) {
    exitBox.hidden = false;
  }
}

function hideExitConfirmation() {
  var form = document.getElementById("sa-reset-form");
  var exitBox = document.getElementById("sa-reset-exit-confirm");
  if (exitBox) {
    exitBox.hidden = true;
  }
  if (form) {
    form.hidden = false;
  }
}
