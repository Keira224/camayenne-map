import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PoiRow = {
  id: number;
  name: string | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
};

const CATEGORY_HINTS: Record<string, string[]> = {
  PHARMACIE: ["pharmacie", "médicament", "medicament"],
  HOPITAL: ["hôpital", "hopital", "clinique", "santé", "sante", "urgence"],
  ECOLE: ["école", "ecole", "collège", "college", "lycée", "lycee"],
  UNIVERSITE: ["université", "universite", "faculté", "faculte"],
  ADMINISTRATION: ["mairie", "police", "gendarmerie", "administration", "commissariat", "service public"],
  MARCHE: ["marché", "marche", "boutique", "achat", "course", "courses"],
  TRANSPORT: ["bus", "transport", "gare", "taxi", "arrêt", "arret"],
  HOTEL: ["hôtel", "hotel", "hébergement", "hebergement"],
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

function normalizeLower(v: unknown) {
  return normalizeText(v).toLowerCase();
}

function tokenize(v: string) {
  return normalizeLower(v)
    .replace(/[^a-z0-9\u00c0-\u017f\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function detectCategories(message: string) {
  const msg = normalizeLower(message);
  const found = new Set<string>();
  for (const [cat, hints] of Object.entries(CATEGORY_HINTS)) {
    for (const hint of hints) {
      if (msg.includes(hint)) {
        found.add(cat);
        break;
      }
    }
  }
  return Array.from(found);
}

function toRad(v: number) {
  return (v * Math.PI) / 180;
}

function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const R = 6371000;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scorePoi(
  poi: PoiRow,
  words: string[],
  categories: string[],
  userLocation: { latitude: number; longitude: number } | null,
) {
  let score = 0;
  const name = normalizeLower(poi.name);
  const category = normalizeLower(poi.category);
  const address = normalizeLower(poi.address);
  const description = normalizeLower(poi.description);
  const blob = `${name} ${category} ${address} ${description}`;

  for (const w of words) {
    if (name.includes(w)) score += 5;
    if (category.includes(w)) score += 4;
    if (blob.includes(w)) score += 2;
  }
  if (categories.length && poi.category && categories.includes(poi.category)) {
    score += 8;
  }

  if (userLocation && poi.latitude != null && poi.longitude != null) {
    const d = distanceMeters(userLocation, {
      latitude: Number(poi.latitude),
      longitude: Number(poi.longitude),
    });
    if (Number.isFinite(d)) {
      if (d < 400) score += 8;
      else if (d < 1000) score += 5;
      else if (d < 2500) score += 3;
    }
  }
  return score;
}

function formatDistance(v: number | null) {
  if (v == null || !Number.isFinite(v)) return "";
  if (v < 1000) return `${Math.round(v)} m`;
  return `${(v / 1000).toFixed(1)} km`;
}

function buildFallbackAnswer(
  message: string,
  suggestions: Array<Record<string, unknown>>,
  reportSummary: { total: number; byType: Record<string, number> },
) {
  const m = normalizeLower(message);
  if (m.includes("signaler") || m.includes("probl") || m.includes("incident")) {
    return "Pour signaler: ouvre l'onglet 'Signaler', choisis le type, place le point sur la carte puis valide. Un agent traitera ensuite le dossier.";
  }
  if (m.includes("itin") || m.includes("route") || m.includes("aller")) {
    if (suggestions.length) {
      return "J'ai trouvé des lieux pertinents. Utilise 'Itinéraire' sur la suggestion pour lancer le guidage depuis ta position.";
    }
    return "Pour un itinéraire: choisis un départ et une arrivée dans l'onglet Rechercher puis clique 'Calculer itinéraire'.";
  }
  if (suggestions.length) {
    return "Voici les lieux les plus pertinents selon ta question. Tu peux ouvrir la carte ou lancer un itinéraire.";
  }
  if (reportSummary.total > 0) {
    return "Je n'ai pas trouvé de lieu précis pour cette question. Reformule avec un type de lieu (pharmacie, hôpital, mairie, police).";
  }
  return "Je n'ai pas encore assez d'informations pour répondre précisément. Essaie avec une question plus courte et un mot-clé de service.";
}

async function generateOpenAiAnswer(params: {
  message: string;
  suggestions: Array<Record<string, unknown>>;
  reportSummary: { total: number; byType: Record<string, number> };
}) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;

  const model = Deno.env.get("OPENAI_MODEL_PUBLIC") || Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
  const summaryLines = Object.entries(params.reportSummary.byType)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  const poiLines = params.suggestions.map((s, i) => {
    return `${i + 1}. ${s.name} (${s.category}) - ${s.address || "adresse non renseignée"} ${s.distanceText ? "- " + s.distanceText : ""}`;
  }).join("\n");

  const systemPrompt = [
    "Tu es l'assistant public de la carte Camayenne (Conakry).",
    "Réponds en français simple, court, utile et concret.",
    "N'invente pas de lieux ni de données non présentes.",
    "Si la question concerne un signalement citoyen, explique les étapes dans l'application.",
    "Si des suggestions de lieux existent, conseille l'action 'Voir sur la carte' ou 'Itinéraire'.",
    "Limite la réponse à 5 phrases maximum.",
  ].join("\n");

  const userPrompt = [
    `Question citoyen: ${params.message}`,
    `Lieux suggérés:`,
    poiLines || "Aucun",
    `Résumé signalements (30 jours): total ${params.reportSummary.total}; ${summaryLines || "aucune donnée"}`,
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const answer = normalizeText(content);
    if (!answer) return null;
    return answer.slice(0, 900);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Missing Supabase environment variables" }, 500);
    }

    const body = await req.json();
    const message = normalizeText(body?.message);
    const limitRaw = Number(body?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.round(limitRaw), 1), 8) : 5;
    if (!message || message.length < 3) {
      return json({ error: "Message too short" }, 400);
    }
    if (message.length > 800) {
      return json({ error: "Message too long" }, 400);
    }

    const userLocation = body?.location && Number.isFinite(Number(body?.location?.latitude)) &&
        Number.isFinite(Number(body?.location?.longitude))
      ? {
        latitude: Number(body.location.latitude),
        longitude: Number(body.location.longitude),
      }
      : null;

    const categories = detectCategories(message);
    const words = tokenize(message);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    let poiQuery = admin
      .from("poi")
      .select("id, name, category, address, phone, description, latitude, longitude, status")
      .eq("status", "ACTIF")
      .limit(250);

    if (categories.length) {
      poiQuery = poiQuery.in("category", categories);
    }

    const poiRes = await poiQuery;
    if (poiRes.error) {
      return json({ error: "POI read failed", detail: poiRes.error.message }, 500);
    }
    const pois = (poiRes.data || []) as PoiRow[];

    const scored = pois.map((poi) => {
      const score = scorePoi(poi, words, categories, userLocation);
      let distance: number | null = null;
      if (userLocation && poi.latitude != null && poi.longitude != null) {
        distance = distanceMeters(userLocation, {
          latitude: Number(poi.latitude),
          longitude: Number(poi.longitude),
        });
      }
      return { poi, score, distance };
    }).sort((a, b) => b.score - a.score);

    const top = scored
      .filter((x) => x.score > 0 || !words.length)
      .slice(0, limit)
      .map((x) => ({
        id: x.poi.id,
        name: x.poi.name,
        category: x.poi.category,
        address: x.poi.address,
        phone: x.poi.phone,
        latitude: x.poi.latitude,
        longitude: x.poi.longitude,
        distanceMeters: x.distance == null || !Number.isFinite(x.distance) ? null : Math.round(x.distance),
        distanceText: formatDistance(x.distance),
      }));

    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const reportsRes = await admin
      .from("reports")
      .select("type")
      .gte("created_at", sinceIso)
      .limit(1200);

    const byType: Record<string, number> = {};
    if (!reportsRes.error && Array.isArray(reportsRes.data)) {
      for (const r of reportsRes.data) {
        const type = normalizeText((r as Record<string, unknown>).type || "AUTRE").toUpperCase();
        byType[type] = (byType[type] || 0) + 1;
      }
    }
    const reportSummary = {
      total: reportsRes.error || !reportsRes.data ? 0 : reportsRes.data.length,
      byType,
    };

    const openAiAnswer = await generateOpenAiAnswer({
      message,
      suggestions: top,
      reportSummary,
    });
    const answer = openAiAnswer || buildFallbackAnswer(message, top, reportSummary);

    return json({
      ok: true,
      answer,
      suggestions: top,
      reportSummary,
      usedOpenAI: !!openAiAnswer,
    });
  } catch (err) {
    return json({ error: "Unexpected error", detail: (err as Error).message }, 500);
  }
});
