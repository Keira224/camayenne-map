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

  function normalizeFocusPolygon(rawPolygon) {
    if (!Array.isArray(rawPolygon) || rawPolygon.length < 3) return null;
    var points = rawPolygon.map(function (item) {
      if (Array.isArray(item) && item.length >= 2) {
        return L.latLng(Number(item[0]), Number(item[1]));
      }
      if (item && typeof item === "object") {
        var lat = Number(item.lat);
        var lon = Number(item.lon != null ? item.lon : item.lng);
        return L.latLng(lat, lon);
      }
      return null;
    }).filter(function (point) {
      return point && isFinite(point.lat) && isFinite(point.lng);
    });
    return points.length >= 3 ? points : null;
  }

  var focusPolygonLatLngs = normalizeFocusPolygon(cfg.focusPolygon);
  var focusBounds = focusPolygonLatLngs
    ? L.latLngBounds(focusPolygonLatLngs)
    : L.latLngBounds(
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
    var focusStyle = {
      color: "#1f6f8b",
      weight: 1.2,
      fillColor: "#1f6f8b",
      fillOpacity: 0.04
    };
    if (focusPolygonLatLngs) {
      L.polygon(focusPolygonLatLngs, focusStyle).addTo(map);
    } else {
      L.rectangle(focusBounds, focusStyle).addTo(map);
    }
  }

  var poiLayer = L.layerGroup().addTo(map);
  var reportsLayer = L.layerGroup().addTo(map);
  var searchFocusLayer = L.layerGroup().addTo(map);
  var sketchLayer = L.layerGroup().addTo(map);
  var userLayer = L.layerGroup().addTo(map);
  var routeLayer = L.layerGroup().addTo(map);
  var routeTargetLayer = L.layerGroup().addTo(map);
  var shareLayer = L.layerGroup().addTo(map);

  var state = {
    poi: [],
    reports: [],
    lang: "fr",
    currentPosition: null,
    currentAccuracy: null,
    currentPositionAt: null,
    panelCollapsed: null,
    pickMode: null,
    selectedPoiPoint: null,
    selectedReportPoint: null,
    routeContext: null,
    lastShareUrl: null,
    lastShareExpiresAt: null,
    toastTimer: null,
    aiLastResponse: null,
    nav: {
      active: false,
      watchId: null,
      rerouteInFlight: false,
      lastRerouteAt: 0,
      currentHeading: null,
      previousTrackPoint: null,
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
    langSelect: document.getElementById("langSelect"),
    btnPanelToggle: document.getElementById("btnPanelToggle"),
    quickTabButtons: document.querySelectorAll("[data-quick-tab]"),
    tabs: document.querySelectorAll(".tab"),
    tabContents: document.querySelectorAll(".tab-content"),
    tabAddButton: document.querySelector(".tab[data-tab='add']"),
    tabAddPanel: document.getElementById("tab-add"),
    btnLocate: document.getElementById("btnLocate"),
    btnClearRoute: document.getElementById("btnClearRoute"),
    btnFocusArea: document.getElementById("btnFocusArea"),
    btnShareLocation: document.getElementById("btnShareLocation"),
    btnShowShareLink: document.getElementById("btnShowShareLink"),
    btnShareWhatsApp: document.getElementById("btnShareWhatsApp"),
    btnShareNewLink: document.getElementById("btnShareNewLink"),
    shareTtlSelect: document.getElementById("shareTtlSelect"),
    shareStatus: document.getElementById("shareStatus"),
    toast: document.getElementById("toast"),
    togglePoi: document.getElementById("togglePoi"),
    toggleReports: document.getElementById("toggleReports"),
    searchName: document.getElementById("searchName"),
    searchCategory: document.getElementById("searchCategory"),
    btnSearch: document.getElementById("btnSearch"),
    btnResetSearch: document.getElementById("btnResetSearch"),
    searchResults: document.getElementById("searchResults"),
    searchStatus: document.getElementById("searchStatus"),
    aiMessageInput: document.getElementById("aiMessageInput"),
    btnAiAsk: document.getElementById("btnAiAsk"),
    btnAiClear: document.getElementById("btnAiClear"),
    aiStatus: document.getElementById("aiStatus"),
    aiResponse: document.getElementById("aiResponse"),
    aiQuickButtons: document.querySelectorAll("[data-ai-prompt]"),
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
    compassWidget: document.getElementById("compassWidget"),
    compassNeedle: document.getElementById("compassNeedle"),
    compassLabel: document.getElementById("compassLabel"),
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

  var I18N = {
    fr: {
      langLabel: "Langue",
      panelToggleHide: "Masquer le panneau",
      panelToggleShow: "Afficher le panneau",
      headerSubtitle: "Géolocalisation, POI, signalements, itinéraires | ",
      quickSearch: "Trouver",
      quickAdd: "Ajouter",
      quickReport: "Signaler",
      btnLocate: "Ma position",
      btnClearRoute: "Effacer itinéraire",
      btnFocusArea: "Zone Camayenne",
      shareTitle: "Partager ma position",
      shareDuration: "Durée du lien",
      btnShare: "Partager",
      btnShowLink: "Afficher mon lien",
      btnShareWhatsapp: "Partager WhatsApp",
      btnShareNewLink: "Générer un nouveau lien",
      togglePoi: "Afficher POI",
      toggleReports: "Afficher signalements",
      aiTitle: "Assistant public IA",
      aiHelp: "Pose une question: lieu utile, service public, orientation ou aide signalement.",
      aiPromptPharmacy: "Pharmacie proche",
      aiPromptReport: "Signaler éclairage",
      aiPromptCity: "Mairie / Police",
      aiQuestion: "Question",
      aiQuestionPh: "Ex: Où trouver un hôpital ouvert à Camayenne ?",
      btnAiAsk: "Demander à l'IA",
      btnClear: "Effacer",
      tabSearch: "Rechercher",
      tabAdd: "Ajouter lieu",
      tabReport: "Signaler",
      labelName: "Nom",
      labelCategory: "Catégorie",
      labelAddress: "Adresse",
      labelPhone: "Téléphone",
      labelDescription: "Description",
      labelType: "Type",
      labelStatusFilter: "Filtrer statut",
      labelTypeFilter: "Filtrer type",
      labelRouteFrom: "Départ",
      labelRouteTo: "Arrivée",
      routeTitle: "Itinéraire",
      routeOptions: "Options itinéraire",
      routeMode: "Mode de déplacement",
      routeType: "Type de trajet",
      routeAvoidMain: "Éviter les grands axes (si possible)",
      routeRoundTrip: "Aller-retour (A -> B -> A)",
      routeCar: "Voiture",
      routeBike: "Vélo",
      routeWalk: "Marche",
      routeShortest: "Le plus court",
      routeBalanced: "Équilibré",
      routeFastest: "Le plus rapide",
      btnSwap: "Inverser",
      btnCalcRoute: "Calculer itinéraire",
      btnStartNav: "Démarrer guidage",
      btnStopNav: "Arrêter guidage",
      poiNamePh: "Nom du lieu",
      poiAddressPh: "Adresse ou repère",
      poiPhonePh: "+224 ...",
      poiDescriptionPh: "Détails utiles",
      btnPickMap: "Choisir sur carte",
      btnUseCenter: "Utiliser centre",
      btnSend: "Envoyer",
      pointUndefined: "Point: non défini",
      pointFormat: "Point: {lat}, {lon}",
      reportInitialStatus: "Statut initial: NOUVEAU (défini automatiquement)",
      reportTitle: "Titre",
      reportTitlePh: "Ex: nid de poule",
      reportDescriptionPh: "Détails du signalement",
      hintDefault: "Clique sur un marqueur pour voir les détails et lancer un itinéraire.",
      hintPickPoi: "Mode ajout lieu: clique un point sur la carte.",
      hintPickReport: "Mode signalement: clique un point sur la carte.",
      hintPointSaved: "Point enregistré. Clique sur un marqueur pour voir les détails et lancer un itinéraire.",
      all: "Tous",
      currentPosition: "Ma position actuelle",
      place: "Lieu",
      routeToPlace: "Itinéraire vers ce lieu",
      viewOnMap: "Voir sur la carte",
      route: "Itinéraire",
      noResults: "Aucun résultat.",
      resultsCount: "{count} résultat(s).",
      assistantReady: "Assistant prêt.",
      assistantAsking: "Analyse en cours...",
      assistantAnswerReady: "Réponse générée.",
      assistantUnavailable: "IA distante indisponible. Résultats locaux affichés.",
      askQuestion: "Saisis une question.",
      questionTooLong: "Question trop longue.",
      dataLoaded: "Données chargées.",
      dataLoadError: "Erreur chargement: {error}",
      demoMode: "Mode démo: renseigne config.js pour connecter la base."
    },
    en: {
      langLabel: "Language",
      panelToggleHide: "Hide panel",
      panelToggleShow: "Show panel",
      headerSubtitle: "Geolocation, POI, reports, routes | ",
      quickSearch: "Find",
      quickAdd: "Add",
      quickReport: "Report",
      btnLocate: "My location",
      btnClearRoute: "Clear route",
      btnFocusArea: "Camayenne area",
      shareTitle: "Share my location",
      shareDuration: "Link duration",
      btnShare: "Share",
      btnShowLink: "Show my link",
      btnShareWhatsapp: "Share on WhatsApp",
      btnShareNewLink: "Generate new link",
      togglePoi: "Show POI",
      toggleReports: "Show reports",
      aiTitle: "Public AI assistant",
      aiHelp: "Ask about useful places, public services, directions or reporting help.",
      aiPromptPharmacy: "Nearest pharmacy",
      aiPromptReport: "Report lighting",
      aiPromptCity: "City hall / Police",
      aiQuestion: "Question",
      aiQuestionPh: "Ex: Where can I find an open hospital in Camayenne?",
      btnAiAsk: "Ask AI",
      btnClear: "Clear",
      tabSearch: "Search",
      tabAdd: "Add place",
      tabReport: "Report",
      labelName: "Name",
      labelCategory: "Category",
      labelAddress: "Address",
      labelPhone: "Phone",
      labelDescription: "Description",
      labelType: "Type",
      labelStatusFilter: "Filter status",
      labelTypeFilter: "Filter type",
      labelRouteFrom: "From",
      labelRouteTo: "To",
      routeTitle: "Route",
      routeOptions: "Route options",
      routeMode: "Travel mode",
      routeType: "Trip type",
      routeAvoidMain: "Avoid major roads (if possible)",
      routeRoundTrip: "Round trip (A -> B -> A)",
      routeCar: "Car",
      routeBike: "Bike",
      routeWalk: "Walk",
      routeShortest: "Shortest",
      routeBalanced: "Balanced",
      routeFastest: "Fastest",
      btnSwap: "Swap",
      btnCalcRoute: "Calculate route",
      btnStartNav: "Start guidance",
      btnStopNav: "Stop guidance",
      poiNamePh: "Place name",
      poiAddressPh: "Address or landmark",
      poiPhonePh: "+224 ...",
      poiDescriptionPh: "Useful details",
      btnPickMap: "Pick on map",
      btnUseCenter: "Use center",
      btnSend: "Send",
      pointUndefined: "Point: undefined",
      pointFormat: "Point: {lat}, {lon}",
      reportInitialStatus: "Initial status: NEW (set automatically)",
      reportTitle: "Title",
      reportTitlePh: "Ex: pothole",
      reportDescriptionPh: "Report details",
      hintDefault: "Click a marker to view details and start a route.",
      hintPickPoi: "Add place mode: click a point on the map.",
      hintPickReport: "Report mode: click a point on the map.",
      hintPointSaved: "Point saved. Click a marker to view details and start a route.",
      all: "All",
      currentPosition: "My current location",
      place: "Place",
      routeToPlace: "Route to this place",
      viewOnMap: "View on map",
      route: "Route",
      noResults: "No results.",
      resultsCount: "{count} result(s).",
      assistantReady: "Assistant ready.",
      assistantAsking: "Analyzing...",
      assistantAnswerReady: "Answer generated.",
      assistantUnavailable: "Remote AI unavailable. Local results displayed.",
      askQuestion: "Enter a question.",
      questionTooLong: "Question is too long.",
      dataLoaded: "Data loaded.",
      dataLoadError: "Loading error: {error}",
      demoMode: "Demo mode: fill config.js to connect the database."
    }
  };

  function getInitialLang() {
    var fallback = (cfg.defaultLanguage || "fr").toLowerCase() === "en" ? "en" : "fr";
    try {
      var saved = localStorage.getItem("camayenne_lang");
      if (saved === "fr" || saved === "en") return saved;
    } catch (_) {
      // ignore localStorage errors
    }
    return fallback;
  }

  function t(key, vars) {
    var lang = state.lang === "en" ? "en" : "fr";
    var value = (I18N[lang] && I18N[lang][key]) || (I18N.fr && I18N.fr[key]) || key;
    if (!vars) return value;
    return value.replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] != null ? String(vars[k]) : "";
    });
  }

  function setText(node, value) {
    if (node) node.textContent = value;
  }

  function setLabel(forId, value) {
    var node = document.querySelector("label[for='" + forId + "']");
    if (node) node.textContent = value;
  }

  function setInputPlaceholder(node, value) {
    if (node) node.placeholder = value;
  }

  function applyPublicLanguage() {
    setLabel("langSelect", t("langLabel"));
    var subtitleNode = document.querySelector(".panel-header p");
    if (subtitleNode) {
      var link = subtitleNode.querySelector("a");
      subtitleNode.innerHTML = "";
      subtitleNode.appendChild(document.createTextNode(t("headerSubtitle")));
      if (link) subtitleNode.appendChild(link);
    }

    if (dom.btnPanelToggle) {
      dom.btnPanelToggle.textContent = state.panelCollapsed ? t("panelToggleShow") : t("panelToggleHide");
    }

    setText(document.querySelector("[data-quick-tab='search']"), t("quickSearch"));
    setText(document.querySelector("[data-quick-tab='add']"), t("quickAdd"));
    setText(document.querySelector("[data-quick-tab='report']"), t("quickReport"));

    setText(dom.btnLocate, t("btnLocate"));
    setText(dom.btnClearRoute, t("btnClearRoute"));
    setText(dom.btnFocusArea, t("btnFocusArea"));
    setText(dom.btnShareLocation, t("btnShare"));
    setText(dom.btnShowShareLink, t("btnShowLink"));
    setText(dom.btnShareWhatsApp, t("btnShareWhatsapp"));
    setText(dom.btnShareNewLink, t("btnShareNewLink"));

    setLabel("shareTtlSelect", t("shareDuration"));
    setText(document.querySelector(".share-actions .cam-subtitle"), t("shareTitle"));
    setText(document.querySelector(".ai-assistant .cam-subtitle"), t("aiTitle"));
    setText(document.querySelector(".ai-help"), t("aiHelp"));

    setLabel("aiMessageInput", t("aiQuestion"));
    setInputPlaceholder(dom.aiMessageInput, t("aiQuestionPh"));
    setText(dom.btnAiAsk, t("btnAiAsk"));
    setText(dom.btnAiClear, t("btnClear"));

    setText(document.querySelector(".tab[data-tab='search']"), t("tabSearch"));
    setText(document.querySelector(".tab[data-tab='add']"), t("tabAdd"));
    setText(document.querySelector(".tab[data-tab='report']"), t("tabReport"));

    setLabel("searchName", t("labelName"));
    setLabel("searchCategory", t("labelCategory"));
    setText(dom.btnSearch, t("tabSearch"));
    setText(dom.btnResetSearch, t("btnClear"));
    setText(document.querySelector("#tab-search .cam-subtitle"), t("routeTitle"));
    setLabel("routeFromSelect", t("labelRouteFrom"));
    setLabel("routeToSelect", t("labelRouteTo"));
    setText(document.querySelector(".advanced-options summary"), t("routeOptions"));
    setLabel("routeProfileSelect", t("routeMode"));
    setLabel("routePreferenceSelect", t("routeType"));
    var routeToggleLabels = document.querySelectorAll(".route-toggle");
    if (routeToggleLabels.length > 0) routeToggleLabels[0].lastChild.textContent = " " + t("routeAvoidMain");
    if (routeToggleLabels.length > 1) routeToggleLabels[1].lastChild.textContent = " " + t("routeRoundTrip");
    setText(dom.btnSwapRoute, t("btnSwap"));
    setText(dom.btnRouteBetween, t("btnCalcRoute"));
    setText(dom.btnStartNav, t("btnStartNav"));
    setText(dom.btnStopNav, t("btnStopNav"));

    setLabel("poiName", t("labelName"));
    setLabel("poiCategory", t("labelCategory"));
    setLabel("poiAddress", t("labelAddress"));
    setLabel("poiPhone", t("labelPhone"));
    setLabel("poiDescription", t("labelDescription"));
    setInputPlaceholder(dom.poiName, t("poiNamePh"));
    setInputPlaceholder(dom.poiAddress, t("poiAddressPh"));
    setInputPlaceholder(dom.poiPhone, t("poiPhonePh"));
    setInputPlaceholder(dom.poiDescription, t("poiDescriptionPh"));
    setText(dom.btnPickPoiPoint, t("btnPickMap"));
    setText(dom.btnPoiCenter, t("btnUseCenter"));
    setText(dom.btnSubmitPoi, t("btnSend"));

    setLabel("reportType", t("labelType"));
    var initialStatusNode = document.querySelector("#tab-report .status");
    if (initialStatusNode) initialStatusNode.textContent = t("reportInitialStatus");
    setLabel("reportTitle", t("reportTitle"));
    setLabel("reportDescription", t("labelDescription"));
    setInputPlaceholder(dom.reportTitle, t("reportTitlePh"));
    setInputPlaceholder(dom.reportDescription, t("reportDescriptionPh"));
    setText(dom.btnPickReportPoint, t("btnPickMap"));
    setText(dom.btnReportCenter, t("btnUseCenter"));
    setText(dom.btnSubmitReport, t("btnSend"));
    setLabel("filterType", t("labelTypeFilter"));
    setLabel("filterStatus", t("labelStatusFilter"));

    var toggles = document.querySelectorAll(".layer-toggles label");
    if (toggles.length > 0) toggles[0].lastChild.textContent = " " + t("togglePoi");
    if (toggles.length > 1) toggles[1].lastChild.textContent = " " + t("toggleReports");

    if (dom.hintText && !state.pickMode) {
      dom.hintText.textContent = t("hintDefault");
    }

    if (dom.aiQuickButtons && dom.aiQuickButtons.length >= 3) {
      dom.aiQuickButtons[0].textContent = t("aiPromptPharmacy");
      dom.aiQuickButtons[0].dataset.aiPrompt = state.lang === "en"
        ? "Where is the nearest pharmacy?"
        : "Où est la pharmacie la plus proche ?";
      dom.aiQuickButtons[1].textContent = t("aiPromptReport");
      dom.aiQuickButtons[1].dataset.aiPrompt = state.lang === "en"
        ? "How do I report a streetlight issue?"
        : "Comment signaler un problème d'éclairage ?";
      dom.aiQuickButtons[2].textContent = t("aiPromptCity");
      dom.aiQuickButtons[2].dataset.aiPrompt = state.lang === "en"
        ? "I am looking for city hall and police in Camayenne"
        : "Je cherche la mairie et la police à Camayenne";
    }

    if (dom.routeProfileSelect) {
      var profileLabels = {
        "driving-car": t("routeCar"),
        "cycling-regular": t("routeBike"),
        "foot-walking": t("routeWalk")
      };
      Array.prototype.forEach.call(dom.routeProfileSelect.options, function (opt) {
        if (profileLabels[opt.value]) opt.textContent = profileLabels[opt.value];
      });
    }
    if (dom.routePreferenceSelect) {
      var prefLabels = {
        shortest: t("routeShortest"),
        recommended: t("routeBalanced"),
        fastest: t("routeFastest")
      };
      Array.prototype.forEach.call(dom.routePreferenceSelect.options, function (opt) {
        if (prefLabels[opt.value]) opt.textContent = prefLabels[opt.value];
      });
    }

    if (dom.langSelect) {
      dom.langSelect.value = state.lang;
    }
    document.documentElement.setAttribute("lang", state.lang);

    setCoord(dom.poiCoord, state.selectedPoiPoint);
    setCoord(dom.reportCoord, state.selectedReportPoint);
    fillRoutePlannerSelects();
  }

  function setLanguage(lang, persist) {
    state.lang = lang === "en" ? "en" : "fr";
    applyPublicLanguage();
    if (persist !== false) {
      try {
        localStorage.setItem("camayenne_lang", state.lang);
      } catch (_) {
        // ignore localStorage errors
      }
    }
  }

  function isPointInPolygon(latlng, polygonLatLngs) {
    if (!latlng || !polygonLatLngs || polygonLatLngs.length < 3) return false;
    var x = latlng.lng;
    var y = latlng.lat;
    var inside = false;
    for (var i = 0, j = polygonLatLngs.length - 1; i < polygonLatLngs.length; j = i++) {
      var xi = polygonLatLngs[i].lng;
      var yi = polygonLatLngs[i].lat;
      var xj = polygonLatLngs[j].lng;
      var yj = polygonLatLngs[j].lat;

      var intersects = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function isInFocusArea(latlng) {
    if (!cfg.enforceFocusBounds) return true;
    if (focusPolygonLatLngs) {
      return isPointInPolygon(latlng, focusPolygonLatLngs);
    }
    return focusBounds.contains(latlng);
  }

  function pointFromRow(row) {
    return L.latLng(Number(row.latitude), Number(row.longitude));
  }

  function clampRowsToFocus(rows) {
    if (!cfg.focusOnlyData) return rows;
    return rows.filter(function (row) {
      if (row.latitude == null || row.longitude == null) return false;
      return isInFocusArea(pointFromRow(row));
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

  function setShareStatus(message, level) {
    setStatus(dom.shareStatus, message, level);
  }

  function setAiStatus(message, level) {
    setStatus(dom.aiStatus, message, level);
  }

  function showToast(message) {
    if (!dom.toast) return;
    dom.toast.textContent = message || "";
    dom.toast.classList.add("is-visible");
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
    }
    state.toastTimer = setTimeout(function () {
      dom.toast.classList.remove("is-visible");
    }, 2200);
  }

  function setNavStatus(message, level) {
    setStatus(dom.navStatus, message, level);
  }

  function setNavProgress(message, level) {
    setStatus(dom.navProgress, message, level);
  }

  function setCoord(node, latlng) {
    if (!latlng) {
      node.textContent = t("pointUndefined");
      return;
    }
    node.textContent = t("pointFormat", {
      lat: latlng.lat.toFixed(6),
      lon: latlng.lng.toFixed(6)
    });
  }

  function fillSelect(selectNode, values, includeAll) {
    if (!selectNode) return;
    selectNode.innerHTML = "";
    if (includeAll) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = t("all");
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
    currentOpt.textContent = t("currentPosition");
    dom.routeFromSelect.appendChild(currentOpt);
    dom.routeToSelect.appendChild(currentOpt.cloneNode(true));

    state.poi.forEach(function (row) {
      var label = (row.name || t("place")) + " (" + (row.category || "") + ")";

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
    var typeText = preference === "shortest" ? t("routeShortest").toLowerCase() : (preference === "fastest" ? t("routeFastest").toLowerCase() : t("routeBalanced").toLowerCase());
    var modeText = profile === "foot-walking" ? t("routeWalk") : (profile === "cycling-regular" ? t("routeBike") : t("routeCar"));
    var rt = roundTrip ? " | " + (state.lang === "en" ? "Round trip" : "Aller-retour") : "";
    dom.routeMetrics.textContent =
      "Distance: " + formatDistance(summary.distance) +
      " | " + (state.lang === "en" ? "Est. time" : "Temps estimé") + ": " + formatDuration(summary.duration) +
      " | " + (state.lang === "en" ? "Mode" : "Mode") + ": " + modeText +
      " | " + (state.lang === "en" ? "Trip" : "Trajet") + ": " + typeText + rt;
  }

  function updateNavigationButtons() {
    if (!dom.btnStartNav || !dom.btnStopNav) return;
    dom.btnStartNav.disabled = !state.routeContext || state.nav.active;
    dom.btnStopNav.disabled = !state.nav.active;
  }

  function getNavigationDisplayHeading(latlng, explicitHeading) {
    if (!state.nav.active) return null;
    var heading = normalizeDegrees(explicitHeading != null ? explicitHeading : state.nav.currentHeading);
    if (heading != null) return heading;
    if (latlng && state.nav.destination) {
      return bearingDegrees(latlng, state.nav.destination);
    }
    return null;
  }

  function drawUserLocation(latlng, accuracyMeters, options) {
    var opts = options || {};
    userLayer.clearLayers();
    var navHeading = getNavigationDisplayHeading(latlng, opts.heading);
    var headingMarker = null;

    if (navHeading != null) {
      headingMarker = L.marker(latlng, {
        icon: L.divIcon({
          className: "",
          html:
            '<div class="user-heading-wrap">' +
            '<div class="user-heading-arrow" style="transform: rotate(' + Math.round(navHeading) + 'deg)"></div>' +
            '<div class="user-heading-dot"></div>' +
            '</div>',
          iconSize: [38, 38],
          iconAnchor: [19, 19]
        })
      }).addTo(userLayer);
    }

    var marker = L.circleMarker(latlng, {
      radius: navHeading != null ? 6 : 8,
      color: "#fff",
      weight: 2,
      fillColor: "#1a73e8",
      fillOpacity: 1
    }).addTo(userLayer);

    if (accuracyMeters && isFinite(accuracyMeters) && accuracyMeters > 0) {
      L.circle(latlng, {
        radius: accuracyMeters,
        color: "#0f8b6d",
        weight: 1,
        fillColor: "#1a73e8",
        fillOpacity: 0.08
      }).addTo(userLayer);
      (headingMarker || marker).bindPopup((state.lang === "en" ? "You are here" : "Vous êtes ici") + " (" + (state.lang === "en" ? "accuracy" : "précision") + " ±" + Math.round(accuracyMeters) + " m)");
    } else {
      (headingMarker || marker).bindPopup(state.lang === "en" ? "You are here" : "Vous êtes ici");
    }
    if (opts.openPopup === true) {
      (headingMarker || marker).openPopup();
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

  function normalizeDegrees(value) {
    var v = Number(value);
    if (!isFinite(v)) return null;
    v = v % 360;
    if (v < 0) v += 360;
    return v;
  }

  function bearingDegrees(from, to) {
    var lat1 = toRad(from.lat);
    var lat2 = toRad(to.lat);
    var dLon = toRad(to.lng - from.lng);
    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return normalizeDegrees((Math.atan2(y, x) * 180 / Math.PI));
  }

  function shortestAngleDiff(target, base) {
    var t = normalizeDegrees(target);
    var b = normalizeDegrees(base);
    if (t == null || b == null) return null;
    var d = t - b;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  function setCompassVisible(visible) {
    if (!dom.compassWidget) return;
    dom.compassWidget.hidden = !visible;
  }

  function updateCompass(latlng, heading) {
    if (!dom.compassWidget || !dom.compassNeedle || !dom.compassLabel) return;
    if (!state.nav.active || !state.nav.destination || !latlng) {
      setCompassVisible(false);
      return;
    }

    setCompassVisible(true);
    var capDest = bearingDegrees(latlng, state.nav.destination);
    var userHeading = normalizeDegrees(heading != null ? heading : state.nav.currentHeading);
    var needleRotation;
    var label;

    if (capDest == null) {
      dom.compassLabel.textContent = state.lang === "en" ? "Compass" : "Boussole";
      return;
    }

    if (userHeading == null) {
      needleRotation = capDest;
      label = (state.lang === "en" ? "Heading " : "Cap ") + Math.round(capDest) + "°";
    } else {
      var rel = shortestAngleDiff(capDest, userHeading);
      needleRotation = rel;
      label = (state.lang === "en" ? "Turn " : "Tourne ") + (rel >= 0 ? "+" : "") + Math.round(rel) + "°";
    }

    dom.compassNeedle.style.transform = "rotate(" + Math.round(needleRotation) + "deg)";
    dom.compassLabel.textContent = label;
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

  function shouldRejectGpsJump(newLatLng, newAccuracy, options) {
    var opts = options || {};
    if (opts.forceFresh === true) return false;
    if (!state.currentPosition || !state.currentPositionAt) return false;
    if (!cfg.gpsJumpProtection) return false;

    var previousAgeMs = Date.now() - state.currentPositionAt;
    if (previousAgeMs > (cfg.gpsJumpProtectMaxAgeMs || 5 * 60 * 1000)) return false;
    var previousAccuracy = state.currentAccuracy;
    if (
      previousAccuracy &&
      newAccuracy &&
      isFinite(previousAccuracy) &&
      isFinite(newAccuracy) &&
      newAccuracy <= (previousAccuracy * 0.8)
    ) {
      return false;
    }

    var jumpDistance = distanceMeters(
      { lat: state.currentPosition.lat, lng: state.currentPosition.lng },
      { lat: newLatLng.lat, lng: newLatLng.lng }
    );
    var maxJumpMeters = cfg.gpsJumpRejectDistanceMeters || 220;
    var accuracyTooLow = newAccuracy == null || newAccuracy > (cfg.gpsJumpRejectAccuracyMeters || 60);
    return jumpDistance > maxJumpMeters && accuracyTooLow;
  }

  function isCurrentPositionFresh(maxAgeMs) {
    if (!state.currentPosition || !state.currentPositionAt) return false;
    var maxAge = maxAgeMs != null ? maxAgeMs : (cfg.currentPositionMaxAgeMs || 45000);
    return (Date.now() - state.currentPositionAt) <= maxAge;
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
      dom.btnPanelToggle.textContent = state.panelCollapsed ? t("panelToggleShow") : t("panelToggleHide");
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

  function getFunctionName(key, fallbackName) {
    if (cfg.functionNames && cfg.functionNames[key]) {
      return cfg.functionNames[key];
    }
    return fallbackName;
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
      var error = new Error("Function HTTP " + res.status + " - " + txt);
      error.status = res.status;
      error.body = txt;
      throw error;
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

  function addPopupRouteHandler(marker, lat, lon, row) {
    marker.on("popupopen", function (evt) {
      var button = evt.popup.getElement().querySelector("[data-route-btn]");
      if (!button) return;
      button.addEventListener("click", function () {
        drawRouteTo(L.latLng(lat, lon), row || null);
      });
    });
  }

  function drawRouteTargetMarker(targetLatLng, meta) {
    routeTargetLayer.clearLayers();
    if (!targetLatLng) return;

    var marker = L.marker(targetLatLng, { icon: destinationIcon() }).addTo(routeTargetLayer);
    var photoUrl = getPoiPhotoUrl(meta || {});
    var title = escapeHtml((meta && meta.name) || (state.lang === "en" ? "Destination" : "Destination"));
    var category = escapeHtml((meta && meta.category) || "");
    marker.bindPopup(
      "<strong>" + title + "</strong>" +
      (category ? "<br>" + category : "") +
      (photoUrl
        ? "<br><img src='" + escapeHtml(photoUrl) + "' alt='Photo destination' style='margin-top:6px;width:190px;max-width:100%;border-radius:8px;border:1px solid #d7e4e2'>"
        : "")
    );
  }

  function renderPoiMarkers(rows) {
    poiLayer.clearLayers();
    rows.forEach(function (row) {
      if (row.latitude == null || row.longitude == null) return;
      var lat = Number(row.latitude);
      var lon = Number(row.longitude);
      var marker = L.marker([lat, lon], { icon: poiIcon() }).addTo(poiLayer);
      var photoUrl = getPoiPhotoUrl(row);
      var photoHtml = photoUrl
        ? "<br><img src='" + escapeHtml(photoUrl) + "' alt='Photo du lieu' style='margin-top:6px;width:190px;max-width:100%;border-radius:8px;border:1px solid #d7e4e2'>"
        : "";
      var html = "<strong>" + escapeHtml(row.name || t("place")) + "</strong>" +
        "<br>" + t("labelCategory") + ": " + escapeHtml(row.category || "") +
        "<br>" + t("labelAddress") + ": " + escapeHtml(row.address || "") +
        "<br>" + t("labelPhone") + ": " + escapeHtml(row.phone || "") +
        photoHtml +
        "<br><button data-route-btn type='button'>" + t("routeToPlace") + "</button>";
      marker.bindPopup(html);
      addPopupRouteHandler(marker, lat, lon, row);
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
        "<strong>" + escapeHtml(row.title || t("tabReport")) + "</strong>" +
        "<br>" + t("labelType") + ": " + escapeHtml(row.type || "") +
        "<br>" + t("labelStatusFilter").replace("Filtrer ", "").replace("Filter ", "") + ": " + escapeHtml(row.status || "") +
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
      "<strong>" + escapeHtml(row.name || t("place")) + "</strong>" +
      "<br>" + escapeHtml(row.category || "") +
      "<br>" + escapeHtml(row.address || "") +
      (getPoiPhotoUrl(row)
        ? "<br><img src='" + escapeHtml(getPoiPhotoUrl(row)) + "' alt='Photo du lieu' style='margin-top:6px;width:190px;max-width:100%;border-radius:8px;border:1px solid #d7e4e2'>"
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
          "<strong>" + escapeHtml(row.name || t("place")) + "</strong>" +
          "<br>" + escapeHtml(row.category || "") +
          "<br>" + escapeHtml(row.address || "") +
          (getPoiPhotoUrl(row)
            ? "<br><img src='" + escapeHtml(getPoiPhotoUrl(row)) + "' alt='Photo du lieu' style='margin-top:6px;width:190px;max-width:100%;border-radius:8px;border:1px solid #d7e4e2'>"
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
      dom.searchResults.innerHTML = '<div class="result-item">' + escapeHtml(t("noResults")) + "</div>";
      return;
    }
    rows.forEach(function (row) {
      var item = document.createElement("div");
      item.className = "result-item";
      item.innerHTML =
        "<strong>" + escapeHtml(row.name || t("place")) + "</strong>" +
        "<br>" + escapeHtml(row.category || "") +
        "<br><button type='button' data-action='zoom'>" + t("viewOnMap") + "</button> " +
        "<button type='button' data-action='route'>" + t("route") + "</button>";
      var zoomButton = item.querySelector("[data-action='zoom']");
      var routeButton = item.querySelector("[data-action='route']");
      zoomButton.addEventListener("click", function () {
        focusResultOnMap(row);
      });
      routeButton.addEventListener("click", function () {
        drawRouteTo(L.latLng(Number(row.latitude), Number(row.longitude)), row);
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
    setStatus(dom.searchStatus, t("resultsCount", { count: rows.length }), "success");
  }

  function clearSearch() {
    dom.searchName.value = "";
    dom.searchCategory.value = "";
    dom.searchResults.innerHTML = "";
    searchFocusLayer.clearLayers();
    setStatus(dom.searchStatus, "", null);
  }

  function destinationIcon() {
    return L.icon({
      iconUrl: "./assets/icons/destination-pin.png",
      iconSize: [36, 36],
      iconAnchor: [18, 34],
      popupAnchor: [0, -30]
    });
  }

  function getPoiPhotoUrl(row) {
    if (!row) return "";
    var directUrl = String(row.photo_url || "").trim();
    if (directUrl) return directUrl;

    var rawPath = String(row.photo_path || "").trim();
    if (!rawPath) return "";
    if (/^https?:\/\//i.test(rawPath)) return rawPath;
    if (!cfg.supabaseUrl) return "";

    var path = rawPath.replace(/^\/+/, "");
    if (path.indexOf("poi-photos/") === 0) {
      path = path.substring("poi-photos/".length);
    }
    return String(cfg.supabaseUrl).replace(/\/+$/, "") + "/storage/v1/object/public/poi-photos/" + path;
  }

  function clearAiResponse() {
    if (!dom.aiResponse) return;
    dom.aiResponse.innerHTML = "";
    state.aiLastResponse = null;
  }

  function buildLocalAiFallback(message) {
    var query = String(message || "").trim().toLowerCase();
    var stopWords = {
      "dans": true, "avec": true, "pour": true, "sans": true, "vers": true, "sur": true, "sous": true,
      "entre": true, "depuis": true, "par": true, "est": true, "comment": true, "quand": true, "quel": true,
      "quelle": true, "quels": true, "quelles": true, "peux": true, "peut": true, "pouvez": true,
      "veux": true, "veut": true, "plus": true, "moins": true, "camayenne": true, "conakry": true
    };
    var words = query.split(/\s+/).filter(function (w) {
      return w.length > 2 && !stopWords[w];
    });
    var categoryHints = [];
    if (query.indexOf("pharm") >= 0) categoryHints.push("PHARMACIE");
    if (query.indexOf("hopit") >= 0 || query.indexOf("hôpital") >= 0) categoryHints.push("HOPITAL");
    if (query.indexOf("police") >= 0 || query.indexOf("sécur") >= 0 || query.indexOf("secur") >= 0) categoryHints.push("ADMINISTRATION");
    if (query.indexOf("mairie") >= 0 || query.indexOf("administr") >= 0) categoryHints.push("ADMINISTRATION");
    if (query.indexOf("ecole") >= 0 || query.indexOf("école") >= 0) categoryHints.push("ECOLE");
    if (query.indexOf("mosquée") >= 0 || query.indexOf("mosquee") >= 0) categoryHints.push("MOSQUEE");
    if (query.indexOf("banque") >= 0 || query.indexOf("atm") >= 0) categoryHints.push("BANQUE_ATM");
    if (query.indexOf("restaurant") >= 0 || query.indexOf("manger") >= 0) categoryHints.push("RESTAURANT");

    var isReportIntent = query.indexOf("signaler") >= 0 || query.indexOf("signalement") >= 0 ||
      query.indexOf("incident") >= 0 || query.indexOf("probl") >= 0;
    var isRouteIntent = query.indexOf("itin") >= 0 || query.indexOf("route") >= 0 ||
      query.indexOf("trajet") >= 0 || query.indexOf("guidage") >= 0;
    var isPlaceHint = query.indexOf("où") >= 0 || query.indexOf("ou ") >= 0 || query.indexOf("trouver") >= 0 ||
      query.indexOf("proche") >= 0 || query.indexOf("près") >= 0 || query.indexOf("pres") >= 0 ||
      query.indexOf("adresse") >= 0;
    var isPlaceIntent = categoryHints.length > 0 || isRouteIntent || isPlaceHint;
    var asksNearest = query.indexOf("plus proche") >= 0 || query.indexOf("proche") >= 0 ||
      query.indexOf("près") >= 0 || query.indexOf("pres") >= 0;

    if (isReportIntent && !isPlaceIntent) {
      return {
        answer: "Pour signaler: ouvre l'onglet 'Signaler', choisis le type, place le point sur la carte puis valide.",
        suggestions: []
      };
    }

    var ranked = state.poi.map(function (row) {
      if (!isFinite(Number(row.latitude)) || !isFinite(Number(row.longitude))) {
        return null;
      }
      var name = String(row.name || "").toLowerCase();
      var category = String(row.category || "").toLowerCase();
      var address = String(row.address || "").toLowerCase();
      var description = String(row.description || "").toLowerCase();
      var score = 0;
      words.forEach(function (w) {
        if (name.indexOf(w) >= 0) score += 7;
        if (category.indexOf(w) >= 0) score += 6;
        if (address.indexOf(w) >= 0) score += 3;
        if (description.indexOf(w) >= 0) score += 1;
      });
      if (categoryHints.length && categoryHints.indexOf(row.category) >= 0) score += 14;
      if (query && (row.name || "").toLowerCase().indexOf(query) >= 0) score += 5;
      var distance = null;
      if (state.currentPosition) {
        distance = distanceMeters(state.currentPosition, L.latLng(Number(row.latitude), Number(row.longitude)));
        if (isFinite(distance)) {
          if (distance < 400) score += 8;
          else if (distance < 1000) score += 5;
          else if (distance < 2500) score += 3;
        }
      }
      return { row: row, score: score, distance: distance };
    }).filter(function (item) {
      if (!item) return false;
      var minScore = categoryHints.length ? 12 : 7;
      if (item.score < minScore) return false;
      if (asksNearest && isFinite(item.distance) && item.distance > 7000) return false;
      return true;
    }).sort(function (a, b) {
      if (asksNearest && isFinite(a.distance) && isFinite(b.distance) && a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return b.score - a.score;
    }).slice(0, cfg.aiPublicMaxSuggestions || 5).map(function (item) {
      return {
        id: item.row.id,
        name: item.row.name,
        category: item.row.category,
        address: item.row.address,
        latitude: Number(item.row.latitude),
        longitude: Number(item.row.longitude),
        distanceMeters: isFinite(item.distance) ? Math.round(item.distance) : null
      };
    });

    var answer = "Je n'ai pas pu contacter le service IA distant. Voici les lieux les plus pertinents trouvés localement.";
    if (!ranked.length) {
      if (isRouteIntent) {
        answer = "Je n'ai pas trouvé de destination claire. Essaie: 'pharmacie la plus proche' ou 'mairie de Camayenne'.";
      } else if (!isPlaceIntent) {
        answer = "Je peux surtout aider pour trouver des lieux et itinéraires. Exemple: 'où est la pharmacie la plus proche ?'.";
      } else {
        answer = "Je n'ai pas trouvé de lieu correspondant. Essaie avec plus de détails (ex: pharmacie, hôpital, mairie, police).";
      }
    }
    return {
      answer: answer,
      suggestions: ranked
    };
  }

  function renderAiResponse(data) {
    if (!dom.aiResponse) return;
    dom.aiResponse.innerHTML = "";

    var answerText = data && data.answer ? String(data.answer) : "";
    var suggestions = data && Array.isArray(data.suggestions) ? data.suggestions : [];

    if (answerText) {
      var answerNode = document.createElement("div");
      answerNode.className = "ai-answer";
      answerNode.textContent = answerText;
      dom.aiResponse.appendChild(answerNode);
    }

    suggestions.slice(0, cfg.aiPublicMaxSuggestions || 5).forEach(function (item) {
      if (!isFinite(Number(item.latitude)) || !isFinite(Number(item.longitude))) return;
      var row = {
        id: item.id,
        name: item.name || (state.lang === "en" ? "Suggested place" : "Lieu suggéré"),
        category: item.category || "",
        address: item.address || "",
        latitude: Number(item.latitude),
        longitude: Number(item.longitude)
      };
      var card = document.createElement("div");
      card.className = "ai-suggestion";
      card.innerHTML =
        "<div class='ai-suggestion-title'>" + escapeHtml(row.name) + "</div>" +
        "<div class='ai-suggestion-meta'>" + escapeHtml(row.category) + (row.address ? " | " + escapeHtml(row.address) : "") + "</div>" +
        "<div class='ai-suggestion-actions'>" +
          "<button type='button' data-action='zoom'>" + t("viewOnMap") + "</button>" +
          "<button type='button' data-action='route'>" + t("route") + "</button>" +
        "</div>";
      var zoomBtn = card.querySelector("[data-action='zoom']");
      var routeBtn = card.querySelector("[data-action='route']");
      zoomBtn.addEventListener("click", function () {
        focusResultOnMap(row);
        if (isMobileLayout()) {
          setPanelCollapsed(true);
        }
      });
      routeBtn.addEventListener("click", function () {
        drawRouteTo(L.latLng(row.latitude, row.longitude), row);
        if (isMobileLayout()) {
          setPanelCollapsed(true);
        }
      });
      dom.aiResponse.appendChild(card);
    });
  }

  async function askPublicAssistant() {
    if (!dom.aiMessageInput) return;
    var message = dom.aiMessageInput.value.trim();
    if (!message) {
      setAiStatus(t("askQuestion"), "error");
      return;
    }
    if (message.length > (cfg.aiPublicMaxQuestionLength || 500)) {
      setAiStatus(t("questionTooLong"), "error");
      return;
    }

    setAiStatus(t("assistantAsking"), null);
    var payload = {
      message: message,
      limit: cfg.aiPublicMaxSuggestions || 5,
      center: center
    };
    if (state.currentPosition) {
      payload.location = {
        latitude: Number(state.currentPosition.lat),
        longitude: Number(state.currentPosition.lng),
        accuracy: state.currentAccuracy == null ? null : Number(state.currentAccuracy)
      };
    }

    try {
      var data;
      if (cfg.useSecureFunctions && getFunctionsReady()) {
        var fn = getFunctionName("aiPublicChat", "ai-public-chat");
        data = await functionFetch(fn, payload);
      } else {
        data = buildLocalAiFallback(message);
      }
      if (!data || (!data.answer && !data.suggestions)) {
        data = buildLocalAiFallback(message);
      }
      state.aiLastResponse = data;
      renderAiResponse(data);
      setAiStatus(t("assistantAnswerReady"), "success");
    } catch (err) {
      var fallback = buildLocalAiFallback(message);
      state.aiLastResponse = fallback;
      renderAiResponse(fallback);
      setAiStatus(t("assistantUnavailable"), "error");
    }
  }

  function getShareTokenFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var token = params.get("s") || params.get("share");
      return token ? String(token).trim() : "";
    } catch (_) {
      var raw = String(window.location.search || "");
      var match = raw.match(/[?&](?:s|share)=([^&]+)/i);
      return match && match[1] ? decodeURIComponent(match[1]).trim() : "";
    }
  }

  function clearShareTokenFromUrl() {
    if (!window.history || !window.history.replaceState) return;
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete("s");
      url.searchParams.delete("share");
      window.history.replaceState({}, "", url.pathname + (url.search || "") + (url.hash || ""));
    } catch (_) {
      // no-op
    }
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "readonly");
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error("copy failed"));
      } catch (err) {
        reject(err);
      }
    });
  }

  async function shareOrCopyLink(url) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Camayenne Map",
          text: "Voici ma position sur la carte.",
          url: url
        });
        return "shared";
      } catch (err) {
        if (err && err.name === "AbortError") {
          throw err;
        }
      }
    }
    await copyTextToClipboard(url);
    return "copied";
  }

  function buildShareBaseUrl() {
    if (cfg.shareBaseUrl && String(cfg.shareBaseUrl).trim()) {
      return String(cfg.shareBaseUrl).trim();
    }
    return window.location.origin + window.location.pathname;
  }

  function getLocationErrorMessage(err) {
    if (!err) return state.lang === "en" ? "Unable to get location." : "Impossible d'obtenir la position.";
    if (err.code === 1) return state.lang === "en" ? "Allow location to calculate route." : "Autorise la localisation pour calculer l'itineraire.";
    if (err.code === 2) return state.lang === "en" ? "Location unavailable. Check GPS." : "Position indisponible. Verifie ton GPS.";
    if (err.code === 3) return state.lang === "en" ? "Location request timed out." : "Delai depasse pour obtenir la position.";
    var msg = String(err.message || "");
    if (msg.toLowerCase().indexOf("no geolocation") !== -1) {
      return state.lang === "en" ? "Geolocation is not available." : "La geolocalisation n'est pas disponible.";
    }
    return state.lang === "en" ? "Unable to get location." : "Impossible d'obtenir la position.";
  }

  function getShareTtlMinutes() {
    if (dom.shareTtlSelect && dom.shareTtlSelect.value) {
      var val = Number(dom.shareTtlSelect.value);
      if (isFinite(val)) return val;
    }
    return cfg.shareLocationTtlMinutes || 30;
  }

  function normalizeCoordinateForShare(value) {
    var digits = Number(cfg.shareLocationPrecisionDecimals);
    if (!isFinite(digits)) digits = 6;
    digits = Math.max(4, Math.min(7, Math.round(digits)));
    return Number(Number(value).toFixed(digits));
  }

  async function createLocationShare(latlng, accuracy) {
    if (!cfg.useSecureFunctions) {
      throw new Error("Partage de position disponible uniquement via fonctions sécurisées.");
    }
    if (!getFunctionsReady()) {
      throw new Error("Fonctions sécurisées non configurées.");
    }
    var fn = getFunctionName("shareLocation", "share-location");
    return functionFetch(fn, {
      latitude: normalizeCoordinateForShare(latlng.lat),
      longitude: normalizeCoordinateForShare(latlng.lng),
      accuracy: accuracy != null ? Math.round(accuracy) : null,
      ttlMinutes: getShareTtlMinutes(),
      baseUrl: buildShareBaseUrl()
    });
  }

  async function generateShareLink() {
    setShareStatus(state.lang === "en" ? "Preparing share link..." : "Préparation du lien de partage...", null);
    ensureShareButtons(true);
    var latlng = null;
    if (isCurrentPositionFresh(cfg.currentPositionMaxAgeMs || 45000)) {
      latlng = state.currentPosition;
    } else {
      latlng = await locateUser({
        forceFresh: true,
        quickFirst: true,
        showCachedFirst: true,
        openPopup: false
      });
    }
    if (!latlng) {
      throw new Error(state.lang === "en" ? "Location unavailable." : "Position non disponible.");
    }
    var data = await createLocationShare(latlng, state.currentAccuracy);
    var shareUrl = data && data.url
      ? String(data.url)
      : (window.location.origin + window.location.pathname + "?s=" + encodeURIComponent(String(data.token || "")));
    if (!shareUrl) {
      throw new Error(state.lang === "en" ? "Share link not found." : "Lien de partage introuvable.");
    }
    state.lastShareUrl = shareUrl;
    state.lastShareExpiresAt = data && data.expiresAt ? String(data.expiresAt) : null;
    return {
      url: shareUrl,
      expiresAt: state.lastShareExpiresAt
    };
  }

  async function shareCurrentPosition() {
    var payload = await generateShareLink();
    try {
      var mode = await shareOrCopyLink(payload.url);
      var expireLabel = payload.expiresAt
        ? (state.lang === "en"
          ? " (expires at " + new Date(payload.expiresAt).toLocaleTimeString("en-US") + ")"
          : " (expire à " + new Date(payload.expiresAt).toLocaleTimeString("fr-FR") + ")")
        : "";
      if (mode === "shared") {
        setShareStatus((state.lang === "en" ? "Location shared." : "Position partagée.") + expireLabel, "success");
      } else {
        setShareStatus((state.lang === "en" ? "Link copied. You can paste it in WhatsApp/SMS." : "Lien copié. Tu peux le coller dans WhatsApp/SMS.") + expireLabel, "success");
        showToast(state.lang === "en" ? "Link copied" : "Lien copié");
      }
      ensureShareButtons(true);
    } catch (err) {
      if (err && err.name === "AbortError") {
        setShareStatus(state.lang === "en" ? "Share canceled." : "Partage annulé.", null);
        return;
      }
      throw err;
    }
  }

  function ensureShareButtons(reset) {
    if (!dom.btnShareNewLink) return;
    if (reset) {
      dom.btnShareNewLink.hidden = true;
      return;
    }
    dom.btnShareNewLink.hidden = false;
  }

  async function showLastShareLink() {
    if (!state.lastShareUrl) {
      setShareStatus(state.lang === "en" ? "No link in memory. Click Share first." : "Aucun lien en mémoire. Clique d'abord sur Partager.", "error");
      return;
    }
    await copyTextToClipboard(state.lastShareUrl);
    showToast(state.lang === "en" ? "Link copied" : "Lien copié");
    setShareStatus(state.lang === "en" ? "Link copied." : "Lien copié.", "success");
  }

  async function shareViaWhatsApp() {
    var shareUrl = state.lastShareUrl;
    if (!shareUrl) {
      var payload = await generateShareLink();
      shareUrl = payload.url;
      setShareStatus(state.lang === "en" ? "Link ready for WhatsApp." : "Lien prêt pour WhatsApp.", "success");
    }
    var message = (state.lang === "en" ? "Here is my position on Camayenne Map: " : "Voici ma position sur Camayenne Map: ") + shareUrl;
    var waUrl = "https://wa.me/?text=" + encodeURIComponent(message);
    window.open(waUrl, "_blank", "noopener");
  }

  async function drawRouteToSharedPosition(targetLatLng) {
    try {
      var from = await getCurrentPositionForRouting({
        maxAgeMs: cfg.currentPositionMaxAgeMs || 45000,
        openPopup: false
      });
      var routeResult = await drawRouteBetween(from, targetLatLng, {
        profile: getSelectedRouteProfile(),
        preference: getSelectedRoutePreference(),
        avoidMainRoads: getAvoidMainRoads(),
        roundTrip: false
      });
      drawRouteTargetMarker(targetLatLng, null);
      onRouteReady(routeResult, targetLatLng, "Itineraire calcule vers la position partagee.");
      setShareStatus("Itineraire pret.", "success");
    } catch (err) {
      setRouteStatus("Itineraire impossible: " + err.message, "error");
      setShareStatus(getLocationErrorMessage(err), "error");
      clearRouteContext();
    }
  }

  async function openSharedLocationFromUrl() {
    var token = getShareTokenFromUrl();
    if (!token) return;
    if (!cfg.useSecureFunctions || !getFunctionsReady()) {
      setStatus(dom.searchStatus, "Lien partagé détecté mais fonctions non configurées.", "error");
      setShareStatus("Fonctions de partage non configurées.", "error");
      ensureShareButtons(true);
      return;
    }

    setStatus(dom.searchStatus, "Ouverture de la position partagée...", null);
    try {
      var fn = getFunctionName("resolveShare", "resolve-share");
      var data = await functionFetch(fn, { token: token });
      var lat = Number(data && data.latitude);
      var lon = Number(data && data.longitude);
      if (!isFinite(lat) || !isFinite(lon)) {
        throw new Error("Coordonnées invalides");
      }
      var latlng = L.latLng(lat, lon);
      shareLayer.clearLayers();
      var marker = L.circleMarker(latlng, {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#c2185b",
        fillOpacity: 0.95
      }).addTo(shareLayer);
      if (data && data.accuracy != null && isFinite(Number(data.accuracy))) {
        L.circle(latlng, {
          radius: Number(data.accuracy),
          color: "#c2185b",
          weight: 1,
          fillColor: "#c2185b",
          fillOpacity: 0.08
        }).addTo(shareLayer);
      }
      var expiresText = data && data.expiresAt
        ? new Date(data.expiresAt).toLocaleString("fr-FR")
        : "";
      marker.bindPopup(
        "<strong>Position partagée</strong>" +
        (expiresText ? "<br>Expire: " + escapeHtml(expiresText) : "") +
        "<br><button data-share-route type='button'>Itinéraire vers cette position</button>"
      );
      marker.on("popupopen", function (evt) {
        var button = evt.popup.getElement().querySelector("[data-share-route]");
        if (!button) return;
        button.addEventListener("click", function () {
          drawRouteToSharedPosition(latlng);
        }, { once: true });
      });
      marker.openPopup();
      map.setView(latlng, cfg.shareLocationZoom || 17);
      setStatus(dom.searchStatus, "Position partagée ouverte.", "success");
      setShareStatus("Lien valide.", "success");
      ensureShareButtons(true);
      clearShareTokenFromUrl();
    } catch (err) {
      var expired = false;
      var body = err && err.body ? String(err.body) : "";
      if (err && err.status === 410) expired = true;
      if (!expired && body.toLowerCase().indexOf("expired") !== -1) expired = true;
      if (expired) {
        setStatus(dom.searchStatus, "Lien expiré. Génère un nouveau lien.", "error");
        setShareStatus("Lien expiré.", "error");
        ensureShareButtons(false);
      } else {
        setStatus(dom.searchStatus, "Lien de position invalide.", "error");
        setShareStatus("Lien invalide.", "error");
        ensureShareButtons(false);
      }
      clearShareTokenFromUrl();
    }
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
    dom.reportTitle.value = "";
    dom.reportDescription.value = "";
    state.selectedReportPoint = null;
    setCoord(dom.reportCoord, null);
  }

  function setPickPoint(target, latlng) {
    if (!isInFocusArea(latlng)) {
      var msg = state.lang === "en"
        ? "Point is outside Camayenne area. Please select inside the boundary."
        : "Point hors zone Camayenne. Reviens dans le rectangle.";
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
      setStatus(dom.poiStatus, state.lang === "en" ? "Adding places is disabled in public mode." : "Ajout de lieux désactivé en mode public.", "error");
      return;
    }
    if (!getSupabaseReady()) {
      setStatus(dom.poiStatus, state.lang === "en" ? "Configure Supabase first (config.js)." : "Configure d'abord Supabase (config.js).", "error");
      return;
    }
    if (!state.selectedPoiPoint) {
      setStatus(dom.poiStatus, state.lang === "en" ? "Choose a point on the map." : "Choisis un point sur la carte.", "error");
      return;
    }
    if (!isInFocusArea(state.selectedPoiPoint)) {
      setStatus(dom.poiStatus, state.lang === "en" ? "Point must be inside Camayenne area." : "Le point doit être dans la zone Camayenne.", "error");
      return;
    }
    var name = dom.poiName.value.trim();
    if (!name) {
      setStatus(dom.poiStatus, state.lang === "en" ? "Name is required." : "Le nom est obligatoire.", "error");
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
      setStatus(dom.poiStatus, state.lang === "en" ? "Place added." : "Lieu ajouté.", "success");
      clearPoiForm();
      await loadPois();
    } catch (err) {
      setStatus(dom.poiStatus, (state.lang === "en" ? "Error: " : "Erreur: ") + err.message, "error");
    }
  }

  async function submitReport() {
    if (!getSupabaseReady()) {
      setStatus(dom.reportStatusMessage, state.lang === "en" ? "Configure Supabase first (config.js)." : "Configure d'abord Supabase (config.js).", "error");
      return;
    }
    if (!state.selectedReportPoint) {
      setStatus(dom.reportStatusMessage, state.lang === "en" ? "Choose a point on the map." : "Choisis un point sur la carte.", "error");
      return;
    }
    if (!isInFocusArea(state.selectedReportPoint)) {
      setStatus(dom.reportStatusMessage, state.lang === "en" ? "Point must be inside Camayenne area." : "Le point doit être dans la zone Camayenne.", "error");
      return;
    }
    var title = dom.reportTitle.value.trim();
    if (!title) {
      setStatus(dom.reportStatusMessage, state.lang === "en" ? "Title is required." : "Le titre est obligatoire.", "error");
      return;
    }
    var payload = {
      title: title,
      type: dom.reportType.value,
      description: dom.reportDescription.value.trim(),
      latitude: state.selectedReportPoint.lat,
      longitude: state.selectedReportPoint.lng
    };
    try {
      if (cfg.useSecureFunctions) {
        var submitReportFn = getFunctionName("submitReport", "submit-report");
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
      setStatus(dom.reportStatusMessage, state.lang === "en" ? "Report submitted." : "Signalement envoyé.", "success");
      clearReportForm();
      await loadReports();
    } catch (err) {
      setStatus(dom.reportStatusMessage, (state.lang === "en" ? "Error: " : "Erreur: ") + err.message, "error");
    }
  }

  function centerMapOnUser(latlng) {
    if (cfg.keepMapFocused === true && isInFocusArea(latlng)) {
      map.setView(latlng, cfg.defaultZoom || 17);
    } else if (cfg.keepMapFocused === true && !isInFocusArea(latlng)) {
      map.fitBounds(focusBounds, { padding: [18, 18], maxZoom: cfg.defaultZoom || 16 });
      setRouteStatus("Position détectée hors Camayenne. Itinéraire depuis votre position possible.", "success");
    } else {
      map.setView(latlng, cfg.defaultZoom || 17);
    }
  }

  function setPositionAccuracyMessage(accuracy, mode) {
    var m = mode || "final";
    if (accuracy && accuracy > (cfg.gpsWarnAboveMeters || 120)) {
      if (m === "quick") {
        setRouteStatus(
          "Position rapide affichée (±" + Math.round(accuracy) + " m). Amélioration GPS en cours...",
          "error"
        );
      } else {
        setRouteStatus("Position trouvée mais précision faible (±" + Math.round(accuracy) + " m). Active le GPS haute précision.", "error");
      }
    } else if (accuracy) {
      if (m === "quick") {
        setRouteStatus("Position rapide affichée (±" + Math.round(accuracy) + " m). Amélioration GPS en cours...", "success");
      } else {
        setRouteStatus("Position détectée (précision ±" + Math.round(accuracy) + " m).", "success");
      }
    }
  }

  function getQuickPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error("no geolocation"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        maximumAge: cfg.quickPositionMaxAgeMs || 3 * 60 * 1000,
        timeout: cfg.quickPositionTimeoutMs || 1200
      });
    });
  }

  function locateUser(options) {
    var opts = options || {};
    if (!navigator.geolocation) {
      setRouteStatus("La géolocalisation n'est pas disponible.", "error");
      return Promise.reject(new Error("no geolocation"));
    }
    if (!opts.silent) {
      setRouteStatus("Recherche de votre position...", null);
    }
    return new Promise(function (resolve, reject) {
      var fallbackPosition = (!opts.forceFresh && state.currentPosition) ? state.currentPosition : null;
      var fallbackAccuracy = (!opts.forceFresh && state.currentAccuracy) ? state.currentAccuracy : null;

      if (!opts.forceFresh && opts.showCachedFirst !== false && state.currentPosition) {
        drawUserLocation(state.currentPosition, state.currentAccuracy, { openPopup: false });
        centerMapOnUser(state.currentPosition);
        if (!opts.silent) {
          setRouteStatus("Position connue affichée, actualisation GPS en cours...", null);
        }
      }

      function finalizeWithBestPosition(pos) {
        var latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
        var accuracy = pos.coords && pos.coords.accuracy ? pos.coords.accuracy : null;
        if (shouldRejectGpsJump(latlng, accuracy, opts)) {
          setRouteStatus(
            "Lecture GPS instable ignorée (saut détecté). Réessaie dans 2-3 secondes.",
            "error"
          );
          if (state.currentPosition && !opts.forceFresh) {
            drawUserLocation(state.currentPosition, state.currentAccuracy, { openPopup: false });
            resolve(state.currentPosition);
            return;
          }
        }
        updateCurrentPosition(latlng, accuracy, { openPopup: opts.openPopup !== false });
        centerMapOnUser(latlng);
        setPositionAccuracyMessage(accuracy, "final");
        resolve(latlng);
      }

      function onBestError(err) {
        if (fallbackPosition && !opts.forceFresh) {
          updateCurrentPosition(fallbackPosition, fallbackAccuracy, { openPopup: false });
          if (!opts.silent) {
            setRouteStatus("Position approximative utilisée. GPS précis indisponible pour le moment.", "error");
          }
          resolve(fallbackPosition);
          return;
        }
        setRouteStatus("Impossible d'obtenir la position actuelle.", "error");
        reject(err);
      }

      function runBestPosition() {
        getBestPosition().then(finalizeWithBestPosition).catch(onBestError);
      }

      if (!opts.forceFresh && opts.quickFirst !== false) {
        getQuickPosition().then(function (quickPos) {
          var quickLatLng = L.latLng(quickPos.coords.latitude, quickPos.coords.longitude);
          var quickAcc = quickPos.coords && quickPos.coords.accuracy ? quickPos.coords.accuracy : null;
          if (!shouldRejectGpsJump(quickLatLng, quickAcc, { forceFresh: false })) {
            updateCurrentPosition(quickLatLng, quickAcc, { openPopup: false });
            centerMapOnUser(quickLatLng);
            fallbackPosition = quickLatLng;
            fallbackAccuracy = quickAcc;
            if (!opts.silent) {
              setPositionAccuracyMessage(quickAcc, "quick");
            }
          }
          runBestPosition();
        }).catch(function () {
          runBestPosition();
        });
      } else {
        runBestPosition();
      }
    });
  }

  async function getCurrentPositionForRouting(options) {
    var opts = options || {};
    if (isCurrentPositionFresh(opts.maxAgeMs)) {
      return state.currentPosition;
    }
    return locateUser({
      forceFresh: true,
      openPopup: opts.openPopup !== false
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
      updateCompass(state.currentPosition, state.nav.currentHeading);
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
    state.nav.currentHeading = null;
    state.nav.previousTrackPoint = null;
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
    setCompassVisible(false);
    if (state.currentPosition) {
      drawUserLocation(state.currentPosition, state.currentAccuracy, { openPopup: false, heading: null });
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
    var coordsHeading = pos.coords && isFinite(pos.coords.heading) ? Number(pos.coords.heading) : null;

    if (shouldRejectGpsJump(latlng, accuracy)) {
      setNavStatus("Lecture GPS instable ignorée.", "error");
      return;
    }

    if (coordsHeading != null && !isNaN(coordsHeading)) {
      state.nav.currentHeading = normalizeDegrees(coordsHeading);
    } else if (state.nav.previousTrackPoint) {
      var moved = distanceMeters(state.nav.previousTrackPoint, latlng);
      if (moved >= (cfg.navHeadingMinMoveMeters || 4)) {
        state.nav.currentHeading = bearingDegrees(state.nav.previousTrackPoint, latlng);
      }
    }
    state.nav.previousTrackPoint = latlng;

    updateCurrentPosition(latlng, accuracy, {
      openPopup: false,
      heading: state.nav.currentHeading
    });

    if (cfg.navFollowUser !== false) {
      map.panTo(latlng, { animate: true, duration: 0.5 });
    }

    updateNavigationProgress(latlng, accuracy);
    updateCompass(latlng, state.nav.currentHeading);
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
    state.nav.previousTrackPoint = state.currentPosition || null;
    updateNavigationButtons();
    setNavStatus("Guidage démarré.", "success");
    setNavProgress("En attente de mise à jour GPS...", null);

    if (!isCurrentPositionFresh(cfg.currentPositionMaxAgeMs || 45000)) {
      try {
        await locateUser({ forceFresh: true, openPopup: false });
      } catch (_) {
        // watchPosition ci-dessous continuera à tenter les lectures GPS
      }
    }
    if (state.currentPosition) {
      drawUserLocation(state.currentPosition, state.currentAccuracy, {
        openPopup: false,
        heading: state.nav.currentHeading
      });
      updateNavigationProgress(state.currentPosition, state.currentAccuracy);
      updateCompass(state.currentPosition, state.nav.currentHeading);
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
    if (cfg.routeFromCenterWhenOutsideFocus === true && !isInFocusArea(from)) {
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
      var routeFn = getFunctionName("route", "route");
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
      var bothInFocus = isInFocusArea(from) && isInFocusArea(targetLatLng);
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

  async function drawRouteTo(targetLatLng, targetMeta) {
    try {
      var from = await getCurrentPositionForRouting({
        maxAgeMs: cfg.currentPositionMaxAgeMs || 45000,
        openPopup: false
      });
      var routeResult = await drawRouteBetween(from, targetLatLng, {
        profile: getSelectedRouteProfile(),
        preference: getSelectedRoutePreference(),
        avoidMainRoads: getAvoidMainRoads(),
        roundTrip: isRoundTripEnabled()
      });
      drawRouteTargetMarker(targetLatLng, targetMeta || null);
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
        fromPoint = await getCurrentPositionForRouting({
          maxAgeMs: cfg.currentPositionMaxAgeMs || 45000,
          openPopup: false
        });
      } else {
        var fromPoi = getPoiById(fromValue);
        if (!fromPoi) {
          setRouteStatus("Lieu de départ introuvable.", "error");
          return;
        }
        fromPoint = pointFromRow(fromPoi);
      }

      if (toValue === "__CURRENT__") {
        toPoint = await getCurrentPositionForRouting({
          maxAgeMs: cfg.currentPositionMaxAgeMs || 45000,
          openPopup: false
        });
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
      drawRouteTargetMarker(toPoint, toValue === "__CURRENT__" ? null : getPoiById(toValue));
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
    if (dom.btnAiAsk) {
      dom.btnAiAsk.addEventListener("click", function () {
        askPublicAssistant().catch(function (err) {
          setAiStatus((state.lang === "en" ? "Assistant unavailable: " : "Assistant indisponible: ") + err.message, "error");
        });
      });
    }
    if (dom.btnAiClear) {
      dom.btnAiClear.addEventListener("click", function () {
        if (dom.aiMessageInput) dom.aiMessageInput.value = "";
        clearAiResponse();
        setAiStatus("", null);
      });
    }
    if (dom.aiMessageInput) {
      dom.aiMessageInput.addEventListener("keydown", function (evt) {
        if (evt.key === "Enter" && !evt.shiftKey) {
          evt.preventDefault();
          askPublicAssistant().catch(function (err) {
            setAiStatus((state.lang === "en" ? "Assistant unavailable: " : "Assistant indisponible: ") + err.message, "error");
          });
        }
      });
    }
    if (dom.aiQuickButtons && dom.aiQuickButtons.length) {
      dom.aiQuickButtons.forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!dom.aiMessageInput) return;
          dom.aiMessageInput.value = btn.dataset.aiPrompt || "";
          askPublicAssistant().catch(function (err) {
            setAiStatus((state.lang === "en" ? "Assistant unavailable: " : "Assistant indisponible: ") + err.message, "error");
          });
        });
      });
    }
    dom.btnLocate.addEventListener("click", function () {
      locateUser({
        forceFresh: false,
        quickFirst: true,
        showCachedFirst: true,
        openPopup: true
      }).catch(function () {
        setRouteStatus(getLocationErrorMessage(), "error");
      });
      if (isMobileLayout()) {
        setPanelCollapsed(true);
      }
    });
    dom.btnClearRoute.addEventListener("click", function () {
      routeLayer.clearLayers();
      routeTargetLayer.clearLayers();
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
    if (dom.btnShareLocation) {
      dom.btnShareLocation.addEventListener("click", function () {
        shareCurrentPosition().catch(function (err) {
          setShareStatus("Partage impossible: " + err.message, "error");
        });
      });
    }
    if (dom.btnShowShareLink) {
      dom.btnShowShareLink.addEventListener("click", function () {
        showLastShareLink().catch(function (err) {
          setShareStatus("Impossible de copier: " + err.message, "error");
        });
      });
    }
    if (dom.btnShareWhatsApp) {
      dom.btnShareWhatsApp.addEventListener("click", function () {
        shareViaWhatsApp().catch(function (err) {
          setShareStatus("WhatsApp indisponible: " + err.message, "error");
        });
      });
    }
    if (dom.btnShareNewLink) {
      dom.btnShareNewLink.addEventListener("click", function () {
        shareCurrentPosition().catch(function (err) {
          setShareStatus("Partage impossible: " + err.message, "error");
        });
      });
    }
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
      dom.hintText.textContent = t("hintPickPoi");
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
      dom.hintText.textContent = t("hintPickReport");
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
      dom.hintText.textContent = t("hintPointSaved");
    });

    if (dom.langSelect) {
      dom.langSelect.addEventListener("change", function () {
        setLanguage(dom.langSelect.value, true);
      });
      dom.langSelect.addEventListener("input", function () {
        setLanguage(dom.langSelect.value, true);
      });
    }
  }

  async function bootstrap() {
    setLanguage(getInitialLang(), false);
    window.__setPublicLang = function (lang) {
      setLanguage(lang, true);
    };
    fillSelect(dom.searchCategory, poiCategories, true);
    fillSelect(dom.poiCategory, poiCategories, false);
    fillSelect(dom.reportType, reportTypes, false);
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
    setCompassVisible(false);
    syncPanelWithViewport(true);
    if (dom.aiStatus) setAiStatus(t("assistantReady"), null);
    clearAiResponse();

    wireEvents();
    if (cfg.lockToFocusBounds !== false) {
      map.fitBounds(focusBounds, { padding: [18, 18], maxZoom: cfg.defaultZoom || 16 });
    }

    if (!getSupabaseReady()) {
      setStatus(dom.searchStatus, t("demoMode"), "error");
      return;
    }

    try {
      await Promise.all([loadPois(), loadReports()]);
      setStatus(dom.searchStatus, t("dataLoaded"), "success");
    } catch (err) {
      setStatus(dom.searchStatus, t("dataLoadError", { error: err.message }), "error");
    }

    applyPublicLanguage();

    await openSharedLocationFromUrl();
  }

  bootstrap();
})();
