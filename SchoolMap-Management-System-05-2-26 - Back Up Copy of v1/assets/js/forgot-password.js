/* =========================================================
   SCHOOLMAP — forgot-password.js
   Forgot Password page specific code
   ========================================================= */

"use strict";

document.addEventListener("DOMContentLoaded", function() {
  resetForgotForm();
});

function resetForgotForm() {
  var formContainer = document.getElementById("forgot-form-container");
  var successBox    = document.getElementById("forgot-success");
  var form          = document.getElementById("forgot-form");
  var errEl         = document.getElementById("err-forgot-email");
  var btn           = document.getElementById("forgot-submit");

  if (formContainer) { formContainer.style.display = ""; }
  if (successBox)    { successBox.style.display    = "none"; }
  if (form)          { form.reset(); }
  if (errEl)         { errEl.textContent = ""; }
  if (btn)           { btn.disabled = false; btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> Send Reset Link'; }
}

function handleForgotPassword(event) {
  event.preventDefault();
  var email  = document.getElementById("forgot-email").value.trim();
  var errEl  = document.getElementById("err-forgot-email");
  var btn    = document.getElementById("forgot-submit");

  if (errEl) { errEl.textContent = ""; }

  if (!email.includes("@")) {
    if (errEl) { errEl.textContent = "Please enter a valid email address"; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }

  setTimeout(function() {
    var formContainer = document.getElementById("forgot-form-container");
    var successBox    = document.getElementById("forgot-success");
    if (formContainer) { formContainer.style.display = "none"; }
    if (successBox)    { successBox.style.display    = ""; }
  }, 700);
}
