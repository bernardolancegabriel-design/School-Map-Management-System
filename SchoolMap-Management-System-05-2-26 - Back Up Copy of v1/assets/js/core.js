/* =========================================================
   SCHOOLMAP — core.js
   Shared utilities and constants for all pages
   ========================================================= */

"use strict";

/* =========================================================
   CONSTANTS & DEFAULT DATA
   ========================================================= */

var APP_USERS_KEY = "schoolmap_users";
var APP_CURRENT_KEY = "schoolmap_current_user";
var APP_LOCATIONS_KEY = "schoolmap_locations";
var APP_FLOORS_KEY = "schoolmap_floors";
var APP_LEGENDS_KEY = "schoolmap_legends";
var APP_FLOOR_IMAGES_KEY = "schoolmap_floor_images";
var APP_LOGS_KEY = "schoolmap_logs";
var APP_SETTINGS_KEY = "schoolmap_settings";
var APP_DATA_VERSION = "schoolmap_data_v3";

var DEFAULT_FLOORS = [
  { id: 1, name: "Ground Floor", label: "1F" },
];

var DEFAULT_LEGENDS = [];

var DEFAULT_USERS = [];

var DEFAULT_LOCATIONS = [];

var LOCATION_TYPES = [];

var RECOMMENDATIONS = [];
var APP_API_BASE = "../backend/api.php";
var APP_LOCALHOST_API_BASE = "http://localhost/SCHOOL%20MAPS/REPO/School-Map-Management-System/SchoolMap-Management-System-05-2-26%20-%20Back%20Up%20Copy%20of%20v1/backend/api.php";

/* =========================================================
   APPLICATION STATE
   ========================================================= */

var AppState = {
  currentPage: "landing",
  currentUser: null,
  locations: [],
  floors: [],
  legends: [],
  currentFloor: 1,
  zoom: 1,
  selectedLocation: null,
  showLabels: true,
  showLegend: true,
  activeLegendFilter: null,
  routeFrom: "",
  routeTo: "",
  showRoute: false,
  userMenuOpen: false,
  sidebarOpen: false,
  adminTab: "locations",
  adminLocations: [],
  adminFloors: [],
  adminLegends: [],
  editingLocationId: null,
  editingFloorId: null,
  showAddLocation: false,
  showAddFloor: false,
};

/* =========================================================
   STORAGE HELPERS
   ========================================================= */

function storageGet(key, defaultValue) {
  return typeof defaultValue === "function" ? defaultValue() : defaultValue;
}

function storageSet(key, value) {
  return value;
}

function migrateData() {
  return true;
}

function getStoredLocations() {
  migrateData();
  return storageGet(APP_LOCATIONS_KEY, DEFAULT_LOCATIONS);
}

function getStoredFloors() {
  return storageGet(APP_FLOORS_KEY, DEFAULT_FLOORS);
}

function getStoredLegends() {
  return storageGet(APP_LEGENDS_KEY, DEFAULT_LEGENDS);
}

function getStoredFloorImages() {
  return storageGet(APP_FLOOR_IMAGES_KEY, {});
}

function getStoredLogs() {
  return storageGet(APP_LOGS_KEY, []);
}

function getStoredSettings() {
  return storageGet(APP_SETTINGS_KEY, {
    guestModeEnabled: false,
    accessibilityEnabled: false,
    logRetention: 30,
    maxAttempts: 5,
    lockoutDuration: 15,
  });
}

function getStoredUsers() {
  var users = storageGet(APP_USERS_KEY, DEFAULT_USERS);
  if (!Array.isArray(users)) {
    users = Array.isArray(DEFAULT_USERS) ? DEFAULT_USERS.slice() : [];
  }

  var hasSuperAdmin = users.some(function (u) {
    return u && u.role === "super_admin";
  });
  if (!hasSuperAdmin) {
    users = users.concat(
      DEFAULT_USERS.filter(function (u) {
        return u && u.role === "super_admin";
      }),
    );
    storeUsers(users);
  }

  return users;
}

function storeUsers(users) {
  storageSet(APP_USERS_KEY, users);
}

function getCurrentUser() {
  return AppState.currentUser || null;
}

function setCurrentUser(user) {
  if (user) {
    AppState.currentUser = user;
  } else {
    AppState.currentUser = null;
  }
}

function getColorMap() {
  var map = {};
  var legends = AppState.legends || [];
  for (var i = 0; i < legends.length; i++) {
    var legend = legends[i] || {};
    if (legend.type) {
      map[legend.type] = legend.color;
    }
    if (legend.id) {
      map[legend.id] = legend.color;
    }
  }
  return map;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getApiBase() {
  if (window.location.protocol === "file:") {
    return APP_LOCALHOST_API_BASE;
  }
  return APP_API_BASE;
}

function apiUrl(action, id) {
  var url = getApiBase() + "?action=" + encodeURIComponent(action || "");
  if (id !== undefined && id !== null && id !== "") {
    url += "&id=" + encodeURIComponent(id);
  }
  return url;
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function navigate(page) {
  window.location.href = page + ".html";
}

function handleLogout() {
  var modal = document.getElementById("logoutModal");
  if (modal) {
    modal.style.display = "flex";
    return;
  }
  performLogout();
}

function hideLogoutModal() {
  var modal = document.getElementById("logoutModal");
  if (modal) {
    modal.style.display = "none";
  }
}

function confirmLogout() {
  hideLogoutModal();
  performLogout();
}

function performLogout() {
  fetch(typeof apiUrl === "function" ? apiUrl("logout") : "../backend/api.php?action=logout", { credentials: "same-origin" }).catch(function () {});
  AppState.currentUser = null;
  setCurrentUser(null);
  showToast("You have been signed out.");
  navigate("login");
}

function requireAdminPage() {
  var user = getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

function requireSuperAdminPage() {
  var user = getCurrentUser();
  if (!user || user.role !== "super_admin") {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

/* =========================================================
   TOAST NOTIFICATION
   ========================================================= */

var toastTimer = null;
var toastHideTimer = null;

function showToast(message) {
  var toast = document.getElementById("toast");
  if (!toast) {
    return;
  }

  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
  }

  toast.classList.remove("show");
  toast.style.display = "none";
  void toast.offsetWidth;

  toast.textContent = message;
  toast.style.display = "";
  requestAnimationFrame(function () {
    toast.classList.add("show");
  });

  toastTimer = setTimeout(function () {
    toast.classList.remove("show");
    toastTimer = null;
    toastHideTimer = setTimeout(function () {
      if (!toast.classList.contains("show")) {
        toast.style.display = "none";
      }
      toastHideTimer = null;
    }, 250);
  }, 3000);
}

/* =========================================================
   HTML ESCAPING UTILITIES
   ========================================================= */

function escHtml(str) {
  if (!str && str !== 0) {
    return "";
  }
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(str) {
  return escHtml(str);
}

/* =========================================================
   INITIALIZATION (Runs on all pages)
   ========================================================= */

function ensureAdminUser() {
  // Authentication handled server-side via api.php
}

document.addEventListener("DOMContentLoaded", function () {
  ensureAdminUser();
  AppState.currentUser = window.SchoolMapCurrentUser || getCurrentUser();
  AppState.locations = getStoredLocations();
  AppState.floors = getStoredFloors();
  AppState.legends = getStoredLegends();
});
