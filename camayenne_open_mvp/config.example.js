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
  gpsMaxWaitMs: 24000,
  gpsDesiredAccuracyMeters: 20,
  gpsWarnAboveMeters: 80,
  gpsMinReadings: 5,
  gpsStabilityMeters: 35,
  gpsMaxSampleAccuracyMeters: 180,
  gpsOutlierDistanceMeters: 90,
  gpsJumpProtection: true,
  gpsJumpProtectMaxAgeMs: 300000,
  gpsJumpRejectDistanceMeters: 220,
  gpsJumpRejectAccuracyMeters: 60,
  currentPositionMaxAgeMs: 45000,
  navAutoStart: false,
  navFollowUser: true,
  navArrivalDistanceMeters: 20,
  navOffRouteThresholdMeters: 45,
  navRerouteCooldownMs: 10000,
  navMaxAccuracyMeters: 120,
  navMaximumAgeMs: 1000,
  navTimeoutMs: 12000,
  publicMode: true,
  allowPoiSubmission: false,
  useSecureFunctions: true,
  functionsBaseUrl: "https://YOUR_PROJECT.supabase.co/functions/v1",
  // Optionnel: JWT anon legacy (eyJ...) pour fonctions avec verify_jwt activé
  functionsAuthToken: "",
  functionNames: {
    submitReport: "submit-report",
    route: "route"
  },

  // Remplace par ton projet Supabase
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
  tables: {
    poi: "poi",
    reports: "reports"
  },
  poiPhotoBucket: "poi-photos",
  poiPhotoMaxSizeBytes: 5242880,

  // Remplace par ta clé openrouteservice
  openRouteServiceApiKey: "",
  routingProfile: "driving-car",
  routingPreference: "shortest",
  routeAvoidMainRoads: true,

  // Tu peux laisser les valeurs par défaut pour démarrer
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
