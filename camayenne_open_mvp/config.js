window.CAMAYENNE_CONFIG = {
  defaultCenter: { lat: 9.532296, lon: -13.688565 },
  defaultZoom: 16,
  minZoom: 15,
  focusBounds: {
    south: 9.527607,
    west: -13.692973,
    north: 9.536985,
    east: -13.684157
  },
  lockToFocusBounds: false,
  enforceFocusBounds: true,
  focusOnlyData: true,
  keepMapFocused: false,
  routeFromCenterWhenOutsideFocus: false,
  showFocusOutline: true,
  gpsMaxWaitMs: 18000,
  gpsDesiredAccuracyMeters: 35,
  gpsWarnAboveMeters: 120,

  // Supabase
  supabaseUrl: "https://aeetsakqivgvrzwxvcdr.supabase.co",
  supabaseAnonKey: "sb_publishable_Ixr7edYTeKOkEDft4oe-YA_3ymJtNNS",
  tables: {
    poi: "poi",
    reports: "reports"
  },

  // openrouteservice
  openRouteServiceApiKey: "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjhiMmRiMGNjZDI5ZDQ0Y2I5ZTc0NTk5YjEzZjUzMjhmIiwiaCI6Im11cm11cjY0In0=",
  routingProfile: "driving-car",
  routingPreference: "shortest",
  routeAvoidMainRoads: true,

  tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: "&copy; OpenStreetMap contributors",

  poiCategories: [
    "PHARMACIE", "HOPITAL", "ECOLE", "UNIVERSITE", "MOSQUEE", "MARCHE",
    "RESTAURANT", "STATION_SERVICE", "BANQUE_ATM", "HOTEL", "ADMINISTRATION",
    "TRANSPORT", "LOISIRS", "AUTRES"
  ],
  reportTypes: ["VOIRIE", "ECLAIRAGE", "DECHETS", "INONDATION", "SECURITE", "AUTRE"],
  reportStatuses: ["NOUVEAU", "EN_COURS", "RESOLU"]
};
