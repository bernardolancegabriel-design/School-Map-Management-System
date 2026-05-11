/* =========================================================
   SCHOOLMAP — login.js
   Login page specific code
   ========================================================= */
"use strict";

var LOCALHOST_APP_BASE = "http://localhost/SCHOOL%20MAPS/REPO/School-Map-Management-System/SchoolMap-Management-System-05-2-26%20-%20Back%20Up%20Copy%20of%20v1/html/";
var LOCALHOST_API_BASE = "http://localhost/SCHOOL%20MAPS/REPO/School-Map-Management-System/SchoolMap-Management-System-05-2-26%20-%20Back%20Up%20Copy%20of%20v1/backend/api.php";

if (window.location.protocol === "file:") {
  window.location.replace(LOCALHOST_APP_BASE + "login.html");
}

var API_BASE = window.location.protocol === "file:"
  ? LOCALHOST_API_BASE
  : (typeof getApiBase === "function" ? getApiBase() : "../backend/api.php");

var pendingIdentifier = null;

document.addEventListener("DOMContentLoaded", function() {
  if (typeof ensureAdminUser === "function") {
    ensureAdminUser();
  }
  resetLoginForm();
});

function resetLoginForm() {
  var form = document.getElementById("login-form");
  if (form) { form.reset(); }
  var err = document.getElementById("login-error");
  if (err) { err.style.display = "none"; err.textContent = ""; }
  var btn = document.getElementById("login-submit");
  if (btn) { btn.textContent = "Sign In"; btn.disabled = false; }

   pendingIdentifier = null;
  document.getElementById("step-credentials").style.display = "";
  document.getElementById("step-otp").style.display = "none";
}

async function apiLogin(identifier, password) {
  try {
    var loginUrl = window.location.protocol === "file:"
      ? LOCALHOST_API_BASE + "?action=login"
      : (typeof apiUrl === "function" ? apiUrl("login") : API_BASE + "?action=login");

    var response = await fetch(loginUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ identifier: identifier, password: password })
    });

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
    console.warn("Login API connection failed:", err);
    return {
      ok: false,
      status: 0,
      payload: null
    };
  }
}

async function apiVerifyOtp(identifier, otp) {
  try {
    var otpUrl = window.location.protocol === "file:"
      ? LOCALHOST_API_BASE + "?action=verify_otp"
      : (typeof apiUrl === "function" ? apiUrl("verify_otp") : API_BASE + "?action=verify_otp");

    var response = await fetch(otpUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ identifier: identifier, otp: otp })
    });

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
    console.warn("OTP API connection failed:", err);
    return {
      ok: false,
      status: 0,
      payload: null
    };
  }
}

async function handleLogin(event) {
  event.preventDefault();

   // if OTP step is visible, route to OTP handler instead
  if (document.getElementById("step-otp").style.display !== "none") {
    handleOtpSubmit(event);
    return;
  }
  var identifier = document.getElementById("login-identifier").value.trim();
  var password    = document.getElementById("login-password").value;
  var errBox      = document.getElementById("login-error");
  var submitBtn   = document.getElementById("login-submit");

  errBox.style.display = "none";
  submitBtn.textContent = "Signing in...";
  submitBtn.disabled    = true;

  var loginResult = await apiLogin(identifier, password);

  if (!loginResult.ok && loginResult.status === 401 && identifier.indexOf("@") === -1) {
    loginResult = await apiLogin(identifier + "@school.com", password);
  }

  // super_admin detected — switch to OTP step, don't proceed
  if (loginResult.payload && loginResult.payload.requires_otp) {
    pendingIdentifier = identifier;
    document.getElementById("step-credentials").style.display = "none";
    document.getElementById("step-otp").style.display = "";
    document.getElementById("login-otp").value = "";
    document.getElementById("login-otp").focus();
    submitBtn.textContent = "Verify OTP";
    submitBtn.disabled    = false;
    errBox.style.display  = "none";
    return;
  }

  if (loginResult.ok && loginResult.payload && loginResult.payload.success) {
    var userData = loginResult.payload.data || {};
    var safeUser = {
      id:       userData.id,
      fullName: userData.fullName || userData.name || identifier,
      email:    userData.email || identifier,
      username: userData.username || (userData.email || identifier).split("@")[0],
      role:     userData.role || "admin"
    };
    AppState.currentUser = safeUser;
    setCurrentUser(safeUser);
    showToast("Welcome back, " + safeUser.fullName.split(" ")[0] + "! 👋");

    if (safeUser.role === "super_admin") {
      window.location.href = "super-admin-dashboard.html";
    } else {
      window.location.href = "admin-dashboard.html";
    }
    return;
  }

  if (loginResult.status === 0) {
    errBox.textContent    = "Cannot connect to the server. Please check your connection and try again.";
    errBox.style.display  = "";
    submitBtn.textContent = "Sign In";
    submitBtn.disabled    = false;
    return;
  }

  errBox.textContent    = (loginResult.payload && loginResult.payload.message)
    ? loginResult.payload.message
    : "Invalid email/username or password.";
  errBox.style.display  = "";
  submitBtn.textContent = "Sign In";
  submitBtn.disabled    = false;
}

// called by the OTP form submit
async function handleOtpSubmit(event) {
  event.preventDefault();
  var otp       = document.getElementById("login-otp").value.trim();
  var errBox    = document.getElementById("login-error");
  var submitBtn = document.getElementById("login-submit");

  if (!otp || otp.length !== 6) {
    errBox.textContent   = "Please enter the 6-digit code from Google Authenticator.";
    errBox.style.display = "";
    return;
  }

  errBox.style.display  = "none";
  submitBtn.textContent = "Verifying...";
  submitBtn.disabled    = true;

  var otpResult = await apiVerifyOtp(pendingIdentifier, otp);

  if (otpResult.ok && otpResult.payload && otpResult.payload.success) {
    var userData = otpResult.payload.data || {};
    var safeUser = {
      id:       userData.id,
      fullName: userData.fullName || userData.name || pendingIdentifier,
      email:    userData.email    || pendingIdentifier,
      username: userData.username || (userData.email || pendingIdentifier).split("@")[0],
      role:     userData.role     || "super_admin"
    };
    AppState.currentUser = safeUser;
    setCurrentUser(safeUser);
    showToast("Welcome back, " + safeUser.fullName.split(" ")[0] + "! 👋");
    window.location.href = "super-admin-dashboard.html";
    return;
  }

  if (otpResult.status === 0) {
    errBox.textContent    = "Cannot connect to the server. Please check your connection and try again.";
    errBox.style.display  = "";
    submitBtn.textContent = "Verify OTP";
    submitBtn.disabled    = false;
    return;
  }

  errBox.textContent    = (otpResult.payload && otpResult.payload.message)
    ? otpResult.payload.message
    : "Invalid OTP code. Please try again.";
  errBox.style.display  = "";
  submitBtn.textContent = "Verify OTP";
  submitBtn.disabled    = false;
}

function togglePasswordVisibility(inputId, button) {
  var input = document.getElementById(inputId);
  if (!input) { return; }
  var isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  if (button) {
    button.innerHTML = isPassword
      ? '<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
}
