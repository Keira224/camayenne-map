import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReportRow = {
  id: number;
  type: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string | null;
  ai_priority: string | null;
  assigned_service: string | null;
  assigned_user_id: string | null;
  assigned_priority: string | null;
  assigned_due_at: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeText(v: unknown) {
  return String(v ?? "").trim();
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function toBucket(dateIso: string | null) {
  if (!dateIso) return "";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function countBy(rows: ReportRow[], field: "type" | "status") {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = normalizeText(row[field] || "AUTRE").toUpperCase();
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function countByService(rows: ReportRow[]) {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = normalizeText(row.assigned_service || "NON_ASSIGNE").toUpperCase();
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function countWindow(rows: ReportRow[], fromTs: number, toTs: number) {
  let count = 0;
  for (const row of rows) {
    const t = row.created_at ? new Date(row.created_at).getTime() : NaN;
    if (!Number.isFinite(t)) continue;
    if (t >= fromTs && t < toTs) count += 1;
  }
  return count;
}

function computeForecast(rows: ReportRow[]) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const last7 = countWindow(rows, now - 7 * day, now);
  const prev7 = countWindow(rows, now - 14 * day, now - 7 * day);
  const trend = prev7 > 0 ? (last7 - prev7) / prev7 : (last7 > 0 ? 1 : 0);
  const safeTrend = clamp(trend, -0.5, 1.5);

  const pred7 = Math.max(0, Math.round(last7 * (1 + safeTrend)));
  const pred30 = Math.max(0, Math.round((pred7 / 7) * 30));

  return {
    last7,
    prev7,
    trendPct: Math.round(safeTrend * 100),
    next7: pred7,
    next30: pred30,
  };
}

function computeForecastByType(rows: ReportRow[]) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const types = Array.from(new Set(rows.map((r) => normalizeText(r.type || "AUTRE").toUpperCase())));
  const out: Array<{ type: string; last7: number; prev7: number; next7: number; trendPct: number }> = [];

  for (const type of types) {
    const typed = rows.filter((r) => normalizeText(r.type || "AUTRE").toUpperCase() === type);
    const last7 = countWindow(typed, now - 7 * day, now);
    const prev7 = countWindow(typed, now - 14 * day, now - 7 * day);
    const trend = prev7 > 0 ? (last7 - prev7) / prev7 : (last7 > 0 ? 1 : 0);
    const safeTrend = clamp(trend, -0.5, 1.5);
    const next7 = Math.max(0, Math.round(last7 * (1 + safeTrend)));

    out.push({
      type,
      last7,
      prev7,
      next7,
      trendPct: Math.round(safeTrend * 100),
    });
  }

  out.sort((a, b) => b.next7 - a.next7);
  return out.slice(0, 8);
}

function computeHotspots(rows: ReportRow[]) {
  const buckets: Record<string, { lat: number; lon: number; count: number }> = {};

  for (const row of rows) {
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const keyLat = lat.toFixed(3);
    const keyLon = lon.toFixed(3);
    const key = `${keyLat},${keyLon}`;

    if (!buckets[key]) {
      buckets[key] = { lat: Number(keyLat), lon: Number(keyLon), count: 0 };
    }
    buckets[key].count += 1;
  }

  return Object.values(buckets)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function buildRuleRecommendations(params: {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byService: Record<string, number>;
  unassigned: number;
  overdue: number;
  highPriority: number;
  forecast: { trendPct: number; next7: number; next30: number };
  hotspots: Array<{ lat: number; lon: number; count: number }>;
}) {
  const recs: string[] = [];
  const newCount = params.byStatus.NOUVEAU || 0;
  const inProgress = params.byStatus.EN_COURS || 0;

  if (newCount > inProgress) {
    recs.push("Augmenter la capacite de traitement initial (tri et affectation) pour reduire le stock NOUVEAU.");
  }
  if (params.unassigned >= 5) {
    recs.push("Affecter rapidement les dossiers non assignes pour eviter l'accumulation en attente.");
  }
  if (params.overdue >= 3) {
    recs.push("Traiter les echeances depassees en priorite (retard operationnel detecte).");
  }
  if (params.highPriority >= 3) {
    recs.push("Mettre en place une revue quotidienne des signalements IA 'HIGH' avec priorite intervention 24h.");
  }
  if (params.forecast.trendPct >= 20) {
    recs.push("Prévoir un renfort temporaire d'agents: la tendance des signalements est en hausse.");
  }
  const topType = Object.entries(params.byType).sort((a, b) => b[1] - a[1])[0];
  if (topType && topType[1] >= 3) {
    recs.push(`Lancer une action ciblee sur le type '${topType[0]}' (cause recurrente observee).`);
  }
  if (params.hotspots.length && params.hotspots[0].count >= 3) {
    recs.push("Traiter la zone hotspot prioritaire avec une intervention terrain preventive.");
  }
  const topService = Object.entries(params.byService).sort((a, b) => b[1] - a[1])[0];
  if (topService && topService[1] >= 4) {
    recs.push(`Renforcer temporairement la capacite du service '${topService[0]}' sur la prochaine semaine.`);
  }
  if (!recs.length) {
    recs.push("Situation stable: maintenir la cadence actuelle et surveiller les nouveaux signalements.");
  }
  return recs.slice(0, 5);
}

async function generateGeminiAdminSummary(params: {
  periodDays: number;
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byService: Record<string, number>;
  unassigned: number;
  overdue: number;
  highPriority: number;
  forecast: { last7: number; prev7: number; trendPct: number; next7: number; next30: number };
  topTypesForecast: Array<{ type: string; next7: number; trendPct: number }>;
  hotspots: Array<{ lat: number; lon: number; count: number }>;
  recommendations: string[];
}) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;
  const model = Deno.env.get("GEMINI_MODEL_ADMIN") || Deno.env.get("GEMINI_MODEL_PUBLIC") || "gemini-2.5-flash-lite";

  const system = [
    "Tu es un assistant d'aide a la decision pour la mairie de Camayenne.",
    "Reponds en francais clair, operationnel, sans jargon inutile.",
    "N'invente aucun chiffre.",
    "Donne: 1) un resume executif 2) les risques 7 jours 3) actions prioritaires.",
    "Limite la reponse a 8 phrases maximum.",
  ].join("\n");

  const payloadText = JSON.stringify({
    periodDays: params.periodDays,
    total: params.total,
    byStatus: params.byStatus,
    byType: params.byType,
    byService: params.byService,
    unassigned: params.unassigned,
    overdue: params.overdue,
    highPriority: params.highPriority,
    forecast: params.forecast,
    topTypesForecast: params.topTypesForecast,
    hotspots: params.hotspots,
    baseRecommendations: params.recommendations,
  });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${system}\n\nDonnees:\n${payloadText}` }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 500,
        },
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map((p: Record<string, unknown>) => normalizeText(p?.text)).join("\n").trim()
      : "";
    return text ? text.slice(0, 1800) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Missing Supabase env vars" }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!token) return json({ error: "Missing auth token" }, 401);

    const authClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const authRes = await authClient.auth.getUser();
    if (authRes.error || !authRes.data.user) {
      return json({ error: "Invalid auth token" }, 401);
    }
    const userId = authRes.data.user.id;

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const profileRes = await admin
      .from("profiles")
      .select("role, is_active")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileRes.error) return json({ error: "Profile read failed", detail: profileRes.error.message }, 500);
    const profile = profileRes.data;
    const role = normalizeText(profile?.role).toLowerCase();
    const isActive = !!profile?.is_active;
    if (!isActive || (role !== "admin" && role !== "agent")) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const rawPeriod = Number(body?.periodDays);
    const periodDays = Number.isFinite(rawPeriod) ? clamp(Math.round(rawPeriod), 7, 180) : 30;
    const sinceIso = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    const reportsRes = await admin
      .from("reports")
      .select("id, type, status, latitude, longitude, created_at, ai_priority, assigned_service, assigned_user_id, assigned_priority, assigned_due_at")
      .gte("created_at", sinceIso)
      .limit(8000);
    if (reportsRes.error) {
      return json({ error: "Reports read failed", detail: reportsRes.error.message }, 500);
    }
    const rows = (reportsRes.data || []) as ReportRow[];

    const byStatus = countBy(rows, "status");
    const byType = countBy(rows, "type");
    const byService = countByService(rows);
    const highPriority = rows.filter((r) => normalizeText(r.ai_priority).toUpperCase() === "HIGH").length;
    const unassigned = rows.filter((r) => !normalizeText(r.assigned_service)).length;
    const overdue = rows.filter((r) => {
      const due = r.assigned_due_at ? new Date(r.assigned_due_at).getTime() : NaN;
      const status = normalizeText(r.status).toUpperCase();
      return Number.isFinite(due) && due < Date.now() && status !== "RESOLU";
    }).length;
    const forecast = computeForecast(rows);
    const topTypesForecast = computeForecastByType(rows);
    const hotspots = computeHotspots(rows);

    const dailyCounts: Record<string, number> = {};
    for (const row of rows) {
      const key = toBucket(row.created_at);
      if (!key) continue;
      dailyCounts[key] = (dailyCounts[key] || 0) + 1;
    }

    const recommendations = buildRuleRecommendations({
      total: rows.length,
      byStatus,
      byType,
      byService,
      unassigned,
      overdue,
      highPriority,
      forecast,
      hotspots,
    });

    const geminiSummary = await generateGeminiAdminSummary({
      periodDays,
      total: rows.length,
      byStatus,
      byType,
      byService,
      unassigned,
      overdue,
      highPriority,
      forecast,
      topTypesForecast: topTypesForecast.map((x) => ({ type: x.type, next7: x.next7, trendPct: x.trendPct })),
      hotspots,
      recommendations,
    });

    const summary = geminiSummary || "Analyse automatique generee (mode regles).";

    return json({
      ok: true,
      periodDays,
      total: rows.length,
      byStatus,
      byType,
      byService,
      unassigned,
      overdue,
      highPriority,
      forecast,
      topTypesForecast,
      hotspots,
      dailyCounts,
      recommendations,
      summary,
      llmProvider: geminiSummary ? "gemini" : "rules",
    });
  } catch (err) {
    return json({ error: "Unexpected error", detail: (err as Error).message }, 500);
  }
});
