(function () {
  "use strict";

  var cfg = window.CAMAYENNE_CONFIG || {};
  var reportStatuses = cfg.reportStatuses || ["NOUVEAU", "EN_COURS", "RESOLU"];
  var reportTypes = cfg.reportTypes || ["VOIRIE", "ECLAIRAGE", "DECHETS", "INONDATION", "SECURITE", "AUTRE"];

  var app = {
    client: null,
    user: null,
    profile: null,
    reports: [],
    filteredReports: [],
    poiActiveCount: 0,
    map: null,
    markersLayer: null,
    markerById: {},
    mapFitted: false,
    focusedReportId: null
  };

  var dom = {
    authCard: document.getElementById("authCard"),
    mairieApp: document.getElementById("mairieApp"),
    loginEmail: document.getElementById("loginEmail"),
    loginPassword: document.getElementById("loginPassword"),
    btnSignIn: document.getElementById("btnSignIn"),
    btnSignOut: document.getElementById("btnSignOut"),
    userBadge: document.getElementById("userBadge"),
    authStatus: document.getElementById("authStatus"),
    mapStatus: document.getElementById("mapStatus"),
    tableStatus: document.getElementById("tableStatus"),
    filterStatus: document.getElementById("filterStatus"),
    filterType: document.getElementById("filterType"),
    filterPeriod: document.getElementById("filterPeriod"),
    filterText: document.getElementById("filterText"),
    btnResetFilters: document.getElementById("btnResetFilters"),
    btnReloadData: document.getElementById("btnReloadData"),
    btnExportCsv: document.getElementById("btnExportCsv"),
    reportsTableBody: document.getElementById("reportsTableBody"),
    resultCount: document.getElementById("resultCount"),
    kpiTotal: document.getElementById("kpiTotal"),
    kpiNew: document.getElementById("kpiNew"),
    kpiInProgress: document.getElementById("kpiInProgress"),
    kpiDone: document.getElementById("kpiDone"),
    kpiHighPriority: document.getElementById("kpiHighPriority"),
    kpiPoi: document.getElementById("kpiPoi"),
    statusBreakdown: document.getElementById("statusBreakdown"),
    typeBreakdown: document.getElementById("typeBreakdown")
  };

  function setStatus(node, message, level) {
    if (!node) return;
    node.textContent = message || "";
    node.classList.remove("error", "success");
    if (level === "error") node.classList.add("error");
    if (level === "success") node.classList.add("success");
  }

  function escapeHtml(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmtDate(v) {
    if (!v) return "-";
    var d = new Date(v);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString("fr-FR");
  }

  function normalizeText(v) {
    return String(v || "").trim().toLowerCase();
  }

  function getSupabaseReady() {
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && window.supabase.createClient);
  }

  function applyAuthUi(isConnected) {
    dom.authCard.hidden = !!isConnected;
    dom.mairieApp.hidden = !isConnected;
    dom.btnSignOut.hidden = !isConnected;
    if (!isConnected && dom.userBadge) {
      dom.userBadge.hidden = true;
      dom.userBadge.textContent = "";
    }
  }

  function fillSelect(node, values, includeAll) {
    if (!node) return;
    node.innerHTML = "";
    if (includeAll) {
      var all = document.createElement("option");
      all.value = "";
      all.textContent = "Tous";
      node.appendChild(all);
    }
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      node.appendChild(opt);
    });
  }

  function normalizeFocusPolygon(rawPolygon) {
    if (!Array.isArray(rawPolygon) || rawPolygon.length < 3) return null;
    var points = rawPolygon.map(function (item) {
      if (Array.isArray(item) && item.length >= 2) {
        return L.latLng(Number(item[0]), Number(item[1]));
      }
      if (item && typeof item === "object") {
        return L.latLng(Number(item.lat), Number(item.lon != null ? item.lon : item.lng));
      }
      return null;
    }).filter(function (p) {
      return p && isFinite(p.lat) && isFinite(p.lng);
    });
    return points.length >= 3 ? points : null;
  }

  function initMap() {
    if (app.map) return;
    var center = cfg.defaultCenter || { lat: 9.532296, lon: -13.688565 };
    app.map = L.map("mairieMap").setView([center.lat, center.lon], cfg.defaultZoom || 15);
    L.tileLayer(cfg.tileUrl || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: cfg.tileAttribution || "&copy; OpenStreetMap contributors"
    }).addTo(app.map);
    app.markersLayer = L.layerGroup().addTo(app.map);

    var polygon = normalizeFocusPolygon(cfg.focusPolygon);
    if (polygon) {
      L.polygon(polygon, {
        color: "#0e6f8e",
        weight: 1.2,
        fillColor: "#0e6f8e",
        fillOpacity: 0.05
      }).addTo(app.map);
    } else if (cfg.focusBounds) {
      var bounds = L.latLngBounds(
        [cfg.focusBounds.south, cfg.focusBounds.west],
        [cfg.focusBounds.north, cfg.focusBounds.east]
      );
      L.rectangle(bounds, {
        color: "#0e6f8e",
        weight: 1.2,
        fillColor: "#0e6f8e",
        fillOpacity: 0.05
      }).addTo(app.map);
      app.map.fitBounds(bounds, { padding: [20, 20], maxZoom: cfg.defaultZoom || 16 });
    }
  }

  function getStatusColor(status) {
    if (status === "NOUVEAU") return "#f59e0b";
    if (status === "EN_COURS") return "#0ea5e9";
    if (status === "RESOLU") return "#10b981";
    return "#6b7280";
  }

  async function loadProfile(userId) {
    var res = await app.client
      .from("profiles")
      .select("user_id, full_name, email, role, is_active")
      .eq("user_id", userId)
      .maybeSingle();
    if (res.error) throw res.error;
    return res.data || null;
  }

  function canAccessMairie(profile) {
    if (!profile) return false;
    if (profile.is_active === false) return false;
    return profile.role === "admin" || profile.role === "agent";
  }

  async function loadAllData() {
    setStatus(dom.tableStatus, "Chargement des donnees...", null);
    setStatus(dom.mapStatus, "", null);

    var reportsQuery = app.client
      .from("reports")
      .select("id, title, type, status, description, latitude, longitude, created_at, ai_priority, ai_suggested_type, ai_summary")
      .order("created_at", { ascending: false })
      .limit(1800);
    var poiCountQuery = app.client
      .from("poi")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIF");

    var results = await Promise.all([reportsQuery, poiCountQuery]);
    var reportsRes = results[0];
    var poiCountRes = results[1];

    if (reportsRes.error) throw reportsRes.error;
    if (poiCountRes.error) throw poiCountRes.error;

    app.reports = reportsRes.data || [];
    app.poiActiveCount = Number(poiCountRes.count || 0);
    applyFiltersAndRender();
    setStatus(dom.tableStatus, "Donnees mises a jour.", "success");
  }

  function getFilteredReports() {
    var status = dom.filterStatus.value;
    var type = dom.filterType.value;
    var periodDays = Number(dom.filterPeriod.value || 0);
    var text = normalizeText(dom.filterText.value);
    var minDate = null;
    if (periodDays > 0) {
      minDate = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    }

    return app.reports.filter(function (row) {
      if (status && row.status !== status) return false;
      if (type && row.type !== type) return false;
      if (minDate) {
        var created = new Date(row.created_at).getTime();
        if (!isFinite(created) || created < minDate) return false;
      }
      if (text) {
        var blob = normalizeText((row.title || "") + " " + (row.description || "") + " " + (row.ai_summary || ""));
        if (blob.indexOf(text) < 0) return false;
      }
      return true;
    });
  }

  function countBy(rows, field) {
    var out = {};
    rows.forEach(function (row) {
      var key = String(row[field] || "NON_CLASSE");
      out[key] = (out[key] || 0) + 1;
    });
    return out;
  }

  function renderBreakdown(node, counts, order) {
    if (!node) return;
    node.innerHTML = "";
    var keys = order && order.length ? order.filter(function (k) { return counts[k] != null; }) : Object.keys(counts);
    if (!keys.length) {
      node.innerHTML = '<div class="muted">Aucune donnee.</div>';
      return;
    }
    var total = keys.reduce(function (sum, k) { return sum + Number(counts[k] || 0); }, 0) || 1;

    keys.forEach(function (key) {
      var value = Number(counts[key] || 0);
      var pct = Math.round((value / total) * 100);
      var item = document.createElement("div");
      item.className = "breakdown-item";
      item.innerHTML =
        "<div class='breakdown-row'><span>" + escapeHtml(key) + "</span><strong>" + value + " (" + pct + "%)</strong></div>" +
        "<div class='breakdown-bar'><div class='breakdown-fill' style='width:" + pct + "%'></div></div>";
      node.appendChild(item);
    });
  }

  function renderKpis(rows) {
    var total = app.reports.length;
    var newCount = app.reports.filter(function (r) { return r.status === "NOUVEAU"; }).length;
    var progressCount = app.reports.filter(function (r) { return r.status === "EN_COURS"; }).length;
    var doneCount = app.reports.filter(function (r) { return r.status === "RESOLU"; }).length;
    var highPriority = app.reports.filter(function (r) {
      return String(r.ai_priority || "").toUpperCase() === "HIGH";
    }).length;

    dom.kpiTotal.textContent = String(total);
    dom.kpiNew.textContent = String(newCount);
    dom.kpiInProgress.textContent = String(progressCount);
    dom.kpiDone.textContent = String(doneCount);
    dom.kpiHighPriority.textContent = String(highPriority);
    dom.kpiPoi.textContent = String(app.poiActiveCount);

    dom.resultCount.textContent = rows.length + " resultat(s)";
  }

  function renderMap(rows) {
    if (!app.map || !app.markersLayer) return;
    app.markersLayer.clearLayers();
    app.markerById = {};

    var bounds = [];
    rows.forEach(function (row) {
      var lat = Number(row.latitude);
      var lon = Number(row.longitude);
      if (!isFinite(lat) || !isFinite(lon)) return;
      var marker = L.circleMarker([lat, lon], {
        radius: 7,
        color: "#fff",
        weight: 1.5,
        fillColor: getStatusColor(row.status),
        fillOpacity: 0.9
      }).addTo(app.markersLayer);
      marker.bindPopup(
        "<strong>" + escapeHtml(row.title || ("Signalement #" + row.id)) + "</strong><br>" +
        "Type: " + escapeHtml(row.type || "-") + "<br>" +
        "Statut: " + escapeHtml(row.status || "-") + "<br>" +
        "Date: " + escapeHtml(fmtDate(row.created_at))
      );
      app.markerById[row.id] = marker;
      bounds.push([lat, lon]);
    });

    if (bounds.length && !app.mapFitted) {
      app.map.fitBounds(L.latLngBounds(bounds), { padding: [24, 24], maxZoom: 16 });
      app.mapFitted = true;
    }
    setStatus(dom.mapStatus, rows.length + " point(s) affiches.", bounds.length ? "success" : null);
  }

  function renderReportsTable(rows) {
    dom.reportsTableBody.innerHTML = "";
    if (!rows.length) {
      dom.reportsTableBody.innerHTML = '<tr><td colspan="7">Aucun signalement pour ces filtres.</td></tr>';
      return;
    }

    rows.forEach(function (row) {
      var aiPriority = String(row.ai_priority || "").toUpperCase();
      var aiLabel = aiPriority ? aiPriority : "-";
      var tr = document.createElement("tr");
      tr.setAttribute("data-row-id", String(row.id));
      tr.innerHTML =
        "<td>#"+ row.id + "</td>" +
        "<td><strong>" + escapeHtml(row.title || "-") + "</strong><br><small>" + escapeHtml(row.description || "") + "</small></td>" +
        "<td>" + escapeHtml(row.type || "-") + "</td>" +
        "<td>" + escapeHtml(aiLabel) + "</td>" +
        "<td><select data-field='status'>" +
        reportStatuses.map(function (status) {
          return "<option value='" + status + "'" + (row.status === status ? " selected" : "") + ">" + status + "</option>";
        }).join("") +
        "</select></td>" +
        "<td>" + escapeHtml(fmtDate(row.created_at)) + "</td>" +
        "<td><div class='action-row'>" +
        "<button class='btn btn-soft' type='button' data-action='focus' data-id='" + row.id + "'>Voir carte</button>" +
        "<button class='btn btn-primary' type='button' data-action='save' data-id='" + row.id + "'>Sauver</button>" +
        "</div></td>";
      dom.reportsTableBody.appendChild(tr);
    });
  }

  function highlightTableRow(reportId) {
    var targetId = String(reportId);
    var rows = dom.reportsTableBody.querySelectorAll("tr[data-row-id]");
    rows.forEach(function (row) {
      row.classList.toggle("is-selected", row.getAttribute("data-row-id") === targetId);
    });
  }

  function focusReportOnMap(reportId, openPopup) {
    var row = app.filteredReports.find(function (r) { return Number(r.id) === Number(reportId); }) ||
      app.reports.find(function (r) { return Number(r.id) === Number(reportId); });
    if (!row) return;
    var lat = Number(row.latitude);
    var lon = Number(row.longitude);
    if (!isFinite(lat) || !isFinite(lon)) {
      setStatus(dom.mapStatus, "Coordonnees invalides pour ce signalement.", "error");
      return;
    }
    app.focusedReportId = Number(reportId);
    app.map.setView([lat, lon], 17, { animate: true });
    var marker = app.markerById[reportId];
    if (marker && openPopup) marker.openPopup();
    highlightTableRow(reportId);
  }

  async function updateReportStatus(reportId, newStatus) {
    var res = await app.client
      .from("reports")
      .update({ status: newStatus })
      .eq("id", reportId);
    if (res.error) throw res.error;
  }

  function exportCsv(rows) {
    if (!rows.length) {
      setStatus(dom.tableStatus, "Aucune ligne a exporter.", "error");
      return;
    }
    var headers = ["id", "title", "type", "status", "ai_priority", "latitude", "longitude", "created_at", "description"];
    var lines = [headers.join(",")];
    rows.forEach(function (row) {
      var vals = headers.map(function (h) {
        var v = row[h] == null ? "" : String(row[h]);
        var escaped = '"' + v.replace(/"/g, '""') + '"';
        return escaped;
      });
      lines.push(vals.join(","));
    });

    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "mairie_signalements_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus(dom.tableStatus, "Export CSV termine.", "success");
  }

  function applyFiltersAndRender() {
    app.filteredReports = getFilteredReports();
    renderKpis(app.filteredReports);
    renderBreakdown(dom.statusBreakdown, countBy(app.filteredReports, "status"), reportStatuses);
    renderBreakdown(dom.typeBreakdown, countBy(app.filteredReports, "type"), reportTypes);
    renderMap(app.filteredReports);
    renderReportsTable(app.filteredReports);
    if (app.focusedReportId != null) {
      highlightTableRow(app.focusedReportId);
    }
  }

  function resetFilters() {
    dom.filterStatus.value = "";
    dom.filterType.value = "";
    dom.filterPeriod.value = "30";
    dom.filterText.value = "";
    applyFiltersAndRender();
  }

  async function onSignedIn(user) {
    app.user = user;
    var profile = await loadProfile(user.id);
    if (!canAccessMairie(profile)) {
      applyAuthUi(false);
      setStatus(dom.authStatus, "Acces refuse. Contacte un admin.", "error");
      await app.client.auth.signOut();
      return;
    }

    app.profile = profile;
    applyAuthUi(true);
    if (dom.userBadge) {
      dom.userBadge.hidden = false;
      dom.userBadge.textContent = (profile.full_name || profile.email || "Utilisateur") + " (" + profile.role + ")";
    }
    initMap();
    setTimeout(function () {
      if (app.map) app.map.invalidateSize();
    }, 80);
    await loadAllData();
  }

  async function tryRestoreSession() {
    var res = await app.client.auth.getSession();
    if (res.error) throw res.error;
    if (res.data && res.data.session && res.data.session.user) {
      await onSignedIn(res.data.session.user);
    } else {
      applyAuthUi(false);
    }
  }

  function wireEvents() {
    dom.btnSignIn.addEventListener("click", async function () {
      var email = String(dom.loginEmail.value || "").trim();
      var password = String(dom.loginPassword.value || "");
      if (!email || !password) {
        setStatus(dom.authStatus, "Email et mot de passe obligatoires.", "error");
        return;
      }
      setStatus(dom.authStatus, "Connexion...", null);
      try {
        var signInRes = await app.client.auth.signInWithPassword({
          email: email,
          password: password
        });
        if (signInRes.error) throw signInRes.error;
        setStatus(dom.authStatus, "Connexion reussie.", "success");
      } catch (err) {
        setStatus(dom.authStatus, "Connexion echouee: " + (err && err.message ? err.message : "Erreur"), "error");
      }
    });

    dom.btnSignOut.addEventListener("click", async function () {
      await app.client.auth.signOut();
      app.user = null;
      app.profile = null;
      applyAuthUi(false);
      setStatus(dom.authStatus, "Deconnecte.", "success");
    });

    [dom.filterStatus, dom.filterType, dom.filterPeriod].forEach(function (el) {
      el.addEventListener("change", applyFiltersAndRender);
    });
    dom.filterText.addEventListener("input", applyFiltersAndRender);

    dom.btnResetFilters.addEventListener("click", resetFilters);
    dom.btnReloadData.addEventListener("click", async function () {
      try {
        await loadAllData();
      } catch (err) {
        setStatus(dom.tableStatus, "Erreur recharge: " + err.message, "error");
      }
    });
    dom.btnExportCsv.addEventListener("click", function () {
      exportCsv(app.filteredReports);
    });

    dom.reportsTableBody.addEventListener("click", async function (evt) {
      var btn = evt.target.closest("button[data-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      var reportId = Number(btn.getAttribute("data-id"));
      if (!isFinite(reportId)) return;

      if (action === "focus") {
        focusReportOnMap(reportId, true);
        return;
      }

      if (action === "save") {
        var row = btn.closest("tr");
        if (!row) return;
        var select = row.querySelector("select[data-field='status']");
        if (!select) return;
        var newStatus = select.value;
        btn.disabled = true;
        try {
          await updateReportStatus(reportId, newStatus);
          var target = app.reports.find(function (r) { return Number(r.id) === reportId; });
          if (target) target.status = newStatus;
          setStatus(dom.tableStatus, "Statut du signalement #" + reportId + " mis a jour.", "success");
          applyFiltersAndRender();
        } catch (err) {
          setStatus(dom.tableStatus, "Echec mise a jour: " + err.message, "error");
        } finally {
          btn.disabled = false;
        }
      }
    });
  }

  async function bootstrap() {
    if (!getSupabaseReady()) {
      setStatus(dom.authStatus, "Config Supabase manquante dans config.js.", "error");
      return;
    }
    app.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    fillSelect(dom.filterStatus, reportStatuses, true);
    fillSelect(dom.filterType, reportTypes, true);
    wireEvents();
    applyAuthUi(false);

    app.client.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_OUT") {
        app.user = null;
        app.profile = null;
        applyAuthUi(false);
      }
      if (event === "SIGNED_IN" && session && session.user) {
        onSignedIn(session.user).catch(function (err) {
          setStatus(dom.authStatus, "Erreur profil: " + err.message, "error");
        });
      }
    });

    try {
      await tryRestoreSession();
    } catch (err) {
      setStatus(dom.authStatus, "Erreur session: " + err.message, "error");
    }
  }

  bootstrap();
})();
