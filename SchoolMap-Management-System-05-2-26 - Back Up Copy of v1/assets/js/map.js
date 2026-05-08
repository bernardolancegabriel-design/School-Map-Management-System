/* =========================================================
   SCHOOLMAP — map.js
   Map page specific code
   ========================================================= */

"use strict";

document.addEventListener("DOMContentLoaded", function () {
  loadCurrentUser();
  initMapPage();
  document.addEventListener("click", handleGlobalClick);
});

function initMapPage() {
  AppState.zoom = 1;
  AppState.panX = 0;
  AppState.panY = 0;
  AppState.selectedLocation = null;
  AppState.routeFrom = "";
  AppState.routeTo = "";
  AppState.showRoute = false;
  AppState.floors = getStoredFloors().slice(0, 1);
  AppState.currentFloor = AppState.floors[0]?.id || 1;
  AppState.locations = getStoredLocations();
  AppState.legends = getStoredLegends();

  renderUserArea();
  populateRouteSelects();
  renderFloorButtons();
  renderLegendItems();
  renderMapCanvas();
  renderPins();
  renderRecommendations();
  updateYouAreHere();
  updateRouteBtnState();
  setupMapInteractions();
  requestAnimationFrame(enableMapTransitions);

  var fromSel = document.getElementById("route-from");
  var toSel = document.getElementById("route-to");
  if (fromSel) fromSel.value = "";
  if (toSel) toSel.value = "";

  initGuestFlow();
}

function enableMapTransitions() {
  var zoomContainer = document.getElementById("map-zoom-container");
  if (zoomContainer) zoomContainer.classList.add("map-transition-enabled");
}

/* ====================== USER AREA ====================== */

function renderUserArea() {
  var container = document.getElementById("map-user-area");
  if (!container) return;

  var user = AppState.currentUser;

  if (user) {
    var displayName = escHtml(user.fullName || "Guest");
    var isAdmin = user.role === "admin";

    container.innerHTML = `
      <button class="${isAdmin ? "map-user-btn admin-btn" : "map-user-btn"}" onclick="toggleUserMenu(this)">
        <div class="user-avatar">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <span class="user-avatar-name">${displayName}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>`;
  } else {
    container.innerHTML = `<button class="wobbly-btn wobbly-btn-primary wobbly-btn-sm" onclick="navigate('login')">Sign In</button>`;
  }
}

/* ====================== PERSISTENCE ====================== */

function loadCurrentUser() {
  const saved = localStorage.getItem("schoolmap_current_user");
  AppState.currentUser = saved ? JSON.parse(saved) : null;
}

function saveCurrentUser(user) {
  if (!user) return;
  localStorage.setItem("schoolmap_current_user", JSON.stringify(user));
  AppState.currentUser = user;
}

function clearCurrentUser() {
  localStorage.removeItem("schoolmap_current_user");
  AppState.currentUser = null;
}

function saveGuestLog(guest) {
  let logs = JSON.parse(localStorage.getItem("schoolmap_logs") || "[]");
  logs.unshift({
    name: guest.fullName,
    category: guest.category,
    purpose: guest.purpose,
    time_in: guest.time_in || new Date().toISOString(),
    timestamp: new Date().toISOString(),
  });
  localStorage.setItem("schoolmap_logs", JSON.stringify(logs.slice(0, 50)));

  // Also save to DB
  const now = new Date();
  const payload = {
    name: guest.fullName,
    purpose: guest.purpose,
    destination: document.getElementById("guest-destination").value.trim() || "Map",
    category: guest.category,
    time_in: now.toTimeString().split(' ')[0],
    date: now.toISOString().split('T')[0],
    plate_no: document.getElementById("guest-plate").value.trim() || null,
  };

  fetch("../backend/api.php?action=visitor_logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(err => console.warn("Failed to save visitor log to DB:", err));
}

function saveGuestTimeOut(guest) {
  let logs = JSON.parse(localStorage.getItem("schoolmap_logs") || "[]");
  const latest = logs.find((l) => l.name === guest.fullName && !l.time_out);
  if (latest) {
    latest.time_out = new Date().toISOString();
    localStorage.setItem("schoolmap_logs", JSON.stringify(logs));
  }
}

/* ====================== GUEST FLOW ====================== */

function initGuestFlow() {
  loadCurrentUser();

  const isGuestMode = sessionStorage.getItem("guest_mode") === "true";

  if (isGuestMode) {
    sessionStorage.removeItem("guest_mode");

    if (!AppState.currentUser || !AppState.currentUser.isGuest) {
      showGuestLogbookModal();
    } else {
      renderUserArea();
    }
  } else {
    renderUserArea();
  }
}

function showGuestLogbookModal() {
  const modal = document.getElementById("guest-logbook-modal");
  const dateInput = document.getElementById("guest-datetime");

  if (modal) modal.classList.add("active");

  if (dateInput) {
    const now = new Date();
    dateInput.value =
      now.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      " " +
      now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

function handleGuestSubmit(e) {
  e.preventDefault();

  const name = document.getElementById("guest-name").value.trim();
  const category = document.getElementById("guest-category").value;
  const purpose = document.getElementById("guest-purpose").value.trim();

  if (!name || !category) {
    showToast("Please fill in all required fields.");
    return;
  }

  const guestUser = {
    id: "guest_" + Date.now(),
    fullName: name,
    role: category,
    isGuest: true,
    category: category,
    purpose: purpose,
    time_in: new Date().toISOString(),
    loggedInAt: new Date().toISOString(),
  };

  saveCurrentUser(guestUser);
  saveGuestLog(guestUser);
  renderUserArea();

  document.getElementById("guest-logbook-modal").classList.remove("active");
  showToast(`Welcome, ${name}!`);
  showEntryBanner();
}

/* ====================== LOGOUT ====================== */

function handleLogout() {
  const user = AppState.currentUser;
  if (!user) return;

  if (user.isGuest) {
    if (confirm("Are you sure you want to log out?")) {
      saveGuestTimeOut(user);
      clearCurrentUser();
      showToast("You have logged out. Thank you for visiting!");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 600);
    }
  } else {
    // Admin logout
    if (confirm("Are you sure you want to logout?")) {
      clearCurrentUser();
      renderUserArea();
      showToast("You have been logged out.");
    }
  }
}

/* ====================== USER MENU ====================== */

function toggleUserMenu(button) {
  var dropdown = document.getElementById("user-dropdown");
  if (!dropdown || !AppState.currentUser) return;

  if (AppState.userMenuOpen) {
    closeUserMenu();
    return;
  }

  const user = AppState.currentUser;
  document.getElementById("user-dropdown-name").textContent =
    user.fullName || "Guest";
  document.getElementById("user-dropdown-role").textContent = user.isGuest
    ? user.category || "Guest"
    : user.role || "User";

  var adminItem = document.getElementById("user-dropdown-admin");
  if (adminItem) adminItem.style.display = user.role === "admin" ? "" : "none";

  if (button) {
    var rect = button.getBoundingClientRect();
    dropdown.style.top = rect.bottom + 4 + "px";
    dropdown.style.right = window.innerWidth - rect.right + "px";
    dropdown.style.left = "auto";
  }

  dropdown.style.display = "";
  AppState.userMenuOpen = true;
}

function closeUserMenu() {
  var dropdown = document.getElementById("user-dropdown");
  if (dropdown) dropdown.style.display = "none";
  AppState.userMenuOpen = false;
}

function handleGlobalClick(event) {
  if (AppState.userMenuOpen) {
    var dropdown = document.getElementById("user-dropdown");
    var userArea = document.getElementById("map-user-area");
    if (
      dropdown &&
      !dropdown.contains(event.target) &&
      userArea &&
      !userArea.contains(event.target)
    ) {
      closeUserMenu();
    }
  }
}

/* ====================== ADMIN ACCESS ====================== */

function verifyAdminAccess() {
  var user = getCurrentUser();
  if (!user || user.role !== "admin") {
    showToast("Admin access requires signing in as Administrator.");
    navigate("login");
    return;
  }
  var modal = document.getElementById("adminVerifyModal");
  if (!modal) {
    window.location.href = "admin-dashboard.html";
    return;
  }
  modal.style.display = "";
}

function closeAdminVerifyModal() {
  var modal = document.getElementById("adminVerifyModal");
  if (modal) modal.style.display = "none";
}

function proceedToAdminPanel() {
  closeAdminVerifyModal();
  window.location.href = "admin-dashboard.html";
}

/* ===== FLOORS ===== */

function renderFloorButtons() {
  var container = document.getElementById("floor-buttons");
  if (!container) {
    return;
  }
  var html = "";
  AppState.floors.forEach(function (floor) {
    var active = floor.id === AppState.currentFloor ? " active" : "";
    html +=
      '<button class="floor-btn' +
      active +
      '" onclick="switchFloor(' +
      floor.id +
      ')">' +
      escHtml(floor.name) +
      '<span class="floor-btn-label">' +
      escHtml(floor.label) +
      "</span>" +
      "</button>";
  });
  container.innerHTML = html;
}

function switchFloor(floorId) {
  AppState.currentFloor = floorId;
  AppState.selectedLocation = null;
  renderFloorButtons();
  updateFloorBadge();
  renderMapCanvas();
  renderPins();
  renderRouteOverlay();
  updateYouAreHere();
  closeSelectedPanel();
}

function updateFloorBadge() {
  var badge = document.getElementById("floor-badge");
  if (!badge) {
    return;
  }
  var floor = AppState.floors.find(function (f) {
    return f.id === AppState.currentFloor;
  });
  badge.textContent = floor ? floor.name : "Floor " + AppState.currentFloor;
}

/* ===== LEGEND ===== */

function renderLegendItems() {
  var container = document.getElementById("legend-items");
  if (!container) {
    return;
  }
  var html = "";
  AppState.legends.forEach(function (leg) {
    html +=
      '<div class="legend-item">' +
      '<div class="legend-dot" style="background:' +
      leg.color +
      '"></div>' +
      '<span class="legend-label">' +
      escHtml(leg.label) +
      "</span>" +
      "</div>";
  });
  container.innerHTML = html;
}

function toggleLegend() {
  AppState.showLegend = !AppState.showLegend;
  var container = document.getElementById("legend-items");
  var btn = document.getElementById("legend-toggle-btn");
  if (container) {
    container.style.display = AppState.showLegend ? "" : "none";
  }
  if (btn) {
    btn.textContent = AppState.showLegend ? "Hide" : "Show";
  }
}

function toggleLabels(checked) {
  AppState.showLabels = checked;
  renderPins();
}

function getLocationType(loc) {
  return loc.type || loc.legendId || "unknown";
}

function getLocationTypeLabel(loc) {
  var typeKey = getLocationType(loc);
  var legend = AppState.legends.find(function (l) {
    return (l.type && l.type === typeKey) || (l.id && l.id === typeKey);
  });
  return legend ? legend.label : escHtml(typeKey);
}

function getStoredFloorImage(floorId) {
  var images = getStoredFloorImages();
  return images && images[floorId] ? images[floorId] : "";
}

/* ===== MAP CANVAS ===== */

function renderMapCanvas() {
  var container = document.getElementById("map-image-container");
  if (!container) {
    return;
  }

  var imageSrc = getStoredFloorImage(AppState.currentFloor);
  if (!imageSrc && AppState.currentFloor === 1) {
    imageSrc = "../images/map-ground-floor.png";
  }

  if (imageSrc) {
    container.innerHTML =
      '<img src="' +
      escAttr(imageSrc) +
      '" alt="Floor Plan" class="map-floor-img" draggable="false" />';
  } else {
    container.innerHTML =
      '<div class="map-grid-bg">' +
      '<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0.25">' +
      '<line x1="50%" y1="10%" x2="50%" y2="90%" stroke="#2d2d2d" stroke-width="1.5" stroke-dasharray="4 4" />' +
      '<line x1="10%" y1="50%" x2="90%" y2="50%" stroke="#2d2d2d" stroke-width="1.5" stroke-dasharray="4 4" />' +
      '<rect x="10%" y="10%" width="38%" height="38%" fill="none" stroke="#2d2d2d" stroke-width="1" rx="4" />' +
      '<rect x="52%" y="10%" width="38%" height="38%" fill="none" stroke="#2d2d2d" stroke-width="1" rx="4" />' +
      '<rect x="10%" y="52%" width="38%" height="38%" fill="none" stroke="#2d2d2d" stroke-width="1" rx="4" />' +
      '<rect x="52%" y="52%" width="38%" height="38%" fill="none" stroke="#2d2d2d" stroke-width="1" rx="4" />' +
      "</svg>" +
      "</div>";
  }

  updateFloorBadge();
  applyZoom();
}

function setupMapInteractions() {
  var zoomContainer = document.getElementById("map-zoom-container");
  if (!zoomContainer) {
    return;
  }

  var isPanning = false;
  var startX = 0;
  var startY = 0;
  var startPanX = 0;
  var startPanY = 0;

  zoomContainer.style.cursor = "grab";

  zoomContainer.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) {
      return;
    }
    if (
      e.target.closest(".map-pin-wrapper") ||
      e.target.closest(".map-pin-icon") ||
      e.target.closest(".map-pin-label")
    ) {
      return;
    }
    e.preventDefault();
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    startPanX = AppState.panX || 0;
    startPanY = AppState.panY || 0;
    zoomContainer.setPointerCapture(e.pointerId);
    zoomContainer.style.cursor = "grabbing";
  });

  zoomContainer.addEventListener("pointermove", function (e) {
    if (!isPanning) {
      return;
    }
    e.preventDefault();
    AppState.panX = startPanX + (e.clientX - startX);
    AppState.panY = startPanY + (e.clientY - startY);
    applyZoom();
  });

  zoomContainer.addEventListener("pointerup", function (e) {
    if (!isPanning) {
      return;
    }
    isPanning = false;
    zoomContainer.releasePointerCapture &&
      zoomContainer.releasePointerCapture(e.pointerId);
    zoomContainer.style.cursor = "grab";
  });

  zoomContainer.addEventListener("pointercancel", function (e) {
    if (!isPanning) {
      return;
    }
    isPanning = false;
    zoomContainer.releasePointerCapture &&
      zoomContainer.releasePointerCapture(e.pointerId);
    zoomContainer.style.cursor = "grab";
  });

  zoomContainer.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      changeZoom(e.deltaY < 0 ? 0.15 : -0.15);
    },
    { passive: false },
  );
}

/* ===== PINS ===== */

function renderPins() {
  var container = document.getElementById("map-pins");
  if (!container) {
    return;
  }

  var floorLocs = AppState.locations.filter(function (l) {
    return l.floor === AppState.currentFloor;
  });

  var colorMap = getColorMap();
  var html = "";

  floorLocs.forEach(function (loc) {
    var locType = getLocationType(loc);
    var color = colorMap[locType] || "#192A57";
    var isSelected =
      AppState.selectedLocation && AppState.selectedLocation.id === loc.id;
    var size = AppState.currentFloor === 1 ? 28 : 30;
    var iconSize = size - 4;
    var selectedClass = isSelected ? " selected" : "";

    var pulseHtml = "";
    if (isSelected) {
      pulseHtml =
        '<div class="map-pin-pulse" style="width:' +
        (size + 18) +
        "px;height:" +
        (size + 18) +
        "px;top:" +
        -(size + 18 - size) / 2 +
        "px;left:" +
        -(size + 18 - size) / 2 +
        "px;background:" +
        color +
        '33;"></div>';
    }

    var labelHtml = "";
    if (AppState.showLabels) {
      labelHtml =
        '<span class="map-pin-label">' + escHtml(loc.name) + "</span>";
    }

    html +=
      '<div class="map-pin-wrapper' +
      selectedClass +
      '" ' +
      'style="left:' +
      loc.x +
      "%;top:" +
      loc.y +
      '%;" ' +
      "onclick=\"selectPin('" +
      loc.id +
      "')\" " +
      'title="' +
      escHtml(loc.name) +
      '">' +
      pulseHtml +
      '<div class="map-pin-icon" style="width:' +
      size +
      "px;height:" +
      size +
      "px;background:" +
      color +
      (isSelected ? ";box-shadow:0 0 0 3px white,0 0 0 5px " + color : "") +
      '">' +
      getPinIcon(getLocationType(loc), iconSize) +
      "</div>" +
      labelHtml +
      "</div>";
  });

  container.innerHTML = html;
}
function getPinIcon(type, size) {
  var legend = AppState.legends.find(function (l) {
    return (l.type && l.type === type) || (l.id && l.id === type);
  });

  if (legend && legend.iconUrl) {
    return (
      '<img src="' +
      escAttr(legend.iconUrl) +
      '" width="' +
      size +
      '" height="' +
      size +
      '" style="width:' +
      size +
      "px;height:" +
      size +
      'px;object-fit:contain;display:block" alt="" />'
    );
  }

  var icons = {
    classroom:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>',
    office:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>',
    admin:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    library:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>',
    cafeteria:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
    gym:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5h11M6.5 17.5h11M3 9.5h18M3 14.5h18"/></svg>',
    restroom:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    stairwell:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
    entrance:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    emergency:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    FileText:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
    BookOpen:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z"/></svg>',
    Briefcase:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    Library:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>',
    UtensilsCrossed:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Z"/></svg>',
    Dumbbell:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829Z"/></svg>',
    User:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    ArrowUpDown:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>',
    DoorOpen:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"/></svg>',
    AlertTriangle:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    MapPin:
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>',
  };

  var iconKey = legend && legend.icon ? legend.icon : type;
  return icons[iconKey] || icons[type] || icons.MapPin;
}

function selectPin(locId) {
  var loc = AppState.locations.find(function (l) {
    return l.id === locId;
  });
  if (!loc) {
    return;
  }

  if (AppState.selectedLocation && AppState.selectedLocation.id === locId) {
    AppState.selectedLocation = null;
    closeSelectedPanel();
  } else {
    AppState.selectedLocation = loc;
    showSelectedPanel(loc);
  }
  renderPins();
}

/* ===== SELECTED PANEL ===== */

function showSelectedPanel(loc) {
  var panel = document.getElementById("selected-panel");
  var content = document.getElementById("selected-panel-content");
  if (!panel || !content) {
    return;
  }

  var colorMap = getColorMap();
  var locType = getLocationType(loc);
  var color = colorMap[locType] || "#192A57";

  content.innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:8px">' +
    '<div class="info-panel-icon" style="background:' +
    color +
    ';margin-top:2px">' +
    '<span style="width:8px;height:8px;background:white;border-radius:50%;display:block"></span>' +
    "</div>" +
    '<div style="flex:1;min-width:0">' +
    '<p class="info-panel-title">' +
    escHtml(loc.name) +
    "</p>" +
    '<p class="info-panel-type">' +
    escHtml(getLocationTypeLabel(loc)) +
    " • Floor " +
    loc.floor +
    "</p>" +
    (loc.description
      ? '<p class="info-panel-desc">' + escHtml(loc.description) + "</p>"
      : "") +
    "</div>" +
    "</div>" +
    '<div class="info-panel-actions">' +
    '<button class="info-action-btn info-action-btn-primary" onclick="setRouteTo(\'' +
    loc.id +
    "')\">Go here</button>" +
    '<button class="info-action-btn info-action-btn-secondary" onclick="setRouteFrom(\'' +
    loc.id +
    "')\">Start here</button>" +
    "</div>";

  panel.style.display = "";
}

function closeSelectedPanel() {
  var panel = document.getElementById("selected-panel");
  if (panel) {
    panel.style.display = "none";
  }
  AppState.selectedLocation = null;
  renderPins();
}

/* ===== SEARCH ===== */

function handleMapSearch(query) {
  AppState.searchQuery = query;
  var resultsBox = document.getElementById("search-results");
  if (!resultsBox) {
    return;
  }

  if (!query || query.length < 1) {
    resultsBox.style.display = "none";
    resultsBox.innerHTML = "";
    return;
  }

  var q = query.toLowerCase();
  var matches = AppState.locations.filter(function (loc) {
    return loc.name.toLowerCase().indexOf(q) !== -1;
  });

  if (matches.length === 0) {
    resultsBox.style.display = "none";
    resultsBox.innerHTML = "";
    return;
  }

  var colorMap = getColorMap();
  var html = "";
  matches.slice(0, 8).forEach(function (loc) {
    var color = colorMap[getLocationType(loc)] || "#192A57";
    html +=
      '<div class="search-result-item" onclick="selectSearchResult(\'' +
      loc.id +
      "')\">" +
      '<div class="search-result-dot" style="background:' +
      color +
      '"></div>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
      escHtml(loc.name) +
      "</span>" +
      '<span class="search-result-floor">Floor ' +
      loc.floor +
      "</span>" +
      "</div>";
  });

  resultsBox.innerHTML = html;
  resultsBox.style.display = "";
}

function selectSearchResult(locId) {
  var loc = AppState.locations.find(function (l) {
    return l.id === locId;
  });
  if (!loc) {
    return;
  }

  var searchInput = document.getElementById("map-search");
  var resultsBox = document.getElementById("search-results");
  if (searchInput) {
    searchInput.value = "";
  }
  if (resultsBox) {
    resultsBox.style.display = "none";
  }

  if (loc.floor !== AppState.currentFloor) {
    switchFloor(loc.floor);
  }

  AppState.selectedLocation = loc;
  showSelectedPanel(loc);
  renderPins();
}

/* ===== ROUTE FINDER ===== */

function populateRouteSelects() {
  var fromSel = document.getElementById("route-from");
  var toSel = document.getElementById("route-to");
  if (!fromSel || !toSel) {
    return;
  }

  var optionsHtml = '<option value="">From: Select location</option>';
  AppState.floors.forEach(function (floor) {
    var floorLocs = AppState.locations.filter(function (l) {
      return l.floor === floor.id;
    });
    if (floorLocs.length === 0) {
      return;
    }
    optionsHtml += '<optgroup label="' + escAttr(floor.name) + '">';
    floorLocs.forEach(function (loc) {
      optionsHtml +=
        '<option value="' +
        escAttr(loc.id) +
        '">' +
        escHtml(loc.name) +
        "</option>";
    });
    optionsHtml += "</optgroup>";
  });
  fromSel.innerHTML = optionsHtml;

  var toOptionsHtml = optionsHtml.replace(
    "From: Select location",
    "To: Select destination",
  );
  toSel.innerHTML = toOptionsHtml;
}

function handleRouteChange() {
  var fromSel = document.getElementById("route-from");
  var toSel = document.getElementById("route-to");
  AppState.routeFrom = fromSel ? fromSel.value : "";
  AppState.routeTo = toSel ? toSel.value : "";
  AppState.showRoute = false;
  closeRoutePanel();
  renderRouteOverlay();
  updateRouteBtnState();
}

function updateRouteBtnState() {
  var btn = document.getElementById("show-route-btn");
  if (!btn) {
    return;
  }
  btn.disabled = !(AppState.routeFrom && AppState.routeTo);
}

function setRouteTo(locId) {
  var toSel = document.getElementById("route-to");
  if (toSel) {
    toSel.value = locId;
  }
  AppState.routeTo = locId;
  updateRouteBtnState();
  closeSelectedPanel();
}

function setRouteFrom(locId) {
  var fromSel = document.getElementById("route-from");
  if (fromSel) {
    fromSel.value = locId;
  }
  AppState.routeFrom = locId;
  updateRouteBtnState();
  closeSelectedPanel();
}

function showRoute() {
  if (!AppState.routeFrom || !AppState.routeTo) {
    return;
  }
  AppState.showRoute = true;

  var fromLoc = AppState.locations.find(function (l) {
    return l.id === AppState.routeFrom;
  });
  var toLoc = AppState.locations.find(function (l) {
    return l.id === AppState.routeTo;
  });

  if (!fromLoc || !toLoc) {
    return;
  }

  if (fromLoc.floor !== AppState.currentFloor) {
    switchFloor(fromLoc.floor);
  }

  renderRouteOverlay();
  showRouteInfoPanel(fromLoc, toLoc);
}

function renderRouteOverlay() {
  var svg = document.getElementById("route-svg");
  if (!svg) {
    return;
  }

  if (!AppState.showRoute) {
    svg.style.display = "none";
    return;
  }

  var fromLoc = AppState.locations.find(function (l) {
    return l.id === AppState.routeFrom;
  });
  var toLoc = AppState.locations.find(function (l) {
    return l.id === AppState.routeTo;
  });

  if (
    !fromLoc ||
    !toLoc ||
    (fromLoc.floor !== AppState.currentFloor &&
      toLoc.floor !== AppState.currentFloor)
  ) {
    svg.style.display = "none";
    return;
  }

  svg.style.display = "";

  var routeLine = document.getElementById("route-line");
  var fromDot = document.getElementById("route-from-dot");
  var toDot = document.getElementById("route-to-dot");

  if (
    fromLoc.floor === AppState.currentFloor &&
    toLoc.floor === AppState.currentFloor
  ) {
    if (routeLine) {
      routeLine.setAttribute("x1", fromLoc.x + "%");
      routeLine.setAttribute("y1", fromLoc.y + "%");
      routeLine.setAttribute("x2", toLoc.x + "%");
      routeLine.setAttribute("y2", toLoc.y + "%");
    }
    if (fromDot) {
      fromDot.setAttribute("cx", fromLoc.x + "%");
      fromDot.setAttribute("cy", fromLoc.y + "%");
      fromDot.style.display = "";
    }
    if (toDot) {
      toDot.setAttribute("cx", toLoc.x + "%");
      toDot.setAttribute("cy", toLoc.y + "%");
      toDot.style.display = "";
    }
  } else if (fromLoc.floor === AppState.currentFloor) {
    if (routeLine) {
      routeLine.setAttribute("x1", fromLoc.x + "%");
      routeLine.setAttribute("y1", fromLoc.y + "%");
      routeLine.setAttribute("x2", "50%");
      routeLine.setAttribute("y2", "90%");
    }
    if (fromDot) {
      fromDot.setAttribute("cx", fromLoc.x + "%");
      fromDot.setAttribute("cy", fromLoc.y + "%");
    }
    if (toDot) {
      toDot.style.display = "none";
    }
  }
}

function showRouteInfoPanel(fromLoc, toLoc) {
  var panel = document.getElementById("route-info-panel");
  var content = document.getElementById("route-info-content");
  if (!panel || !content) {
    return;
  }

  var html =
    '<div class="route-info-row">' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="#15803d" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>' +
    "<span><strong>From:</strong> " +
    escHtml(fromLoc.name) +
    "</span>" +
    "</div>" +
    '<div class="route-info-row">' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="#C24322" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>' +
    "<span><strong>To:</strong> " +
    escHtml(toLoc.name) +
    "</span>" +
    "</div>";

  if (fromLoc.floor !== toLoc.floor) {
    html += '<p class="route-warn">⚠ Different floors! Use stairwell.</p>';
  }

  content.innerHTML = html;
  panel.style.display = "";
}

function closeRoutePanel() {
  var panel = document.getElementById("route-info-panel");
  if (panel) {
    panel.style.display = "none";
  }
  AppState.showRoute = false;
  var svg = document.getElementById("route-svg");
  if (svg) {
    svg.style.display = "none";
  }
}

/* ===== ZOOM ===== */

function changeZoom(delta) {
  AppState.zoom = Math.min(2.5, Math.max(0.5, AppState.zoom + delta));
  applyZoom();
}

function resetZoom() {
  AppState.zoom = 1;
  applyZoom();
}

function applyZoom() {
  var container = document.getElementById("map-zoom-container");
  if (container) {
    var x = AppState.panX || 0;
    var y = AppState.panY || 0;
    container.style.transform =
      "translate(calc(-50% + " +
      x +
      "px), calc(-50% + " +
      y +
      "px)) scale(" +
      AppState.zoom +
      ")";
    container.style.transformOrigin = "center center";
  }
}

function showEntryBanner() {
  var banner = document.getElementById("map-entry-banner");
  if (!banner) {
    return;
  }
  banner.classList.add("show");
  clearTimeout(showEntryBanner._hideTimer);
  showEntryBanner._hideTimer = setTimeout(function () {
    banner.classList.remove("show");
  }, 2600);
}

/* ===== YOU ARE HERE ===== */

function updateYouAreHere() {
  var el = document.getElementById("you-are-here");
  if (!el) {
    return;
  }
  if (AppState.currentFloor === 1) {
    el.style.left = "51%";
    el.style.top = "88%";
  } else {
    el.style.left = "50%";
    el.style.top = "85%";
  }
}

/* ===== RECOMMENDATIONS ===== */

function renderRecommendations() {
  var container = document.getElementById("rec-bar-items");
  if (!container) {
    return;
  }

  var colorMap = getColorMap();
  var html = "";

  RECOMMENDATIONS.forEach(function (rec) {
    var loc = AppState.locations.find(function (l) {
      return l.id === rec.id;
    });
    if (!loc) {
      return;
    }
    var color = colorMap[loc.type] || "#192A57";
    html +=
      '<button class="rec-item" onclick="selectRecItem(\'' +
      loc.id +
      "')\">" +
      '<div class="rec-dot" style="background:' +
      color +
      '"></div>' +
      "<div>" +
      '<div class="rec-name">' +
      escHtml(loc.name) +
      "</div>" +
      '<div class="rec-reason">' +
      escHtml(rec.reason) +
      "</div>" +
      "</div>" +
      "</button>";
  });

  container.innerHTML =
    html ||
    "<span style='font-size:13px;color:#2d2d2d66'>No recommendations available</span>";
}

function selectRecItem(locId) {
  var loc = AppState.locations.find(function (l) {
    return l.id === locId;
  });
  if (!loc) {
    return;
  }
  if (loc.floor !== AppState.currentFloor) {
    switchFloor(loc.floor);
  }
  AppState.selectedLocation = loc;
  showSelectedPanel(loc);
  renderPins();
}

/* ===== SIDEBAR ===== */

function toggleMapSidebar() {
  var sidebar = document.getElementById("map-sidebar");
  if (!sidebar) {
    return;
  }
  AppState.sidebarOpen = !AppState.sidebarOpen;
  sidebar.classList.toggle("open", AppState.sidebarOpen);
}
function initGuestFlow() {
  loadCurrentUser();

  const isGuestMode = sessionStorage.getItem("guest_mode") === "true";

  if (isGuestMode) {
    sessionStorage.removeItem("guest_mode");

    if (!AppState.currentUser || !AppState.currentUser.isGuest) {
      showGuestLogbookModal(); // Entry mode only
    } else {
      renderUserArea();
    }
  } else {
    renderUserArea();
  }
}

function showGuestLogbookModal() {
  const modal = document.getElementById("guest-logbook-modal");
  const card = document.getElementById("guest-modal-card");
  const title = document.getElementById("modal-title");
  const subtitle = document.getElementById("modal-subtitle");
  const submitBtn = document.getElementById("guest-submit-btn");
  const backLink = document.getElementById("guest-back-link");

  if (!modal || !card) return;

  modal.classList.add("active");

  // Reset to Entry Mode
  card.style.background = "";
  card.style.border = "";
  title.textContent = "Visitor Logbook";
  subtitle.textContent =
    "Please fill out this form before entering the campus map.";
  submitBtn.textContent = "Continue to Map";
  submitBtn.className = "wobbly-btn wobbly-btn-primary w-full guest-submit-btn";
  backLink.style.display = "block";

  // Make fields editable
  document.getElementById("guest-name").readOnly = false;
  document.getElementById("guest-category").disabled = false;
  document.getElementById("guest-purpose").readOnly = false;

  const form = document.getElementById("guest-logbook-form");
  form.onsubmit = handleGuestSubmit;
}

function handleGuestSubmit(e) {
  e.preventDefault();

  const name = document.getElementById("guest-name").value.trim();
  const category = document.getElementById("guest-category").value;
  const purpose = document.getElementById("guest-purpose").value.trim();

  if (!name || !category) {
    showToast("Please fill in all required fields.");
    return;
  }

  const guestUser = {
    id: "guest_" + Date.now(),
    fullName: name,
    role: category,
    isGuest: true,
    category: category,
    purpose: purpose,
    time_in: new Date().toISOString(),
    loggedInAt: new Date().toISOString(),
  };

  saveCurrentUser(guestUser);
  saveGuestLog(guestUser);

  renderUserArea();

  document.getElementById("guest-logbook-modal").classList.remove("active");
  showToast(`Welcome, ${name}!`);
  showEntryBanner();
}

/* ===== GUEST LOGOUT CONFIRMATION ===== */

function handleLogout() {
  const user = AppState.currentUser;
  if (!user) return;

  if (user.isGuest) {
    showGuestLogoutConfirmation();
  } else {
    // Admin Logout
    if (confirm("Are you sure you want to logout?")) {
      clearCurrentUser();
      renderUserArea();
      showToast("You have been logged out.");
    }
  }
}

function showGuestLogoutConfirmation() {
  const user = AppState.currentUser;
  if (!user || !user.isGuest) return;

  const modal = document.getElementById("guest-logout-modal");
  const infoEl = document.getElementById("logout-guest-info");

  if (!modal || !infoEl) return;

  infoEl.innerHTML = `
    <strong>Name:</strong> ${escHtml(user.fullName)}<br>
    <strong>Category:</strong> ${escHtml(user.category)}<br>
    <strong>Purpose:</strong> ${escHtml(user.purpose)}
  `;

  modal.style.display = "flex";
}

function cancelGuestLogout() {
  const modal = document.getElementById("guest-logout-modal");
  if (modal) modal.style.display = "none";
}

function confirmGuestLogout() {
  const user = AppState.currentUser;
  if (user && user.isGuest) {
    saveGuestTimeOut(user);
  }

  clearCurrentUser();
  cancelGuestLogout();

  showToast("You have logged out. Thank you for visiting!");
  window.location.href = "index.html";
}
