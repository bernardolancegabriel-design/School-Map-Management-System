/* =========================================================
   SCHOOLMAP — map.js
   Map page specific code
   ========================================================= */

"use strict";

const API_BASE = typeof getApiBase === "function" ? getApiBase() : "../backend/api.php";

document.addEventListener("DOMContentLoaded", function () {
  initMapPage();
  document.addEventListener("click", handleGlobalClick);
});

window.addEventListener("focus", function () {
  if (AppState.mapDataReady) {
    refreshMapDataFromDatabase();
  }
});

async function apiGet(action) {
  try {
    const response = await fetch(typeof apiUrl === "function" ? apiUrl(action) : API_BASE + "?action=" + encodeURIComponent(action), {
      credentials: "same-origin",
      cache: "no-store",
    });
    return await response.json();
  } catch (err) {
    console.warn("API load failed:", action, err);
    return null;
  }
}

function normalizeDbImagePath(path) {
  if (!path) return "";
  if (/^data:/i.test(path) || /^https?:\/\//i.test(path) || /^\/\//.test(path)) {
    return path;
  }
  if (/^\.?(images\/.+)$/i.test(path)) {
    return "../" + RegExp.$1;
  }
  if (/^\.?(maps\/ground\.png)$/i.test(path)) {
    return "../images/map-ground-floor.png";
  }
  if (/^\.?(maps\/.+)$/i.test(path)) {
    return path;
  }
  return path;
}

function normalizeDbFloor(floor, index) {
  var imagePath = normalizeDbImagePath(floor.image_path || "");
  return {
    id: Number(floor.id ?? floor.map_id),
    name: floor.name || floor.floor_name || "Untitled Floor",
    label: floor.label || `${index + 1}F`,
    image_path: imagePath,
  };
}

function normalizeDbLegend(legend) {
  const name = legend.label || legend.name || "Untitled";
  return {
    id: String(legend.id ?? legend.category_id),
    type: legend.type || String(name).toLowerCase().replace(/[\s/]+/g, "_"),
    label: name,
    color: legend.color || "#192A57",
    icon: legend.icon || "MapPin",
  };
}

function normalizeDbPin(pin) {
  const categoryId = pin.legendId ?? pin.category_id ?? "";
  return {
    id: String(pin.id ?? pin.pin_id),
    name: pin.name || "Untitled",
    description: pin.description || "",
    type: categoryId === null ? "" : String(categoryId),
    legendId: categoryId === null ? "" : String(categoryId),
    floor: Number(pin.floor ?? pin.map_id ?? 1),
    x: Number(pin.x ?? 50),
    y: Number(pin.y ?? 50),
    image: normalizeDbImagePath(pin.image || ""),
  };
}

function normalizeDbRoute(route) {
  var routeFloor = Number(route.floor ?? route.map_id ?? 1);
  var points = Array.isArray(route.points) ? route.points.slice() : [];
  points.sort(function (a, b) {
    return Number(a.point_order ?? a.pointOrder ?? 0) - Number(b.point_order ?? b.pointOrder ?? 0);
  });

  return {
    id: String(route.id ?? route.route_id),
    name: route.name || route.route_name || "Untitled Route",
    originId: String(route.originId ?? route.from_pin_id ?? ""),
    destinationId: String(route.destinationId ?? route.to_pin_id ?? ""),
    origin: route.origin || route.from_pin_name || "",
    destination: route.destination || route.to_pin_name || "",
    direction: route.direction || "",
    floor: routeFloor,
    archived: route.archived === true || route.archived === 1 || route.archived === "1",
    points: points.map(function (point, index) {
      return {
        x: Number(point.x ?? 50),
        y: Number(point.y ?? 50),
        floor: Number(point.floor ?? routeFloor),
        pointOrder: Number(point.point_order ?? point.pointOrder ?? index + 1),
      };
    }),
  };
}

async function loadMapDataFromDatabase() {
  const [meRes, floorsRes, legendsRes, pinsRes, routesRes] = await Promise.all([
    apiGet("me"),
    apiGet("floors"),
    apiGet("legends"),
    apiGet("pins"),
    apiGet("routes"),
  ]);

  AppState.currentUser = meRes?.user || null;
  AppState.floors = Array.isArray(floorsRes?.floors)
    ? floorsRes.floors.map(normalizeDbFloor)
    : [];
  AppState.legends = Array.isArray(legendsRes?.legends)
    ? legendsRes.legends.map(normalizeDbLegend)
    : [];
  AppState.locations = Array.isArray(pinsRes?.pins)
    ? pinsRes.pins.map(normalizeDbPin)
    : [];
  AppState.routes = Array.isArray(routesRes?.routes)
    ? routesRes.routes.map(normalizeDbRoute)
    : [];
}

async function initMapPage() {
  await loadMapDataFromDatabase();
  AppState.zoom = 1;
  AppState.panX = 0;
  AppState.panY = 0;
  AppState.selectedLocation = null;
  AppState.routeFrom = "";
  AppState.routeTo = "";
  AppState.showRoute = false;
  AppState.activeRoute = null;
  AppState.activeRouteReversed = false;
  AppState.activeLegendFilter = null;
  AppState.currentFloor = AppState.floors[0]?.id || null;

  renderUserArea();
  populateRouteSelects();
  renderFloorButtons();
  renderLegendItems();
  renderMapCanvas();
  renderPins();
  updateRouteBtnState();
  setupMapInteractions();
  requestAnimationFrame(enableMapTransitions);

  var fromSel = document.getElementById("route-from");
  var toSel = document.getElementById("route-to");
  if (fromSel) fromSel.value = "";
  if (toSel) toSel.value = "";

  initGuestFlow();
  showEntryBannerIfRequested();
  AppState.mapDataReady = true;
}

async function refreshMapDataFromDatabase() {
  var previousFloor = AppState.currentFloor;
  var previousFilter = AppState.activeLegendFilter;
  await loadMapDataFromDatabase();

  if (AppState.floors.some(function (floor) { return String(floor.id) === String(previousFloor); })) {
    AppState.currentFloor = previousFloor;
  } else {
    AppState.currentFloor = AppState.floors[0]?.id || null;
  }

  if (
    previousFilter !== null &&
    !AppState.legends.some(function (legend) { return String(legend.id) === String(previousFilter); })
  ) {
    AppState.activeLegendFilter = null;
  } else {
    AppState.activeLegendFilter = previousFilter;
  }

  renderUserArea();
  populateRouteSelects();
  renderFloorButtons();
  renderLegendItems();
  renderMapCanvas();
  renderPins();
  renderRouteOverlay();
  updateRouteBtnState();
}

function enableMapTransitions() {
  var canvas = document.getElementById("mapCanvas");
  if (canvas) canvas.classList.add("map-transition-enabled");
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
  return AppState.currentUser;
}

function saveCurrentUser(user) {
  if (!user) return;
  AppState.currentUser = user;
}

function clearCurrentUser() {
  AppState.currentUser = null;
}

function saveGuestLog(guest) {
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

  fetch(typeof apiUrl === "function" ? apiUrl("visitor_logs") : API_BASE + "?action=visitor_logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(err => console.warn("Failed to save visitor log to DB:", err));
}

function saveGuestTimeOut(guest) {
  return guest;
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
  if (!AppState.floors.length) {
    container.innerHTML = '<p class="map-empty-note">No floors found in database.</p>';
    return;
  }
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
  renderMapCanvas();
  renderPins();
  renderRouteOverlay();
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
  var html =
    '<button type="button" class="legend-item legend-filter-item' +
    (AppState.activeLegendFilter === null ? " active" : "") +
    '" onclick="setLegendFilter(null)" title="Show all legends">' +
    '<span class="legend-dot legend-icon-chip" style="background:#192A57">' +
    getLegendSidebarIcon(null) +
    "</span>" +
    '<span class="legend-label">All legends</span>' +
    '<span class="legend-count">' +
    getCurrentFloorLocations().length +
    "</span>" +
    "</button>";

  if (!AppState.legends.length) {
    container.innerHTML = html + '<p class="map-empty-note">No legends found in database.</p>';
    return;
  }

  AppState.legends.forEach(function (leg) {
    var active = String(AppState.activeLegendFilter) === String(leg.id) ? " active" : "";
    var count = AppState.locations.filter(function (loc) {
      return String(loc.floor) === String(AppState.currentFloor) && String(loc.legendId) === String(leg.id);
    }).length;
    html +=
      '<button type="button" class="legend-item legend-filter-item' +
      active +
      '" onclick="setLegendFilter(\'' +
      escAttr(leg.id) +
      '\')" title="Show only ' +
      escAttr(leg.label) +
      '">' +
      '<span class="legend-dot legend-icon-chip" style="background:' +
      leg.color +
      '">' +
      getLegendSidebarIcon(leg) +
      "</span>" +
      '<span class="legend-label">' +
      escHtml(leg.label) +
      "</span>" +
      '<span class="legend-count">' +
      count +
      "</span>" +
      "</button>";
  });
  container.innerHTML = html;
}

function setLegendFilter(legendId) {
  AppState.activeLegendFilter = legendId === null || legendId === undefined ? null : String(legendId);
  AppState.selectedLocation = null;
  closeSelectedPanel();
  renderLegendItems();
  renderPins();
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
  return loc.legendId || loc.type || "unknown";
}

function getVisibleFloorLocations() {
  return AppState.locations.filter(function (loc) {
    var sameFloor = String(loc.floor) === String(AppState.currentFloor);
    var sameLegend = AppState.activeLegendFilter === null || String(loc.legendId) === String(AppState.activeLegendFilter);
    return sameFloor && sameLegend;
  });
}

function getCurrentFloorLocations() {
  return AppState.locations.filter(function (loc) {
    return String(loc.floor) === String(AppState.currentFloor);
  });
}

function getLegendSidebarIcon(legend) {
  if (!legend) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/></svg>';
  }
  return getPinIcon(String(legend.id), 18);
}

function getLocationTypeLabel(loc) {
  var typeKey = getLocationType(loc);
  var legend = AppState.legends.find(function (l) {
    return (l.type && String(l.type) === String(typeKey)) || (l.id && String(l.id) === String(typeKey));
  });
  return legend ? legend.label : escHtml(typeKey);
}

function getStoredFloorImage(floorId) {
  var floor = AppState.floors.find(function (f) {
    return String(f.id) === String(floorId);
  });
  return floor && floor.image_path ? floor.image_path : "";
}

/* ===== MAP CANVAS ===== */

function renderMapCanvas() {
  var img = document.getElementById("floorImage");
  if (!img) {
    return;
  }

  var imageSrc = getStoredFloorImage(AppState.currentFloor);
  if (!imageSrc && Number(AppState.currentFloor) === 1) {
    imageSrc = "../images/map-ground-floor.png";
  }

  if (imageSrc) {
    img.src = imageSrc;
    img.alt = "Floor Plan";
    img.hidden = false;
  } else {
    img.hidden = true;
  }

  updateFloorBadge();
  applyZoom();
}

function setupMapInteractions() {
  var mapStage = document.getElementById("mapStage");
  var mapCanvas = document.getElementById("mapCanvas");
  if (!mapStage || !mapCanvas) {
    return;
  }

  var isPanning = false;
  var startX = 0;
  var startY = 0;
  var startPanX = 0;
  var startPanY = 0;

  mapCanvas.style.cursor = "grab";

  mapCanvas.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) {
      return;
    }
    if (
      e.target.closest(".pin") ||
      e.target.closest(".map-pin-wrapper") ||
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
    mapCanvas.setPointerCapture(e.pointerId);
    mapCanvas.classList.add("panning");
    mapCanvas.style.cursor = "grabbing";
  });

  mapCanvas.addEventListener("pointermove", function (e) {
    if (!isPanning) {
      return;
    }
    e.preventDefault();
    AppState.panX = startPanX + (e.clientX - startX) / AppState.zoom;
    AppState.panY = startPanY + (e.clientY - startY) / AppState.zoom;
    applyZoom();
  });

  mapCanvas.addEventListener("pointerup", function (e) {
    if (!isPanning) {
      return;
    }
    isPanning = false;
    mapCanvas.releasePointerCapture &&
      mapCanvas.releasePointerCapture(e.pointerId);
    mapCanvas.classList.remove("panning");
    mapCanvas.style.cursor = "grab";
  });

  mapCanvas.addEventListener("pointercancel", function (e) {
    if (!isPanning) {
      return;
    }
    isPanning = false;
    mapCanvas.releasePointerCapture &&
      mapCanvas.releasePointerCapture(e.pointerId);
    mapCanvas.classList.remove("panning");
    mapCanvas.style.cursor = "grab";
  });

  mapStage.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      var rect = mapStage.getBoundingClientRect();
      var cx = e.clientX - rect.left - rect.width / 2;
      var cy = e.clientY - rect.top - rect.height / 2;
      var oldZoom = AppState.zoom;
      var newZoom = Math.min(4, Math.max(0.25, +(oldZoom - e.deltaY * 0.001).toFixed(3)));
      var zoomRatio = newZoom / oldZoom;
      AppState.panX = cx + ((AppState.panX || 0) - cx) * zoomRatio;
      AppState.panY = cy + ((AppState.panY || 0) - cy) * zoomRatio;
      AppState.zoom = newZoom;
      applyZoom();
    },
    { passive: false },
  );
}

/* ===== PINS ===== */

function renderPins() {
  var container = document.getElementById("pinsLayer");
  if (!container) {
    return;
  }

  var floorLocs = getVisibleFloorLocations();

  // During route display, show only origin and destination pins
  if (AppState.showRoute && AppState.routeFrom && AppState.routeTo) {
    floorLocs = floorLocs.filter(function(loc) {
      return String(loc.id) === String(AppState.routeFrom) || String(loc.id) === String(AppState.routeTo);
    });
  }

  var colorMap = getColorMap();
  var html = "";

  floorLocs.forEach(function (loc) {
    var locType = getLocationType(loc);
    var color = colorMap[locType] || "#192A57";
    var isSelected =
      AppState.selectedLocation && AppState.selectedLocation.id === loc.id;
    var iconSize = 14;
    var selectedClass = isSelected ? " selected" : "";
    var hoverAttrs = AppState.showRoute
      ? ""
      : "onmouseenter=\"showPinTooltip(event,'" +
        loc.id +
        "')\" " +
        "onmousemove=\"movePinTooltip(event)\" " +
        "onmouseleave=\"hidePinTooltip()\" ";

    var labelHtml = "";
    if (AppState.showLabels) {
      labelHtml =
        '<span class="map-pin-label map-public-pin-label" style="left:' +
        loc.x +
        "%;top:" +
        loc.y +
        '%;">' +
        escHtml(loc.name) +
        "</span>";
    }

    html +=
      '<div class="pin map-public-pin' +
      selectedClass +
      '" ' +
      'style="left:' +
      loc.x +
      "%;top:" +
      loc.y +
      "%;background:" +
      color +
      ';" ' +
      "onclick=\"selectPin('" +
      loc.id +
      "')\" " +
      hoverAttrs +
      'title="' +
      escHtml(loc.name) +
      '">' +
      getPinIcon(getLocationType(loc), iconSize) +
      "</div>" +
      labelHtml;
  });

  container.innerHTML = html;
}

function getPinTooltipHtml(loc) {
  var html =
    '<strong>' + escHtml(loc.name) + '</strong>' +
    '<span>' + escHtml(getLocationTypeLabel(loc)) + '</span>';

  if (loc.image) {
    html +=
      '<img class="pin-tooltip-image" src="' +
      escAttr(loc.image) +
      '" alt="' +
      escAttr(loc.name) +
      ' image" />';
  }

  return html;
}

function positionPinTooltip(event) {
  var tooltip = document.getElementById("pinTooltip");
  var stage = document.getElementById("mapStage");
  if (!tooltip || !stage) {
    return;
  }
  var rect = stage.getBoundingClientRect();
  var x = event.clientX - rect.left;
  var y = event.clientY - rect.top;
  tooltip.style.left = x + "px";
  tooltip.style.top = Math.max(0, y - 12) + "px";
}

function showPinTooltip(event, locId) {
  var loc = AppState.locations.find(function (l) {
    return l.id === locId;
  });
  var tooltip = document.getElementById("pinTooltip");
  if (!loc || !tooltip) {
    return;
  }
  tooltip.innerHTML = getPinTooltipHtml(loc);
  tooltip.classList.add("show");
  positionPinTooltip(event);
}

function movePinTooltip(event) {
  positionPinTooltip(event);
}

function hidePinTooltip() {
  var tooltip = document.getElementById("pinTooltip");
  if (tooltip) {
    tooltip.classList.remove("show");
  }
}

function getPinIcon(type, size) {
  var legend = AppState.legends.find(function (l) {
    return (l.type && String(l.type) === String(type)) || (l.id && String(l.id) === String(type));
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

  function iconSvg(paths) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      paths +
      "</svg>"
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
  Object.assign(icons, {
    Home: iconSvg('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
    Star: iconSvg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
    Toilet: iconSvg('<path d="M3 3h8v4H3z"/><path d="M7 7v2a4 4 0 0 0 8 0V7"/><path d="M11 13v7"/><path d="M8 20h6"/>'),
    Building2: iconSvg('<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M6 12H4a2 2 0 0 0-2 2v8"/><path d="M18 9h2a2 2 0 0 1 2 2v11"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>'),
    School: iconSvg('<path d="M2 22h20"/><path d="M6 18V9l6-4 6 4v9"/><path d="M10 22v-6h4v6"/><path d="M8 12h.01"/><path d="M16 12h.01"/>'),
    GraduationCap: iconSvg('<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/><path d="M22 10v6"/>'),
    FlaskConical: iconSvg('<path d="M10 2v7.3L4.4 19a2 2 0 0 0 1.7 3h11.8a2 2 0 0 0 1.7-3L14 9.3V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>'),
    Monitor: iconSvg('<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>'),
    Printer: iconSvg('<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/><path d="M18 12h.01"/>'),
    Wifi: iconSvg('<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 9a15 15 0 0 1 20 0"/><path d="M12 20h.01"/>'),
    Phone: iconSvg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>'),
    Info: iconSvg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
    HelpCircle: iconSvg('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.8 1c-.6 1.1-2 1.4-2.6 2.4-.2.3-.3.7-.3 1.1"/><path d="M12 17h.01"/>'),
    Shield: iconSvg('<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z"/>'),
    HeartPulse: iconSvg('<path d="M19.5 13.6 12 21l-7.5-7.4A5 5 0 0 1 12 7a5 5 0 0 1 7.5 6.6Z"/><path d="M3 12h4l2-3 3 6 2-3h7"/>'),
    Cross: iconSvg('<path d="M11 2h2v7h7v2h-7v11h-2V11H4V9h7z"/>'),
    Accessibility: iconSvg('<circle cx="12" cy="4" r="2"/><path d="M4 10h16"/><path d="M12 6v8"/><path d="m8 22 4-8 4 8"/>'),
    ParkingCircle: iconSvg('<circle cx="12" cy="12" r="10"/><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"/>'),
    Bus: iconSvg('<path d="M6 17h12l1-5V5a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v7l1 5Z"/><path d="M8 22h.01"/><path d="M16 22h.01"/><path d="M5 9h14"/><path d="M8 13h.01"/><path d="M16 13h.01"/>'),
    Coffee: iconSvg('<path d="M4 8h14v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z"/><path d="M18 9h1a3 3 0 0 1 0 6h-1"/><path d="M6 2v2"/><path d="M10 2v2"/><path d="M14 2v2"/>'),
    Wrench: iconSvg('<path d="M14.7 6.3a4 4 0 0 0-5 5L3 18v3h3l6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-2-2 2.4-2.4Z"/>'),
    Settings: iconSvg('<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V22a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 18l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1A1.7 1.7 0 0 0 21 10h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"/>'),
    Archive: iconSvg('<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>'),
    Landmark: iconSvg('<path d="M3 22h18"/><path d="M6 18V9"/><path d="M10 18V9"/><path d="M14 18V9"/><path d="M18 18V9"/><path d="m12 2 9 5H3Z"/>'),
    Navigation: iconSvg('<polygon points="3 11 22 2 13 21 11 13 3 11"/>'),
    Compass: iconSvg('<circle cx="12" cy="12" r="10"/><polygon points="16.2 7.8 14 14 7.8 16.2 10 10 16.2 7.8"/>'),
    Clock: iconSvg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
    Calendar: iconSvg('<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>'),
    Users: iconSvg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>'),
    ClipboardList: iconSvg('<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 12h8"/><path d="M8 16h8"/><path d="M8 8h.01"/>'),
    FileCheck: iconSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>'),
    Package: iconSvg('<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
    KeyRound: iconSvg('<circle cx="7.5" cy="15.5" r="5.5"/><path d="m12 12 9-9"/><path d="m16 7 2 2"/><path d="m19 4 2 2"/>'),
    Lock: iconSvg('<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    Bell: iconSvg('<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>'),
    Megaphone: iconSvg('<path d="m3 11 18-5v12L3 13Z"/><path d="M11.6 16.8a3 3 0 0 1-5.8-1.6"/>'),
    Camera: iconSvg('<path d="M14.5 4 16 7h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4l1.5-3Z"/><circle cx="12" cy="13" r="3"/>'),
    Image: iconSvg('<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>'),
  });

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
    getPinIcon(locType, 18) +
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
    (loc.image
      ? '<img class="info-panel-pin-image" src="' + escAttr(loc.image) + '" alt="' + escAttr(loc.name) + ' image"/>'
      : "") +
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

  var fromLoc = AppState.locations.find(function (l) {
    return l.id === AppState.routeFrom;
  });
  var toLoc = AppState.locations.find(function (l) {
    return l.id === AppState.routeTo;
  });

  if (!fromLoc || !toLoc) {
    return;
  }

  var routeMatch = findSavedRoute(AppState.routeFrom, AppState.routeTo);
  if (!routeMatch || !routeMatch.route || !routeMatch.route.points.length) {
    AppState.showRoute = false;
    clearPublicRouteOverlay();
    renderPins();
    showToast("No saved route path found for these pins.");
    return;
  }

  AppState.activeRoute = routeMatch.route;
  AppState.activeRouteReversed = routeMatch.reversed;
  AppState.showRoute = true;

  if (fromLoc.floor !== AppState.currentFloor) {
    switchFloor(fromLoc.floor);
  }

  closeSelectedPanel();
  hidePinTooltip();
  renderPins();
  renderRouteOverlay();
}

function resetRoute() {
  hideRestartRouteConfirm();

  // Clear route state
  AppState.showRoute = false;
  AppState.routeFrom = null;
  AppState.routeTo = null;
  AppState.activeRoute = null;
  AppState.activeRouteReversed = false;
  AppState.selectedLocation = null;

  // Reset route selectors
  var fromSelect = document.getElementById('route-from');
  var toSelect = document.getElementById('route-to');
  if (fromSelect) fromSelect.value = '';
  if (toSelect) toSelect.value = '';

  clearPublicRouteOverlay();

  // Re-render all pins and UI
  renderPins();
  updateFloorBadge();
}

function showRestartRouteConfirm() {
  if (!AppState.showRoute || !AppState.routeFrom || !AppState.routeTo) {
    hideRestartRouteConfirm();
    showToast("There is no route selected.");
    return;
  }

  var panel = document.getElementById("restart-route-confirm");
  if (!panel) {
    resetRoute();
    return;
  }
  panel.hidden = false;
}

function hideRestartRouteConfirm() {
  var panel = document.getElementById("restart-route-confirm");
  if (panel) {
    panel.hidden = true;
  }
}

function confirmRestartRoute() {
  resetRoute();
}

function findSavedRoute(fromId, toId) {
  var routes = Array.isArray(AppState.routes) ? AppState.routes : [];
  var forward = routes.find(function (route) {
    return !route.archived &&
      String(route.originId) === String(fromId) &&
      String(route.destinationId) === String(toId);
  });
  if (forward) {
    return { route: forward, reversed: false };
  }

  var reverse = routes.find(function (route) {
    return !route.archived &&
      String(route.originId) === String(toId) &&
      String(route.destinationId) === String(fromId);
  });
  return reverse ? { route: reverse, reversed: true } : null;
}

function getLocationById(locId) {
  return AppState.locations.find(function (loc) {
    return String(loc.id) === String(locId);
  }) || null;
}

function getRouteDisplayPoints(route, reversed) {
  var fromLoc = getLocationById(AppState.routeFrom);
  var toLoc = getLocationById(AppState.routeTo);
  if (!route || !fromLoc || !toLoc) {
    return [];
  }

  var savedPoints = Array.isArray(route.points) ? route.points.slice() : [];
  if (reversed) {
    savedPoints.reverse();
  }

  var points = [{
    x: fromLoc.x,
    y: fromLoc.y,
    floor: fromLoc.floor,
    type: "origin",
  }];

  savedPoints.forEach(function (point) {
    points.push({
      x: Number(point.x),
      y: Number(point.y),
      floor: Number(point.floor ?? route.floor ?? fromLoc.floor),
      type: "point",
    });
  });

  points.push({
    x: toLoc.x,
    y: toLoc.y,
    floor: toLoc.floor,
    type: "destination",
  });

  return points;
}

function getRouteSegments(points) {
  var segments = [];
  for (var i = 0; i < points.length - 1; i++) {
    var start = points[i];
    var end = points[i + 1];
    segments.push({
      start: start,
      end: end,
      floor: start.floor,
      sameFloor: String(start.floor) === String(end.floor),
    });
  }
  return segments;
}

function clearPublicRouteOverlay() {
  var svg = document.getElementById("routeEditorSvg");
  var pointsLayer = document.getElementById("routePointsLayer");
  var walkerLayer = document.getElementById("routeWalkerLayer");
  if (svg) {
    svg.innerHTML = "";
    svg.style.display = "none";
  }
  if (pointsLayer) {
    pointsLayer.innerHTML = "";
    pointsLayer.style.display = "none";
  }
  if (walkerLayer) {
    walkerLayer.innerHTML = "";
    walkerLayer.style.display = "none";
  }
}

function renderRouteOverlay() {
  var svg = document.getElementById("routeEditorSvg");
  var pointsLayer = document.getElementById("routePointsLayer");
  var walkerLayer = document.getElementById("routeWalkerLayer");
  if (!svg || !pointsLayer || !walkerLayer) {
    return;
  }

  clearPublicRouteOverlay();

  if (!AppState.showRoute || !AppState.routeFrom || !AppState.routeTo) {
    return;
  }

  var match = findSavedRoute(AppState.routeFrom, AppState.routeTo);
  var route = match ? match.route : null;
  if (match) {
    AppState.activeRoute = match.route;
    AppState.activeRouteReversed = match.reversed;
  }

  if (!route || !route.points.length) {
    return;
  }

  var displayPoints = getRouteDisplayPoints(route, !!AppState.activeRouteReversed);
  var segments = getRouteSegments(displayPoints).filter(function (segment) {
    return segment.sameFloor && String(segment.floor) === String(AppState.currentFloor);
  });

  if (!segments.length) {
    return;
  }

  var fromLoc = getLocationById(AppState.routeFrom);
  var colorMap = getColorMap();
  var routeColor = fromLoc ? colorMap[getLocationType(fromLoc)] || "#2d5da1" : "#2d5da1";

  svg.style.display = "block";
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  pointsLayer.style.display = "block";

  segments.forEach(function (segment) {
    var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(segment.start.x));
    line.setAttribute("y1", String(segment.start.y));
    line.setAttribute("x2", String(segment.end.x));
    line.setAttribute("y2", String(segment.end.y));
    line.setAttribute("stroke", routeColor);
    line.setAttribute("stroke-width", "6");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("stroke-opacity", "0.95");
    line.classList.add("route-line", "route-line-public");
    svg.appendChild(line);
  });

  renderRouteEndpointDot(pointsLayer, displayPoints[0], "route-endpoint-start");
  renderRouteEndpointDot(pointsLayer, displayPoints[displayPoints.length - 1], "route-endpoint-finish");
  renderFixedRoutePinTooltip(pointsLayer, getLocationById(AppState.routeFrom), "route-fixed-tooltip-start");
  renderFixedRoutePinTooltip(pointsLayer, getLocationById(AppState.routeTo), "route-fixed-tooltip-finish");
}

function renderRouteEndpointDot(layer, point, className) {
  if (!point || String(point.floor) !== String(AppState.currentFloor)) {
    return;
  }

  var dot = document.createElement("div");
  dot.className = "route-endpoint-dot " + className;
  dot.style.left = point.x + "%";
  dot.style.top = point.y + "%";
  layer.appendChild(dot);
}

function renderFixedRoutePinTooltip(layer, loc, className) {
  if (!loc || String(loc.floor) !== String(AppState.currentFloor)) {
    return;
  }

  var tooltip = document.createElement("div");
  tooltip.className = "pin-tooltip route-fixed-tooltip show " + className;
  tooltip.style.left = loc.x + "%";
  tooltip.style.top = loc.y + "%";
  tooltip.innerHTML = getPinTooltipHtml(loc);
  layer.appendChild(tooltip);
}

function showRouteInfoPanel(fromLoc, toLoc) {
  var panel = document.getElementById("route-info-panel");
  var content = document.getElementById("route-info-content");
  if (!panel || !content) {
    return;
  }

  var html =
    '<div style="margin-bottom: 16px;">' +
    getPinTooltipHtml(fromLoc) +
    '</div>';

  html +=
    '<div style="margin-bottom: 8px;">' +
    getPinTooltipHtml(toLoc) +
    '</div>';

  if (fromLoc.floor !== toLoc.floor) {
    html += '<p class="route-warn" style="margin-top: 12px; font-size: 12px; color: #C24322;">⚠ Different floors! Use stairwell.</p>';
  }

  content.innerHTML = html;
  panel.style.display = "";
}

function closeRoutePanel() {
  AppState.showRoute = false;
  AppState.activeRoute = null;
  AppState.activeRouteReversed = false;
  clearPublicRouteOverlay();
}

/* ===== ZOOM ===== */

function changeZoom(delta) {
  AppState.zoom = Math.min(4, Math.max(0.25, AppState.zoom + delta));
  applyZoom();
}

function resetZoom() {
  AppState.zoom = 1;
  applyZoom();
}

function restoreMap() {
  AppState.zoom = 1;
  AppState.panX = 0;
  AppState.panY = 0;
  applyZoom();
}

function applyZoom() {
  var canvas = document.getElementById("mapCanvas");
  if (canvas) {
    var x = AppState.panX || 0;
    var y = AppState.panY || 0;
    canvas.style.transform =
      "translate(calc(-50% + " +
      x +
      "px), calc(-50% + " +
      y +
      "px)) scale(" +
      AppState.zoom +
      ")";
    canvas.style.transformOrigin = "center center";
  }
  
  var zoomLabel = document.getElementById("zoomLabel");
  if (zoomLabel) {
    zoomLabel.textContent = Math.round(AppState.zoom * 100) + "%";
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

function showEntryBannerIfRequested() {
  var shouldShow = false;
  try {
    shouldShow = sessionStorage.getItem("show_map_entry_banner") === "true";
    if (shouldShow) {
      sessionStorage.removeItem("show_map_entry_banner");
    }
  } catch (err) {
    shouldShow = false;
  }

  if (shouldShow) {
    requestAnimationFrame(showEntryBanner);
  }
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
