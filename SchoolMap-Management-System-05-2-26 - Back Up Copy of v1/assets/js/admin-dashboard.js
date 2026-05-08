/* SchoolMap Admin Panel — admin-panel.js
   Legend-based pin system + cursor-centered scroll zoom
   Data persisted in localStorage */
(() => {
  // ---------- Constants ----------
  const KEYS = {
    floors:    "schoolmap_floors",
    locations: "schoolmap_locations",
    legends:   "schoolmap_legends",
    images:    "schoolmap_floor_images",
    routes:    "schoolmap_routes",
    activeFloor: "schoolmap_active_floor",
  };

  // Built-in SVG icons keyed by name
  const ICONS = {
    BookOpen:        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z"/></svg>',
    Briefcase:       '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    FileText:        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
    Library:         '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>',
    UtensilsCrossed: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Z"/></svg>',
    Dumbbell:        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829Z"/></svg>',
    User:            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    ArrowUpDown:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>',
    DoorOpen:        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"/></svg>',
    AlertTriangle:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    MapPin:          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    Toilet:          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h8v4H3z"/><path d="M7 7v2a4 4 0 0 0 8 0V7"/><path d="M11 13v7"/><path d="M8 20h6"/></svg>',
    Star:            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    Home:            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  };
  const ICON_NAMES = Object.keys(ICONS);

  const ICONS_SM = {
    plus:      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
    pencil:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497Z"/><path d="m15 5 4 4"/></svg>',
    trash:     '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    search:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4.5-7 11-7 11 7 11 7-4.5 7-11 7S1 12 1 12z"/><path d="M9.5 11.5 11 13l3.5-3.5"/><path d="M8 12h8"/></svg>',
    routePreview: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"/><path d="M12 7v5"/><path d="M9 12h6"/></svg>',
    play:       '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5v14l11-7z"/></svg>',
    eraser:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 3 13 11 5 15 9 7 17Z"/><path d="M13 7l4 4"/><path d="M3 21h18"/></svg>',
    xMark:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6 18 18"/></svg>',
    arrowLeft: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
    check:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    upload:    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8"/><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m8 17 4-4 4 4"/></svg>',
    link:      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><path d="M8 12h8"/></svg>',
  };

  // ---------- Defaults ----------
  const DEFAULTS = {
    floors: [
      { id: 1, name: "Ground Floor", label: "1F" },
    ],
    // Legends replace "types" — each legend is a named category with color + icon
    legends: [
      { id: "lg-classroom", label: "Classrooms", color: "#3b82f6", icon: "BookOpen" },
      { id: "lg-office",    label: "Offices",    color: "#8b5cf6", icon: "Briefcase" },
      { id: "lg-restroom",  label: "Restrooms",  color: "#06b6d4", icon: "FileText" },
      { id: "lg-cafeteria", label: "Cafeteria",  color: "#f59e0b", icon: "UtensilsCrossed" },
      { id: "lg-library",   label: "Library",    color: "#10b981", icon: "Library" },
      { id: "lg-gym",       label: "Gymnasium",  color: "#ef4444", icon: "Dumbbell" },
      { id: "lg-admin",     label: "Admin",      color: "#ec4899", icon: "User" },
      { id: "lg-stairwell", label: "Stairwell",  color: "#6b7280", icon: "ArrowUpDown" },
      { id: "lg-entrance",  label: "Entrance",   color: "#22c55e", icon: "DoorOpen" },
      { id: "lg-emergency", label: "Emergency",  color: "#dc2626", icon: "AlertTriangle" },
    ],
    locations: [],
  };

  // ---------- State ----------
  const load = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

 function normalizeRoute(route) {
    return {
        id: route.id,
        name: route.name || '',
        originId: route.originId || route.from_pin_id,
        destinationId: route.destinationId || route.to_pin_id,
        origin: route.origin || '',
        destination: route.destination || '',
        direction: route.direction || '',
        floor: parseInt(route.floor || route.map_id || 1),
        archived: !!route.archived,
        points: Array.isArray(route.points) ? route.points.map((p, i) => ({
            x: parseFloat(p.x || 50),
            y: parseFloat(p.y || 50),
            floor: parseInt(p.floor || route.floor || 1),
            pointOrder: p.point_order || p.pointOrder || i + 1
        })) : []
    };
}

  const state = {
    floors:        load(KEYS.floors,    DEFAULTS.floors),
    locations:     load(KEYS.locations, DEFAULTS.locations),
    legends:       load(KEYS.legends,   DEFAULTS.legends),
    images:        load(KEYS.images,    {}),
    routes:        load(KEYS.routes,    []),
    activeFloor:   null,
    activeSection: "floors",
    selectedPinId: null,
    activeLegendId: null,
    mode:          "default", // default | add-pin
    search:        "",
    legendSearch:  "",
    routeLocationSearch: "",
    routeSearch:   "",
    zoom:          1,
    showGrid:      false,
    showLegend:    false,
    showFloorPreview: false,
    edit:          null, // { kind: "floor"|"pin"|"legend", isNew, draft }
    routeEditor: {
      draft: null,
      selectedPointIndex: null,
      mode: 'segment',
      pickTarget: null,
      originFilter: null,
      originLocked: false,
      isSaving: false,
      message: '',
      previewing: false,
      previewMode: null,
      previewStep: null,
      previewFloorBackup: null,
      previewPoints: [],
    },
  };
  state.routes = state.routes.map(normalizeRoute);
  state.activeFloor = state.floors[0]?.id ?? null;
  state.activeFloor = load(KEYS.activeFloor, state.activeFloor);
  state.activeLegendId = state.legends[0]?.id || null;

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function restoreDefaultMap() {
    if (state.activeFloor == null) {
      showToast('Select a floor first to restore the map');
      return;
    }

    panX = 0;
    panY = 0;
    state.zoom = 1;

    // Load default image only when the current floor has no map at all
    if (!floorImageSrc(state.activeFloor)) {
      state.images[state.activeFloor] = "../images/map-ground-floor.png";
    }

    renderMap();
    applyTransform(true);
    showToast('Map restored');
  }

  function getMapCoordinates(clientX, clientY) {
    const img = $("#floorImage");
    const canvasRect = mapCanvas.getBoundingClientRect();
    if (img && !img.hidden) {
      const imgRect = img.getBoundingClientRect();
      if (imgRect.width > 0 && imgRect.height > 0) {
        return {
          x: clamp(((clientX - imgRect.left) / imgRect.width) * 100, 0, 100),
          y: clamp(((clientY - imgRect.top) / imgRect.height) * 100, 0, 100),
        };
      }
    }
    return {
      x: clamp(((clientX - canvasRect.left) / canvasRect.width) * 100, 0, 100),
      y: clamp(((clientY - canvasRect.top) / canvasRect.height) * 100, 0, 100),
    };
  }

  /** Find legend by id */
  const legendById   = (id) => state.legends.find(l => l.id === id);
  /** Colour for a pin — falls back gracefully */
  const colorForPin  = (loc) => legendById(loc.legendId)?.color || "#ff4d4d";
  /** SVG icon string for a pin */
  const iconForPin   = (loc) => {
    const lg = legendById(loc.legendId);
    return ICONS[lg?.icon || "MapPin"] || ICONS.MapPin;
  };
  /** Label of the legend a pin belongs to */
  const labelForPin  = (loc) => legendById(loc.legendId)?.label || "Unknown";
  const activeLegend  = () => legendById(state.activeLegendId) || state.legends[0] || null;
  const floorImageSrc   = (id) => id != null ? (state.images[id] || (id === 1 ? "../images/map-ground-floor.png" : "")) : "";
  const API_BASE = "../backend/api.php";

  async function apiRequest(action, method = "GET", data = null, id = null) {
    try {
      const url = API_BASE + "?action=" + encodeURIComponent(action) + (id ? "&id=" + encodeURIComponent(id) : "");
      const init = { method, headers: { 'Content-Type': 'application/json' } };
      if (data != null && method !== 'GET') {
        init.body = JSON.stringify(data);
      }
      const response = await fetch(url, init);
      const text = await response.text();
      const trimmed = text.trim();
      if (trimmed.startsWith('<?php') || trimmed.startsWith('<')) {
        throw new Error(`API request returned non-JSON content from ${url}. Make sure the admin panel is served through PHP/XAMPP (http://localhost/...) rather than opened directly from the file system.`);
      }
      let payload;
      try {
        payload = JSON.parse(text);
      } catch (parseError) {
        throw new Error(`Unable to parse JSON response from ${url}: ${trimmed.slice(0, 120)}`);
      }
      if (!response.ok) {
        console.warn('API request failed', action, response.status, payload);
      }
      return payload;
    } catch (err) {
      console.warn('API request failed', action, err);
      return null;
    }
  }

  function saveRoutesLocally() {
    save(KEYS.routes, state.routes);
  }

  async function fetchRoutes() {
    const res = await apiRequest('routes');
    
    if (!res) return;

    // Handle both possible response formats
    let routesData = res?.routes || res?.data?.routes || [];

    state.routes = routesData.map(route => normalizeRoute({
        ...route,
        id: route.id || route.route_id,           // ensure id
        originId: route.originId || route.from_pin_id,
        destinationId: route.destinationId || route.to_pin_id,
        points: route.points || []
    }));

    saveRoutesLocally();
    console.log("✅ Routes loaded from API:", state.routes.length);
}

  const routeById = (id) => state.routes.find(r => r.id === id);
  const destinationLocation = (id) => state.locations.find(l => l.id === id);
  const distanceBetween = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
  const nearestPin = (x, y, floor, threshold = 6) => {
    let nearest = null;
    let best = threshold;
    state.locations.forEach(loc => {
      if (loc.floor !== floor) return;
      const d = distanceBetween(loc.x, loc.y, x, y);
      if (d < best) {
        best = d;
        nearest = loc;
      }
    });
    return nearest;
  };

  const showToast = (msg) => {
    const el = $("#toast");
    el.innerHTML = `${ICONS_SM.check} ${msg}`;
    el.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove("show"), 1800);
  };

  const updateFloorImagePreview = (src) => {
    const panel = $("#floorImagePreviewPanel");
    const img = $("#floorImagePreview");
    if (!panel || !img) return;
    if (src && state.showFloorPreview) {
      img.src = src;
      panel.hidden = false;
    } else {
      panel.hidden = true;
      img.removeAttribute("src");
    }
  };

  function wirePreviewPanel() {
    const panel = $("#floorImagePreviewPanel");
    if (!panel) return;
    panel.addEventListener("click", (evt) => {
      const btn = evt.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "preview-close") {
        state.showFloorPreview = false;
        updateFloorImagePreview("");
      }
      if (btn.dataset.action === "preview-change-image") {
        state.showFloorPreview = true;
        const fileInput = document.querySelector("#fImageFile");
        if (fileInput) fileInput.click();
      }
    });
  }

  // ---------- Extra CSS (icon grid) ----------
  const extraCSS = document.createElement("style");
  extraCSS.textContent = `
    .icon-grid { display:grid; grid-template-columns: repeat(6, 1fr); gap:6px; padding:8px; background:#fdfbf7;
      border:2px dashed #2d2d2d; border-radius:14px 6px 16px 6px / 6px 16px 6px 14px; }
    .icon-cell { height:38px; display:grid; place-items:center; background:#fff; border:2px solid #2d2d2d;
      border-radius:12px 4px 14px 4px; box-shadow:2px 2px 0 0 #2d2d2d; transition:all .1s ease; }
    .icon-cell:hover { background:#fff9c4; transform:rotate(-3deg); }
    .icon-cell.active { background:#192A57; color:#fff; }
    @media (max-width:600px) { .icon-grid { grid-template-columns: repeat(4, 1fr); } }
  `;
  document.head.appendChild(extraCSS);

  const bind = (selector, event, handler) => {
    const el = $(selector);
    if (el) {
      el.addEventListener(event, handler);
    }
  };

  const icon = (name) => ICONS_SM[name] || ICONS_SM.search || "";

  function wireTopBarButtons() {
    bind("#saveBtn", "click", () => {
      save(KEYS.floors,    state.floors);
      save(KEYS.locations, state.locations);
      save(KEYS.legends,   state.legends);
      save(KEYS.images,    state.images);
      save(KEYS.activeFloor, state.activeFloor);
      saveRoutesLocally();
      showToast("All changes saved");
    });

    bind("#resetBtn", "click", () => {
      if (!confirm("Reset all data to defaults?")) return;
      state.floors     = JSON.parse(JSON.stringify(DEFAULTS.floors));
      state.locations  = JSON.parse(JSON.stringify(DEFAULTS.locations));
      state.legends    = JSON.parse(JSON.stringify(DEFAULTS.legends));
      state.images     = {};
      // Seed the 1F ground floor image if the file is local
      state.activeFloor      = state.floors[0]?.id ?? null;
      state.activeSection    = "floors";
      state.mode             = "default";
      state.edit             = null;
      state.routeEditor.draft = null;
      state.routeEditor.selectedPointIndex = null;
      state.routeEditor.originFilter = null;
      state.routeEditor.pickTarget = null;
      state.routeEditor.originLocked = false;
      state.selectedPinId = null;
      renderAll();
      showToast("Reset to defaults");
    });

    bind("#backBtn", "click", () => {
      history.length > 1 ? history.back() : alert("This is the standalone admin panel.");
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", wireTopBarButtons);
  } else {
    wireTopBarButtons();
  }

  // Section tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeSection = btn.dataset.section;
      if (state.activeSection !== "pins") state.mode = "default";
      state.edit = null;
      renderTabs();
      renderControlPanel();
    });
  });

  // Map toolbar — grid / legend overlay / zoom buttons
  $("#gridBtn").addEventListener("click",   () => { state.showGrid   = !state.showGrid;   renderMap(); });
  $("#legendBtn").addEventListener("click", () => { state.showLegend = !state.showLegend; renderMap(); });
  $("#zoomIn").addEventListener("click",    () => { state.zoom = clamp(+(state.zoom + 0.1).toFixed(2), 0.25, 4); renderMap(); });
  $("#zoomOut").addEventListener("click",   () => { state.zoom = clamp(+(state.zoom - 0.1).toFixed(2), 0.25, 4); renderMap(); });

  // ============================================================
  // ZOOM — smooth cursor-centred wheel zoom on the map stage
  // ============================================================
  const mapStage  = $("#mapStage");
  const mapCanvas = $("#mapCanvas");

  // We track a logical pan offset so cursor-centred zoom works
  // correctly without breaking percentage-based pin placement.
  // Pan offset is only used for CSS translate; pin x/y remain
  // in 0-100% coordinates relative to mapCanvas dimensions.
  let panX = 0, panY = 0;  // offset in pixels (stage space)
  let isDraggingPin = false;
  let isPanningMap = false;
  let routePreviewTimer = null;

  function applyTransform(animate) {
    mapCanvas.style.transition = animate ? "transform .18s ease" : "none";
    mapCanvas.style.transform  =
      `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${state.zoom})`;
    $("#zoomLabel").textContent = Math.round(state.zoom * 100) + "%";
  }

  mapStage.addEventListener("wheel", (e) => {
    e.preventDefault();

    const rect    = mapStage.getBoundingClientRect();
    // Cursor position relative to stage centre
    const cx = e.clientX - rect.left - rect.width  / 2;
    const cy = e.clientY - rect.top  - rect.height / 2;

    const delta     = -e.deltaY * 0.001;
    const oldZoom   = state.zoom;
    const newZoom   = clamp(+(oldZoom + delta).toFixed(3), 0.25, 4);
    const zoomRatio = newZoom / oldZoom;

    // Shift pan so the point under the cursor stays fixed
    panX = cx + (panX - cx) * zoomRatio;
    panY = cy + (panY - cy) * zoomRatio;

    state.zoom = newZoom;
    applyTransform(false);
  }, { passive: false });

  mapCanvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".pin")) return;
    if (state.mode === "add-pin") return;
    if (state.activeFloor == null) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const baseX  = panX;
    const baseY  = panY;
    let moved    = false;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 3) {
        moved = true;
        isPanningMap = true;
        mapCanvas.classList.add("panning");
        document.body.style.cursor = "grabbing";
      }
      if (!moved) return;

      panX = baseX + dx / state.zoom;
      panY = baseY + dy / state.zoom;
      applyTransform(false);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (isPanningMap) {
        mapCanvas.classList.remove("panning");
        document.body.style.cursor = "default";
      }
      setTimeout(() => { isPanningMap = false; }, 0);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  // ============================================================
  // MAP CLICK — add a new pin
  // ============================================================
  mapCanvas.addEventListener("click", (e) => {
    if (e.target.closest(".pin")) return;
    if (isDraggingPin || isPanningMap) return;
    if (state.activeFloor == null) { showToast("Add a floor first"); return; }

    const { x, y } = getMapCoordinates(e.clientX, e.clientY);

    // If we are mid-edit of a pin and want to reposition by clicking
    if (state.edit && state.edit.kind === "pin" && !state.edit.isNew) {
      state.edit.draft.x = x;
      state.edit.draft.y = y;
      const p = state.locations.find(l => l.id === state.edit.draft.id);
      if (p) { p.x = x; p.y = y; }
      renderControlPanel(); renderMap();
      return;
    }

    if (state.activeSection === "routes" && state.routeEditor.draft) {
      if (state.routeEditor.draft.floor !== state.activeFloor) {
        showToast("Switch to the route floor before adding points");
        return;
      }
      if (state.routeEditor.mode === 'segment') {
        const route = state.routeEditor.draft;
        if (!route.originId || !route.destinationId) {
          showToast('Select both origin and destination pins before adding route points.');
          return;
        }

        route.points.push({ x, y, floor: state.activeFloor });
        state.routeEditor.selectedPointIndex = route.points.length - 1;
        renderControlPanel(); renderMap();
        return;
      }
      showToast('Switch to Segment Mode to add route points.');
      return;
    }

    if (state.activeSection !== "pins" || state.mode !== "add-pin") return;

    const currentLegend = activeLegend();
    if (!currentLegend) { showToast("Create a legend before placing pins"); return; }

    const loc = {
      id:       "loc-" + Date.now(),
      name:     "New Pin",
      legendId: currentLegend.id,
      floor:    state.activeFloor,
      x, y,
      description: "",
    };
    state.locations.push(loc);
    state.selectedPinId  = loc.id;
    state.activeSection  = "pins";
    state.edit = { kind: "pin", isNew: true, draft: { ...loc } };
    renderTabs(); renderControlPanel(); renderMap();
  });

  document.addEventListener('keydown', (e) => {
    if (state.activeSection !== 'routes' || state.routeEditor.mode !== 'arrow' || state.routeEditor.draft == null) return;
    const route = state.routeEditor.draft;
    const origin = destinationLocation(route.originId);
    if (!origin) return;

    const step = e.shiftKey ? 2 : 5;
    let x = origin.x;
    let y = origin.y;
    if (route.points.length > 0) {
      const last = route.points[route.points.length - 1];
      x = last.x;
      y = last.y;
    }

    if (e.key === 'ArrowUp')    { y = clamp(y - step, 0, 100); }
    else if (e.key === 'ArrowDown')  { y = clamp(y + step, 0, 100); }
    else if (e.key === 'ArrowLeft')  { x = clamp(x - step, 0, 100); }
    else if (e.key === 'ArrowRight') { x = clamp(x + step, 0, 100); }
    else return;

    e.preventDefault();
    route.points.push({ x, y, floor: state.activeFloor });
    state.routeEditor.selectedPointIndex = route.points.length - 1;
    renderAll();
  });

  // ---------- Render helpers ----------
  function renderTabs() {
    document.querySelectorAll(".tab").forEach(t => {
      t.classList.toggle("active", t.dataset.section === state.activeSection);
    });
  }

  function renderAll() {
    renderTabs();
    renderControlPanel();
    renderMap();
  }

  // ---------- ADMIN PANEL RENDER HELPERS ----------
  function renderControlPanel() {
    const body = $("#cpBody");
    if (state.edit) {
      body.innerHTML = renderForm();
      wireForm();
      if (state.edit.kind === "floor") {
        const previewSrc = state.edit.draft.image || floorImageSrc(state.edit.draft.id);
        updateFloorImagePreview(previewSrc);
      } else {
        updateFloorImagePreview("");
      }
    } else {
      updateFloorImagePreview("");
      let content = '';
      if (state.activeSection === "routes") {
        content = `
          <div class="admin-module admin-module-routes">
            <div class="module-banner module-banner-routes">Route Panel</div>
            ${renderRoutesList()}
          </div>
        `;
      } else {
        const panelContent = state.activeSection === "floors"
          ? renderFloorsList()
          : state.activeSection === "pins"
            ? renderPinsList()
            : renderLegendsList();
        const panelTitle = state.activeSection === "floors"
          ? "Floor Panel"
          : state.activeSection === "pins"
            ? "Pin Panel"
            : "Legend Panel";
        content = `
          <div class="admin-module admin-module-panel">
            <div class="module-banner module-banner-panel">${panelTitle}</div>
            ${panelContent}
          </div>
        `;
      }
      body.innerHTML = content;
      wireList();
    }
  }

  // ---------- LIST VIEWS ----------

  function renderFloorsList() {
    const items = state.floors.map(f => `
      <div class="row ${state.activeFloor === f.id ? "selected" : ""}" data-floor-id="${f.id}">
        <span class="row-tag">${escapeHtml(f.label)}</span>
        <div class="row-info">
          <div class="row-name">${escapeHtml(f.name)}</div>
          <div class="row-sub">${state.images[f.id] || f.id === 1 ? "Image attached" : "No image"}</div>
        </div>
        <button class="icon-btn" data-edit-floor="${f.id}" title="Edit">${ICONS_SM.pencil}</button>
        <button class="icon-btn danger" data-delete-floor="${f.id}" title="Delete">${ICONS_SM.trash}</button>
      </div>
    `).join("");
    return `
      <div class="section">
        <div class="section-head">
          <h2>Floors <span class="count">${state.floors.length}</span></h2>
          <button class="btn btn-primary" data-action="add-floor">${ICONS_SM.plus} Add Floor</button>
        </div>
        <div class="list">${items || `<p class="hint">No floors yet — add one to begin.</p>`}</div>
      </div>
    `;
  }

  function renderPinsList() {
    const q        = state.search.trim().toLowerCase();
    const filtered = q
      ? state.locations.filter(l =>
          l.name.toLowerCase().includes(q) ||
          labelForPin(l).toLowerCase().includes(q)
        )
      : state.locations;

    const items = filtered.map((loc, index) => {
      const lg = legendById(loc.legendId);
      return `
        <div class="row ${state.selectedPinId === loc.id ? "selected" : ""}" data-pin-id="${loc.id}">
          <span class="row-number">${index + 1}</span>
          <span class="row-swatch" style="background:${colorForPin(loc)}">${iconForPin(loc)}</span>
          <div class="row-info">
            <div class="row-name">${escapeHtml(loc.name)}</div>
            <div class="row-sub">${escapeHtml(lg?.label || "—")} · Floor ${loc.floor}</div>
          </div>
          <button class="icon-btn" data-edit-pin="${loc.id}">${ICONS_SM.pencil}</button>
          <button class="icon-btn danger" data-delete-pin="${loc.id}">${ICONS_SM.trash}</button>
        </div>
      `;
    }).join("");

    return `
      <div class="section">
        <div class="section-head">
          <h2>Pins <span class="count">${state.locations.length}</span></h2>
          <button class="btn btn-primary ${state.mode === "add-pin" ? "on" : ""}" data-action="toggle-add-pin">
            ${ICONS_SM.plus} ${state.mode === "add-pin" ? "Cancel Place Pins" : "Place Pins"}
          </button>
        </div>
        <div class="search">${ICONS_SM.search}<input type="text" id="pinSearch" placeholder="Search pins..." value="${escapeHtml(state.search)}"/></div>
        <div class="list scroll">${items || `<p class="hint">No pins found.</p>`}</div>
        <p class="hint">${state.mode === "add-pin" ? `${ICONS_SM.plus} Add pins by clicking on the map, or press the button to cancel.` : `${ICONS_SM.plus} Switch to Place Pins mode in the Pins tab to place pins.`}</p>
      </div>
    `;
  }

  function renderLegendsList() {
    const q = state.legendSearch.trim().toLowerCase();
    const filteredLegends = q
      ? state.legends.filter(lg =>
          lg.label.toLowerCase().includes(q) ||
          state.locations.some(loc => loc.legendId === lg.id && loc.name.toLowerCase().includes(q))
        )
      : state.legends;

    const items = filteredLegends.map(lg => `
      <div class="row ${lg.id === state.activeLegendId ? "selected" : ""}" data-legend-id="${lg.id}">
        <span class="legend-color" style="background:${lg.color}"></span>
        <span class="row-swatch" style="background:#fff;color:#2d2d2d">${ICONS[lg.icon] || ICONS.MapPin}</span>
        <div class="row-info">
          <div class="row-name">${escapeHtml(lg.label)}</div>
          <div class="row-sub">${state.locations.filter(l => l.legendId === lg.id).length} pin(s)</div>
        </div>
        <button class="icon-btn" data-edit-legend="${lg.id}">${ICONS_SM.pencil}</button>
        <button class="icon-btn danger" data-delete-legend="${lg.id}">${ICONS_SM.trash}</button>
      </div>
    `).join("");

    return `
      <div class="section">
        <div class="section-head">
          <h2>Legends <span class="count">${state.legends.length}</span></h2>
          <button class="btn btn-primary" data-action="add-legend">${ICONS_SM.plus} Add Legend</button>
        </div>
        <div class="search">${ICONS_SM.search}<input type="text" id="legendSearch" placeholder="Search legends..." value="${escapeHtml(state.legendSearch)}"/></div>
        <div class="list">${items || `<p class="hint">No legends found.</p>`}</div>
        <p class="hint">Click a legend row to make it the active category for new pins.</p>
      </div>
    `;
  }

  function renderRoutesList() {
    const qLocation = state.routeLocationSearch.trim().toLowerCase();
    const qRoute = state.routeSearch.trim().toLowerCase();
    const locations = state.locations.slice().sort((a, b) => a.name.localeCompare(b.name));
    const routeMatchesQuery = (route) => {
      if (!qRoute) return true;
      const origin = destinationLocation(route.originId);
      const dest = destinationLocation(route.destinationId);
      return [route.name, origin?.name, dest?.name, route.destination]
        .filter(Boolean)
        .some(text => text.toLowerCase().includes(qRoute));
    };

    const filteredLocations = qLocation
      ? locations.filter(loc => loc.name.toLowerCase().includes(qLocation))
      : locations;

    const pinRows = filteredLocations.map(loc => {
      const activeCount = state.routes.filter(r => r.originId === loc.id && !r.archived).length;
      const archivedCount = state.routes.filter(r => r.originId === loc.id && r.archived).length;
      const selectedClass = state.routeEditor.originFilter === loc.id ? 'selected' : '';
      return `
        <div class="row route-location-row ${selectedClass}" data-route-origin="${loc.id}">
          <div>
            <span class="row-name">${escapeHtml(loc.name)}</span>
            <div class="row-sub">Floor ${loc.floor} · ${activeCount} active${archivedCount ? `, ${archivedCount} archived` : ''}</div>
          </div>
          <div class="row-actions">
            <button class="btn btn-secondary small" data-add-route="${loc.id}">${ICONS_SM.plus} Add Route</button>
            <button class="btn btn-danger small" data-archive-origin="${loc.id}">Archive</button>
          </div>
        </div>
      `;
    }).join('');

    const selectedOrigin = state.routeEditor.originFilter ? destinationLocation(state.routeEditor.originFilter) : null;
    const filteredRoutes = selectedOrigin
      ? state.routes.filter(r => r.originId === selectedOrigin.id && routeMatchesQuery(r))
      : [];
    const activeRoutes = filteredRoutes.filter(r => !r.archived);
    const archivedRoutes = filteredRoutes.filter(r => r.archived);
    const showRouteDetails = Boolean(selectedOrigin);
    const routeListTitle = selectedOrigin
      ? `Routes from ${escapeHtml(selectedOrigin.name)}`
      : '';
    const routeHint = selectedOrigin
      ? 'Search routes within the selected location using origin, destination, or route name.'
      : '';

    const routeItem = (route) => {
      const origin = destinationLocation(route.originId);
      const dest = destinationLocation(route.destinationId);
      const routeLabel = origin && dest
        ? `${escapeHtml(origin.name)} → ${escapeHtml(dest.name)}`
        : escapeHtml(route.name);
      return `
        <div class="row ${state.routeEditor.draft?.id === route.id ? "selected" : ""} ${route.archived ? 'archived' : ''}" data-route-id="${route.id}">
          <span class="row-tag">${escapeHtml(route.name)}</span>
          <div class="row-info">
            <div class="row-name">${routeLabel}</div>
            <div class="row-sub">${escapeHtml(dest?.name || route.destination || 'No destination')} · ${route.points?.length || 0} point(s)</div>
          </div>
          <div class="row-actions">
            <button class="icon-btn" data-edit-route="${route.id}">${ICONS_SM.pencil}</button>
            <button class="icon-btn ${route.archived ? 'btn-secondary' : 'danger'}" data-archive-route="${route.id}">${route.archived ? 'Restore' : 'Archive'}</button>
          </div>
        </div>
      `;
    };

    const activeRouteList = activeRoutes.map(routeItem).join('') || `<p class="hint">No matching active routes found.</p>`;
    const archivedRouteList = archivedRoutes.map(routeItem).join('');

    return `
      <div class="section">
        <div class="section-head">
          <h2>Locations <span class="count">${state.locations.length}</span></h2>
        </div>
        <div class="search">${ICONS_SM.search}<input type="text" id="routeLocationSearch" placeholder="Search locations..." value="${escapeHtml(state.routeLocationSearch)}"/></div>
        <div class="list scroll">${pinRows || `<p class="hint">No locations found.</p>`}</div>
        <div class="route-details ${showRouteDetails ? '' : 'hidden'}">
          <div class="section-head">
            <h2>${routeListTitle}</h2>
          </div>
          <div class="search">${ICONS_SM.search}<input type="text" id="routeSearch" placeholder="Search routes for this location..." value="${escapeHtml(state.routeSearch)}"/></div>
          <div class="list scroll">${activeRouteList}</div>
          ${archivedRouteList ? `<div class="section-head"><h3>Archived Routes</h3></div><div class="list scroll">${archivedRouteList}</div>` : ''}
          <p class="hint">${routeHint}</p>
        </div>
      </div>
      ${state.routeEditor.draft ? renderRouteEditorPanel() : ''}
    `;
  }

  function renderRouteEditorPanel() {
    const routeDraft = state.routeEditor.draft;
    const isExisting = Boolean(routeById(routeDraft.id));
    const pinOptions = state.locations.map(loc =>
      `<option value="${loc.id}" ${loc.id === routeDraft.originId || loc.id === routeDraft.destinationId ? 'selected' : ''}>${escapeHtml(loc.name)} (F${loc.floor})</option>`
    ).join('');

    const originLocation = destinationLocation(routeDraft.originId);
    const destinationLocationLabel = destinationLocation(routeDraft.destinationId);
    const destinationFloor = destinationLocationLabel?.floor ?? null;
    const floorOptions = state.floors.map(f =>
      `<option value="${f.id}" ${f.id === routeDraft.floor ? 'selected' : ''}>${escapeHtml(f.name)} (F${escapeHtml(f.label)})</option>`
    ).join('');
    const canContinueOnDestinationFloor = destinationFloor != null && destinationFloor !== routeDraft.floor;

    const pointItems = routeDraft.points.map((point, idx) => `
      <div class="row ${state.routeEditor.selectedPointIndex === idx ? 'selected' : ''}" data-point-index="${idx}">
        <span class="row-number">${idx + 1}</span>
        <div class="row-info">
          <span class="row-name">Point ${idx + 1}</span>
          <div class="row-sub">${point.x.toFixed(1)}% · ${point.y.toFixed(1)}% · F${point.floor}</div>
        </div>
      </div>
    `).join('');

    return `
      <div class="section route-editor-section" id="routeEditorPanel">
        <div class="form-shell">
          <div class="form-head">
            <button class="icon-btn" data-action="close-route-editor" title="Back">${ICONS_SM.arrowLeft}</button>
            <h2>${originLocation ? escapeHtml(originLocation.name) : (isExisting ? 'Edit Route' : 'New Route')}</h2>
          </div>
          <div class="form-body">
            <div class="field"><label>Route Name</label><input type="text" id="routeName" value="${escapeHtml(routeDraft.name)}" placeholder="Route to Library"/></div>
            ${originLocation ? `
              <div class="field">
                <label>Start Location</label>
                <div class="readonly-field">${escapeHtml(originLocation.name)}</div>
              </div>
            ` : `
              <div class="field">
                <label>Start Location</label>
                <div class="field-row">
                  <select id="routeOrigin">${pinOptions}</select>
                </div>
                <div class="hint">${originLocation ? `Selected: ${escapeHtml(originLocation.name)}` : 'Choose a pin to start the route.'}</div>
              </div>
            `}
            <div class="field">
              <label>Destination</label>
              <div class="field-row">
                <select id="routeDestination">${pinOptions}</select>
              </div>
              <div class="hint">${destinationLocationLabel ? `Selected: ${escapeHtml(destinationLocationLabel.name)}` : 'Choose a pin to end the route.'}</div>
            </div>
            <div class="field route-mode-group">
              <label>Mode</label>
              <div class="route-mode-buttons">
                <button type="button" class="btn ${state.routeEditor.mode === 'segment' ? 'btn-primary on' : 'btn-ghost'}" data-action="set-route-mode" data-mode="segment">Segment Mode</button>
                <button type="button" class="btn ${state.routeEditor.mode === 'arrow' ? 'btn-primary on' : 'btn-ghost'}" data-action="set-route-mode" data-mode="arrow">Arrow Mode</button>
              </div>
            </div>
            <div class="field">
              <label>Route Floor</label>
              <div class="muted">Floor ${routeDraft.floor}</div>
            </div>
            ${state.floors.length > 1 ? `
            <div class="field">
              <label>Continue on floor</label>
              <div class="field-row">
                <button type="button" class="btn btn-secondary" data-action="keep-route-floor">Keep</button>
                <select id="routeFloorSwitch">${floorOptions}</select>
                <button type="button" class="btn btn-secondary" data-action="change-route-floor">Switch</button>
              </div>
              <div class="hint">Keep will lock the route to the current active floor. Switch will move the route to the selected floor so new points continue there.</div>
            </div>
            ` : ''}
            <div class="field route-editor-hint">
              Click on the map to add or adjust route points in Segment Mode. Arrow Mode creates a new point for each arrow key press and builds the path step-by-step.
            </div>
            <div class="section-head">
              <h2>Points <span class="count">${routeDraft.points.length}</span></h2>
              <button class="btn btn-secondary" data-action="delete-route-point">Delete selected point</button>
            </div>
            <div class="list scroll">${pointItems || `<p class="hint">No points yet — click the map to add them.</p>`}</div>
          </div>
          <div class="form-foot">
            <div class="foot-group foot-group-left">
              ${isExisting ? `<button class="icon-btn btn-danger" title="Delete route" data-action="delete-route">${ICONS_SM.trash}</button>` : ''}
              <button class="icon-btn btn-ghost" title="Clear points" data-action="clear-route">${ICONS_SM.eraser}</button>
              <button class="icon-btn btn-secondary" title="Line preview" data-action="preview-route">${ICONS_SM.routePreview}</button>
              <button class="icon-btn btn-secondary" title="Run route" data-action="run-route">${ICONS_SM.play}</button>
            </div>
            <div class="foot-group foot-group-right">
              <button class="icon-btn btn-ghost" title="Cancel" data-action="close-route-editor">${ICONS_SM.xMark}</button>
              <button class="icon-btn btn-primary" title="Save route" data-action="save-route">${ICONS_SM.check}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderForm() {
    const e     = state.edit;
    const title = (e.isNew ? "Add " : "Edit ") + cap(e.kind);

    const head = `
      <div class="form-head">
        <button class="icon-btn" data-action="cancel" title="Back">${ICONS_SM.arrowLeft}</button>
        <h2>${title}</h2>
      </div>`;

    const foot = `
      <div class="form-foot">
        ${!e.isNew ? `<button class="btn btn-danger" data-action="delete">${ICONS_SM.trash} Delete</button>` : ""}
        <div class="spacer"></div>
        <button class="btn btn-ghost" data-action="cancel">Cancel</button>
        <button class="btn btn-primary" data-action="save">${ICONS_SM.check} Save</button>
      </div>`;

    let body = "";

    if (e.kind === "floor") {
      const previewImage = escapeHtml(e.draft.image || floorImageSrc(e.draft.id) || "");
      body = `
        <div class="field"><label>Floor Name</label><input type="text" id="fName" value="${escapeHtml(e.draft.name)}" placeholder="Ground Floor"/></div>
        <div class="field"><label>Level / Label</label><input type="text" id="fLabel" value="${escapeHtml(e.draft.label)}" placeholder="1F"/></div>
        <div class="field">
          <label>Floor Map Image</label>
          <button type="button" class="upload-box" data-action="pick-floor-image">${ICONS_SM.upload}<span>Click to upload PNG, JPG, or SVG</span></button>
          <input type="file" id="fImageFile" accept="image/png,image/jpeg,image/svg+xml" hidden/>
          <div class="hint" style="margin-top:10px;">Recommended size: 1080 × 1920 for best quality. Crop image before upload for cleaner map display.</div>
          ${previewImage ? `<img class="floor-preview" src="${previewImage}" alt="Floor preview"/>` : ""}
          ${previewImage ? `<button type="button" class="btn btn-primary" data-action="show-floor-preview" style="margin-top:12px;">Preview Image</button>` : ""}
        </div>
      `;
    } else if (e.kind === "pin") {
      // Build legend options
      const legendOptions = state.legends.map(lg =>
        `<option value="${lg.id}" ${lg.id === e.draft.legendId ? "selected" : ""}>${escapeHtml(lg.label)}</option>`
      ).join("");

      // Floor options
      const floorOptions = state.floors.map(f =>
        `<option value="${f.id}" ${f.id === e.draft.floor ? "selected" : ""}>${escapeHtml(f.name)}</option>`
      ).join("");

      // Current legend preview
      const curLg = legendById(e.draft.legendId);

      const pinPreviewImage = escapeHtml(e.draft.image || "");
      body = `
        <div class="map-hint">${ICONS_SM.move} Click on the map to place · drag the pin to move it</div>
        <div class="field"><label>Name</label><input type="text" id="pName" value="${escapeHtml(e.draft.name)}" placeholder="Room 101"/></div>
        <div class="field"><label>Description</label><textarea id="pDesc" rows="2">${escapeHtml(e.draft.description || "")}</textarea></div>
        <div class="field">
          <label>Pin Image</label>
          <button type="button" class="upload-box" data-action="pick-pin-image">${ICONS_SM.upload}<span>Click to upload PNG or JPG</span></button>
          <input type="file" id="pImageFile" accept="image/png,image/jpeg" hidden/>
          <div class="hint">This image appears on pin hover or click to preview the pin stage.</div>
          ${pinPreviewImage ? `<img class="pin-image-preview" src="${pinPreviewImage}" alt="Pin preview"/><button type="button" class="btn btn-secondary small" data-action="remove-pin-image">Remove image</button>` : ``}
        </div>
        <div class="grid-2">
          <div class="field"><label>Floor</label>
            <select id="pFloor">${floorOptions}</select>
          </div>
          <div class="field"><label>Legend Category</label>
            <select id="pLegend">${legendOptions}</select>
          </div>
        </div>
        <div class="field"><label>Position</label>
          <div class="icon-preview">
            <span class="row-swatch" style="background:${colorForPin(e.draft)}">${iconForPin(e.draft)}</span>
            <span class="muted" id="posLabel">x: ${e.draft.x.toFixed(1)}% · y: ${e.draft.y.toFixed(1)}%</span>
          </div>
        </div>
      `;

    } else if (e.kind === "legend") {
      body = `
        <div class="field"><label>Legend Name</label><input type="text" id="lLabel" value="${escapeHtml(e.draft.label)}" placeholder="Classrooms"/></div>
        <div class="field"><label>Color</label><input type="color" id="lColor" value="${e.draft.color}"/></div>
        <div class="field">
          <label>Icon — choose from library</label>
          <div class="icon-grid" id="iconGrid">
            ${ICON_NAMES.map(n => `<button type="button" class="icon-cell ${n === e.draft.icon ? "active" : ""}" data-icon="${n}" title="${n}">${ICONS[n]}</button>`).join("")}
          </div>
        </div>
        <div class="field">
          <label>…or upload an icon</label>
          <button type="button" class="upload-box small" data-action="pick-legend-icon">${ICONS_SM.upload}<span>Upload PNG or SVG</span></button>
          <input type="file" id="lIconFile" accept="image/png,image/svg+xml" hidden/>
        </div>
        <div class="field">
          <label>…or paste an image URL</label>
          <div class="url-row">${ICONS_SM.link}<input type="text" id="lIconUrl" value="${escapeHtml(e.draft.iconUrl || "")}" placeholder="https://..."/></div>
        </div>
        <div class="icon-preview" id="legendPreview">
          <span class="legend-color" style="background:${e.draft.color}"></span>
          ${e.draft.iconUrl
            ? `<img src="${e.draft.iconUrl}" style="width:24px;height:24px;object-fit:contain"/>`
            : (ICONS[e.draft.icon] || ICONS.MapPin)}
          <span class="muted">${escapeHtml(e.draft.label || "Preview")}</span>
        </div>
      `;
    }

    return `<div class="form-shell">${head}<div class="form-body">${body}</div>${foot}</div>`;
  }

  // ---------- WIRE INTERACTIONS ----------

  function wireList() {
    const body = $("#cpBody");

    // Floors — click row to activate, edit / delete
    body.querySelectorAll("[data-floor-id]").forEach(el => {
      el.addEventListener("click", () => { state.activeFloor = +el.dataset.floorId; renderAll(); });
    });
    body.querySelectorAll("[data-edit-floor]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const f = state.floors.find(x => x.id === +el.dataset.editFloor);
        if (!f) return;
        state.edit = { kind: "floor", isNew: false, draft: { ...f, image: state.images[f.id] || "" } };
        renderControlPanel();
      });
    });
    body.querySelectorAll("[data-delete-floor]").forEach(el => {
      el.addEventListener("click", (e) => { e.stopPropagation(); deleteFloor(+el.dataset.deleteFloor); });
    });

    // Pins
    body.querySelectorAll("[data-pin-id]").forEach(el => {
      el.addEventListener("click", () => {
        const p = state.locations.find(l => l.id === el.dataset.pinId);
        if (!p) return;
        state.selectedPinId = p.id;
        state.mode = "default";
        if (p.floor !== state.activeFloor) state.activeFloor = p.floor;
        renderAll();
      });
    });
    body.querySelectorAll("[data-edit-pin]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const p = state.locations.find(l => l.id === el.dataset.editPin);
        if (!p) return;
        state.mode = "default";
        state.edit = { kind: "pin", isNew: false, draft: { ...p } };
        renderControlPanel();
      });
    });
    body.querySelectorAll("[data-delete-pin]").forEach(el => {
      el.addEventListener("click", (e) => { e.stopPropagation(); state.mode = "default"; deletePin(el.dataset.deletePin); });
    });

    // Legends — click row to edit, edit / delete buttons
    body.querySelectorAll("[data-legend-id]").forEach(el => {
      el.addEventListener("click", () => {
        const lg = state.legends.find(x => x.id === el.dataset.legendId);
        if (!lg) return;
        state.mode = "default";
        state.activeLegendId = lg.id;
        renderControlPanel();
      });
    });
    body.querySelectorAll("[data-edit-legend]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const lg = state.legends.find(x => x.id === el.dataset.editLegend);
        if (!lg) return;
        state.mode = "default";
        state.edit = { kind: "legend", isNew: false, draft: { ...lg, iconUrl: "" } };
        renderControlPanel();
      });
    });
    body.querySelectorAll("[data-delete-legend]").forEach(el => {
      el.addEventListener("click", (e) => { e.stopPropagation(); deleteLegend(el.dataset.deleteLegend); });
    });

    // Route origin rows — select a location to manage its routes
    body.querySelectorAll("[data-route-origin]").forEach(el => {
      el.addEventListener("click", () => {
        const originId = el.dataset.routeOrigin;
        state.routeEditor.originFilter = state.routeEditor.originFilter === originId ? null : originId;
        renderAll();
      });
    });

    body.querySelectorAll("[data-add-route]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const originId = el.dataset.addRoute;
        const origin = destinationLocation(originId);
        if (!origin) return;
        const routeId = "route-" + Date.now();
        state.mode = "default";
        state.edit = null;
        state.activeSection = "routes";
        state.routeEditor.draft = {
          id: routeId,
          name: `${origin.name} Route`,
          origin: origin.name,
          originId: origin.id,
          destination: "",
          destinationId: "",
          floor: origin.floor,
          points: [],
          archived: false,
        };
        state.routeEditor.originFilter = origin.id;
        state.routeEditor.selectedPointIndex = null;
        state.routeEditor.mode = 'segment';
        state.routeEditor.pickTarget = null;
        state.routeEditor.originLocked = true;
        if (origin.floor != null) state.activeFloor = origin.floor;
        renderAll();
        const routePanel = document.querySelector("#routeEditorPanel");
        if (routePanel) {
          routePanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

    body.querySelectorAll("[data-route-id]").forEach(el => {
      el.addEventListener("click", () => {
        const routeId = el.dataset.routeId;
        const route   = routeById(routeId);
        if (!route) return;
        state.mode = "default";
        state.edit = null;
        state.activeSection = "routes";
        state.routeEditor.draft = JSON.parse(JSON.stringify(route));
        state.routeEditor.selectedPointIndex = null;
        state.routeEditor.originLocked = true;
        state.routeEditor.pickTarget = null;
        if (route.floor != null) state.activeFloor = route.floor;
        renderAll();
        const routePanel = document.querySelector("#routeEditorPanel");
        if (routePanel) routePanel.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    body.querySelectorAll("[data-edit-route]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const route = routeById(el.dataset.editRoute);
        if (!route) return;
        state.mode = "default";
        state.edit = null;
        state.activeSection = "routes";
        state.routeEditor.draft = JSON.parse(JSON.stringify(route));
        state.routeEditor.selectedPointIndex = null;
        state.routeEditor.originLocked = true;
        state.routeEditor.pickTarget = null;
        if (route.floor != null) state.activeFloor = route.floor;
        renderAll();
        const routePanel = document.querySelector("#routeEditorPanel");
        if (routePanel) routePanel.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    body.querySelectorAll("[data-archive-route]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleRouteArchived(el.dataset.archiveRoute);
      });
    });
    body.querySelectorAll("[data-archive-origin]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        archiveOriginRoutes(el.dataset.archiveOrigin);
      });
    });
    body.querySelectorAll("[data-delete-route]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteRoute(el.dataset.deleteRoute);
      });
    });

    const newRoute = body.querySelector('[data-action="new-route"]');
    if (newRoute) newRoute.addEventListener("click", () => {
      const routeId = "route-" + Date.now();
      state.mode = "default";
      state.edit = null;
      state.activeSection = "routes";
      state.routeEditor.draft = {
        id: routeId,
        name: "Route 1",
        origin: "",
        originId: "",
        destination: "",
        destinationId: "",
        floor: state.activeFloor || state.floors[0]?.id || 1,
        points: [],
        archived: false,
      };
      state.routeEditor.originFilter = null;
      state.routeEditor.selectedPointIndex = null;
      state.routeEditor.mode = 'segment';
      state.routeEditor.pickTarget = null;
      state.routeEditor.originLocked = false;
      renderAll();
    });

    // "Add" action buttons
    const addFloor = body.querySelector('[data-action="add-floor"]');
    if (addFloor) addFloor.addEventListener("click", () => {
      const id = Math.max(0, ...state.floors.map(f => f.id)) + 1;
      state.edit = { kind: "floor", isNew: true, draft: { id, name: "", label: "F" + id, image: "" } };
      renderControlPanel();
    });

    const togglePinMode = body.querySelector('[data-action="toggle-add-pin"]');
    if (togglePinMode) togglePinMode.addEventListener("click", () => {
      if (state.activeFloor == null) { showToast("Add a floor first"); return; }
      state.mode = state.mode === "add-pin" ? "default" : "add-pin";
      renderAll();
    });

    const legendSelect = body.querySelector('#activeLegendSelect');
    if (legendSelect) {
      legendSelect.addEventListener('change', (e) => {
        state.activeLegendId = e.target.value;
        renderControlPanel();
      });
    }

    const addLegend = body.querySelector('[data-action="add-legend"]');
    if (addLegend) addLegend.addEventListener("click", () => {
      state.edit = { kind: "legend", isNew: true, draft: { id: "lg-" + Date.now(), label: "", color: "#ff4d4d", icon: "MapPin", iconUrl: "" } };
      renderControlPanel();
    });

    const routeNameInput = body.querySelector("#routeName");
    if (routeNameInput) {
      routeNameInput.addEventListener("input", (e) => {
        if (state.routeEditor.draft) state.routeEditor.draft.name = e.target.value;
      });
    }

    const routeOrigin = body.querySelector("#routeOrigin");
    if (routeOrigin) {
      routeOrigin.addEventListener("change", (e) => {
        const originId = e.target.value;
        const route = state.routeEditor.draft;
        if (route) {
          route.originId = originId;
          route.origin = destinationLocation(originId)?.name || '';
          route.floor = destinationLocation(originId)?.floor || route.floor;
          if (route.floor !== state.activeFloor) {
            state.activeFloor = route.floor;
          }
          renderAll();
        }
      });
    }

    const routeDestination = body.querySelector("#routeDestination");
    if (routeDestination) {
      routeDestination.addEventListener("change", (e) => {
        const destId = e.target.value;
        const route = state.routeEditor.draft;
        if (route) {
          route.destinationId = destId;
          route.destination = destinationLocation(destId)?.name || '';
          if (route.destinationId && !route.originId && route.floor == null) {
            route.floor = destinationLocation(destId)?.floor || route.floor;
          }
          renderAll();
        }
      });
    }

    body.querySelectorAll('[data-action="set-route-mode"]').forEach(btn => {
      btn.addEventListener("click", () => {
        if (!state.routeEditor.draft) return;
        const selectedMode = btn.dataset.mode || 'segment';
        if (state.routeEditor.mode === selectedMode) return;
        state.routeEditor.mode = selectedMode;
        showToast(`Switched to ${selectedMode === 'segment' ? 'Segment' : 'Arrow'} Mode`);
        renderAll();
      });
    });

    body.querySelectorAll('[data-origin-group]').forEach(el => {
      el.addEventListener('click', () => {
        const groupId = el.dataset.originGroup || null;
        state.routeEditor.originFilter = state.routeEditor.originFilter === groupId ? null : groupId;
        renderAll();
      });
    });

    body.querySelector('[data-action="clear-origin-filter"]')?.addEventListener('click', () => {
      state.routeEditor.originFilter = null;
      renderAll();
    });

    body.querySelector('[data-action="save-route"]')?.addEventListener("click", () => saveRoute());
    body.querySelector('[data-action="preview-route"]')?.addEventListener("click", () => previewRoute());
    body.querySelector('[data-action="run-route"]')?.addEventListener("click", () => runRoute());
    body.querySelector('[data-action="clear-route"]')?.addEventListener("click", () => {
      if (!state.routeEditor.draft) return;
      state.routeEditor.draft.points = [];
      state.routeEditor.selectedPointIndex = null;
      renderAll();
    });
    body.querySelector('[data-action="keep-route-floor"]')?.addEventListener("click", () => {
      if (!state.routeEditor.draft) return;
      if (state.activeFloor == null) { showToast("Select a floor first"); return; }
      const selectedFloor = state.activeFloor;
      if (state.routeEditor.draft.floor === selectedFloor) {
        showToast(`Route already on Floor ${selectedFloor}`);
        return;
      }
      state.routeEditor.draft.floor = selectedFloor;
      showToast(`Keep route on Floor ${selectedFloor}`);
      renderAll();
    });
    body.querySelector('[data-action="change-route-floor"]')?.addEventListener("click", () => {
      if (!state.routeEditor.draft) return;
      const select = body.querySelector('#routeFloorSwitch');
      if (!select) { showToast('Select a floor to switch to'); return; }
      const selectedFloor = Number(select.value);
      if (!state.floors.some(f => f.id === selectedFloor)) { showToast('Select a valid floor'); return; }
      if (state.routeEditor.draft.floor === selectedFloor) {
        showToast(`Route already on Floor ${selectedFloor}`);
        return;
      }
      state.routeEditor.draft.floor = selectedFloor;
      state.activeFloor = selectedFloor;
      showToast(`Continue route on Floor ${selectedFloor}`);
      renderAll();
    });
    body.querySelector('[data-action="delete-route"]')?.addEventListener("click", () => {
      if (!state.routeEditor.draft) return;
      deleteRoute(state.routeEditor.draft.id);
    });
    body.querySelectorAll('[data-action="close-route-editor"]').forEach(btn => {
      btn.addEventListener("click", () => {
        stopRoutePreview();
        state.mode = "default";
        state.activeSection = "routes";
        state.routeEditor.draft = null;
        state.routeEditor.selectedPointIndex = null;
        state.routeEditor.pickTarget = null;
        state.routeEditor.originLocked = false;
        renderAll();
      });
    });
    body.querySelector('[data-action="delete-route-point"]')?.addEventListener("click", () => {
      const idx = state.routeEditor.selectedPointIndex;
      if (idx == null || !state.routeEditor.draft) return;
      state.routeEditor.draft.points.splice(idx, 1);
      state.routeEditor.selectedPointIndex = Math.min(idx, state.routeEditor.draft.points.length - 1);
      renderAll();
    });
    body.querySelectorAll('[data-select-route-point]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.selectRoutePoint);
        state.routeEditor.selectedPointIndex = idx;
        renderAll();
      });
    });

    // Pin search
    const search = body.querySelector("#pinSearch");
    if (search) search.addEventListener("input", (e) => {
      state.search = e.target.value;
      renderControlPanel();
      const s2 = $("#pinSearch");
      if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
    });

    const legendSearch = body.querySelector("#legendSearch");
    if (legendSearch) legendSearch.addEventListener("input", (e) => {
      state.legendSearch = e.target.value;
      renderControlPanel();
      const s2 = $("#legendSearch");
      if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
    });

    const routeLocationSearch = body.querySelector("#routeLocationSearch");
    if (routeLocationSearch) routeLocationSearch.addEventListener("input", (e) => {
      state.routeLocationSearch = e.target.value;
      renderControlPanel();
      const s2 = $("#routeLocationSearch");
      if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
    });

    const routeSearch = body.querySelector("#routeSearch");
    if (routeSearch) routeSearch.addEventListener("input", (e) => {
      state.routeSearch = e.target.value;
      renderControlPanel();
      const s2 = $("#routeSearch");
      if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
    });
  }

  function wireForm() {
    const body = $("#cpBody");

    body.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
      if (state.edit?.kind === "pin" && state.edit.isNew) {
        state.locations = state.locations.filter(p => p.id !== state.edit.draft.id);
      }
      state.edit = null; renderAll();
    });

    body.querySelector('[data-action="save"]')?.addEventListener("click", saveEdit);

    body.querySelector('[data-action="delete"]')?.addEventListener("click", () => {
      const e = state.edit;
      if      (e.kind === "floor")  deleteFloor(e.draft.id);
      else if (e.kind === "pin")    deletePin(e.draft.id);
      else if (e.kind === "legend") deleteLegend(e.draft.id);
    });

    // ---- Floor form ----
    if (state.edit.kind === "floor") {
      body.querySelector("#fName")?.addEventListener("input",  e => state.edit.draft.name  = e.target.value);
      body.querySelector("#fLabel")?.addEventListener("input", e => state.edit.draft.label = e.target.value);
      body.querySelector('[data-action="pick-floor-image"]')?.addEventListener("click", () =>
        body.querySelector("#fImageFile").click()
      );
      body.querySelector('[data-action="show-floor-preview"]')?.addEventListener("click", () => {
        state.showFloorPreview = true;
        const previewSrc = state.edit.draft.image || floorImageSrc(state.edit.draft.id);
        updateFloorImagePreview(previewSrc);
      });
      body.querySelector("#fImageFile")?.addEventListener("change", (ev) => {
        const file = ev.target.files?.[0]; if (!file) return;
        const r = new FileReader();
        r.onload = (e) => { state.edit.draft.image = String(e.target.result || ""); renderControlPanel(); };
        r.readAsDataURL(file);
      });
    }

    // ---- Pin form ----
    if (state.edit.kind === "pin") {
      body.querySelector("#pName")?.addEventListener("input",  e => state.edit.draft.name        = e.target.value);
      body.querySelector("#pDesc")?.addEventListener("input",  e => state.edit.draft.description = e.target.value);
      body.querySelector("#pFloor")?.addEventListener("change", e => { state.edit.draft.floor    = +e.target.value; });
      body.querySelector("#pLegend")?.addEventListener("change", e => {
        state.edit.draft.legendId = e.target.value;
        renderControlPanel();   // refresh icon/color preview
        renderMap();            // update pin preview style immediately
      });
      body.querySelector('[data-action="pick-pin-image"]')?.addEventListener("click", () =>
        body.querySelector("#pImageFile").click()
      );
      body.querySelector("#pImageFile")?.addEventListener("change", (ev) => {
        const file = ev.target.files?.[0]; if (!file) return;
        const r = new FileReader();
        r.onload = (e) => { state.edit.draft.image = String(e.target.result || ""); renderControlPanel(); };
        r.readAsDataURL(file);
      });
      body.querySelector('[data-action="remove-pin-image"]')?.addEventListener("click", () => {
        delete state.edit.draft.image;
        renderControlPanel();
      });
    }

    // ---- Legend form ----
    if (state.edit.kind === "legend") {
      body.querySelector("#lLabel")?.addEventListener("input", e => { state.edit.draft.label = e.target.value; refreshLegendPreview(); });
      body.querySelector("#lColor")?.addEventListener("input", e => { state.edit.draft.color = e.target.value; refreshLegendPreview(); });

      body.querySelectorAll("#iconGrid .icon-cell").forEach(cell => {
        cell.addEventListener("click", () => {
          state.edit.draft.icon    = cell.dataset.icon;
          state.edit.draft.iconUrl = "";
          renderControlPanel();
        });
      });

      body.querySelector('[data-action="pick-legend-icon"]')?.addEventListener("click", () =>
        body.querySelector("#lIconFile").click()
      );
      body.querySelector("#lIconFile")?.addEventListener("change", (ev) => {
        const file = ev.target.files?.[0]; if (!file) return;
        const r = new FileReader();
        r.onload = (e) => { state.edit.draft.iconUrl = String(e.target.result || ""); renderControlPanel(); };
        r.readAsDataURL(file);
      });
      body.querySelector("#lIconUrl")?.addEventListener("input", e => {
        state.edit.draft.iconUrl = e.target.value; refreshLegendPreview();
      });
    }
  }

  function refreshLegendPreview() {
    const e    = state.edit;
    const prev = $("#legendPreview");
    if (!prev) return;
    prev.innerHTML = `
      <span class="legend-color" style="background:${e.draft.color}"></span>
      ${e.draft.iconUrl
        ? `<img src="${e.draft.iconUrl}" style="width:24px;height:24px;object-fit:contain"/>`
        : (ICONS[e.draft.icon] || ICONS.MapPin)}
      <span class="muted">${escapeHtml(e.draft.label || "Preview")}</span>
    `;
  }

  // ---------- SAVE EDIT ----------
  function saveEdit() {
    const e = state.edit;

    if (e.kind === "floor") {
      const d     = e.draft;
      const draft = {
        id:    d.id,
        name:  (d.name  || "").trim() || "Untitled",
        label: (d.label || "").trim() || "F" + d.id,
      };
      if (e.isNew) state.floors.push(draft);
      else         state.floors = state.floors.map(f => f.id === draft.id ? draft : f);

      if (d.image) state.images[d.id] = d.image;
      else if (d.id === 1) state.images[d.id] = "../images/map-ground-floor.png";
      else         delete state.images[d.id];

      if (state.activeFloor == null) state.activeFloor = draft.id;
      showToast(e.isNew ? "Floor added" : "Floor updated");

    } else if (e.kind === "pin") {
      const d     = e.draft;
      const draft = {
        ...d,
        name: (d.name || "").trim() || "Untitled",
        x:    clamp(d.x, 0, 100),
        y:    clamp(d.y, 0, 100),
      };
      const exists = state.locations.find(p => p.id === draft.id);
      if (e.isNew && !exists) state.locations.push(draft);
      else                    state.locations = state.locations.map(p => p.id === draft.id ? draft : p);
      state.selectedPinId = draft.id;
      showToast(e.isNew ? "Pin added" : "Pin updated");

    } else if (e.kind === "legend") {
      const d     = e.draft;
      const draft = {
        id:    d.id,
        label: (d.label || "").trim() || "Untitled",
        color: d.color,
        icon:  (d.icon || "").trim() || "MapPin",
      };
      const exists = state.legends.find(l => l.id === draft.id);
      if (e.isNew && !exists) state.legends.push(draft);
      else                    state.legends = state.legends.map(l => l.id === draft.id ? draft : l);
      showToast(e.isNew ? "Legend added" : "Legend updated");
    }

    state.edit = null; renderAll();
  }

  async function syncRouteToBackend(route, isNew) {
    const payload = {
      id: route.id,
      name: route.name,
      origin: route.origin || '',
      originId: route.originId || '',
      destination: route.destination || '',
      destinationId: route.destinationId || '',
      floor: route.floor,
      archived: route.archived ? 1 : 0,
      points: route.points.map((point, index) => ({
        x: clamp(point.x, 0, 100),
        y: clamp(point.y, 0, 100),
        floor: point.floor != null ? point.floor : route.floor,
        point_order: index + 1,
      })),
    };

    const method = isNew ? 'POST' : 'PUT';
    const res = await apiRequest('routes', method, payload, isNew ? null : route.id);
    if (res && res.success && res.data?.route) {
      const updated = normalizeRoute(res.data.route);
      if (isNew) {
        state.routes = state.routes.map(r => r.id === route.id ? updated : r);
      } else {
        state.routes = state.routes.map(r => r.id === updated.id ? updated : r);
      }
      saveRoutesLocally();
    }
  }

  async function saveRoute() {
    const route = state.routeEditor.draft;
    if (!route) return;
    if (!route.originId || !route.destinationId) {
      showToast('Select both origin and destination pins before saving');
      return;
    }
    route.name = (route.name || '').trim() || 'Untitled Route';
    const origin = destinationLocation(route.originId);
    const destination = destinationLocation(route.destinationId);
    route.origin = origin?.name || route.origin || '';
    route.destination = destination?.name || route.destination || '';
    route.floor = origin?.floor || route.floor;
    route.archived = !!route.archived;
    route.points = route.points.map((point, index, points) => ({
      x: clamp(point.x, 0, 100),
      y: clamp(point.y, 0, 100),
      floor: point.floor != null
        ? point.floor
        : (index > 0 ? (points[index - 1]?.floor ?? route.floor) : route.floor),
      pointOrder: index + 1,
    }));

    const existing = routeById(route.id);
    if (existing) {
      state.routes = state.routes.map(r => r.id === route.id ? { ...route } : r);
    } else {
      state.routes.push({ ...route });
    }
    saveRoutesLocally();
    await syncRouteToBackend(route, !existing);

    state.routeEditor.draft = null;
    state.routeEditor.selectedPointIndex = null;
    state.routeEditor.originLocked = false;
    renderAll();
    showToast(existing ? 'Route updated' : 'Route saved');
  }

  function toggleRouteArchived(routeId) {
    const route = routeById(routeId);
    if (!route) return;
    route.archived = !route.archived;
    state.routes = state.routes.map(r => r.id === route.id ? { ...route } : r);
    saveRoutesLocally();
    syncRouteToBackend(route, false);
    renderAll();
    showToast(route.archived ? 'Route archived' : 'Route restored');
  }

  function archiveOriginRoutes(originId) {
    const routes = state.routes.filter(r => r.originId === originId && !r.archived);
    if (!routes.length) {
      showToast('No active routes found for this location');
      return;
    }
    routes.forEach(r => { r.archived = true; });
    state.routes = state.routes.map(r => routes.some(a => a.id === r.id) ? { ...r, archived: true } : r);
    saveRoutesLocally();
    renderAll();
    showToast('Routes archived for this location');
  }

  function deleteRoute(id) {
    if (!confirm('Delete this route?')) return;
    state.routes = state.routes.filter(r => r.id !== id);
    if (state.routeEditor.draft?.id === id) {
      state.routeEditor.draft = null;
      state.routeEditor.selectedPointIndex = null;
    }
    saveRoutesLocally();
    apiRequest('routes', 'DELETE', null, id);
    renderAll();
    showToast('Route deleted');
  }

  // ---------- DELETE ----------
  function deleteFloor(id) {
    if (state.floors.length <= 1) { showToast("Keep at least one floor"); return; }
    if (!confirm("Delete this floor and its pins?")) return;
    state.floors    = state.floors.filter(f => f.id !== id);
    state.locations = state.locations.filter(l => l.floor !== id);
    delete state.images[id];
    if (state.activeFloor === id) state.activeFloor = state.floors[0]?.id ?? null;
    state.edit = null;
    renderAll();
    showToast("Floor deleted");
  }

  function deletePin(id) {
    if (!confirm("Delete this pin?")) return;
    state.locations = state.locations.filter(l => l.id !== id);
    if (state.selectedPinId === id) state.selectedPinId = null;
    state.edit = null;
    renderAll();
    showToast("Pin deleted");
  }

  function deleteLegend(id) {
    const usedBy = state.locations.filter(l => l.legendId === id).length;
    if (usedBy > 0 && !confirm(`This legend is used by ${usedBy} pin(s). Delete anyway?`)) return;
    else if (usedBy === 0 && !confirm("Delete this legend?")) return;
    state.legends = state.legends.filter(l => l.id !== id);
    if (state.activeLegendId === id) {
      state.activeLegendId = state.legends[0]?.id || null;
    }
    // Pins that referenced this legend lose their legendId
    state.locations = state.locations.map(l =>
      l.legendId === id ? { ...l, legendId: state.legends[0]?.id || "" } : l
    );
    state.edit = null;
    renderAll();
    showToast("Legend deleted");
  }

  // ---------- MAP RENDER ----------
  function renderMap() {
    const f = state.floors.find(x => x.id === state.activeFloor);
    $("#floorTag").textContent  = f?.label || "—";
    $("#floorName").textContent = f?.name  || "No floor selected";

    // Floor switch chips
    const sw = $("#floorSwitch");
    sw.innerHTML = state.floors.map(fl =>
      `<button class="floor-chip ${fl.id === state.activeFloor ? "active" : ""}" data-fl="${fl.id}">${escapeHtml(fl.label)}</button>`
    ).join("");
    sw.querySelectorAll("[data-fl]").forEach(b => b.addEventListener("click", () => {
      state.activeFloor = +b.dataset.fl; renderAll();
    }));

    // Apply zoom/pan transform (keeps existing pan offset)
    applyTransform(true);
    mapCanvas.classList.toggle("add-pin-mode", state.mode === "add-pin" && state.activeSection === "pins");
    mapCanvas.classList.toggle("grid-on", state.showGrid);

    // Grid & legend toggle visual state
    $("#gridBtn").classList.toggle("on",   state.showGrid);
    $("#legendBtn").classList.toggle("on", state.showLegend);
    $("#gridOverlay").hidden = !state.showGrid;

    // Floor image — use Map-ground-floor.png for floor id 1 if no custom image uploaded
    const img   = $("#floorImage");
    const empty = $("#emptyState");
    const restoreBtn = $("#restoreMapBtn");
    const emptyText = $("#emptyStateText");
    let src = state.activeFloor != null ? floorImageSrc(state.activeFloor) : "";

    const showEmptyState = (message) => {
      if (emptyText) emptyText.textContent = message;
      if (restoreBtn) {
        if (state.activeFloor != null) restoreBtn.classList.remove("hidden");
        else restoreBtn.classList.add("hidden");
      }
      if (img) {
        img.removeAttribute("src");
        img.hidden = true;
      }
      if (empty) empty.hidden = false;
    };

    if (img) {
      img.onerror = () => {
        showEmptyState(state.activeFloor != null
          ? "No map image found. Click restore to load the default map."
          : "");
      };
      img.onload = () => {
        if (empty) empty.hidden = true;
        img.hidden = false;
      };
    }

    if (src) {
      if (img) {
        img.hidden = true;
        img.src = src;
        if (img.complete && img.naturalWidth) {
          if (empty) empty.hidden = true;
          img.hidden = false;
        }
      }
    } else {
      showEmptyState(state.activeFloor != null
        ? "No map image available. Click restore to load the default map."
        : "");
    }

    if (restoreBtn) {
      restoreBtn.onclick = () => restoreDefaultMap();
    }

    // Pins
    const layer = $("#pinsLayer");
    layer.innerHTML = "";
    if (state.activeFloor != null) {
      state.locations
        .filter(l => l.floor === state.activeFloor)
        .forEach(loc => renderPin(loc, layer));
    }

    renderRouteOverlay();

    // Legend overlay panel
    const lo = $("#legendOverlay");
    if (lo) {
      lo.hidden = false;
      lo.style.display = 'block';
      lo.classList.toggle('expanded', state.showLegend);
      lo.classList.toggle('collapsed', !state.showLegend);
      if (state.showLegend) {
        lo.innerHTML = `<div class="lo-title">Legend</div>` +
          state.legends.map(lg =>
            `<div class="lo-row"><span class="lo-color" style="background:${lg.color}"></span><span>${escapeHtml(lg.label)}</span></div>`
          ).join("");
      } else {
        lo.innerHTML = `<div class="legend-pill" title="Show map legend">` +
          ICONS.MapPin +
          `</div>`;
      }
    }
  }

  function renderRouteOverlay() {
    const svgLayer = document.getElementById('routeEditorSvg');
    const pointsLayer = document.getElementById('routePointsLayer');
    const walkerLayer = document.getElementById('routeWalkerLayer');
    if (!svgLayer || !pointsLayer || !walkerLayer) return;

    svgLayer.innerHTML = '';
    pointsLayer.innerHTML = '';

    if (state.activeSection !== 'routes' || !state.routeEditor.draft) {
      svgLayer.style.display = 'none';
      pointsLayer.style.display = 'none';
      walkerLayer.style.display = 'none';
      return;
    }

    const draft = state.routeEditor.draft;
    svgLayer.style.display = 'block';
    pointsLayer.style.display = 'block';
    svgLayer.setAttribute('viewBox', '0 0 100 100');
    svgLayer.setAttribute('preserveAspectRatio', 'none');

    if (!state.routeEditor.previewing && draft.floor !== state.activeFloor) {
      const note = document.createElement('div');
      note.className = 'route-editor-floor-note';
      note.textContent = `Route is on Floor ${draft.floor}. Switch to that floor to edit points.`;
      pointsLayer.appendChild(note);
      return;
    }

    const origin = destinationLocation(draft.originId);
    const destination = destinationLocation(draft.destinationId);
    const routeColor = origin ? colorForPin(origin) : '#2d5da1';
    const destinationColor = destination ? colorForPin(destination) : routeColor;
    const allPathPoints = [];
    if (origin) allPathPoints.push({ x: origin.x, y: origin.y, floor: origin.floor, type: 'origin' });
    allPathPoints.push(...draft.points.map(p => ({ x: p.x, y: p.y, floor: p.floor != null ? p.floor : draft.floor, type: 'point' })));
    if (destination) allPathPoints.push({ x: destination.x, y: destination.y, floor: destination.floor, type: 'destination' });
    const isPreview = !!state.routeEditor.previewing;
    const isLinePreview = isPreview && state.routeEditor.previewMode === 'line';
    const isRunPreview = isPreview && state.routeEditor.previewMode === 'run';

    const getRouteSegments = (points) => {
      const segments = [];
      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        segments.push({
          start,
          end,
          floor: start.floor,
          sameFloor: start.floor === end.floor,
          length,
        });
      }
      return segments;
    };

    const getCurrentRunState = () => {
      const segments = getRouteSegments(allPathPoints);
      const totalLength = segments.reduce((sum, seg) => sum + seg.length, 0);
      const progress = clamp(state.routeEditor.previewProgress ?? 0, 0, 1);
      let travel = totalLength * progress;
      let current = null;
      for (const seg of segments) {
        if (seg.length === 0 || travel <= seg.length) {
          const t = seg.length === 0 ? 1 : clamp(travel / seg.length, 0, 1);
          const x = seg.start.x + (seg.end.x - seg.start.x) * t;
          const y = seg.start.y + (seg.end.y - seg.start.y) * t;
          current = {
            x,
            y,
            floor: seg.floor,
            direction: {
              dx: seg.end.x - seg.start.x,
              dy: seg.end.y - seg.start.y,
            },
            segment: seg,
          };
          break;
        }
        travel -= seg.length;
      }
      if (!current && allPathPoints.length) {
        const lastPoint = allPathPoints[allPathPoints.length - 1];
        current = { x: lastPoint.x, y: lastPoint.y, floor: lastPoint.floor };
      }
      return { current, segments };
    };

    const routeSegments = getRouteSegments(allPathPoints);
    const runState = isRunPreview ? getCurrentRunState() : null;
    const currentPoint = runState?.current || null;
    const activeFloor = state.activeFloor;

    if (state.routeEditor.mode === 'arrow') {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = `
        <marker id="routeArrow" markerWidth="3" markerHeight="3" refX="3" refY="1.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L3,1.5 L0,3 Z" fill="currentColor" />
        </marker>
      `;
      svgLayer.appendChild(defs);
    }

    const visibleSegments = routeSegments.filter(seg => seg.floor === activeFloor && seg.sameFloor);
    visibleSegments.forEach((seg, idx) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', `${seg.start.x}`);
      line.setAttribute('y1', `${seg.start.y}`);
      line.setAttribute('x2', `${seg.end.x}`);
      line.setAttribute('y2', `${seg.end.y}`);
      line.setAttribute('stroke', routeColor);
      line.setAttribute('stroke-width', isLinePreview ? '8' : '6');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-linejoin', 'round');
      line.setAttribute('stroke-opacity', isLinePreview ? '0.9' : '0.95');
      line.classList.add('route-line');
      if (isPreview) {
        line.classList.add(isLinePreview ? 'route-line-preview' : 'route-line-run');
      }
      if (state.routeEditor.mode === 'arrow') {
        line.setAttribute('marker-end', 'url(#routeArrow)');
        line.style.color = routeColor;
      }
      svgLayer.appendChild(line);
    });

    if (origin && origin.floor === activeFloor && !isLinePreview) {
      const start = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      start.setAttribute('cx', `${origin.x}`);
      start.setAttribute('cy', `${origin.y}`);
      start.setAttribute('r', '2.5');
      start.setAttribute('fill', routeColor);
      svgLayer.appendChild(start);
    }
    if (destination && destination.floor === activeFloor && !isLinePreview) {
      const end = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      end.setAttribute('cx', `${destination.x}`);
      end.setAttribute('cy', `${destination.y}`);
      end.setAttribute('r', '2.5');
      end.setAttribute('fill', destinationColor);
      svgLayer.appendChild(end);
    }
    if (currentPoint && currentPoint.floor === activeFloor && !isLinePreview) {
      walkerLayer.style.display = 'block';
      let walker = walkerLayer.querySelector('.route-walker');
      if (!walker) {
        walker = document.createElement('div');
        walker.className = 'route-walker';
        walker.innerHTML = `
          <video class="route-walker-media"
                 muted loop playsinline preload="auto"
                 aria-hidden="true"
                 style="width: 48px; height: 48px;">
            <source src="../images/walking-icon.webm" type="video/webm" />
          </video>
          <div class="route-walker-fallback" aria-hidden="true" style="width: 48px; height: 48px;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="5" r="2.5" fill="#f59e0b" stroke="#fff" stroke-width="0.9" />
              <path d="M12 8.5v3.5" />
              <path d="M12 11.5l-2 2.5" />
              <path d="M12 11.5l2 2.5" />
              <path d="M12 12.5l-1.5 4" />
              <path d="M12 12.5l1.5 4" />
              <path d="M12 8.5l-1.5 1.5h3" fill="none" />
            </svg>
          </div>
        `;
        walkerLayer.appendChild(walker);

        const video = walker.querySelector('video');
        const fallback = walker.querySelector('.route-walker-fallback');
        if (video) {
          video.autoplay = true;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.load();
          video.play().catch(() => {
            video.style.display = 'none';
            if (fallback) fallback.style.display = 'flex';
          });
          video.addEventListener('loadeddata', () => {
            video.style.display = 'block';
            if (fallback) fallback.style.display = 'none';
          });
          video.addEventListener('error', () => {
            video.style.display = 'none';
            if (fallback) fallback.style.display = 'flex';
          });
        }
      }
      const currentSegment = runState?.current?.segment;
      const directionAngle = currentSegment
        ? Math.atan2(currentSegment.end.y - currentSegment.start.y, currentSegment.end.x - currentSegment.start.x) * 180 / Math.PI
        : 0;
      walker.style.left = `${currentPoint.x}%`;
      walker.style.top = `${currentPoint.y}%`;
      walker.style.transform = `translate(-50%, -100%) rotate(${directionAngle}deg)`;
      walker.style.display = 'flex';
    } else {
      const existingWalker = walkerLayer.querySelector('.route-walker');
      if (existingWalker) {
        existingWalker.style.display = 'none';
      }
      walkerLayer.style.display = 'none';
    }

    if (!isPreview) {
      draft.points.forEach((point, i) => {
        // Only show points that belong to the current active floor
        const pointFloor = point.floor != null ? point.floor : draft.floor;
        if (pointFloor !== activeFloor) return;

        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `route-point${state.routeEditor.selectedPointIndex === i ? ' selected' : ''}`;
        dot.style.left = `${point.x}%`;
        dot.style.top = `${point.y}%`;
        dot.style.background = routeColor;
        dot.style.width = '10px';
        dot.style.height = '10px';
        dot.style.transform = 'translate(-50%, 0)';
        dot.dataset.pointIndex = i;
        dot.title = `Point ${i + 1}`;
        dot.addEventListener('click', (ev) => {
          ev.stopPropagation();
          state.routeEditor.selectedPointIndex = i;
          renderAll();
        });
        dot.addEventListener('pointerdown', (ev) => startRoutePointDrag(ev, i));
        pointsLayer.appendChild(dot);
      });
    }
  }

  function stopRoutePreview() {
    window.clearTimeout(routePreviewTimer);
    window.clearInterval(routePreviewTimer);
    routePreviewTimer = null;
    state.routeEditor.previewing = false;
    state.routeEditor.previewMode = null;
    state.routeEditor.previewStep = null;
    state.routeEditor.previewProgress = 0;
    state.routeEditor.previewFloorIndex = 0;
    state.routeEditor.previewFloors = [];
    state.routeEditor.previewPoints = [];
    if (state.routeEditor.previewFloorBackup != null) {
      state.activeFloor = state.routeEditor.previewFloorBackup;
      state.routeEditor.previewFloorBackup = null;
    }
  }

  function buildRoutePreviewPoints(route) {
    const origin = destinationLocation(route.originId);
    const destination = destinationLocation(route.destinationId);
    if (!origin || !destination) return null;

    const previewPoints = [];
    previewPoints.push({ x: origin.x, y: origin.y, floor: origin.floor, type: 'origin' });
    route.points.reduce((lastFloor, p) => {
      const floor = p.floor != null ? p.floor : lastFloor;
      previewPoints.push({ x: p.x, y: p.y, floor, type: 'point' });
      return floor;
    }, route.floor);
    previewPoints.push({ x: destination.x, y: destination.y, floor: destination.floor, type: 'destination' });
    return previewPoints;
  }

  function startRoutePreview(mode) {
    if (!state.routeEditor.draft) return;
    const route = state.routeEditor.draft;
    if (!route.originId || !route.destinationId) {
      showToast('Set both start and destination pins before previewing');
      return;
    }

    const previewPoints = buildRoutePreviewPoints(route);
    if (!previewPoints || previewPoints.length < 2) {
      showToast('Add route points before previewing');
      return;
    }

    stopRoutePreview();
    state.routeEditor.previewPoints = previewPoints;
    state.routeEditor.previewMode = mode;
    state.routeEditor.previewFloorBackup = state.activeFloor;
    state.routeEditor.previewFloorIndex = 0;
    state.routeEditor.previewFloors = previewPoints.reduce((floors, point) => {
      if (floors.length === 0 || floors[floors.length - 1] !== point.floor) {
        floors.push(point.floor);
      }
      return floors;
    }, []);
    state.routeEditor.previewProgress = 0;
    state.routeEditor.previewing = true;
    state.activeFloor = state.routeEditor.previewFloors[0];
    renderMap();

    if (mode === 'line') {
      const duration = 3000;
      const floors = state.routeEditor.previewFloors.length;
      if (floors <= 1) {
        routePreviewTimer = window.setTimeout(() => {
          stopRoutePreview();
          renderMap();
        }, duration);
      } else {
        const interval = duration / floors;
        routePreviewTimer = window.setInterval(() => {
          if (!state.routeEditor.previewing) return;
          const nextIndex = state.routeEditor.previewFloorIndex + 1;
          if (nextIndex >= floors) {
            stopRoutePreview();
            renderMap();
            return;
          }
          state.routeEditor.previewFloorIndex = nextIndex;
          state.activeFloor = state.routeEditor.previewFloors[nextIndex];
          renderMap();
        }, interval);
      }
    } else if (mode === 'run') {
      const segments = buildRoutePreviewPoints(route).reduce((acc, point, idx, points) => {
        if (idx === 0) return acc;
        const prev = points[idx - 1];
        const len = Math.hypot(point.x - prev.x, point.y - prev.y);
        acc.push({ start: prev, end: point, floor: prev.floor, length: len });
        return acc;
      }, []);
      const totalLength = segments.reduce((sum, seg) => sum + seg.length, 0);
      const duration = Math.max(9000, Math.min(18000, totalLength * 60 + 4000));
      const startTime = performance.now();
      const ease = (t) => t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
      routePreviewTimer = window.setInterval(() => {
        if (!state.routeEditor.previewing) return;
        const elapsed = performance.now() - startTime;
        const rawProgress = clamp(elapsed / duration, 0, 1);
        const easedProgress = ease(rawProgress);
        state.routeEditor.previewProgress = easedProgress;
        const progress = easedProgress;
        let remaining = totalLength * progress;
        let currentFloor = previewPoints[0].floor;
        for (const seg of segments) {
          if (remaining <= seg.length) {
            currentFloor = seg.floor;
            break;
          }
          remaining -= seg.length;
          currentFloor = seg.end.floor;
        }
        state.activeFloor = currentFloor;
        renderMap();
        if (rawProgress >= 1) {
          stopRoutePreview();
          renderMap();
        }
      }, 30);
    }
  }

  function previewRoute() {
    startRoutePreview('line');
  }

  function runRoute() {
    startRoutePreview('run');
  }

  function startRoutePointDrag(event, index) {
    if (!state.routeEditor.draft || state.routeEditor.draft.floor !== state.activeFloor) return;
    event.preventDefault();
    event.stopPropagation();

    const draft = state.routeEditor.draft;
    let dragging = false;
    const onMove = (ev) => {
      if (!dragging) {
        dragging = true;
        state.routeEditor.selectedPointIndex = index;
      }
      const { x, y } = getMapCoordinates(ev.clientX, ev.clientY);
      const prevFloor = draft.points[index]?.floor ?? state.activeFloor;
      draft.points[index] = { x, y, floor: prevFloor };
      renderMap();
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const route = state.routeEditor.draft;
      if (route && route.floor === state.activeFloor && route.points[index]) {
        const point = route.points[index];
        const pin = nearestPin(point.x, point.y, state.activeFloor, 6);
        if (pin) {
          if (!route.originId && index === 0) {
            if (confirm(`Set ${pin.name} as route origin?`)) {
              route.originId = pin.id;
              route.origin = pin.name;
              route.floor = pin.floor;
              route.points[index] = { x: pin.x, y: pin.y, floor: pin.floor };
            }
          } else if (!route.destinationId && index === route.points.length - 1 && pin.id !== route.originId) {
            if (confirm(`Set ${pin.name} as route destination?`)) {
              route.destinationId = pin.id;
              route.destination = pin.name;
              route.points[index] = { x: pin.x, y: pin.y, floor: pin.floor };
            }
          }
        }
      }
      renderMap();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function renderPin(loc, layer) {
    const pinData = state.edit?.draft?.id === loc.id ? state.edit.draft : loc;
    const el  = document.createElement("div");
    const sel = state.selectedPinId === loc.id || state.edit?.draft?.id === loc.id;
    el.className = "pin draggable" + (sel ? " selected" : "");
    el.style.left       = pinData.x + "%";
    el.style.top        = pinData.y + "%";
    el.style.background = colorForPin(pinData);
    el.innerHTML        = iconForPin(pinData);
    el.dataset.id       = loc.id;

    // Drag
    el.addEventListener("mousedown", (e) => startDrag(e, loc));

    // Click → select a pin or open its edit state
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selectedPinId = loc.id;
      state.mode = 'default';
      if (loc.floor !== state.activeFloor) state.activeFloor = loc.floor;
      renderAll();
    });

    // Double-click → open edit form
    el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      state.activeSection = "pins";
      state.edit = { kind: "pin", isNew: false, draft: { ...loc } };
      renderTabs(); renderControlPanel();
    });

    // Tooltip on hover
    el.addEventListener("mouseenter", () => {
      const r  = el.getBoundingClientRect();
      const s  = $("#mapStage").getBoundingClientRect();
      const tt = $("#pinTooltip");
      let tooltipHtml = `<strong>${escapeHtml(loc.name)}</strong><span>${escapeHtml(labelForPin(loc))}</span>`;
      if (pinData.image) {
        tooltipHtml += `<img class="pin-tooltip-image" src="${escapeHtml(pinData.image)}" alt="Pin image"/>`;
      }
      tt.innerHTML = tooltipHtml;
      tt.style.left = (r.left + r.width / 2 - s.left) + "px";
      tt.style.top  = (r.top - s.top) + "px";
      tt.classList.add("show");
    });
    el.addEventListener("mouseleave", () => $("#pinTooltip").classList.remove("show"));

    layer.appendChild(el);
  }

  // ---------- PIN DRAG ----------
  function startDrag(e, loc) {
    e.stopPropagation();
    const canvas = $("#mapCanvas");
    const rect   = canvas.getBoundingClientRect();
    let moved    = false;
    let dragging = false;
    const sx = e.clientX, sy = e.clientY;

    const onClickSuppress = (evt) => {
      if (dragging) {
        evt.stopPropagation();
        evt.preventDefault();
      }
    };

    const onMove = (ev) => {
      if (!dragging && (Math.abs(ev.clientX - sx) > 3 || Math.abs(ev.clientY - sy) > 3)) {
        dragging = true;
        isDraggingPin = true;
        const pinEl = document.querySelector(`.pin[data-id="${loc.id}"]`);
        if (pinEl) pinEl.classList.add("dragging");
      }

      if (!dragging) return;
      document.body.style.cursor = "grabbing";

      const r = canvas.getBoundingClientRect();
      const x = clamp(((ev.clientX - r.left)  / r.width)  * 100, 0, 100);
      const y = clamp(((ev.clientY - r.top)   / r.height) * 100, 0, 100);

      const p = state.locations.find(l => l.id === loc.id);
      if (p) { p.x = x; p.y = y; }

      if (state.edit?.draft?.id === loc.id) {
        state.edit.draft.x = x;
        state.edit.draft.y = y;
        const lbl = $("#posLabel");
        if (lbl) lbl.textContent = `x: ${x.toFixed(1)}% · y: ${y.toFixed(1)}%`;
      }

      renderMap();
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      document.removeEventListener("click", onClickSuppress, true);
      const pinEl = document.querySelector(`.pin[data-id="${loc.id}"]`);
      if (pinEl) pinEl.classList.remove("dragging");
      document.body.style.cursor = "default";
      if (!dragging) { state.selectedPinId = loc.id; renderAll(); }
      setTimeout(() => { isDraggingPin = false; }, 0);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    document.addEventListener("click", onClickSuppress, true);
  }

  function wireSectionTabs() {
    document.querySelectorAll(".section-tabs .tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const section = tab.dataset.section;
        if (!section) return;
        state.activeSection = section;
        if (section !== "pins") {
          state.mode = "default";
        }
        renderAll();
      });
    });
  }

  // ---------- Utility ----------
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

// ---------- Init ----------
  wirePreviewPanel();
  wireSectionTabs();

  // Improved Initialization
  async function initializeApp() {
      try {
          // Load data from backend first
          await Promise.allSettled([
              fetchRoutes(),
              fetchFloors?.() || Promise.resolve(),   // optional chaining kung wala pa
              fetchPins?.()   || Promise.resolve(),
              fetchLegends?.()|| Promise.resolve()
          ]);

          // Ensure we have at least one active floor
          if (!state.activeFloor && state.floors.length > 0) {
              state.activeFloor = state.floors[0].id;
          }

          if (!state.activeLegendId && state.legends.length > 0) {
              state.activeLegendId = state.legends[0].id;
          }

          state.activeSection = state.activeSection || "floors";

          renderAll();

          // Extra safety render after a short delay
          setTimeout(() => {
              renderControlPanel();
              if (state.activeSection === "routes") renderRouteOverlay();
          }, 300);

          console.log("✅ SchoolMap Admin Panel initialized successfully");
      } catch (err) {
          console.error("Init failed:", err);
          renderAll(); // fallback render
      }
  }

  // Run initialization
  if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initializeApp);
  } else {
      initializeApp();
  }
})();