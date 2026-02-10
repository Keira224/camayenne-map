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
  var sketchLayer = L.layerGroup().addTo(map);
  var userLayer = L.layerGroup().addTo(map);
  var routeLayer = L.layerGroup().addTo(map);

  var state = {
    poi: [],
    reports: [],
    currentPosition: null,
    currentAccuracy: null,
    pickMode: null,
    selectedPoiPoint: null,
    selectedReportPoint: null
  };

  var poiCategories = cfg.poiCategories || [
    "PHARMACIE", "HOPITAL", "ECOLE", "MARCHE", "TRANSPORT", "AUTRES"
  ];
  var reportTypes = cfg.reportTypes || [
    "VOIRIE", "ECLAIRAGE", "DECHETS", "INONDATION", "SECURITE", "AUTRE"
  ];
  var reportStatuses = cfg.reportStatuses || ["NOUVEAU", "EN_COURS", "RESOLU"];

  var dom = {
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

  function drawUserLocation(latlng, accuracyMeters) {
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
      marker.bindPopup("Vous êtes ici (précision ±" + Math.round(accuracyMeters) + " m)").openPopup();
    } else {
      marker.bindPopup("Vous êtes ici").openPopup();
    }
  }

  function getBestPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error("no geolocation"));
        return;
      }

      var maxWaitMs = cfg.gpsMaxWaitMs || 18000;
      var desiredAccuracy = cfg.gpsDesiredAccuracyMeters || 35;
      var watchId = null;
      var best = null;
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

      var timeoutId = setTimeout(function () {
        if (best) {
          finish(best, null);
        } else {
          finish(null, new Error("Délai dépassé pour la géolocalisation."));
        }
      }, maxWaitMs);

      watchId = navigator.geolocation.watchPosition(function (pos) {
        if (!best || (pos.coords && pos.coords.accuracy < best.coords.accuracy)) {
          best = pos;
        }
        if (pos.coords && pos.coords.accuracy <= desiredAccuracy) {
          clearTimeout(timeoutId);
          finish(pos, null);
        }
      }, function (err) {
        clearTimeout(timeoutId);
        if (best) {
          finish(best, null);
        } else {
          finish(null, err);
        }
      }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: maxWaitMs
      });
    });
  }

  function activateTab(name) {
    dom.tabs.forEach(function (tab) {
      tab.classList.toggle("is-active", tab.dataset.tab === name);
    });
    dom.tabContents.forEach(function (section) {
      section.classList.toggle("is-active", section.id === "tab-" + name);
    });
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
      var html = "<strong>" + escapeHtml(row.name || "Lieu") + "</strong>" +
        "<br>Catégorie: " + escapeHtml(row.category || "") +
        "<br>Adresse: " + escapeHtml(row.address || "") +
        "<br>Téléphone: " + escapeHtml(row.phone || "") +
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

  function renderSearchResults(rows) {
    dom.searchResults.innerHTML = "";
    if (!rows.length) {
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
        map.setView([Number(row.latitude), Number(row.longitude)], cfg.defaultZoom || 17);
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
    setStatus(dom.searchStatus, rows.length + " résultat(s).", "success");
  }

  function clearSearch() {
    dom.searchName.value = "";
    dom.searchCategory.value = "";
    dom.searchResults.innerHTML = "";
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
        state.currentPosition = latlng;
        state.currentAccuracy = accuracy;
        drawUserLocation(latlng, accuracy);
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

  async function drawRouteBetween(fromLatLng, targetLatLng, options) {
    if (!cfg.useSecureFunctions && !cfg.openRouteServiceApiKey) {
      setRouteStatus("Ajoute la clé openrouteservice dans config.js.", "error");
      return;
    }
    if (cfg.useSecureFunctions && !getFunctionsReady()) {
      setRouteStatus("Configure functionsBaseUrl + functionNames dans config.js.", "error");
      return;
    }
    var from = fromLatLng;
    var profile = (options && options.profile) || getSelectedRouteProfile();
    var preference = (options && options.preference) || getSelectedRoutePreference();
    var roundTrip = !!(options && options.roundTrip);
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

    var bothInFocus = focusBounds.contains(from) && focusBounds.contains(targetLatLng);
    if (cfg.keepMapFocused === true && bothInFocus) {
      map.fitBounds(focusBounds, { padding: [18, 18], maxZoom: cfg.defaultZoom || 16 });
    } else {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24] });
    }
    return {
      summary: summary,
      profile: profile,
      preference: preference,
      roundTrip: roundTrip
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
      setRouteStatus("Itinéraire calculé.", "success");
      if (routeResult) {
        setRouteMetrics(routeResult.summary, routeResult.profile, routeResult.preference, routeResult.roundTrip);
      }
    } catch (err) {
      setRouteStatus("Itinéraire impossible: " + err.message, "error");
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
      setRouteStatus("Itinéraire calculé entre deux points.", "success");
      if (routeResult) {
        setRouteMetrics(routeResult.summary, routeResult.profile, routeResult.preference, routeResult.roundTrip);
      }
    } catch (err) {
      setRouteStatus("Itinéraire impossible: " + err.message, "error");
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
    if (dom.tabs && dom.tabs.length) {
      activateTab("search");
    }
  }

  function wireEvents() {
    dom.tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        activateTab(tab.dataset.tab);
      });
    });

    dom.btnSearch.addEventListener("click", runSearch);
    dom.btnResetSearch.addEventListener("click", clearSearch);
    dom.btnLocate.addEventListener("click", function () {
      locateUser().catch(function () {
        setRouteStatus("Impossible d'obtenir la position.", "error");
      });
    });
    dom.btnClearRoute.addEventListener("click", function () {
      routeLayer.clearLayers();
      setRouteStatus("", null);
      setRouteMetrics(null, null, null, null);
    });
    dom.btnFocusArea.addEventListener("click", function () {
      map.fitBounds(focusBounds, { padding: [18, 18], maxZoom: cfg.defaultZoom || 16 });
    });
    if (dom.btnSwapRoute) {
      dom.btnSwapRoute.addEventListener("click", swapRouteEndpoints);
    }
    if (dom.btnRouteBetween) {
      dom.btnRouteBetween.addEventListener("click", routeBetweenPlaces);
    }

    dom.btnPickPoiPoint.addEventListener("click", function () {
      state.pickMode = "poi";
      dom.hintText.textContent = "Mode ajout lieu: clique un point sur la carte.";
    });
    dom.btnPoiCenter.addEventListener("click", function () {
      setPickPoint("poi", map.getCenter());
    });
    dom.btnSubmitPoi.addEventListener("click", submitPoi);

    dom.btnPickReportPoint.addEventListener("click", function () {
      state.pickMode = "report";
      dom.hintText.textContent = "Mode signalement: clique un point sur la carte.";
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
