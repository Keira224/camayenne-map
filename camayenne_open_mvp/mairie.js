(function () {
  "use strict";

  var cfg = window.CAMAYENNE_CONFIG || {};
  var reportStatuses = cfg.reportStatuses || ["NOUVEAU", "EN_COURS", "RESOLU"];
  var reportTypes = cfg.reportTypes || ["VOIRIE", "ECLAIRAGE", "DECHETS", "INONDATION", "SECURITE", "AUTRE"];
  var serviceOptions = ["VOIRIE", "ECLAIRAGE", "ASSAINISSEMENT", "SECURITE", "INONDATION", "GENERAL", "AUTRE"];
  var assignmentPriorityOptions = ["LOW", "NORMAL", "HIGH", "URGENT"];

  var app = {
    client: null,
    user: null,
    profile: null,
    operators: [],
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
    filterService: document.getElementById("filterService"),
    filterAssigned: document.getElementById("filterAssigned"),
    filterPeriod: document.getElementById("filterPeriod"),
    filterText: document.getElementById("filterText"),
    btnResetFilters: document.getElementById("btnResetFilters"),
    btnAutoAssign: document.getElementById("btnAutoAssign"),
    btnReloadData: document.getElementById("btnReloadData"),
    btnExportCsv: document.getElementById("btnExportCsv"),
    aiPeriodDays: document.getElementById("aiPeriodDays"),
    btnRunAiInsights: document.getElementById("btnRunAiInsights"),
    aiStatus: document.getElementById("aiStatus"),
    aiSummary: document.getElementById("aiSummary"),
    aiMeta: document.getElementById("aiMeta"),
    aiForecast: document.getElementById("aiForecast"),
    aiRecommendations: document.getElementById("aiRecommendations"),
    aiHotspots: document.getElementById("aiHotspots"),
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

  function toDateTimeInputValue(v) {
    if (!v) return "";
    var d = new Date(v);
    if (isNaN(d.getTime())) return "";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" +
      pad(d.getMonth() + 1) + "-" +
      pad(d.getDate()) + "T" +
      pad(d.getHours()) + ":" +
      pad(d.getMinutes());
  }

  function fromDateTimeInputValue(v) {
    var value = String(v || "").trim();
    if (!value) return null;
    var d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function normalizeText(v) {
    return String(v || "").trim().toLowerCase();
  }

  function getOperatorLabel(row) {
    var name = String(row.full_name || "").trim();
    var email = String(row.email || "").trim();
    if (name && email) return name + " (" + email + ")";
    return name || email || String(row.user_id || "");
  }

  function getSupabaseReady() {
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && window.supabase.createClient);
  }

  function getFunctionName(key, fallbackName) {
    if (cfg.functionNames && cfg.functionNames[key]) return cfg.functionNames[key];
    return fallbackName;
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

  function renderAssignedFilterOptions() {
    if (!dom.filterAssigned) return;
    var previous = dom.filterAssigned.value;
    dom.filterAssigned.innerHTML = "";

    var all = document.createElement("option");
    all.value = "";
    all.textContent = "Tous";
    dom.filterAssigned.appendChild(all);

    var none = document.createElement("option");
    none.value = "__NONE__";
    none.textContent = "Non affecte";
    dom.filterAssigned.appendChild(none);

    app.operators.forEach(function (op) {
      var opt = document.createElement("option");
      opt.value = String(op.user_id || "");
      opt.textContent = getOperatorLabel(op);
      dom.filterAssigned.appendChild(opt);
    });

    if (previous && dom.filterAssigned.querySelector("option[value='" + previous + "']")) {
      dom.filterAssigned.value = previous;
    }
  }

  function buildAgentSelectHtml(selectedValue) {
    var current = selectedValue == null ? "" : String(selectedValue);
    var html = "<select data-field='assigned_user_id'>" +
      "<option value=''>Non affecte</option>";
    app.operators.forEach(function (op) {
      var value = String(op.user_id || "");
      var label = escapeHtml(getOperatorLabel(op));
      html += "<option value='" + escapeHtml(value) + "'" + (value === current ? " selected" : "") + ">" + label + "</option>";
    });
    html += "</select>";
    return html;
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

  async function loadOperators() {
    var rpc = await app.client.rpc("list_active_operators");
    if (rpc.error) throw rpc.error;
    app.operators = rpc.data || [];
    renderAssignedFilterOptions();
  }

  async function loadAllData() {
    setStatus(dom.tableStatus, "Chargement des donnees...", null);
    setStatus(dom.mapStatus, "", null);

    var reportsQuery = app.client
      .from("reports")
      .select("id, title, type, status, description, latitude, longitude, created_at, ai_priority, ai_suggested_type, ai_summary, assigned_service, assigned_user_id, assigned_priority, assigned_due_at, assignment_source")
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

  async function callFunction(functionName, payload) {
    var sessionRes = await app.client.auth.getSession();
    var accessToken = sessionRes && sessionRes.data && sessionRes.data.session
      ? sessionRes.data.session.access_token
      : null;

    if (cfg.functionsBaseUrl) {
      var fnUrl = cfg.functionsBaseUrl.replace(/\/+$/, "") + "/" + functionName;
      var headers = {
        "Content-Type": "application/json",
        apikey: cfg.supabaseAnonKey
      };
      if (accessToken) {
        headers.Authorization = "Bearer " + accessToken;
      } else {
        headers.Authorization = "Bearer " + cfg.supabaseAnonKey;
      }

      var res = await fetch(fnUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload || {})
      });
      var text = await res.text();
      var data = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_) {
        data = { raw: text };
      }
      if (!res.ok) {
        throw new Error("Function HTTP " + res.status + " - " + (data && (data.error || data.detail || text) || "Erreur"));
      }
      return data;
    }

    var invokeRes = await app.client.functions.invoke(functionName, { body: payload || {} });
    if (invokeRes.error) throw invokeRes.error;
    return invokeRes.data || {};
  }

  function getFilteredReports() {
    var status = dom.filterStatus.value;
    var type = dom.filterType.value;
    var service = dom.filterService ? dom.filterService.value : "";
    var assigned = dom.filterAssigned ? dom.filterAssigned.value : "";
    var periodDays = Number(dom.filterPeriod.value || 0);
    var text = normalizeText(dom.filterText.value);
    var minDate = null;
    if (periodDays > 0) {
      minDate = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    }

    return app.reports.filter(function (row) {
      if (status && row.status !== status) return false;
      if (type && row.type !== type) return false;
      if (service && String(row.assigned_service || "") !== service) return false;
      if (assigned) {
        if (assigned === "__NONE__") {
          if (row.assigned_user_id) return false;
        } else if (String(row.assigned_user_id || "") !== assigned) {
          return false;
        }
      }
      if (minDate) {
        var created = new Date(row.created_at).getTime();
        if (!isFinite(created) || created < minDate) return false;
      }
      if (text) {
        var blob = normalizeText((row.title || "") + " " + (row.description || "") + " " + (row.ai_summary || "") + " " + (row.assigned_service || ""));
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
        "Service: " + escapeHtml(row.assigned_service || "-") + "<br>" +
        "Echeance: " + escapeHtml(fmtDate(row.assigned_due_at)) + "<br>" +
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
      dom.reportsTableBody.innerHTML = '<tr><td colspan="10">Aucun signalement pour ces filtres.</td></tr>';
      return;
    }

    rows.forEach(function (row) {
      var aiPriority = String(row.ai_priority || "").toUpperCase();
      var aiLabel = aiPriority ? aiPriority : "-";
      var assignedPriority = String(row.assigned_priority || "NORMAL").toUpperCase();
      var tr = document.createElement("tr");
      tr.setAttribute("data-row-id", String(row.id));
      tr.innerHTML =
        "<td>#"+ row.id + "</td>" +
        "<td><strong>" + escapeHtml(row.title || "-") + "</strong><br><small>" + escapeHtml(row.description || "") + "</small></td>" +
        "<td>" + escapeHtml(row.type || "-") + "</td>" +
        "<td>" + escapeHtml(aiLabel) + "</td>" +
        "<td><select data-field='assigned_service'>" +
        "<option value=''>Non assigne</option>" +
        serviceOptions.map(function (service) {
          return "<option value='" + service + "'" + (row.assigned_service === service ? " selected" : "") + ">" + service + "</option>";
        }).join("") +
        "</select></td>" +
        "<td>" + buildAgentSelectHtml(row.assigned_user_id) + "</td>" +
        "<td><input type='datetime-local' data-field='assigned_due_at' value='" + escapeHtml(toDateTimeInputValue(row.assigned_due_at)) + "'></td>" +
        "<td><select data-field='status'>" +
        reportStatuses.map(function (status) {
          return "<option value='" + status + "'" + (row.status === status ? " selected" : "") + ">" + status + "</option>";
        }).join("") +
        "</select><br><small>Priorite: <select data-field='assigned_priority'>" +
        assignmentPriorityOptions.map(function (priority) {
          return "<option value='" + priority + "'" + (assignedPriority === priority ? " selected" : "") + ">" + priority + "</option>";
        }).join("") +
        "</select></small></td>" +
        "<td>" + escapeHtml(fmtDate(row.created_at)) + "</td>" +
        "<td><div class='action-row'>" +
        "<button class='btn btn-soft' type='button' data-action='focus' data-id='" + row.id + "'>Voir carte</button>" +
        "<button class='btn btn-soft' type='button' data-action='auto' data-id='" + row.id + "'>Auto</button>" +
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

  async function applyReportAssignment(params) {
    var payload = {
      p_report_id: params.reportId,
      p_service: params.service || null,
      p_assigned_user_id: params.assignedUserId || null,
      p_due_at: params.dueAt || null,
      p_priority: params.priority || null,
      p_note: params.note || null,
      p_source: params.source || "manual"
    };
    var rpc = await app.client.rpc("apply_report_assignment", payload);
    if (rpc.error) throw rpc.error;
    return rpc.data || null;
  }

  async function autoAssignOpenReports(limit, onlyUnassigned) {
    var rpc = await app.client.rpc("auto_assign_open_reports", {
      p_limit: Number(limit || 40),
      p_only_unassigned: onlyUnassigned !== false
    });
    if (rpc.error) throw rpc.error;
    return rpc.data || null;
  }

  function exportCsv(rows) {
    if (!rows.length) {
      setStatus(dom.tableStatus, "Aucune ligne a exporter.", "error");
      return;
    }
    var headers = ["id", "title", "type", "status", "ai_priority", "assigned_service", "assigned_user_id", "assigned_priority", "assigned_due_at", "assignment_source", "latitude", "longitude", "created_at", "description"];
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

  function renderAiList(node, items, emptyText) {
    if (!node) return;
    node.innerHTML = "";
    if (!items || !items.length) {
      node.innerHTML = "<li>" + escapeHtml(emptyText || "Aucune donnee.") + "</li>";
      return;
    }
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = String(item);
      node.appendChild(li);
    });
  }

  function renderAiForecast(data) {
    if (!dom.aiForecast) return;
    dom.aiForecast.innerHTML = "";
    var forecast = data && data.forecast ? data.forecast : null;
    var top = data && Array.isArray(data.topTypesForecast) ? data.topTypesForecast : [];
    if (!forecast) {
      dom.aiForecast.innerHTML = "<div class='muted'>Aucune prevision.</div>";
      return;
    }

    var global = document.createElement("div");
    global.className = "forecast-item";
    global.innerHTML =
      "<span>Global</span>" +
      "<strong>J+7: " + Number(forecast.next7 || 0) + " | J+30: " + Number(forecast.next30 || 0) + " | Tendance: " + Number(forecast.trendPct || 0) + "%</strong>";
    dom.aiForecast.appendChild(global);

    top.slice(0, 5).forEach(function (row) {
      var item = document.createElement("div");
      item.className = "forecast-item";
      item.innerHTML =
        "<span>" + escapeHtml(row.type || "AUTRE") + "</span>" +
        "<strong>J+7: " + Number(row.next7 || 0) + " | Tendance: " + Number(row.trendPct || 0) + "%</strong>";
      dom.aiForecast.appendChild(item);
    });
  }

  async function runAiInsights() {
    setStatus(dom.aiStatus, "Analyse IA en cours...", null);
    try {
      var fn = getFunctionName("aiAdminInsights", "ai-admin-insights");
      var periodDays = Number(dom.aiPeriodDays && dom.aiPeriodDays.value ? dom.aiPeriodDays.value : 30);
      var data = await callFunction(fn, { periodDays: periodDays });
      if (!data || data.ok !== true) {
        throw new Error("Reponse IA invalide");
      }

      if (dom.aiSummary) {
        dom.aiSummary.textContent = String(data.summary || "Pas de resume.");
      }
      if (dom.aiMeta) {
        dom.aiMeta.textContent =
          "Modele: " + String(data.llmProvider || "rules") +
          " | Fenetre: " + String(data.periodDays || periodDays) + " jours" +
          " | Non assignes: " + Number(data.unassigned || 0) +
          " | En retard: " + Number(data.overdue || 0);
      }
      renderAiForecast(data);
      renderAiList(dom.aiRecommendations, data.recommendations || [], "Aucune recommandation.");

      var hotspots = Array.isArray(data.hotspots)
        ? data.hotspots.map(function (h) {
          return "Zone " + Number(h.lat).toFixed(3) + ", " + Number(h.lon).toFixed(3) + " | " + Number(h.count || 0) + " cas";
        })
        : [];
      renderAiList(dom.aiHotspots, hotspots, "Aucun hotspot detecte.");
      setStatus(dom.aiStatus, "Analyse IA terminee.", "success");
    } catch (err) {
      setStatus(dom.aiStatus, "Erreur analyse IA: " + err.message, "error");
    }
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
    if (dom.filterService) dom.filterService.value = "";
    if (dom.filterAssigned) dom.filterAssigned.value = "";
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
    try {
      await loadOperators();
    } catch (err) {
      app.operators = [];
      renderAssignedFilterOptions();
      setStatus(dom.tableStatus, "Info: liste des agents indisponible (verifie intervention_queue.sql).", "error");
    }
    await loadAllData();
    await runAiInsights();
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

    [dom.filterStatus, dom.filterType, dom.filterService, dom.filterAssigned, dom.filterPeriod].forEach(function (el) {
      if (el) el.addEventListener("change", applyFiltersAndRender);
    });
    dom.filterText.addEventListener("input", applyFiltersAndRender);

    dom.btnResetFilters.addEventListener("click", resetFilters);
    dom.btnReloadData.addEventListener("click", async function () {
      try {
        await loadAllData();
        await runAiInsights();
      } catch (err) {
        setStatus(dom.tableStatus, "Erreur recharge: " + err.message, "error");
      }
    });
    if (dom.btnAutoAssign) {
      dom.btnAutoAssign.addEventListener("click", async function () {
        dom.btnAutoAssign.disabled = true;
        setStatus(dom.tableStatus, "Affectation automatique en cours...", null);
        try {
          var res = await autoAssignOpenReports(80, true);
          await loadAllData();
          await runAiInsights();
          var processed = res && Number(res.processed || 0);
          setStatus(dom.tableStatus, "Auto-affectation terminee: " + processed + " dossier(s) traites.", "success");
        } catch (err) {
          setStatus(dom.tableStatus, "Echec auto-affectation: " + err.message, "error");
        } finally {
          dom.btnAutoAssign.disabled = false;
        }
      });
    }
    dom.btnExportCsv.addEventListener("click", function () {
      exportCsv(app.filteredReports);
    });
    if (dom.btnRunAiInsights) {
      dom.btnRunAiInsights.addEventListener("click", function () {
        runAiInsights().catch(function (err) {
          setStatus(dom.aiStatus, "Erreur analyse IA: " + err.message, "error");
        });
      });
    }

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

      if (action === "auto") {
        var rowAuto = btn.closest("tr");
        if (!rowAuto) return;
        var selectedAgentAuto = rowAuto.querySelector("select[data-field='assigned_user_id']");
        btn.disabled = true;
        try {
          await applyReportAssignment({
            reportId: reportId,
            assignedUserId: selectedAgentAuto ? selectedAgentAuto.value : null,
            source: "auto"
          });
          await loadAllData();
          setStatus(dom.tableStatus, "Affectation auto du signalement #" + reportId + " effectuee.", "success");
        } catch (err) {
          setStatus(dom.tableStatus, "Echec affectation auto: " + err.message, "error");
        } finally {
          btn.disabled = false;
        }
        return;
      }

      if (action === "save") {
        var row = btn.closest("tr");
        if (!row) return;
        var statusSelect = row.querySelector("select[data-field='status']");
        var serviceSelect = row.querySelector("select[data-field='assigned_service']");
        var assignedUserSelect = row.querySelector("select[data-field='assigned_user_id']");
        var assignedPrioritySelect = row.querySelector("select[data-field='assigned_priority']");
        var dueInput = row.querySelector("input[data-field='assigned_due_at']");
        if (!statusSelect) return;
        var newStatus = statusSelect.value;
        var dueIso = fromDateTimeInputValue(dueInput ? dueInput.value : "");
        btn.disabled = true;
        try {
          await applyReportAssignment({
            reportId: reportId,
            service: serviceSelect ? serviceSelect.value : null,
            assignedUserId: assignedUserSelect ? assignedUserSelect.value : null,
            priority: assignedPrioritySelect ? assignedPrioritySelect.value : null,
            dueAt: dueIso,
            source: "manual"
          });
          await updateReportStatus(reportId, newStatus);
          await loadAllData();
          setStatus(dom.tableStatus, "Affectation + statut du signalement #" + reportId + " enregistres.", "success");
        } catch (err) {
          setStatus(dom.tableStatus, "Echec sauvegarde: " + err.message, "error");
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
    fillSelect(dom.filterService, serviceOptions, true);
    renderAssignedFilterOptions();
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
