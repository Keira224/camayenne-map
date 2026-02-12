(function () {
  "use strict";

  var cfg = window.CAMAYENNE_CONFIG || {};
  var categories = cfg.poiCategories || [];
  var reportStatuses = cfg.reportStatuses || ["NOUVEAU", "EN_COURS", "RESOLU"];
  var poiPhotoBucket = cfg.poiPhotoBucket || "poi-photos";
  var app = {
    client: null,
    user: null,
    profile: null,
    role: null,
    isAdmin: false,
    poiRows: [],
    reportRows: [],
    poiPhotoObjectUrl: null,
    removePoiPhotoRequested: false
  };

  var dom = {
    authCard: document.getElementById("authCard"),
    adminApp: document.getElementById("adminApp"),
    loginEmail: document.getElementById("loginEmail"),
    loginPassword: document.getElementById("loginPassword"),
    btnSignIn: document.getElementById("btnSignIn"),
    btnSignOut: document.getElementById("btnSignOut"),
    authStatus: document.getElementById("authStatus"),
    statPoi: document.getElementById("statPoi"),
    statReports: document.getElementById("statReports"),
    statNewReports: document.getElementById("statNewReports"),
    reportFilterStatus: document.getElementById("reportFilterStatus"),
    btnReloadReports: document.getElementById("btnReloadReports"),
    reportsStatus: document.getElementById("reportsStatus"),
    reportsTableBody: document.getElementById("reportsTableBody"),
    poiFormTitle: document.getElementById("poiFormTitle"),
    poiEditId: document.getElementById("poiEditId"),
    poiName: document.getElementById("poiName"),
    poiCategory: document.getElementById("poiCategory"),
    poiAddress: document.getElementById("poiAddress"),
    poiPhone: document.getElementById("poiPhone"),
    poiLatitude: document.getElementById("poiLatitude"),
    poiLongitude: document.getElementById("poiLongitude"),
    poiStatus: document.getElementById("poiStatus"),
    poiDescription: document.getElementById("poiDescription"),
    poiPhotoFile: document.getElementById("poiPhotoFile"),
    poiCurrentPhotoPath: document.getElementById("poiCurrentPhotoPath"),
    poiPhotoPreview: document.getElementById("poiPhotoPreview"),
    btnRemovePoiPhoto: document.getElementById("btnRemovePoiPhoto"),
    btnSavePoi: document.getElementById("btnSavePoi"),
    btnResetPoiForm: document.getElementById("btnResetPoiForm"),
    poiFormStatus: document.getElementById("poiFormStatus"),
    poiSearchText: document.getElementById("poiSearchText"),
    btnReloadPoi: document.getElementById("btnReloadPoi"),
    poiListStatus: document.getElementById("poiListStatus"),
    poiTableBody: document.getElementById("poiTableBody")
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

  function fmtDate(ts) {
    if (!ts) return "-";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString("fr-FR");
  }

  function fmtAiPriority(priority) {
    var p = String(priority || "").toUpperCase();
    if (p === "HIGH") return "Haute";
    if (p === "LOW") return "Basse";
    if (p === "MEDIUM") return "Moyenne";
    return "-";
  }

  function renderAiCell(row) {
    if (!row || !row.ai_processed_at) {
      return "<small>Non traite</small>";
    }
    var confidence = Number(row.ai_confidence);
    var confidenceText = isFinite(confidence)
      ? Math.round(confidence * 100) + "%"
      : "-";
    var parts = [];
    parts.push("<small>Type suggere: " + escapeHtml(row.ai_suggested_type || "-") + "</small>");
    parts.push("<small>Priorite: " + escapeHtml(fmtAiPriority(row.ai_priority)) + " (" + escapeHtml(confidenceText) + ")</small>");
    if (row.ai_summary) {
      parts.push("<small>Resume: " + escapeHtml(row.ai_summary) + "</small>");
    }
    if (row.ai_reason) {
      parts.push("<small>Motif: " + escapeHtml(row.ai_reason) + "</small>");
    }
    return parts.join("<br>");
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
    values.forEach(function (value) {
      var opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      node.appendChild(opt);
    });
  }

  function clearPoiPhotoPreview() {
    if (app.poiPhotoObjectUrl) {
      URL.revokeObjectURL(app.poiPhotoObjectUrl);
      app.poiPhotoObjectUrl = null;
    }
    if (dom.poiPhotoPreview) {
      dom.poiPhotoPreview.hidden = true;
      dom.poiPhotoPreview.removeAttribute("src");
    }
  }

  function setPoiPhotoPreview(src) {
    if (!dom.poiPhotoPreview) return;
    if (!src) {
      clearPoiPhotoPreview();
      return;
    }
    dom.poiPhotoPreview.src = src;
    dom.poiPhotoPreview.hidden = false;
  }

  function getFileExtension(filename, fallback) {
    var name = String(filename || "");
    var idx = name.lastIndexOf(".");
    if (idx < 0) return fallback || "jpg";
    var ext = name.slice(idx + 1).toLowerCase();
    if (!ext) return fallback || "jpg";
    return ext.replace(/[^a-z0-9]/g, "") || (fallback || "jpg");
  }

  function getPhotoExtension(file) {
    var byMime = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };
    return byMime[file.type] || getFileExtension(file.name, "jpg");
  }

  function validatePoiPhoto(file) {
    if (!file) return null;
    var maxSize = cfg.poiPhotoMaxSizeBytes || (5 * 1024 * 1024);
    if (file.size > maxSize) {
      return "Photo trop lourde (max " + Math.round(maxSize / (1024 * 1024)) + " MB).";
    }
    if (!/^image\//.test(file.type || "")) {
      return "Format photo invalide.";
    }
    return null;
  }

  async function uploadPoiPhoto(poiId, file) {
    var ext = getPhotoExtension(file);
    var path = "poi/" + poiId + "/" + Date.now() + "." + ext;
    var uploadRes = await app.client.storage
      .from(poiPhotoBucket)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || ("image/" + ext)
      });
    if (uploadRes.error) throw uploadRes.error;

    var pub = app.client.storage.from(poiPhotoBucket).getPublicUrl(path);
    var publicUrl = pub && pub.data ? pub.data.publicUrl : "";
    return {
      photo_path: path,
      photo_url: publicUrl,
      photo_taken_at: new Date().toISOString()
    };
  }

  async function deletePoiPhotoObject(path) {
    if (!path) return;
    var delRes = await app.client.storage
      .from(poiPhotoBucket)
      .remove([path]);
    if (delRes.error) throw delRes.error;
  }

  function getSupabaseReady() {
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && window.supabase.createClient);
  }

  async function loadProfile(userId) {
    var response = await app.client
      .from("profiles")
      .select("user_id, role, full_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (response.error) throw response.error;
    app.profile = response.data || null;
  }

  function applyAuthUi(connected, isAdmin) {
    dom.authCard.hidden = !!connected;
    dom.btnSignOut.hidden = !connected;
    dom.adminApp.hidden = !(connected && isAdmin);
  }

  async function refreshStats() {
    var poiCountRes = await app.client.from("poi").select("id", { count: "exact", head: true });
    var reportsCountRes = await app.client.from("reports").select("id", { count: "exact", head: true });
    var newReportsCountRes = await app.client
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "NOUVEAU");
    if (poiCountRes.error) throw poiCountRes.error;
    if (reportsCountRes.error) throw reportsCountRes.error;
    if (newReportsCountRes.error) throw newReportsCountRes.error;
    dom.statPoi.textContent = String(poiCountRes.count || 0);
    dom.statReports.textContent = String(reportsCountRes.count || 0);
    dom.statNewReports.textContent = String(newReportsCountRes.count || 0);
  }

  function renderReportsTable(rows) {
    dom.reportsTableBody.innerHTML = "";
    if (!rows.length) {
      dom.reportsTableBody.innerHTML = '<tr><td colspan="7">Aucun signalement.</td></tr>';
      return;
    }

    rows.forEach(function (row) {
      var deleteBtn = app.isAdmin
        ? "<button class='btn btn-danger' type='button' data-action='report-delete' data-id='" + row.id + "'>Supprimer</button>"
        : "";
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + row.id + "</td>" +
        "<td>" + escapeHtml(row.title) + "<br><small>" + escapeHtml(row.description || "") + "</small></td>" +
        "<td>" + escapeHtml(row.type) + "</td>" +
        "<td>" + renderAiCell(row) + "</td>" +
        "<td>" +
        "<select data-action='report-status' data-id='" + row.id + "'>" +
        reportStatuses.map(function (status) {
          return "<option value='" + status + "'" + (row.status === status ? " selected" : "") + ">" + status + "</option>";
        }).join("") +
        "</select>" +
        "</td>" +
        "<td>" + fmtDate(row.created_at) + "</td>" +
        "<td class='actions'>" +
        "<button class='btn btn-secondary' type='button' data-action='report-save' data-id='" + row.id + "'>Sauver</button> " +
        deleteBtn +
        "</td>";
      dom.reportsTableBody.appendChild(tr);
    });
  }

  async function loadReports() {
    setStatus(dom.reportsStatus, "Chargement signalements...", null);
    var filter = dom.reportFilterStatus.value;
    var query = app.client
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (filter) {
      query = query.eq("status", filter);
    }
    var response = await query;
    if (response.error) {
      setStatus(dom.reportsStatus, "Erreur: " + response.error.message, "error");
      return;
    }
    app.reportRows = response.data || [];
    renderReportsTable(app.reportRows);
    setStatus(dom.reportsStatus, app.reportRows.length + " signalement(s).", "success");
  }

  async function updateReportStatus(reportId, newStatus) {
    var response = await app.client
      .from("reports")
      .update({ status: newStatus })
      .eq("id", reportId);
    if (response.error) throw response.error;
  }

  async function deleteReport(reportId) {
    var response = await app.client
      .from("reports")
      .delete()
      .eq("id", reportId);
    if (response.error) throw response.error;
  }

  function resetPoiForm() {
    dom.poiEditId.value = "";
    dom.poiName.value = "";
    dom.poiCategory.selectedIndex = 0;
    dom.poiAddress.value = "";
    dom.poiPhone.value = "";
    dom.poiLatitude.value = "";
    dom.poiLongitude.value = "";
    dom.poiStatus.value = "ACTIF";
    dom.poiDescription.value = "";
    dom.poiCurrentPhotoPath.value = "";
    app.removePoiPhotoRequested = false;
    if (dom.poiPhotoFile) {
      dom.poiPhotoFile.value = "";
    }
    clearPoiPhotoPreview();
    dom.poiFormTitle.textContent = "Ajouter un POI";
    setStatus(dom.poiFormStatus, "", null);
  }

  function setPoiForm(row) {
    clearPoiPhotoPreview();
    dom.poiEditId.value = String(row.id);
    dom.poiName.value = row.name || "";
    dom.poiCategory.value = row.category || categories[0] || "";
    dom.poiAddress.value = row.address || "";
    dom.poiPhone.value = row.phone || "";
    dom.poiLatitude.value = row.latitude;
    dom.poiLongitude.value = row.longitude;
    dom.poiStatus.value = row.status || "ACTIF";
    dom.poiDescription.value = row.description || "";
    dom.poiCurrentPhotoPath.value = row.photo_path || "";
    app.removePoiPhotoRequested = false;
    if (dom.poiPhotoFile) {
      dom.poiPhotoFile.value = "";
    }
    if (row.photo_url) {
      setPoiPhotoPreview(row.photo_url);
    }
    dom.poiFormTitle.textContent = "Modifier POI #" + row.id;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderPoiTable(rows) {
    dom.poiTableBody.innerHTML = "";
    if (!rows.length) {
      dom.poiTableBody.innerHTML = '<tr><td colspan="6">Aucun POI.</td></tr>';
      return;
    }

    rows.forEach(function (row) {
      var deleteBtn = app.isAdmin
        ? "<button class='btn btn-danger' type='button' data-action='poi-delete' data-id='" + row.id + "'>Supprimer</button>"
        : "";
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + row.id + "</td>" +
        "<td>" + escapeHtml(row.name) + "</td>" +
        "<td>" + escapeHtml(row.category || "") + "</td>" +
        "<td>" + Number(row.latitude).toFixed(6) + ", " + Number(row.longitude).toFixed(6) + "</td>" +
        "<td>" + escapeHtml(row.status || "") + (row.photo_url ? "<br><small>Photo: oui</small>" : "<br><small>Photo: non</small>") + "</td>" +
        "<td class='actions'>" +
        "<button class='btn btn-secondary' type='button' data-action='poi-edit' data-id='" + row.id + "'>Modifier</button> " +
        deleteBtn +
        "</td>";
      dom.poiTableBody.appendChild(tr);
    });
  }

  function getPoiFilteredRows() {
    var needle = (dom.poiSearchText.value || "").trim().toLowerCase();
    if (!needle) return app.poiRows.slice();
    return app.poiRows.filter(function (row) {
      return (row.name || "").toLowerCase().indexOf(needle) !== -1;
    });
  }

  async function loadPois() {
    setStatus(dom.poiListStatus, "Chargement POI...", null);
    var response = await app.client
      .from("poi")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (response.error) {
      setStatus(dom.poiListStatus, "Erreur: " + response.error.message, "error");
      return;
    }
    app.poiRows = response.data || [];
    renderPoiTable(getPoiFilteredRows());
    setStatus(dom.poiListStatus, app.poiRows.length + " POI.", "success");
  }

  async function savePoi() {
    var editId = dom.poiEditId.value ? Number(dom.poiEditId.value) : null;
    var selectedPhotoFile = dom.poiPhotoFile && dom.poiPhotoFile.files && dom.poiPhotoFile.files.length
      ? dom.poiPhotoFile.files[0]
      : null;
    var photoValidationError = validatePoiPhoto(selectedPhotoFile);
    if (photoValidationError) {
      setStatus(dom.poiFormStatus, photoValidationError, "error");
      return;
    }

    var payload = {
      name: dom.poiName.value.trim(),
      category: dom.poiCategory.value,
      address: dom.poiAddress.value.trim(),
      phone: dom.poiPhone.value.trim(),
      status: dom.poiStatus.value,
      description: dom.poiDescription.value.trim(),
      latitude: Number(dom.poiLatitude.value),
      longitude: Number(dom.poiLongitude.value)
    };

    if (!payload.name) {
      setStatus(dom.poiFormStatus, "Le nom est obligatoire.", "error");
      return;
    }
    if (!isFinite(payload.latitude) || !isFinite(payload.longitude)) {
      setStatus(dom.poiFormStatus, "Latitude/Longitude invalides.", "error");
      return;
    }

    setStatus(dom.poiFormStatus, "Enregistrement...", null);
    var response;
    var poiId = editId;
    var oldPhotoPath = dom.poiCurrentPhotoPath.value || "";

    if (editId) {
      var updatePayload = Object.assign({}, payload);
      if (app.removePoiPhotoRequested && !selectedPhotoFile) {
        updatePayload.photo_url = null;
        updatePayload.photo_path = null;
        updatePayload.photo_taken_at = null;
      }
      response = await app.client
        .from("poi")
        .update(updatePayload)
        .eq("id", editId);
      if (response.error) {
        setStatus(dom.poiFormStatus, "Erreur: " + response.error.message, "error");
        return;
      }
    } else {
      response = await app.client
        .from("poi")
        .insert(payload)
        .select("id")
        .single();
      if (response.error) {
        setStatus(dom.poiFormStatus, "Erreur: " + response.error.message, "error");
        return;
      }
      poiId = response.data && response.data.id ? Number(response.data.id) : null;
      if (!poiId) {
        setStatus(dom.poiFormStatus, "Erreur: identifiant POI manquant après insertion.", "error");
        return;
      }
    }

    if (selectedPhotoFile && poiId) {
      try {
        var photoPayload = await uploadPoiPhoto(poiId, selectedPhotoFile);
        var photoUpdate = await app.client
          .from("poi")
          .update(photoPayload)
          .eq("id", poiId);
        if (photoUpdate.error) {
          setStatus(dom.poiFormStatus, "Erreur photo: " + photoUpdate.error.message, "error");
          return;
        }
        if (oldPhotoPath && oldPhotoPath !== photoPayload.photo_path) {
          try {
            await deletePoiPhotoObject(oldPhotoPath);
          } catch (_) {
            // non bloquant
          }
        }
      } catch (err) {
        setStatus(dom.poiFormStatus, "Erreur upload photo: " + err.message, "error");
        return;
      }
    } else if (app.removePoiPhotoRequested && oldPhotoPath) {
      try {
        await deletePoiPhotoObject(oldPhotoPath);
      } catch (_) {
        // non bloquant
      }
    }

    setStatus(dom.poiFormStatus, editId ? "POI mis à jour." : "POI ajouté.", "success");
    resetPoiForm();
    await Promise.all([loadPois(), refreshStats()]);
  }

  async function deletePoi(poiId, photoPath) {
    var response = await app.client
      .from("poi")
      .delete()
      .eq("id", poiId);
    if (response.error) throw response.error;
    if (photoPath) {
      try {
        await deletePoiPhotoObject(photoPath);
      } catch (_) {
        // non bloquant
      }
    }
  }

  async function loadAdminData() {
    try {
      await Promise.all([refreshStats(), loadReports(), loadPois()]);
    } catch (err) {
      setStatus(dom.authStatus, "Erreur chargement admin: " + err.message, "error");
    }
  }

  async function handleLogin() {
    var email = dom.loginEmail.value.trim();
    var password = dom.loginPassword.value;
    if (!email || !password) {
      setStatus(dom.authStatus, "Email et mot de passe obligatoires.", "error");
      return;
    }
    setStatus(dom.authStatus, "Connexion en cours...", null);
    var response = await app.client.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (response.error) {
      setStatus(dom.authStatus, "Erreur: " + response.error.message, "error");
      return;
    }
    setStatus(dom.authStatus, "Connecté.", "success");
  }

  async function handleSignOut() {
    var response = await app.client.auth.signOut();
    if (response.error) {
      setStatus(dom.authStatus, "Erreur déconnexion: " + response.error.message, "error");
    }
  }

  async function handleSession(session) {
    app.user = session && session.user ? session.user : null;
    app.profile = null;
    app.role = null;
    app.isAdmin = false;

    if (!app.user) {
      applyAuthUi(false, false);
      setStatus(dom.authStatus, "Connecte-toi avec un compte admin.", null);
      return;
    }

    try {
      await loadProfile(app.user.id);
    } catch (err) {
      applyAuthUi(false, false);
      setStatus(dom.authStatus, "Erreur profil: " + err.message, "error");
      return;
    }

    var role = app.profile && app.profile.role ? String(app.profile.role) : "";
    var isAllowed = role === "admin" || role === "agent";
    app.role = role;
    app.isAdmin = role === "admin";

    if (!isAllowed) {
      applyAuthUi(true, false);
      setStatus(dom.authStatus, "Accès refusé: ce compte n'est ni admin ni agent.", "error");
      return;
    }

    applyAuthUi(true, true);
    setStatus(dom.authStatus, "Connecté en " + role + ": " + (app.user.email || ""), "success");
    await loadAdminData();
  }

  function wireEvents() {
    dom.btnSignIn.addEventListener("click", function () {
      handleLogin().catch(function (err) {
        setStatus(dom.authStatus, "Erreur: " + err.message, "error");
      });
    });

    dom.btnSignOut.addEventListener("click", function () {
      handleSignOut().catch(function (err) {
        setStatus(dom.authStatus, "Erreur: " + err.message, "error");
      });
    });

    dom.btnReloadReports.addEventListener("click", function () {
      loadReports().catch(function (err) {
        setStatus(dom.reportsStatus, "Erreur: " + err.message, "error");
      });
    });

    dom.reportFilterStatus.addEventListener("change", function () {
      loadReports().catch(function (err) {
        setStatus(dom.reportsStatus, "Erreur: " + err.message, "error");
      });
    });

    dom.reportsTableBody.addEventListener("click", function (evt) {
      var target = evt.target;
      var action = target && target.dataset ? target.dataset.action : "";
      if (!action) return;
      var reportId = Number(target.dataset.id);
      if (!reportId) return;

      if (action === "report-save") {
        var statusSelect = dom.reportsTableBody.querySelector("select[data-action='report-status'][data-id='" + reportId + "']");
        var newStatus = statusSelect ? statusSelect.value : "";
        if (!newStatus) return;
        updateReportStatus(reportId, newStatus).then(function () {
          setStatus(dom.reportsStatus, "Signalement #" + reportId + " mis à jour.", "success");
          return Promise.all([loadReports(), refreshStats()]);
        }).catch(function (err) {
          setStatus(dom.reportsStatus, "Erreur: " + err.message, "error");
        });
        return;
      }

      if (action === "report-delete") {
        if (!app.isAdmin) {
          setStatus(dom.reportsStatus, "Suppression réservée aux admins.", "error");
          return;
        }
        if (!window.confirm("Supprimer le signalement #" + reportId + " ?")) return;
        deleteReport(reportId).then(function () {
          setStatus(dom.reportsStatus, "Signalement supprimé.", "success");
          return Promise.all([loadReports(), refreshStats()]);
        }).catch(function (err) {
          setStatus(dom.reportsStatus, "Erreur: " + err.message, "error");
        });
      }
    });

    dom.btnSavePoi.addEventListener("click", function () {
      savePoi().catch(function (err) {
        setStatus(dom.poiFormStatus, "Erreur: " + err.message, "error");
      });
    });

    dom.btnResetPoiForm.addEventListener("click", resetPoiForm);

    if (dom.poiPhotoFile) {
      dom.poiPhotoFile.addEventListener("change", function () {
        var file = dom.poiPhotoFile.files && dom.poiPhotoFile.files.length ? dom.poiPhotoFile.files[0] : null;
        if (!file) {
          if (dom.poiCurrentPhotoPath.value) {
            var editedRow = app.poiRows.find(function (row) {
              return String(row.id) === String(dom.poiEditId.value);
            });
            if (editedRow && editedRow.photo_url) {
              setPoiPhotoPreview(editedRow.photo_url);
            } else {
              clearPoiPhotoPreview();
            }
          } else {
            clearPoiPhotoPreview();
          }
          return;
        }
        var err = validatePoiPhoto(file);
        if (err) {
          setStatus(dom.poiFormStatus, err, "error");
          dom.poiPhotoFile.value = "";
          return;
        }
        app.removePoiPhotoRequested = false;
        clearPoiPhotoPreview();
        app.poiPhotoObjectUrl = URL.createObjectURL(file);
        setPoiPhotoPreview(app.poiPhotoObjectUrl);
      });
    }

    if (dom.btnRemovePoiPhoto) {
      dom.btnRemovePoiPhoto.addEventListener("click", function () {
        app.removePoiPhotoRequested = true;
        if (dom.poiPhotoFile) {
          dom.poiPhotoFile.value = "";
        }
        clearPoiPhotoPreview();
        setStatus(dom.poiFormStatus, "La photo sera supprimée à l'enregistrement.", null);
      });
    }

    dom.btnReloadPoi.addEventListener("click", function () {
      loadPois().catch(function (err) {
        setStatus(dom.poiListStatus, "Erreur: " + err.message, "error");
      });
    });

    dom.poiSearchText.addEventListener("input", function () {
      renderPoiTable(getPoiFilteredRows());
    });

    dom.poiTableBody.addEventListener("click", function (evt) {
      var target = evt.target;
      var action = target && target.dataset ? target.dataset.action : "";
      if (!action) return;
      var poiId = Number(target.dataset.id);
      if (!poiId) return;
      var row = app.poiRows.find(function (poi) { return Number(poi.id) === poiId; });
      if (!row) return;

      if (action === "poi-edit") {
        setPoiForm(row);
        return;
      }

      if (action === "poi-delete") {
        if (!app.isAdmin) {
          setStatus(dom.poiListStatus, "Suppression réservée aux admins.", "error");
          return;
        }
        if (!window.confirm("Supprimer le POI #" + poiId + " ?")) return;
        deletePoi(poiId, row.photo_path).then(function () {
          setStatus(dom.poiListStatus, "POI supprimé.", "success");
          return Promise.all([loadPois(), refreshStats()]);
        }).catch(function (err) {
          setStatus(dom.poiListStatus, "Erreur: " + err.message, "error");
        });
      }
    });
  }

  async function bootstrap() {
    if (!getSupabaseReady()) {
      setStatus(dom.authStatus, "Config Supabase manquante dans config.js.", "error");
      return;
    }
    fillSelect(dom.poiCategory, categories, false);
    fillSelect(dom.reportFilterStatus, reportStatuses, true);
    resetPoiForm();

    app.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    wireEvents();

    app.client.auth.onAuthStateChange(function (_event, session) {
      handleSession(session).catch(function (err) {
        setStatus(dom.authStatus, "Erreur session: " + err.message, "error");
      });
    });

    var sessionResult = await app.client.auth.getSession();
    if (sessionResult.error) {
      setStatus(dom.authStatus, "Erreur session: " + sessionResult.error.message, "error");
      return;
    }
    await handleSession(sessionResult.data ? sessionResult.data.session : null);
  }

  bootstrap().catch(function (err) {
    setStatus(dom.authStatus, "Erreur initialisation: " + err.message, "error");
  });
})();
