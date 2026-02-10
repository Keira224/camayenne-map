define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/_base/array",
    "dojo/dom",
    "dojo/dom-construct",
    "dojo/dom-class",
    "dojo/on",
    "dojo/query",
    "esri/graphic",
    "esri/geometry/webMercatorUtils",
    "esri/layers/GraphicsLayer",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/symbols/SimpleLineSymbol",
    "esri/Color",
    "esri/tasks/query"
], function (
    declare,
    lang,
    array,
    dom,
    domConstruct,
    domClass,
    on,
    query,
    Graphic,
    webMercatorUtils,
    GraphicsLayer,
    SimpleMarkerSymbol,
    SimpleLineSymbol,
    Color,
    Query
) {
    return declare(null, {
        map: null,
        config: null,
        poiLayer: null,
        reportsLayer: null,
        sketchLayer: null,
        pickMode: null,
        lastPoint: null,
        nodes: null,

        constructor: function (options) {
            this.map = options.map;
            this.config = options.config || {};
            this.poiLayer = options.poiLayer || null;
            this.reportsLayer = options.reportsLayer || null;
            this.nodes = {};
            this.i18n = (this.config && this.config.i18n && this.config.i18n.camayenne) ? this.config.i18n.camayenne : null;
        },

        startup: function () {
            if (!this.map) {
                return;
            }
            this._cacheNodes();
            this._initTabs();
            this._applyI18n();
            this._populateSelects();
            this._initSketchLayer();
            this._wireEvents();
            this._applyReportsFilter();
        },

        _cacheNodes: function () {
            this.nodes.camPanel = dom.byId("camayennePanel");
            this.nodes.camPanelToggle = dom.byId("camPanelToggle");
            this.nodes.poiSearchName = dom.byId("poiSearchName");
            this.nodes.poiSearchCategory = dom.byId("poiSearchCategory");
            this.nodes.poiSearchResults = dom.byId("poiSearchResults");
            this.nodes.poiSearchStatus = dom.byId("poiSearchStatus");
            this.nodes.poiLayerToggle = dom.byId("poiLayerToggle");
            this.nodes.poiAddName = dom.byId("poiAddName");
            this.nodes.poiAddCategory = dom.byId("poiAddCategory");
            this.nodes.poiAddAddress = dom.byId("poiAddAddress");
            this.nodes.poiAddPhone = dom.byId("poiAddPhone");
            this.nodes.poiAddDescription = dom.byId("poiAddDescription");
            this.nodes.poiCoord = dom.byId("poiCoord");
            this.nodes.poiAddStatus = dom.byId("poiAddStatus");
            this.nodes.reportType = dom.byId("reportType");
            this.nodes.reportStatus = dom.byId("reportStatus");
            this.nodes.reportTitle = dom.byId("reportTitle");
            this.nodes.reportDescription = dom.byId("reportDescription");
            this.nodes.reportCoord = dom.byId("reportCoord");
            this.nodes.reportStatusMessage = dom.byId("reportStatusMessage");
            this.nodes.reportsFilterType = dom.byId("reportsFilterType");
            this.nodes.reportsFilterStatus = dom.byId("reportsFilterStatus");
            this.nodes.reportsLayerToggle = dom.byId("reportsLayerToggle");
        },

        _initTabs: function () {
            var buttons = query(".cam-tab-button");
            buttons.forEach(lang.hitch(this, function (btn) {
                on(btn, "click", lang.hitch(this, function () {
                    var tabId = btn.getAttribute("data-tab");
                    buttons.forEach(function (b) { domClass.remove(b, "is-active"); });
                    domClass.add(btn, "is-active");
                    query(".cam-tab").forEach(function (tab) { domClass.remove(tab, "is-active"); });
                    domClass.add(dom.byId("cam-tab-" + tabId), "is-active");
                }));
            }));
        },

        _applyI18n: function () {
            if (!this.i18n) {
                return;
            }
            var t = this.i18n;
            var setText = function (selector, value) {
                var node = query(selector)[0];
                if (node && value) {
                    node.innerHTML = value;
                }
            };
            var setLabel = function (forId, value) {
                var node = query("label[for='" + forId + "']")[0];
                if (node && value) {
                    node.innerHTML = value;
                }
            };
            var setPlaceholder = function (id, value) {
                var node = dom.byId(id);
                if (node && value) {
                    node.setAttribute("placeholder", value);
                }
            };

            setText(".cam-tab-button[data-tab='search']", t.tabs && t.tabs.search);
            setText(".cam-tab-button[data-tab='add']", t.tabs && t.tabs.add);
            setText(".cam-tab-button[data-tab='report']", t.tabs && t.tabs.report);

            setText("#cam-tab-search .cam-title", t.sections && t.sections.searchTitle);
            setText("#cam-tab-add .cam-title", t.sections && t.sections.addTitle);
            setText("#cam-tab-report .cam-title", t.sections && t.sections.reportTitle);

            setLabel("poiSearchName", t.labels && t.labels.name);
            setLabel("poiSearchCategory", t.labels && t.labels.category);
            setLabel("poiAddName", t.labels && t.labels.name);
            setLabel("poiAddCategory", t.labels && t.labels.category);
            setLabel("poiAddAddress", t.labels && t.labels.address);
            setLabel("poiAddPhone", t.labels && t.labels.phone);
            setLabel("poiAddDescription", t.labels && t.labels.description);
            setLabel("reportType", t.labels && t.labels.type);
            setLabel("reportStatus", t.labels && t.labels.status);
            setLabel("reportTitle", t.labels && t.labels.title);
            setLabel("reportDescription", t.labels && t.labels.description);
            setLabel("reportsFilterType", t.labels && t.labels.filterType);
            setLabel("reportsFilterStatus", t.labels && t.labels.filterStatus);

            setPlaceholder("poiSearchName", t.placeholders && t.placeholders.searchName);
            setPlaceholder("poiAddName", t.placeholders && t.placeholders.name);
            setPlaceholder("poiAddAddress", t.placeholders && t.placeholders.address);
            setPlaceholder("poiAddPhone", t.placeholders && t.placeholders.phone);
            setPlaceholder("poiAddDescription", t.placeholders && t.placeholders.description);
            setPlaceholder("reportTitle", t.placeholders && t.placeholders.reportTitle);
            setPlaceholder("reportDescription", t.placeholders && t.placeholders.reportDescription);

            if (dom.byId("poiSearchSubmit") && t.buttons) {
                dom.byId("poiSearchSubmit").innerHTML = t.buttons.search || dom.byId("poiSearchSubmit").innerHTML;
            }
            if (dom.byId("poiSearchClear") && t.buttons) {
                dom.byId("poiSearchClear").innerHTML = t.buttons.clear || dom.byId("poiSearchClear").innerHTML;
            }
            if (dom.byId("poiPickLocation") && t.buttons) {
                dom.byId("poiPickLocation").innerHTML = t.buttons.pick || dom.byId("poiPickLocation").innerHTML;
            }
            if (dom.byId("poiUseCenter") && t.buttons) {
                dom.byId("poiUseCenter").innerHTML = t.buttons.useCenter || dom.byId("poiUseCenter").innerHTML;
            }
            if (dom.byId("poiAddSubmit") && t.buttons) {
                dom.byId("poiAddSubmit").innerHTML = t.buttons.submit || dom.byId("poiAddSubmit").innerHTML;
            }
            if (dom.byId("poiAddReset") && t.buttons) {
                dom.byId("poiAddReset").innerHTML = t.buttons.reset || dom.byId("poiAddReset").innerHTML;
            }
            if (dom.byId("reportPickLocation") && t.buttons) {
                dom.byId("reportPickLocation").innerHTML = t.buttons.pick || dom.byId("reportPickLocation").innerHTML;
            }
            if (dom.byId("reportUseCenter") && t.buttons) {
                dom.byId("reportUseCenter").innerHTML = t.buttons.useCenter || dom.byId("reportUseCenter").innerHTML;
            }
            if (dom.byId("reportSubmit") && t.buttons) {
                dom.byId("reportSubmit").innerHTML = t.buttons.submit || dom.byId("reportSubmit").innerHTML;
            }
            if (dom.byId("reportReset") && t.buttons) {
                dom.byId("reportReset").innerHTML = t.buttons.reset || dom.byId("reportReset").innerHTML;
            }

            var poiToggleLabel = query("label.cam-toggle")[0];
            if (poiToggleLabel && t.toggles && t.toggles.showPoi) {
                poiToggleLabel.lastChild.nodeValue = t.toggles.showPoi;
            }
            var reportToggleLabel = query("label.cam-toggle")[1];
            if (reportToggleLabel && t.toggles && t.toggles.showReports) {
                reportToggleLabel.lastChild.nodeValue = t.toggles.showReports;
            }

            if (this.nodes.poiCoord && t.misc && t.misc.pointUnset) {
                this.nodes.poiCoord.innerHTML = t.misc.pointUnset;
            }
            if (this.nodes.reportCoord && t.misc && t.misc.pointUnset) {
                this.nodes.reportCoord.innerHTML = t.misc.pointUnset;
            }
            if (this.nodes.camPanelToggle && t.misc) {
                this.nodes.camPanelToggle.title = t.misc.panelCollapse || this.nodes.camPanelToggle.title;
            }
        },

        _populateSelects: function () {
            var cam = this.config.camayenne || {};
            var categories = cam.poiCategories || [];
            var reportTypes = cam.reportTypes || [];
            var reportStatuses = cam.reportStatuses || [];

            var allLabel = this._t("options.all", "Tous");
            this._fillSelect(this.nodes.poiSearchCategory, [{ value: "", label: allLabel }].concat(categories), "categories");
            this._fillSelect(this.nodes.poiAddCategory, categories, "categories");
            this._fillSelect(this.nodes.reportType, reportTypes, "reportTypes");
            this._fillSelect(this.nodes.reportStatus, reportStatuses, "reportStatuses");
            this._fillSelect(this.nodes.reportsFilterType, [{ value: "", label: allLabel }].concat(reportTypes), "reportTypes");
            this._fillSelect(this.nodes.reportsFilterStatus, [{ value: "", label: allLabel }].concat(reportStatuses), "reportStatuses");

            if (this.nodes.poiLayerToggle) {
                this.nodes.poiLayerToggle.checked = !cam.lightMode;
            }
            if (this.nodes.reportsLayerToggle) {
                this.nodes.reportsLayerToggle.checked = !cam.lightMode;
            }
        },

        _fillSelect: function (selectNode, values, mapKey) {
            if (!selectNode) {
                return;
            }
            domConstruct.empty(selectNode);
            var map = this._getMap(mapKey);
            array.forEach(values, function (val) {
                var label = val.label || val.value || "";
                if (map && val.value && map[val.value]) {
                    label = map[val.value];
                }
                domConstruct.create("option", {
                    value: val.value || "",
                    innerHTML: label
                }, selectNode);
            });
        },

        _initSketchLayer: function () {
            this.sketchLayer = new GraphicsLayer({ id: "camayenneSketch" });
            this.map.addLayer(this.sketchLayer);
        },

        _wireEvents: function () {
            var cam = this.config.camayenne || {};

            if (this.nodes.camPanel && this.nodes.camPanelToggle) {
                on(this.nodes.camPanelToggle, "click", lang.hitch(this, function () {
                    var isCollapsed = domClass.toggle(this.nodes.camPanel, "is-collapsed");
                    this.nodes.camPanelToggle.innerHTML = isCollapsed ? "+" : "–";
                    this.nodes.camPanelToggle.title = isCollapsed ? this._t("misc.panelExpand", "Ouvrir") : this._t("misc.panelCollapse", "Réduire");
                }));
            }

            on(dom.byId("poiSearchSubmit"), "click", lang.hitch(this, this._runPoiSearch));
            on(dom.byId("poiSearchClear"), "click", lang.hitch(this, this._clearPoiSearch));
            on(dom.byId("poiAddSubmit"), "click", lang.hitch(this, this._submitPoi));
            on(dom.byId("poiAddReset"), "click", lang.hitch(this, this._resetPoiForm));
            on(dom.byId("reportSubmit"), "click", lang.hitch(this, this._submitReport));
            on(dom.byId("reportReset"), "click", lang.hitch(this, this._resetReportForm));

            on(dom.byId("poiPickLocation"), "click", lang.hitch(this, function () {
                this.pickMode = "poi";
                this._setStatus(this.nodes.poiAddStatus, this._t("misc.pickOnMap", "Touchez la carte pour placer le point."), "info");
            }));
            on(dom.byId("reportPickLocation"), "click", lang.hitch(this, function () {
                this.pickMode = "report";
                this._setStatus(this.nodes.reportStatusMessage, this._t("misc.pickOnMap", "Touchez la carte pour placer le point."), "info");
            }));
            on(dom.byId("poiUseCenter"), "click", lang.hitch(this, function () {
                this._setPointFromCenter("poi");
            }));
            on(dom.byId("reportUseCenter"), "click", lang.hitch(this, function () {
                this._setPointFromCenter("report");
            }));

            if (this.nodes.poiLayerToggle) {
                on(this.nodes.poiLayerToggle, "change", lang.hitch(this, function () {
                    if (this.poiLayer) {
                        this.poiLayer.setVisibility(this.nodes.poiLayerToggle.checked);
                    }
                }));
            }
            if (this.nodes.reportsLayerToggle) {
                on(this.nodes.reportsLayerToggle, "change", lang.hitch(this, function () {
                    if (this.reportsLayer) {
                        this.reportsLayer.setVisibility(this.nodes.reportsLayerToggle.checked);
                    }
                }));
            }

            if (this.nodes.reportsFilterType) {
                on(this.nodes.reportsFilterType, "change", lang.hitch(this, this._applyReportsFilter));
            }
            if (this.nodes.reportsFilterStatus) {
                on(this.nodes.reportsFilterStatus, "change", lang.hitch(this, this._applyReportsFilter));
            }

            this.map.on("click", lang.hitch(this, function (evt) {
                if (!this.pickMode) {
                    return;
                }
                this.lastPoint = evt.mapPoint;
                this._drawPickPoint();
                this._updateCoordDisplay();
                this.pickMode = null;
            }));

            if (cam.lightMode) {
                if (this.poiLayer) {
                    this.poiLayer.setVisibility(false);
                }
                if (this.reportsLayer) {
                    this.reportsLayer.setVisibility(false);
                }
            }
        },

        _setPointFromCenter: function (target) {
            if (!this.map) {
                return;
            }
            this.lastPoint = this.map.extent.getCenter();
            this._drawPickPoint();
            this._updateCoordDisplay();
            if (target === "poi") {
                this._setStatus(this.nodes.poiAddStatus, this._t("misc.pointSetCenter", "Point défini au centre de la carte."), "info");
            } else {
                this._setStatus(this.nodes.reportStatusMessage, this._t("misc.pointSetCenter", "Point défini au centre de la carte."), "info");
            }
        },

        _drawPickPoint: function () {
            if (!this.sketchLayer || !this.lastPoint) {
                return;
            }
            this.sketchLayer.clear();
            var outline = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([255, 255, 255, 1]), 1);
            var symbol = new SimpleMarkerSymbol(SimpleMarkerSymbol.STYLE_CIRCLE, 16, outline, new Color([43, 124, 106, 0.9]));
            this.sketchLayer.add(new Graphic(this.lastPoint, symbol));
        },

        _updateCoordDisplay: function () {
            if (!this.lastPoint) {
                return;
            }
            var geo = this.lastPoint;
            if (webMercatorUtils.canProject(geo)) {
                geo = webMercatorUtils.webMercatorToGeographic(geo);
            }
            var text = this._t("misc.pointPrefix", "Point:") + " " + geo.y.toFixed(5) + ", " + geo.x.toFixed(5);
            if (this.nodes.poiCoord) {
                this.nodes.poiCoord.innerHTML = text;
            }
            if (this.nodes.reportCoord) {
                this.nodes.reportCoord.innerHTML = text;
            }
        },

        _runPoiSearch: function () {
            if (!this.poiLayer) {
                this._setStatus(this.nodes.poiSearchStatus, this._t("misc.poiLayerMissing", "POI layer non configurée."), "error");
                return;
            }
            var cam = this.config.camayenne || {};
            var fields = (cam.fields && cam.fields.poi) ? cam.fields.poi : {};
            var nameField = fields.name || "name";
            var categoryField = fields.category || "category";
            var nameVal = (this.nodes.poiSearchName && this.nodes.poiSearchName.value) ? this.nodes.poiSearchName.value.trim() : "";
            var categoryVal = (this.nodes.poiSearchCategory && this.nodes.poiSearchCategory.value) ? this.nodes.poiSearchCategory.value : "";

            var whereParts = ["1=1"];
            if (nameVal) {
                whereParts.push(nameField + " LIKE '%" + this._escapeSql(nameVal) + "%'");
            }
            if (categoryVal) {
                whereParts.push(categoryField + " = '" + this._escapeSql(categoryVal) + "'");
            }

            var queryObj = new Query();
            queryObj.where = whereParts.join(" AND ");
            queryObj.outFields = ["*"];
            queryObj.returnGeometry = true;
            if (cam.lightMode && this.map && this.map.extent) {
                queryObj.geometry = this.map.extent;
                queryObj.spatialRelationship = Query.SPATIAL_REL_INTERSECTS;
            }

            this.poiLayer.queryFeatures(queryObj, lang.hitch(this, function (result) {
                this._setStatus(this.nodes.poiSearchStatus, "", "info");
                this._renderPoiResults(result && result.features ? result.features : []);
            }), lang.hitch(this, function (err) {
                this._renderPoiResults([]);
                this._setStatus(this.nodes.poiSearchStatus, this._t("misc.searchError", "Erreur de recherche."), "error");
                console.log(err);
            }));
        },

        _renderPoiResults: function (features) {
            var container = this.nodes.poiSearchResults;
            if (!container) {
                return;
            }
            domConstruct.empty(container);
            if (!features || features.length === 0) {
                domConstruct.create("div", {
                    className: "cam-result",
                    innerHTML: this._t("misc.noResults", "Aucun résultat.")
                }, container);
                return;
            }
            array.forEach(features, lang.hitch(this, function (feature) {
                var name = feature.getTitle ? feature.getTitle() : "";
                if (!name || name === "") {
                    name = feature.attributes && feature.attributes.name ? feature.attributes.name : "Lieu";
                }
                var cat = feature.attributes && feature.attributes.category ? feature.attributes.category : "";
                var row = domConstruct.create("div", {
                    className: "cam-result",
                    innerHTML: "<strong>" + name + "</strong><br/>" + cat
                }, container);
                on(row, "click", lang.hitch(this, function () {
                    this._zoomToFeature(feature);
                }));
            }));
        },

        _zoomToFeature: function (feature) {
            if (!feature || !feature.geometry || !this.map) {
                return;
            }
            var geom = feature.geometry;
            var center = geom;
            if (geom.getExtent) {
                center = geom.getExtent().getCenter();
            }
            var zoom = (this.config && this.config.defaultZoomLevel) ? this.config.defaultZoomLevel : 15;
            this.map.centerAndZoom(center, zoom);
            if (this.map.infoWindow && feature.getContent) {
                this.map.infoWindow.setTitle(feature.getTitle ? feature.getTitle() : "");
                this.map.infoWindow.setContent(feature.getContent());
                this.map.infoWindow.show(center);
            }
            this.lastPoint = center;
            this._drawPickPoint();
        },

        _clearPoiSearch: function () {
            if (this.nodes.poiSearchName) {
                this.nodes.poiSearchName.value = "";
            }
            if (this.nodes.poiSearchCategory) {
                this.nodes.poiSearchCategory.value = "";
            }
            this._renderPoiResults([]);
            this._setStatus(this.nodes.poiSearchStatus, "", "info");
        },

        _submitPoi: function () {
            if (!this.poiLayer) {
                this._setStatus(this.nodes.poiAddStatus, this._t("misc.poiLayerMissing", "POI layer non configurée."), "error");
                return;
            }
            if (!this.lastPoint) {
                this._setStatus(this.nodes.poiAddStatus, this._t("misc.pickOnMap", "Définissez un point sur la carte."), "error");
                return;
            }
            var cam = this.config.camayenne || {};
            var fields = (cam.fields && cam.fields.poi) ? cam.fields.poi : {};
            var attrs = {};
            attrs[fields.name || "name"] = this.nodes.poiAddName ? this.nodes.poiAddName.value : "";
            attrs[fields.category || "category"] = this.nodes.poiAddCategory ? this.nodes.poiAddCategory.value : "";
            attrs[fields.address || "address"] = this.nodes.poiAddAddress ? this.nodes.poiAddAddress.value : "";
            attrs[fields.phone || "phone"] = this.nodes.poiAddPhone ? this.nodes.poiAddPhone.value : "";
            attrs[fields.description || "description"] = this.nodes.poiAddDescription ? this.nodes.poiAddDescription.value : "";
            attrs[fields.status || "status"] = "ACTIF";
            if (fields.createdAt) {
                attrs[fields.createdAt] = new Date();
            }

            var graphic = new Graphic(this.lastPoint, null, attrs);
            this.poiLayer.applyEdits([graphic], null, null, lang.hitch(this, function () {
                this._setStatus(this.nodes.poiAddStatus, this._t("misc.poiAdded", "Lieu ajouté. Merci."), "success");
                this._resetPoiForm(false);
                this.poiLayer.refresh();
                if (this.nodes.poiLayerToggle) {
                    this.nodes.poiLayerToggle.checked = true;
                    this.poiLayer.setVisibility(true);
                }
            }), lang.hitch(this, function (err) {
                console.log(err);
                this._setStatus(this.nodes.poiAddStatus, this._t("misc.sendError", "Erreur lors de l'envoi."), "error");
            }));
        },

        _resetPoiForm: function (clearMessage) {
            if (this.nodes.poiAddName) { this.nodes.poiAddName.value = ""; }
            if (this.nodes.poiAddCategory) { this.nodes.poiAddCategory.selectedIndex = 0; }
            if (this.nodes.poiAddAddress) { this.nodes.poiAddAddress.value = ""; }
            if (this.nodes.poiAddPhone) { this.nodes.poiAddPhone.value = ""; }
            if (this.nodes.poiAddDescription) { this.nodes.poiAddDescription.value = ""; }
            if (this.nodes.poiCoord) { this.nodes.poiCoord.innerHTML = this._t("misc.pointUnset", "Point: non défini"); }
            if (clearMessage !== false) {
                this._setStatus(this.nodes.poiAddStatus, "", "info");
            }
        },

        _submitReport: function () {
            if (!this.reportsLayer) {
                this._setStatus(this.nodes.reportStatusMessage, this._t("misc.reportLayerMissing", "Signalements non configurés."), "error");
                return;
            }
            if (!this.lastPoint) {
                this._setStatus(this.nodes.reportStatusMessage, this._t("misc.pickOnMap", "Définissez un point sur la carte."), "error");
                return;
            }
            var cam = this.config.camayenne || {};
            var fields = (cam.fields && cam.fields.reports) ? cam.fields.reports : {};
            var attrs = {};
            attrs[fields.title || "title"] = this.nodes.reportTitle ? this.nodes.reportTitle.value : "";
            attrs[fields.type || "type"] = this.nodes.reportType ? this.nodes.reportType.value : "";
            attrs[fields.status || "status"] = this.nodes.reportStatus ? this.nodes.reportStatus.value : "";
            attrs[fields.description || "description"] = this.nodes.reportDescription ? this.nodes.reportDescription.value : "";
            if (fields.createdAt) {
                attrs[fields.createdAt] = new Date();
            }

            var graphic = new Graphic(this.lastPoint, null, attrs);
            this.reportsLayer.applyEdits([graphic], null, null, lang.hitch(this, function () {
                this._setStatus(this.nodes.reportStatusMessage, this._t("misc.reportSent", "Signalement envoyé. Merci."), "success");
                this._resetReportForm(false);
                this.reportsLayer.refresh();
                if (this.nodes.reportsLayerToggle) {
                    this.nodes.reportsLayerToggle.checked = true;
                    this.reportsLayer.setVisibility(true);
                }
            }), lang.hitch(this, function (err) {
                console.log(err);
                this._setStatus(this.nodes.reportStatusMessage, this._t("misc.sendError", "Erreur lors de l'envoi."), "error");
            }));
        },

        _resetReportForm: function (clearMessage) {
            if (this.nodes.reportType) { this.nodes.reportType.selectedIndex = 0; }
            if (this.nodes.reportStatus) { this.nodes.reportStatus.selectedIndex = 0; }
            if (this.nodes.reportTitle) { this.nodes.reportTitle.value = ""; }
            if (this.nodes.reportDescription) { this.nodes.reportDescription.value = ""; }
            if (this.nodes.reportCoord) { this.nodes.reportCoord.innerHTML = this._t("misc.pointUnset", "Point: non défini"); }
            if (clearMessage !== false) {
                this._setStatus(this.nodes.reportStatusMessage, "", "info");
            }
        },

        _applyReportsFilter: function () {
            if (!this.reportsLayer) {
                return;
            }
            var cam = this.config.camayenne || {};
            var fields = (cam.fields && cam.fields.reports) ? cam.fields.reports : {};
            var typeField = fields.type || "type";
            var statusField = fields.status || "status";
            var typeVal = this.nodes.reportsFilterType ? this.nodes.reportsFilterType.value : "";
            var statusVal = this.nodes.reportsFilterStatus ? this.nodes.reportsFilterStatus.value : "";

            var whereParts = ["1=1"];
            if (typeVal) {
                whereParts.push(typeField + " = '" + this._escapeSql(typeVal) + "'");
            }
            if (statusVal) {
                whereParts.push(statusField + " = '" + this._escapeSql(statusVal) + "'");
            }
            this.reportsLayer.setDefinitionExpression(whereParts.join(" AND "));
            this.reportsLayer.refresh();
        },

        _escapeSql: function (value) {
            return String(value).replace(/'/g, "''");
        },

        _setStatus: function (node, message, level) {
            if (!node) {
                return;
            }
            domClass.remove(node, "is-error");
            domClass.remove(node, "is-success");
            if (level === "error") {
                domClass.add(node, "is-error");
            }
            if (level === "success") {
                domClass.add(node, "is-success");
            }
            node.innerHTML = message || "";
        },

        _t: function (path, fallback) {
            if (!this.i18n || !path) {
                return fallback;
            }
            var parts = path.split(".");
            var cur = this.i18n;
            for (var i = 0; i < parts.length; i++) {
                if (!cur || !cur.hasOwnProperty(parts[i])) {
                    return fallback;
                }
                cur = cur[parts[i]];
            }
            return cur || fallback;
        },

        _getMap: function (key) {
            if (!this.i18n || !key || !this.i18n[key]) {
                return null;
            }
            return this.i18n[key];
        }
    });
});
