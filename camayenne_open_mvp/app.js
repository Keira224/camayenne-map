(function () {
  "use strict";

  var cfg = window.CAMAYENNE_CONFIG || {};
  var center = cfg.defaultCenter || { lat: 9.532296, lon: -13.688565 };
  var zoom = cfg.defaultZoom || 16;
  var focusBoundsConfig = cfg.focusBounds || {
    south: 9.527607,
    west: -13.692973,
    north: 9.536985,
    east: -13.684157
  };
  var focusBounds = L.latLngBounds(
    [focusBoundsConfig.south, focusBoundsConfig.west],
    [focusBoundsConfig.north, focusBoundsConfig.east]
  );

  var mapOptions = {};
  if (cfg.lockToFocusBounds !== false) {
    mapOptions.maxBounds = focusBounds;
    mapOptions.maxBoundsViscosity = 1.0;
    mapOptions.minZoom = cfg.minZoom || 15;
  }

  var map = L.map("map", mapOptions).setView([center.lat, center.lon], zoom);
  L.tileLayer(cfg.tileUrl || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: cfg.tileAttribution || "&copy; OpenStreetMap contributors"
  }).addTo(map);

  if (cfg.showFocusOutline !== false) {
    L.rectangle(focusBounds, {
      color: "#1f6f8b",
      weight: 1.2,
      fillColor: "#1f6f8b",
      fillOpacity: 0.04
    }).addTo(map);
  }

  var poiLayer = L.layerGroup().addTo(map);
  var reportsLayer = L.layerGroup().addTo(map);
  var searchFocusLayer = L.layerGroup().addTo(map);
  var sketchLayer = L.layerGroup().addTo(map);
  var userLayer = L.layerGroup().addTo(map);
  var routeLayer = L.layerGroup().addTo(map);

  var state = {
    poi: [],
    reports: [],
    currentPosition: null,
    currentAccuracy: null,
    currentPositionAt: null,
    panelCollapsed: null,
    pickMode: null,
    selectedPoiPoint: null,
    selectedReportPoint: null,
    routeContext: null,
    nav: {
      active: false,
      watchId: null,
      rerouteInFlight: false,
      lastRerouteAt: 0,
      destination: null,
      routeLatLngs: [],
      segmentLengths: [],
      totalDistance: null,
      totalDuration: null,
      profile: null,
      preference: null,
      avoidMainRoads: false,
      roundTrip: false
    }
  };

  var poiCategories = cfg.poiCategories || [
    "PHARMACIE", "HOPITAL", "ECOLE", "MARCHE", "TRANSPORT", "AUTRES"
  ];
  var reportTypes = cfg.reportTypes || [
    "VOIRIE", "ECLAIRAGE", "DECHETS", "INONDATION", "SECURITE", "AUTRE"
  ];
  var reportStatuses = cfg.reportStatuses || ["NOUVEAU", "EN_COURS", "RESOLU"];

  var dom = {
    panel: document.getElementById("panel"),
    btnPanelToggle: document.getElementById("btnPanelToggle"),
    quickTabButtons: document.querySelectorAll("[data-quick-tab]"),
    tabs: document.querySelectorAll(".tab"),
    tabContents: document.querySelectorAll(".tab-content"),
    tabAddButton: document.querySelector(".tab[data-tab='add']"),
    tabAddPanel: document.getElementById("tab-add"),
    btnLocate: document.getElementById("btnLocate"),
    btnClearRoute: document.getElementById("btnClearRoute"),
    btnFocusArea: document.getElementById("btnFocusArea"),
    togglePoi: document.getElementById("togglePoi"),
    toggleReports: document.getElementById("toggleReports"),
    searchName: document.getElementById("searchName"),
    searchCategory: document.getElementById("searchCategory"),
    btnSearch: document.getElementById("btnSearch"),
    btnResetSearch: document.getElementById("btnResetSearch"),
    searchResults: document.getElementById("searchResults"),
    searchStatus: document.getElementById("searchStatus"),
    routeFromSelect: document.getElementById("routeFromSelect"),
    routeToSelect: document.getElementById("routeToSelect"),
    routeProfileSelect: document.getElementById("routeProfileSelect"),
    routePreferenceSelect: document.getElementById("routePreferenceSelect"),
    routeAvoidMainRoads: document.getElementById("routeAvoidMainRoads"),
    routeRoundTrip: document.getElementById("routeRoundTrip"),
    btnSwapRoute: document.getElementById("btnSwapRoute"),
    btnRouteBetween: document.getElementById("btnRouteBetween"),
    routeStatus: document.getElementById("routeStatus"),
    routeMetrics: document.getElementById("routeMetrics"),
    btnStartNav: document.getElementById("btnStartNav"),
    btnStopNav: document.getElementById("btnStopNav"),
    navStatus: document.getElementById("navStatus"),
    navProgress: document.getElementById("navProgress"),
    poiName: document.getElementById("poiName"),
    poiCategory: document.getElementById("poiCategory"),
    poiAddress: document.getElementById("poiAddress"),
    poiPhone: document.getElementById("poiPhone"),
    poiDescription: document.getElementById("poiDescription"),
    btnPickPoiPoint: document.getElementById("btnPickPoiPoint"),
    btnPoiCenter: document.getElementById("btnPoiCenter"),
    poiCoord: document.getElementById("poiCoord"),
    btnSubmitPoi: document.getElementById("btnSubmitPoi"),
    poiStatus: document.getElementById("poiStatus"),
    reportType: document.getElementById("reportType"),
    reportStatus: document.getElementById("reportStatus"),
    reportTitle: document.getElementById("reportTitle"),
    reportDescription: document.getElementById("reportDescription"),
    btnPickReportPoint: document.getElementById("btnPickReportPoint"),
    btnReportCenter: document.getElementById("btnReportCenter"),
    reportCoord: document.getElementById("reportCoord"),
    btnSubmitReport: document.getElementById("btnSubmitReport"),
    filterType: document.getElementById("filterType"),
    filterStatus: document.getElementById("filterStatus"),
    reportStatusMessage: document.getElementById("reportStatusMessage"),
    hintText: document.getElementById("hintText")
  };

  function isInFocusArea(latlng) {
    if (!cfg.enforceFocusBounds) return true;
    return focusBounds.contains(latlng);
  }

  function pointFromRow(row) {
    return L.latLng(Number(row.latitude), Number(row.longitude));
  }

  function clampRowsToFocus(rows) {
    if (!cfg.focusOnlyData) return rows;
    return rows.filter(function (row) {
      if (row.latitude == null || row.longitude == null) return false;
      return focusBounds.contains(pointFromRow(row));
    });
  }

  function setStatus(node, message, level) {
    if (!node) return;
    node.textContent = message || "";
    node.classList.remove("error", "success");
    if (level === "error") node.classList.add("error");
    if (level === "success") node.classList.add("success");
  }

  function setRouteStatus(message, level) {
    setStatus(dom.routeStatus, message, level);
    setStatus(dom.searchStatus, message, level);
    if (!message) {
      setStatus(dom.routeMetrics, "", null);
    }
  }

  function setNavStatus(message, level) {
    setStatus(dom.navStatus, message, level);
  }

  function setNavProgress(message, level) {
    setStatus(dom.navProgress, message, level);
  }

  function setCoord(node, latlng) {
    if (!latlng) {
      node.textContent = "Point: non défini";
      return;
    }
    node.textContent = "Point: " + latlng.lat.toFixed(6) + ", " + latlng.lng.toFixed(6);
  }

  function fillSelect(selectNode, values, includeAll) {
    if (!selectNode) return;
    selectNode.innerHTML = "";
    if (includeAll) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Tous";
      selectNode.appendChild(opt);
    }
    values.forEach(function (value) {
      var o = document.createElement("option");
      o.value = value;
      o.textContent = value;
      selectNode.appendChild(o);
    });
  }

  function fillRoutePlannerSelects() {
    if (!dom.routeFromSelect || !dom.routeToSelect) return;

    var oldFrom = dom.routeFromSelect.value;
    var oldTo = dom.routeToSelect.value;
    dom.routeFromSelect.innerHTML = "";
    dom.routeToSelect.innerHTML = "";

    var currentOpt = document.createElement("option");
    currentOpt.value = "__CURRENT__";
    currentOpt.textContent = "Ma position actuelle";
    dom.routeFromSelect.appendChild(currentOpt);
    dom.routeToSelect.appendChild(currentOpt.cloneNode(true));

    state.poi.forEach(function (row) {
      var label = (row.name || "Lieu") + " (" + (row.category || "") + ")";

      var fromOpt = document.createElement("option");
      fromOpt.value = String(row.id);
      fromOpt.textContent = label;
      dom.routeFromSelect.appendChild(fromOpt);

      var toOpt = document.createElement("option");
      toOpt.value = String(row.id);
      toOpt.textContent = label;
      dom.routeToSelect.appendChild(toOpt);
    });

    if (oldFrom && dom.routeFromSelect.querySelector("option[value='" + oldFrom + "']")) {
      dom.routeFromSelect.value = oldFrom;
    }
    if (oldTo && dom.routeToSelect.querySelector("option[value='" + oldTo + "']")) {
      dom.routeToSelect.value = oldTo;
    }
    if (!dom.routeToSelect.value && dom.routeToSelect.options.length > 0) {
      dom.routeToSelect.selectedIndex = 0;
    }
  }

  function getPoiById(idValue) {
    var idText = String(idValue);
    return state.poi.find(function (row) {
      return String(row.id) === idText;
    }) || null;
  }

  function getSelectedRouteProfile() {
    if (dom.routeProfileSelect && dom.routeProfileSelect.value) {
      return dom.routeProfileSelect.value;
    }
    return cfg.routingProfile || "driving-car";
  }

  function getSelectedRoutePreference() {
    if (dom.routePreferenceSelect && dom.routePreferenceSelect.value) {
      return dom.routePreferenceSelect.value;
    }
    return cfg.routingPreference || "shortest";
  }

  function getAvoidMainRoads() {
    if (dom.routeAvoidMainRoads) {
      return !!dom.routeAvoidMainRoads.checked;
    }
    return !!cfg.routeAvoidMainRoads;
  }

  function isRoundTripEnabled() {
    return !!(dom.routeRoundTrip && dom.routeRoundTrip.checked);
  }

  function swapRouteEndpoints() {
    if (!dom.routeFromSelect || !dom.routeToSelect) return;
    var fromVal = dom.routeFromSelect.value;
    var toVal = dom.routeToSelect.value;
    dom.routeFromSelect.value = toVal;
    dom.routeToSelect.value = fromVal;
  }

  function formatDistance(distanceMeters) {
    if (distanceMeters == null || isNaN(distanceMeters)) return "-";
    if (distanceMeters < 1000) return Math.round(distanceMeters) + " m";
    return (distanceMeters / 1000).toFixed(2) + " km";
  }

  function formatDuration(durationSeconds) {
    if (durationSeconds == null || isNaN(durationSeconds)) return "-";
    var totalMin = Math.round(durationSeconds / 60);
    var hours = Math.floor(totalMin / 60);
    var mins = totalMin % 60;
    if (hours <= 0) return mins + " min";
    return hours + " h " + mins + " min";
  }

  function setRouteMetrics(summary, profile, preference, roundTrip) {
    if (!dom.routeMetrics) return;
    if (!summary) {
      dom.routeMetrics.textContent = "";
      return;
    }
    var typeText = preference === "shortest" ? "plus court" : (preference === "fastest" ? "plus rapide" : "équilibré");
    var modeText = profile === "foot-walking" ? "Marche" : (profile === "cycling-regular" ? "Vélo" : "Voiture");
    var rt = roundTrip ? " | Aller-retour" : "";
    dom.routeMetrics.textContent =
      "Distance: " + formatDistance(summary.distance) +
      " | Temps estimé: " + formatDuration(summary.duration) +
      " | Mode: " + modeText +
      " | Trajet: " + typeText + rt;
  }

  function updateNavigationButtons() {
    if (!dom.btnStartNav || !dom.btnStopNav) return;
    dom.btnStartNav.disabled = !state.routeContext || state.nav.active;
    dom.btnStopNav.disabled = !state.nav.active;
  }

  function drawUserLocation(latlng, accuracyMeters, options) {
    var opts = options || {};
    userLayer.clearLayers();
    var marker = L.circleMarker(latlng, {
      radius: 8,
      color: "#fff",
      weight: 2,
      fillColor: "#0f8b6d",
      fillOpacity: 1
    }).addTo(userLayer);

    if (accuracyMeters && isFinite(accuracyMeters) && accuracyMeters > 0) {
      L.circle(latlng, {
        radius: accuracyMeters,
        color: "#0f8b6d",
        weight: 1,
        fillColor: "#0f8b6d",
        fillOpacity: 0.08
      }).addTo(userLayer);
      marker.bindPopup("Vous êtes ici (précision ±" + Math.round(accuracyMeters) + " m)");
    } else {
      marker.bindPopup("Vous êtes ici");
    }
    if (opts.openPopup === true) {
      marker.openPopup();
    }
  }

  function toRad(deg) {
    return deg * Math.PI / 180;
  }

  function distanceMeters(a, b) {
    var R = 6371000;
    var dLat = toRad(b.lat - a.lat);
    var dLon = toRad(b.lng - a.lng);
    var lat1 = toRad(a.lat);
    var lat2 = toRad(b.lat);
    var sinLat = Math.sin(dLat / 2);
    var sinLon = Math.sin(dLon / 2);
    var x = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function toLocalMeters(origin, latlng) {
    var R = 6371000;
    var x = toRad(latlng.lng - origin.lng) * Math.cos(toRad((latlng.lat + origin.lat) / 2)) * R;
    var y = toRad(latlng.lat - origin.lat) * R;
    return { x: x, y: y };
  }

  function projectPointOnSegmentMeters(point, a, b) {
    var origin = {
      lat: (point.lat + a.lat + b.lat) / 3,
      lng: (point.lng + a.lng + b.lng) / 3
    };
    var p = toLocalMeters(origin, point);
    var av = toLocalMeters(origin, a);
    var bv = toLocalMeters(origin, b);

    var abx = bv.x - av.x;
    var aby = bv.y - av.y;
    var apx = p.x - av.x;
    var apy = p.y - av.y;
    var ab2 = (abx * abx) + (aby * aby);
    var t = ab2 > 0 ? ((apx * abx) + (apy * aby)) / ab2 : 0;
    t = clampNumber(t, 0, 1);

    var projX = av.x + (abx * t);
    var projY = av.y + (aby * t);
    var dx = p.x - projX;
    var dy = p.y - projY;
    return {
      t: t,
      distance: Math.sqrt((dx * dx) + (dy * dy))
    };
  }

  function buildSegmentLengths(latlngs) {
    var lengths = [];
    if (!latlngs || latlngs.length < 2) return lengths;
    for (var i = 0; i < latlngs.length - 1; i += 1) {
      lengths.push(distanceMeters(latlngs[i], latlngs[i + 1]));
    }
    return lengths;
  }

  function sumValues(values) {
    return (values || []).reduce(function (acc, value) {
      return acc + value;
    }, 0);
  }

  function computeRouteProgress(position, routeLatLngs, segmentLengths) {
    if (!routeLatLngs || routeLatLngs.length < 2) return null;
    var bestDistance = Infinity;
    var bestIndex = 0;
    var bestT = 0;

    for (var i = 0; i < routeLatLngs.length - 1; i += 1) {
      var proj = projectPointOnSegmentMeters(position, routeLatLngs[i], routeLatLngs[i + 1]);
      if (proj.distance < bestDistance) {
        bestDistance = proj.distance;
        bestIndex = i;
        bestT = proj.t;
      }
    }

    var remaining = (1 - bestT) * (segmentLengths[bestIndex] || 0);
    for (var j = bestIndex + 1; j < segmentLengths.length; j += 1) {
      remaining += segmentLengths[j];
    }

    return {
      distanceToRoute: bestDistance,
      remainingDistance: Math.max(0, remaining),
      segmentIndex: bestIndex,
      segmentT: bestT
    };
  }

  function updateCurrentPosition(latlng, accuracy, options) {
    state.currentPosition = latlng;
    state.currentAccuracy = accuracy;
    state.currentPositionAt = Date.now();
    drawUserLocation(latlng, accuracy, options);
  }

  function normalizeSample(pos) {
    var acc = Number(pos && pos.coords && pos.coords.accuracy);
    if (!isFinite(acc) || acc <= 0) acc = 9999;
    return {
      lat: Number(pos.coords.latitude),
      lng: Number(pos.coords.longitude),
      acc: acc,
      ts: pos.timestamp || Date.now()
    };
  }

  function weightedAverageSample(samples) {
    if (!samples.length) return null;
    var sumW = 0;
    var sumLat = 0;
    var sumLng = 0;
    var bestAcc = samples[0].acc;

    samples.forEach(function (s) {
      var w = 1 / ((s.acc * s.acc) + 1);
      sumW += w;
      sumLat += s.lat * w;
      sumLng += s.lng * w;
      if (s.acc < bestAcc) bestAcc = s.acc;
    });

    if (sumW <= 0) return null;
    return {
      lat: sumLat / sumW,
      lng: sumLng / sumW,
      acc: bestAcc
    };
  }

  function stabilizeSamples(samples) {
    if (!samples.length) return null;

    var maxSampleAcc = cfg.gpsMaxSampleAccuracyMeters || 250;
    var outlierDistance = cfg.gpsOutlierDistanceMeters || 120;
    var filteredByAcc = samples.filter(function (s) { return s.acc <= maxSampleAcc; });
    if (!filteredByAcc.length) filteredByAcc = samples.slice();

    var best = filteredByAcc.reduce(function (p, c) {
      return c.acc < p.acc ? c : p;
    }, filteredByAcc[0]);

    var withoutOutliers = filteredByAcc.filter(function (s) {
      var d = distanceMeters({ lat: best.lat, lng: best.lng }, { lat: s.lat, lng: s.lng });
      return d <= outlierDistance || s.acc <= (cfg.gpsDesiredAccuracyMeters || 35);
    });
    if (!withoutOutliers.length) withoutOutliers = filteredByAcc.slice();

    return weightedAverageSample(withoutOutliers);
  }

  function makePosition(lat, lng, acc) {
    return {
      coords: {
        latitude: lat,
        longitude: lng,
        accuracy: acc
      },
      timestamp: Date.now()
    };
  }

  function getBestPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error("no geolocation"));
        return;
      }

      var maxWaitMs = cfg.gpsMaxWaitMs || 22000;
      var desiredAccuracy = cfg.gpsDesiredAccuracyMeters || 25;
      var minReadings = cfg.gpsMinReadings || 4;
      var stabilityMeters = cfg.gpsStabilityMeters || 45;
      var watchId = null;
      var samples = [];
      var done = false;

      function finish(successPos, err) {
        if (done) return;
        done = true;
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
        }
        if (successPos) {
          resolve(successPos);
        } else {
          reject(err || new Error("Position indisponible"));
        }
      }

      function tryFinishFromSamples(force) {
        if (!samples.length) return false;
        var stable = stabilizeSamples(samples);
        if (!stable) return false;
        var bestAcc = samples.reduce(function (p, c) { return c.acc < p ? c.acc : p; }, samples[0].acc);
        var farthest = 0;
        samples.forEach(function (s) {
          var d = distanceMeters({ lat: stable.lat, lng: stable.lng }, { lat: s.lat, lng: s.lng });
          if (d > farthest) farthest = d;
        });
        var enoughSamples = samples.length >= minReadings;
        var goodAccuracy = bestAcc <= desiredAccuracy;
        var stableCluster = farthest <= stabilityMeters;

        if (force || (enoughSamples && goodAccuracy && stableCluster)) {
          finish(makePosition(stable.lat, stable.lng, bestAcc), null);
          return true;
        }
        return false;
      }

      var timeoutId = setTimeout(function () {
        if (!tryFinishFromSamples(true)) {
          finish(null, new Error("Délai dépassé pour la géolocalisation."));
        }
      }, maxWaitMs);

      watchId = navigator.geolocation.watchPosition(function (pos) {
        if (!pos || !pos.coords) return;
        var s = normalizeSample(pos);
        if (!isFinite(s.lat) || !isFinite(s.lng)) return;
        samples.push(s);
        if (samples.length > 10) {
          samples.shift();
        }
        if (tryFinishFromSamples(false)) {
          clearTimeout(timeoutId);
        }
      }, function (err) {
        clearTimeout(timeoutId);
        if (!tryFinishFromSamples(true)) {
          finish(null, err);
        }
      }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: Math.max(5000, Math.floor(maxWaitMs / 2))
      });
    });
  }

  function shouldRejectGpsJump(newLatLng, newAccuracy) {
    if (!state.currentPosition || !state.currentPositionAt) return false;
    if (!cfg.gpsJumpProtection) return false;

    var previousAgeMs = Date.now() - state.currentPositionAt;
    if (previousAgeMs > (cfg.gpsJumpProtectMaxAgeMs || 5 * 60 * 1000)) return false;

    var jumpDistance = distanceMeters(
      { lat: state.currentPosition.lat, lng: state.currentPosition.lng },
      { lat: newLatLng.lat, lng: newLatLng.lng }
    );
    var maxJumpMeters = cfg.gpsJumpRejectDistanceMeters || 220;
    var accuracyTooLow = newAccuracy == null || newAccuracy > (cfg.gpsJumpRejectAccuracyMeters || 60);
    return jumpDistance > maxJumpMeters && accuracyTooLow;
  }

  function activateTab(name) {
    dom.tabs.forEach(function (tab) {
      tab.classList.toggle("is-active", tab.dataset.tab === name);
    });
    dom.tabContents.forEach(function (section) {
      section.classList.toggle("is-active", section.id === "tab-" + name);
    });
  }

  function isMobileLayout() {
    return window.matchMedia("(max-width: 980px)").matches;
  }

  function setPanelCollapsed(collapsed) {
    if (state.panelCollapsed === collapsed) return;
    state.panelCollapsed = !!collapsed;
    document.body.classList.toggle("panel-collapsed", state.panelCollapsed);
    if (dom.btnPanelToggle) {
      dom.btnPanelToggle.textContent = state.panelCollapsed ? "Afficher le panneau" : "Masquer le panneau";
    }
  }

  function syncPanelWithViewport(forceDefaultForMobile) {
    if (!isMobileLayout()) {
      setPanelCollapsed(false);
      return;
    }
    if (forceDefaultForMobile || state.panelCollapsed == null) {
      setPanelCollapsed(true);
    }
  }

  function getSupabaseReady() {
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  }

  function getFunctionsReady() {
    return !!(cfg.functionsBaseUrl && cfg.supabaseAnonKey && cfg.functionNames);
  }

  function looksLikeJwt(value) {
    if (!value) return false;
    return String(value).split(".").length === 3;
  }

  async function supabaseFetch(path, options) {
    var url = cfg.supabaseUrl.replace(/\/+$/, "") + "/rest/v1/" + path;
    var headers = Object.assign({
      apikey: cfg.supabaseAnonKey,
      Authorization: "Bearer " + cfg.supabaseAnonKey
    }, (options && options.headers) || {});
    var finalOptions = Object.assign({}, options || {}, { headers: headers });
    var res = await fetch(url, finalOptions);
    if (!res.ok) {
      var txt = await res.text();
      throw new Error("Supabase HTTP " + res.status + " - " + txt);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function functionFetch(functionName, payload) {
    if (!getFunctionsReady()) {
      throw new Error("Fonctions sécurisées non configurées.");
    }
    var fnUrl = cfg.functionsBaseUrl.replace(/\/+$/, "") + "/" + functionName;
    var headers = {
      "Content-Type": "application/json",
      apikey: cfg.supabaseAnonKey
    };
    var token = cfg.functionsAuthToken || null;
    if (!token && looksLikeJwt(cfg.supabaseAnonKey)) {
      token = cfg.supabaseAnonKey;
    }
    if (token) {
      headers.Authorization = "Bearer " + token;
    }
    var res = await fetch(fnUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload || {})
    });
    if (!res.ok) {
      var txt = await res.text();
      throw new Error("Function HTTP " + res.status + " - " + txt);
    }
    return res.json();
  }

  function poiIcon() {
    return L.divIcon({
      className: "",
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#0f8b6d;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
  }

  function reportIcon(status) {
    var color = "#f39c12";
    if (status === "NOUVEAU") color = "#e74c3c";
    if (status === "EN_COURS") color = "#f39c12";
    if (status === "RESOLU") color = "#27ae60";
    return L.divIcon({
      className: "",
      html: '<div style="width:16px;height:16px;transform:rotate(45deg);background:' + color + ';border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
  }

  function addPopupRouteHandler(marker, lat, lon) {
    marker.on("popupopen", function (evt) {
      var button = evt.popup.getElement().querySelector("[data-route-btn]");
      if (!button) return;
      button.addEventListener("click", function () {
        drawRouteTo(L.latLng(lat, lon));
      });
    });
  }

  function renderPoiMarkers(rows) {
    poiLayer.clearLayers();
    rows.forEach(function (row) {
      if (row.latitude == null || row.longitude == null) return;
      var lat = Number(row.latitude);
      var lon = Number(row.longitude);
      var marker = L.marker([lat, lon], { icon: poiIcon() }).addTo(poiLayer);
      var photoHtml = row.photo_url
        ? "<br><img src='" + escapeHtml(row.photo_url) + "' alt='Photo du lieu' style='margin-top:6px;width:190px;max-width:100%;border-radius:8px;border:1px solid #d7e4e2'>"
        : "";
      var html = "<strong>" + escapeHtml(row.name || "Lieu") + "</strong>" +
        "<br>Catégorie: " + escapeHtml(row.category || "") +
        "<br>Adresse: " + escapeHtml(row.address || "") +
        "<br>Téléphone: " + escapeHtml(row.phone || "") +
        photoHtml +
        "<br><button data-route-btn type='button'>Itinéraire vers ce lieu</button>";
      marker.bindPopup(html);
      addPopupRouteHandler(marker, lat, lon);
    });
  }

  function getFilteredReports() {
    var type = dom.filterType.value;
    var status = dom.filterStatus.value;
    return state.reports.filter(function (row) {
      var typeOk = !type || row.type === type;
      var statusOk = !status || row.status === status;
      return typeOk && statusOk;
    });
  }

  function renderReportsMarkers() {
    reportsLayer.clearLayers();
    getFilteredReports().forEach(function (row) {
      if (row.latitude == null || row.longitude == null) return;
      var lat = Number(row.latitude);
      var lon = Number(row.longitude);
      var marker = L.marker([lat, lon], { icon: reportIcon(row.status) }).addTo(reportsLayer);
      marker.bindPopup(
        "<strong>" + escapeHtml(row.title || "Signalement") + "</strong>" +
        "<br>Type: " + escapeHtml(row.type || "") +
        "<br>Statut: " + escapeHtml(row.status || "") +
        "<br>" + escapeHtml(row.description || "")
      );
    });
  }

  function focusResultOnMap(row) {
    if (!row || row.latitude == null || row.longitude == null) return;
    var lat = Number(row.latitude);
    var lon = Number(row.longitude);
    var latlng = L.latLng(lat, lon);

    searchFocusLayer.clearLayers();
    var marker = L.marker(latlng, { icon: poiIcon() }).addTo(searchFocusLayer);
    L.circleMarker(latlng, {
      radius: 15,
      color: "#1f6f8b",
      weight: 2,
      fillColor: "#1f6f8b",
      fillOpacity: 0.08
    }).addTo(searchFocusLayer);

    map.setView(latlng, cfg.searchResultZoom || 18);
    marker.bindPopup(
      "<strong>" + escapeHtml(row.name || "Lieu") + "</strong>" +
      "<br>" + escapeHtml(row.category || "") +
      "<br>" + escapeHtml(row.address || "") +
      (row.photo_url
        ? "<br><img src='" + escapeHtml(row.photo_url) + "' alt='Photo du lieu' style='margin-top:6px;width:190px;max-width:100%;border-radius:8px;border:1px solid #d7e4e2'>"
        : "")
    ).openPopup();
  }

  function showSearchMarkers(rows) {
    searchFocusLayer.clearLayers();
    if (!rows || !rows.length) return;

    if (rows.length === 1) {
      focusResultOnMap(rows[0]);
      return;
    }

    var points = [];
    rows.forEach(function (row) {
      if (row.latitude == null || row.longitude == null) return;
      var lat = Number(row.latitude);
      var lon = Number(row.longitude);
      var latlng = L.latLng(lat, lon);
      points.push(latlng);
      L.marker(latlng, { icon: poiIcon() })
        .bindPopup(
          "<strong>" + escapeHtml(row.name || "Lieu") + "</strong>" +
          "<br>" + escapeHtml(row.category || "") +
          "<br>" + escapeHtml(row.address || "") +
          (row.photo_url
            ? "<br><img src='" + escapeHtml(row.photo_url) + "' alt='Photo du lieu' style='margin-top:6px;width:190px;max-width:100%;border-radius:8px;border:1px solid #d7e4e2'>"
            : "")
        )
        .addTo(searchFocusLayer);
    });

    if (points.length) {
      map.fitBounds(L.latLngBounds(points), {
        padding: [24, 24],
        maxZoom: cfg.searchResultZoom || 17
      });
    }
  }

  function renderSearchResults(rows) {
    dom.searchResults.innerHTML = "";
    if (!rows.length) {
      searchFocusLayer.clearLayers();
      dom.searchResults.innerHTML = '<div class="result-item">Aucun résultat.</div>';
      return;
    }
    rows.forEach(function (row) {
      var item = document.createElement("div");
      item.className = "result-item";
      item.innerHTML =
        "<strong>" + escapeHtml(row.name || "Lieu") + "</strong>" +
        "<br>" + escapeHtml(row.category || "") +
        "<br><button type='button' data-action='zoom'>Voir sur la carte</button> " +
        "<button type='button' data-action='route'>Itinéraire</button>";
      var zoomButton = item.querySelector("[data-action='zoom']");
      var routeButton = item.querySelector("[data-action='route']");
      zoomButton.addEventListener("click", function () {
        focusResultOnMap(row);
      });
      routeButton.addEventListener("click", function () {
        drawRouteTo(L.latLng(Number(row.latitude), Number(row.longitude)));
      });
      dom.searchResults.appendChild(item);
    });
  }

  function runSearch() {
    var name = dom.searchName.value.trim().toLowerCase();
    var category = dom.searchCategory.value;
    var rows = state.poi.filter(function (row) {
      var byName = !name || (row.name || "").toLowerCase().indexOf(name) !== -1;
      var byCategory = !category || row.category === category;
      return byName && byCategory;
    });
    renderSearchResults(rows);
    showSearchMarkers(rows);
    setStatus(dom.searchStatus, rows.length + " résultat(s).", "success");
  }

  function clearSearch() {
    dom.searchName.value = "";
    dom.searchCategory.value = "";
    dom.searchResults.innerHTML = "";
    searchFocusLayer.clearLayers();
    setStatus(dom.searchStatus, "", null);
  }

  function clearPoiForm() {
    dom.poiName.value = "";
    dom.poiCategory.selectedIndex = 0;
    dom.poiAddress.value = "";
    dom.poiPhone.value = "";
    dom.poiDescription.value = "";
    state.selectedPoiPoint = null;
    setCoord(dom.poiCoord, null);
  }

  function clearReportForm() {
    dom.reportType.selectedIndex = 0;
    dom.reportStatus.selectedIndex = 0;
    dom.reportTitle.value = "";
    dom.reportDescription.value = "";
    state.selectedReportPoint = null;
    setCoord(dom.reportCoord, null);
  }

  function setPickPoint(target, latlng) {
    if (!isInFocusArea(latlng)) {
      var msg = "Point hors zone Camayenne. Reviens dans le rectangle.";
      if (target === "poi") {
        setStatus(dom.poiStatus, msg, "error");
      } else {
        setStatus(dom.reportStatusMessage, msg, "error");
      }
      return false;
    }
    sketchLayer.clearLayers();
    L.circleMarker(latlng, {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: "#1f6f8b",
      fillOpacity: 0.95
    }).addTo(sketchLayer);
    if (target === "poi") {
      state.selectedPoiPoint = latlng;
      setCoord(dom.poiCoord, latlng);
    } else {
      state.selectedReportPoint = latlng;
      setCoord(dom.reportCoord, latlng);
    }
    return true;
  }

  async function loadPois() {
    if (!getSupabaseReady()) return;
    var table = cfg.tables && cfg.tables.poi ? cfg.tables.poi : "poi";
    state.poi = clampRowsToFocus(await supabaseFetch(table + "?select=*&order=created_at.desc"));
    renderPoiMarkers(state.poi);
    fillRoutePlannerSelects();
  }

  async function loadReports() {
    if (!getSupabaseReady()) return;
    var table = cfg.tables && cfg.tables.reports ? cfg.tables.reports : "reports";
    state.reports = clampRowsToFocus(await supabaseFetch(table + "?select=*&order=created_at.desc"));
    renderReportsMarkers();
  }

  async function submitPoi() {
    if (cfg.allowPoiSubmission === false) {
      setStatus(dom.poiStatus, "Ajout de lieux désactivé en mode public.", "error");
      return;
    }
    if (!getSupabaseReady()) {
      setStatus(dom.poiStatus, "Configure d'abord Supabase (config.js).", "error");
      return;
    }
    if (!state.selectedPoiPoint) {
      setStatus(dom.poiStatus, "Choisis un point sur la carte.", "error");
      return;
    }
    if (!isInFocusArea(state.selectedPoiPoint)) {
      setStatus(dom.poiStatus, "Le point doit être dans la zone Camayenne.", "error");
      return;
    }
    var name = dom.poiName.value.trim();
    if (!name) {
      setStatus(dom.poiStatus, "Le nom est obligatoire.", "error");
      return;
    }
    var table = cfg.tables && cfg.tables.poi ? cfg.tables.poi : "poi";
    var payload = {
      name: name,
      category: dom.poiCategory.value,
      address: dom.poiAddress.value.trim(),
      phone: dom.poiPhone.value.trim(),
      description: dom.poiDescription.value.trim(),
      status: "ACTIF",
      latitude: state.selectedPoiPoint.lat,
      longitude: state.selectedPoiPoint.lng
    };
    try {
      await supabaseFetch(table, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify(payload)
      });
      setStatus(dom.poiStatus, "Lieu ajouté.", "success");
      clearPoiForm();
      await loadPois();
    } catch (err) {
      setStatus(dom.poiStatus, "Erreur: " + err.message, "error");
    }
  }

  async function submitReport() {
    if (!getSupabaseReady()) {
      setStatus(dom.reportStatusMessage, "Configure d'abord Supabase (config.js).", "error");
      return;
    }
    if (!state.selectedReportPoint) {
      setStatus(dom.reportStatusMessage, "Choisis un point sur la carte.", "error");
      return;
    }
    if (!isInFocusArea(state.selectedReportPoint)) {
      setStatus(dom.reportStatusMessage, "Le point doit être dans la zone Camayenne.", "error");
      return;
    }
    var title = dom.reportTitle.value.trim();
    if (!title) {
      setStatus(dom.reportStatusMessage, "Le titre est obligatoire.", "error");
      return;
    }
    var payload = {
      title: title,
      type: dom.reportType.value,
      status: dom.reportStatus.value,
      description: dom.reportDescription.value.trim(),
      latitude: state.selectedReportPoint.lat,
      longitude: state.selectedReportPoint.lng
    };
    try {
      if (cfg.useSecureFunctions) {
        var submitReportFn = (cfg.functionNames && cfg.functionNames.submitReport) || "submit-report";
        await functionFetch(submitReportFn, payload);
      } else {
        var table = cfg.tables && cfg.tables.reports ? cfg.tables.reports : "reports";
        await supabaseFetch(table, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify(payload)
        });
      }
      setStatus(dom.reportStatusMessage, "Signalement envoyé.", "success");
      clearReportForm();
      await loadReports();
    } catch (err) {
      setStatus(dom.reportStatusMessage, "Erreur: " + err.message, "error");
    }
  }

  function locateUser() {
    if (!navigator.geolocation) {
      setRouteStatus("La géolocalisation n'est pas disponible.", "error");
      return Promise.reject(new Error("no geolocation"));
    }
    return new Promise(function (resolve, reject) {
      getBestPosition().then(function (pos) {
        var latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
        var accuracy = pos.coords && pos.coords.accuracy ? pos.coords.accuracy : null;
        if (shouldRejectGpsJump(latlng, accuracy)) {
          setRouteStatus(
            "Lecture GPS instable ignorée (saut détecté). Réessaie dans 2-3 secondes.",
            "error"
          );
          if (state.currentPosition) {
            drawUserLocation(state.currentPosition, state.currentAccuracy, { openPopup: false });
            resolve(state.currentPosition);
            return;
          }
        }
        updateCurrentPosition(latlng, accuracy, { openPopup: true });
        if (cfg.keepMapFocused === true && focusBounds.contains(latlng)) {
          map.setView(latlng, cfg.defaultZoom || 17);
        } else if (cfg.keepMapFocused === true && !focusBounds.contains(latlng)) {
          map.fitBounds(focusBounds, { padding: [18, 18], maxZoom: cfg.defaultZoom || 16 });
          setRouteStatus("Position détectée hors Camayenne. Itinéraire depuis votre position possible.", "success");
        } else {
          map.setView(latlng, cfg.defaultZoom || 17);
        }
        if (accuracy && accuracy > (cfg.gpsWarnAboveMeters || 120)) {
          setRouteStatus("Position trouvée mais précision faible (±" + Math.round(accuracy) + " m). Active le GPS haute précision.", "error");
        } else if (accuracy) {
          setRouteStatus("Position détectée (précision ±" + Math.round(accuracy) + " m).", "success");
        }
        resolve(latlng);
      }).catch(function (err) {
        reject(err);
      });
    });
  }

  function setRouteContext(routeResult, destinationLatLng, options) {
    var opts = options || {};
    if (!routeResult || !routeResult.latlngs || routeResult.latlngs.length < 2 || !destinationLatLng) {
      state.routeContext = null;
      updateNavigationButtons();
      if (!state.nav.active) {
        setNavStatus("", null);
        setNavProgress("", null);
      }
      return;
    }

    var routeLatLngs = routeResult.latlngs.map(function (p) {
      return L.latLng(p.lat, p.lng);
    });
    var segmentLengths = buildSegmentLengths(routeLatLngs);
    state.routeContext = {
      destination: L.latLng(destinationLatLng.lat, destinationLatLng.lng),
      routeLatLngs: routeLatLngs,
      segmentLengths: segmentLengths,
      totalDistance: routeResult.summary && routeResult.summary.distance
        ? routeResult.summary.distance
        : sumValues(segmentLengths),
      totalDuration: routeResult.summary && routeResult.summary.duration
        ? routeResult.summary.duration
        : null,
      profile: routeResult.profile,
      preference: routeResult.preference,
      avoidMainRoads: !!routeResult.avoidMainRoads,
      roundTrip: !!routeResult.roundTrip
    };
    if (state.nav.active) {
      syncNavFromRouteContext();
    }
    if (!opts.silentHint && !state.nav.active) {
      setNavStatus("Itinéraire prêt. Clique sur 'Démarrer guidage'.", "success");
      setNavProgress("", null);
    }
    updateNavigationButtons();
  }

  function clearRouteContext() {
    state.routeContext = null;
    updateNavigationButtons();
    if (!state.nav.active) {
      setNavStatus("", null);
      setNavProgress("", null);
    }
  }

  function stopNavigation(showMessage) {
    if (state.nav.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(state.nav.watchId);
    }
    state.nav.active = false;
    state.nav.watchId = null;
    state.nav.rerouteInFlight = false;
    state.nav.lastRerouteAt = 0;
    state.nav.destination = null;
    state.nav.routeLatLngs = [];
    state.nav.segmentLengths = [];
    state.nav.totalDistance = null;
    state.nav.totalDuration = null;
    state.nav.profile = null;
    state.nav.preference = null;
    state.nav.avoidMainRoads = false;
    state.nav.roundTrip = false;
    updateNavigationButtons();
    if (showMessage !== false) {
      setNavStatus("Guidage arrêté.", null);
      setNavProgress("", null);
    }
  }

  function syncNavFromRouteContext() {
    if (!state.routeContext) return false;
    state.nav.destination = L.latLng(state.routeContext.destination.lat, state.routeContext.destination.lng);
    state.nav.routeLatLngs = state.routeContext.routeLatLngs.slice();
    state.nav.segmentLengths = state.routeContext.segmentLengths.slice();
    state.nav.totalDistance = state.routeContext.totalDistance;
    state.nav.totalDuration = state.routeContext.totalDuration;
    state.nav.profile = state.routeContext.profile;
    state.nav.preference = state.routeContext.preference;
    state.nav.avoidMainRoads = state.routeContext.avoidMainRoads;
    state.nav.roundTrip = state.routeContext.roundTrip;
    return true;
  }

  async function rerouteNavigation(reason) {
    if (!state.nav.active || !state.nav.destination || !state.currentPosition) return;
    if (state.nav.rerouteInFlight) return;
    var now = Date.now();
    var cooldown = cfg.navRerouteCooldownMs || 10000;
    if ((now - state.nav.lastRerouteAt) < cooldown) return;

    state.nav.rerouteInFlight = true;
    state.nav.lastRerouteAt = now;
    setNavStatus("Recalcul itinéraire (" + reason + ")...", "error");
    try {
      var routeResult = await drawRouteBetween(state.currentPosition, state.nav.destination, {
        profile: state.nav.profile || getSelectedRouteProfile(),
        preference: state.nav.preference || getSelectedRoutePreference(),
        avoidMainRoads: state.nav.avoidMainRoads,
        roundTrip: false,
        skipFitBounds: true
      });
      if (routeResult) {
        setRouteMetrics(routeResult.summary, routeResult.profile, routeResult.preference, routeResult.roundTrip);
        setRouteContext(routeResult, state.nav.destination, { silentHint: true });
        syncNavFromRouteContext();
        setNavStatus("Itinéraire mis à jour.", "success");
      }
    } catch (err) {
      setNavStatus("Recalcul impossible: " + err.message, "error");
    } finally {
      state.nav.rerouteInFlight = false;
    }
  }

  function updateNavigationProgress(latlng, accuracy) {
    if (!state.nav.active || !state.nav.routeLatLngs || state.nav.routeLatLngs.length < 2) return;
    var progress = computeRouteProgress(latlng, state.nav.routeLatLngs, state.nav.segmentLengths);
    if (!progress) return;

    var offRouteThreshold = cfg.navOffRouteThresholdMeters || 45;
    var arrivalDistance = cfg.navArrivalDistanceMeters || 20;
    var remainingDuration = null;
    if (state.nav.totalDuration && state.nav.totalDistance && state.nav.totalDistance > 0) {
      remainingDuration = state.nav.totalDuration * (progress.remainingDistance / state.nav.totalDistance);
    }
    var quality = "success";
    var info = "Restant: " + formatDistance(progress.remainingDistance) +
      " | Temps restant: " + (remainingDuration != null ? formatDuration(remainingDuration) : "-") +
      " | Écart route: " + Math.round(progress.distanceToRoute) + " m";

    var maxAcc = cfg.navMaxAccuracyMeters || 120;
    if (accuracy && accuracy > maxAcc) {
      quality = "error";
      info += " | GPS faible ±" + Math.round(accuracy) + " m";
    } else if (progress.distanceToRoute > offRouteThreshold) {
      quality = "error";
    }
    setNavProgress(info, quality);

    if (progress.remainingDistance <= arrivalDistance) {
      setNavStatus("Destination atteinte.", "success");
      stopNavigation(false);
      return;
    }

    if (progress.distanceToRoute > offRouteThreshold) {
      rerouteNavigation("hors trajectoire");
    } else if (!accuracy || accuracy <= maxAcc) {
      setNavStatus("Guidage actif.", "success");
    }
  }

  function handleNavigationPosition(pos) {
    if (!state.nav.active || !pos || !pos.coords) return;
    var latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
    var accuracy = pos.coords && pos.coords.accuracy ? pos.coords.accuracy : null;

    if (shouldRejectGpsJump(latlng, accuracy)) {
      setNavStatus("Lecture GPS instable ignorée.", "error");
      return;
    }

    updateCurrentPosition(latlng, accuracy, { openPopup: false });

    if (cfg.navFollowUser !== false) {
      map.panTo(latlng, { animate: true, duration: 0.5 });
    }
    updateNavigationProgress(latlng, accuracy);
  }

  async function startNavigation() {
    if (!state.routeContext) {
      setNavStatus("Calcule d'abord un itinéraire.", "error");
      return;
    }
    if (!navigator.geolocation) {
      setNavStatus("GPS non disponible sur cet appareil.", "error");
      return;
    }

    stopNavigation(false);
    state.nav.active = true;
    syncNavFromRouteContext();
    updateNavigationButtons();
    setNavStatus("Guidage démarré.", "success");
    setNavProgress("En attente de mise à jour GPS...", null);

    if (!state.currentPosition) {
      try {
        await locateUser();
      } catch (_) {
        // watchPosition ci-dessous continuera à tenter les lectures GPS
      }
    }
    if (state.currentPosition) {
      updateNavigationProgress(state.currentPosition, state.currentAccuracy);
    }

    state.nav.watchId = navigator.geolocation.watchPosition(function (pos) {
      handleNavigationPosition(pos);
    }, function (err) {
      setNavStatus("Erreur GPS: " + ((err && err.message) || "inconnue"), "error");
    }, {
      enableHighAccuracy: true,
      maximumAge: cfg.navMaximumAgeMs || 1000,
      timeout: cfg.navTimeoutMs || 12000
    });
  }

  function onRouteReady(routeResult, destinationLatLng, message) {
    if (!routeResult) return;
    setRouteStatus(message, "success");
    setRouteMetrics(routeResult.summary, routeResult.profile, routeResult.preference, routeResult.roundTrip);
    setRouteContext(routeResult, destinationLatLng);
    if (isMobileLayout()) {
      setPanelCollapsed(true);
    }
    if (cfg.navAutoStart === true) {
      startNavigation().catch(function (err) {
        setNavStatus("Impossible de démarrer le guidage: " + err.message, "error");
      });
    }
  }

  async function drawRouteBetween(fromLatLng, targetLatLng, options) {
    if (!cfg.useSecureFunctions && !cfg.openRouteServiceApiKey) {
      throw new Error("Ajoute la clé openrouteservice dans config.js.");
    }
    if (cfg.useSecureFunctions && !getFunctionsReady()) {
      throw new Error("Configure functionsBaseUrl + functionNames dans config.js.");
    }
    var from = fromLatLng;
    var profile = (options && options.profile) || getSelectedRouteProfile();
    var preference = (options && options.preference) || getSelectedRoutePreference();
    var roundTrip = !!(options && options.roundTrip);
    var skipFitBounds = !!(options && options.skipFitBounds);
    var avoidMainRoads = (options && typeof options.avoidMainRoads === "boolean")
      ? options.avoidMainRoads
      : getAvoidMainRoads();
    if (cfg.routeFromCenterWhenOutsideFocus === true && !focusBounds.contains(from)) {
      from = L.latLng(center.lat, center.lon);
    }

    var coordinates = [
      [from.lng, from.lat],
      [targetLatLng.lng, targetLatLng.lat]
    ];
    if (roundTrip) {
      coordinates.push([from.lng, from.lat]);
    }
    var payload = {
      coordinates: coordinates,
      preference: preference,
      profile: profile
    };
    if (avoidMainRoads && profile === "driving-car") {
      payload.options = {
        avoid_features: ["highways", "tollways"]
      };
    }
    var data;
    if (cfg.useSecureFunctions) {
      var routeFn = (cfg.functionNames && cfg.functionNames.route) || "route";
      data = await functionFetch(routeFn, payload);
    } else {
      var url = "https://api.openrouteservice.org/v2/directions/" + profile + "/geojson";
      var res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: cfg.openRouteServiceApiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error("openrouteservice HTTP " + res.status);
      }
      data = await res.json();
    }
    var coords = (((data || {}).features || [])[0] || {}).geometry;
    if (!coords || !coords.coordinates) {
      throw new Error("Géométrie d'itinéraire absente.");
    }
    var summary = (((data || {}).features || [])[0] || {}).properties;
    summary = summary && summary.summary ? summary.summary : null;
    var latlngs = coords.coordinates.map(function (xy) {
      return [xy[1], xy[0]];
    });
    routeLayer.clearLayers();
    L.polyline(latlngs, { color: "#1f6f8b", weight: 5, opacity: 0.9 }).addTo(routeLayer);

    if (!skipFitBounds) {
      var bothInFocus = focusBounds.contains(from) && focusBounds.contains(targetLatLng);
      if (cfg.keepMapFocused === true && bothInFocus) {
        map.fitBounds(focusBounds, { padding: [18, 18], maxZoom: cfg.defaultZoom || 16 });
      } else {
        map.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24] });
      }
    }
    return {
      summary: summary,
      profile: profile,
      preference: preference,
      roundTrip: roundTrip,
      avoidMainRoads: avoidMainRoads,
      latlngs: latlngs.map(function (pt) {
        return L.latLng(pt[0], pt[1]);
      })
    };
  }

  async function drawRouteTo(targetLatLng) {
    try {
      var from = state.currentPosition || await locateUser();
      var routeResult = await drawRouteBetween(from, targetLatLng, {
        profile: getSelectedRouteProfile(),
        preference: getSelectedRoutePreference(),
        avoidMainRoads: getAvoidMainRoads(),
        roundTrip: isRoundTripEnabled()
      });
      onRouteReady(routeResult, targetLatLng, "Itinéraire calculé.");
    } catch (err) {
      setRouteStatus("Itinéraire impossible: " + err.message, "error");
      clearRouteContext();
    }
  }

  async function routeBetweenPlaces() {
    var fromValue = dom.routeFromSelect ? dom.routeFromSelect.value : "";
    var toValue = dom.routeToSelect ? dom.routeToSelect.value : "";

    if (!fromValue || !toValue) {
      setRouteStatus("Choisis un départ et une arrivée.", "error");
      return;
    }

    try {
      var fromPoint;
      var toPoint;

      if (fromValue === "__CURRENT__" && toValue === "__CURRENT__") {
        setRouteStatus("Départ et arrivée ne peuvent pas être tous les deux 'Ma position actuelle'.", "error");
        return;
      }
      if (fromValue !== "__CURRENT__" && toValue !== "__CURRENT__" && fromValue === toValue) {
        setRouteStatus("Départ et arrivée identiques.", "error");
        return;
      }

      if (fromValue === "__CURRENT__") {
        fromPoint = state.currentPosition || await locateUser();
      } else {
        var fromPoi = getPoiById(fromValue);
        if (!fromPoi) {
          setRouteStatus("Lieu de départ introuvable.", "error");
          return;
        }
        fromPoint = pointFromRow(fromPoi);
      }

      if (toValue === "__CURRENT__") {
        toPoint = state.currentPosition || await locateUser();
      } else {
        var toPoi = getPoiById(toValue);
        if (!toPoi) {
          setRouteStatus("Lieu d'arrivée introuvable.", "error");
          return;
        }
        toPoint = pointFromRow(toPoi);
      }

      var routeResult = await drawRouteBetween(fromPoint, toPoint, {
        profile: getSelectedRouteProfile(),
        preference: getSelectedRoutePreference(),
        avoidMainRoads: getAvoidMainRoads(),
        roundTrip: isRoundTripEnabled()
      });
      onRouteReady(routeResult, toPoint, "Itinéraire calculé entre deux points.");
    } catch (err) {
      setRouteStatus("Itinéraire impossible: " + err.message, "error");
      clearRouteContext();
    }
  }

  function escapeHtml(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function applyPublicModeUi() {
    if (cfg.allowPoiSubmission !== false) return;
    if (dom.tabAddButton) {
      dom.tabAddButton.style.display = "none";
    }
    if (dom.tabAddPanel) {
      dom.tabAddPanel.style.display = "none";
    }
    if (dom.quickTabButtons && dom.quickTabButtons.length) {
      dom.quickTabButtons.forEach(function (btn) {
        if (btn.dataset.quickTab === "add") {
          btn.style.display = "none";
        }
      });
    }
    if (dom.tabs && dom.tabs.length) {
      activateTab("search");
    }
  }

  function wireEvents() {
    dom.tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        activateTab(tab.dataset.tab);
        if (isMobileLayout()) {
          setPanelCollapsed(false);
        }
      });
    });

    if (dom.quickTabButtons && dom.quickTabButtons.length) {
      dom.quickTabButtons.forEach(function (btn) {
        btn.addEventListener("click", function () {
          var targetTab = btn.dataset.quickTab;
          if (!targetTab) return;
          activateTab(targetTab);
          if (isMobileLayout()) {
            setPanelCollapsed(false);
          }
        });
      });
    }

    if (dom.btnPanelToggle) {
      dom.btnPanelToggle.addEventListener("click", function () {
        setPanelCollapsed(!state.panelCollapsed);
      });
    }

    window.addEventListener("resize", function () {
      syncPanelWithViewport(false);
    });

    dom.btnSearch.addEventListener("click", runSearch);
    dom.btnResetSearch.addEventListener("click", clearSearch);
    dom.btnLocate.addEventListener("click", function () {
      locateUser().catch(function () {
        setRouteStatus("Impossible d'obtenir la position.", "error");
      });
      if (isMobileLayout()) {
        setPanelCollapsed(true);
      }
    });
    dom.btnClearRoute.addEventListener("click", function () {
      routeLayer.clearLayers();
      setRouteStatus("", null);
      setRouteMetrics(null, null, null, null);
      stopNavigation(false);
      clearRouteContext();
    });
    dom.btnFocusArea.addEventListener("click", function () {
      map.fitBounds(focusBounds, { padding: [18, 18], maxZoom: cfg.defaultZoom || 16 });
      if (isMobileLayout()) {
        setPanelCollapsed(true);
      }
    });
    if (dom.btnSwapRoute) {
      dom.btnSwapRoute.addEventListener("click", swapRouteEndpoints);
    }
    if (dom.btnRouteBetween) {
      dom.btnRouteBetween.addEventListener("click", routeBetweenPlaces);
    }
    if (dom.btnStartNav) {
      dom.btnStartNav.addEventListener("click", function () {
        startNavigation().catch(function (err) {
          setNavStatus("Guidage impossible: " + err.message, "error");
        });
        if (isMobileLayout()) {
          setPanelCollapsed(true);
        }
      });
    }
    if (dom.btnStopNav) {
      dom.btnStopNav.addEventListener("click", function () {
        stopNavigation(true);
      });
    }

    dom.btnPickPoiPoint.addEventListener("click", function () {
      state.pickMode = "poi";
      dom.hintText.textContent = "Mode ajout lieu: clique un point sur la carte.";
      if (isMobileLayout()) {
        setPanelCollapsed(true);
      }
    });
    dom.btnPoiCenter.addEventListener("click", function () {
      setPickPoint("poi", map.getCenter());
    });
    dom.btnSubmitPoi.addEventListener("click", submitPoi);

    dom.btnPickReportPoint.addEventListener("click", function () {
      state.pickMode = "report";
      dom.hintText.textContent = "Mode signalement: clique un point sur la carte.";
      if (isMobileLayout()) {
        setPanelCollapsed(true);
      }
    });
    dom.btnReportCenter.addEventListener("click", function () {
      setPickPoint("report", map.getCenter());
    });
    dom.btnSubmitReport.addEventListener("click", submitReport);

    dom.filterType.addEventListener("change", renderReportsMarkers);
    dom.filterStatus.addEventListener("change", renderReportsMarkers);

    dom.togglePoi.addEventListener("change", function () {
      if (dom.togglePoi.checked) map.addLayer(poiLayer);
      else map.removeLayer(poiLayer);
    });
    dom.toggleReports.addEventListener("change", function () {
      if (dom.toggleReports.checked) map.addLayer(reportsLayer);
      else map.removeLayer(reportsLayer);
    });

    map.on("click", function (evt) {
      if (!state.pickMode) return;
      if (!setPickPoint(state.pickMode, evt.latlng)) return;
      state.pickMode = null;
      dom.hintText.textContent = "Point enregistré. Clique sur un marqueur pour voir les détails et lancer un itinéraire.";
    });
  }

  async function bootstrap() {
    fillSelect(dom.searchCategory, poiCategories, true);
    fillSelect(dom.poiCategory, poiCategories, false);
    fillSelect(dom.reportType, reportTypes, false);
    fillSelect(dom.reportStatus, reportStatuses, false);
    fillSelect(dom.filterType, reportTypes, true);
    fillSelect(dom.filterStatus, reportStatuses, true);
    fillRoutePlannerSelects();
    if (dom.routeProfileSelect && cfg.routingProfile) {
      dom.routeProfileSelect.value = cfg.routingProfile;
    }
    if (dom.routePreferenceSelect && cfg.routingPreference) {
      dom.routePreferenceSelect.value = cfg.routingPreference;
    }
    if (dom.routeAvoidMainRoads) {
      dom.routeAvoidMainRoads.checked = !!cfg.routeAvoidMainRoads;
    }
    applyPublicModeUi();
    updateNavigationButtons();
    syncPanelWithViewport(true);

    wireEvents();
    if (cfg.lockToFocusBounds !== false) {
      map.fitBounds(focusBounds, { padding: [18, 18], maxZoom: cfg.defaultZoom || 16 });
    }

    if (!getSupabaseReady()) {
      setStatus(dom.searchStatus, "Mode démo: renseigne config.js pour connecter la base.", "error");
      return;
    }

    try {
      await Promise.all([loadPois(), loadReports()]);
      setStatus(dom.searchStatus, "Données chargées.", "success");
    } catch (err) {
      setStatus(dom.searchStatus, "Erreur chargement: " + err.message, "error");
    }
  }

  bootstrap();
})();
