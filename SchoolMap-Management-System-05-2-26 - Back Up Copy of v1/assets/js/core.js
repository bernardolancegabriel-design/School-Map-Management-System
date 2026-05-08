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
  { id: 2, name: "2nd Floor", label: "2F" },
  { id: 3, name: "3rd Floor", label: "3F" },
];

var DEFAULT_LEGENDS = [
  { id: "classroom", type: "classroom", label: "Classroom", color: "#192A57" },
  {
    id: "office",
    type: "office",
    label: "VP / Admin Office",
    color: "#8F3347",
  },
  { id: "admin", type: "admin", label: "Admin / Registrar", color: "#C24322" },
  { id: "library", type: "library", label: "Library", color: "#2d5da1" },
  { id: "cafeteria", type: "cafeteria", label: "Cafeteria", color: "#b45309" },
  { id: "gym", type: "gym", label: "Gymnasium", color: "#15803d" },
  { id: "restroom", type: "restroom", label: "Restroom", color: "#6b7280" },
  { id: "stairwell", type: "stairwell", label: "Stairwell", color: "#7c3aed" },
  {
    id: "entrance",
    type: "entrance",
    label: "Entrance / Exit",
    color: "#0891b2",
  },
  {
    id: "emergency",
    type: "emergency",
    label: "Emergency Exit",
    color: "#dc2626",
  },
];

var DEFAULT_USERS = [];

var DEFAULT_LOCATIONS = [];

var LOCATION_TYPES = [
  "classroom",
  "office",
  "admin",
  "library",
  "cafeteria",
  "gym",
  "restroom",
  "stairwell",
  "entrance",
  "emergency",
];

var RECOMMENDATIONS = [];

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
  try {
    var raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) {
      return typeof defaultValue === "function" ? defaultValue() : defaultValue;
    }
    return JSON.parse(raw);
  } catch (err) {
    return typeof defaultValue === "function" ? defaultValue() : defaultValue;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("localStorage write failed:", err);
  }
}

function migrateData() {
  var version = localStorage.getItem("schoolmap_data_version");
  if (version !== APP_DATA_VERSION) {
    localStorage.removeItem(APP_LOCATIONS_KEY);
    localStorage.setItem("schoolmap_data_version", APP_DATA_VERSION);
  }
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
  return storageGet(APP_CURRENT_KEY, null);
}

function setCurrentUser(user) {
  if (user) {
    storageSet(APP_CURRENT_KEY, user);
  } else {
    localStorage.removeItem(APP_CURRENT_KEY);
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

/* =========================================================
   NAVIGATION
   ========================================================= */

function navigate(page) {
  window.location.href = page + ".html";
}

function handleLogout() {
  var modal = document.getElementById("logoutModal");
  if (modal) {
    modal.style.display = "";
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

function showToast(message) {
  var toast = document.getElementById("toast");
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.style.display = "";

  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(function () {
    toast.style.display = "none";
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
  AppState.currentUser = getCurrentUser();
  AppState.locations = getStoredLocations();
  AppState.floors = getStoredFloors();
  AppState.legends = getStoredLegends();
});