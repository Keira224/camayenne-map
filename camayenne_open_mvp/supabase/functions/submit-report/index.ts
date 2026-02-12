import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REPORT_TYPES = ["VOIRIE", "ECLAIRAGE", "DECHETS", "INONDATION", "SECURITE", "AUTRE"] as const;
type ReportType = typeof REPORT_TYPES[number];

type AiTriageResult = {
  suggestedType: ReportType;
  priority: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  confidence: number;
  reason: string;
  model: string;
  processedAt: string;
};

function badRequest(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeString(input: unknown, maxLength: number) {
  return String(input ?? "").trim().slice(0, maxLength);
}

function parseJsonObjectFromText(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // try to extract first JSON object from model text
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const candidate = raw.slice(start, end + 1);
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeSuggestedType(input: unknown, fallbackType: ReportType): ReportType {
  const value = safeString(input, 40).toUpperCase();
  if ((REPORT_TYPES as readonly string[]).includes(value)) {
    return value as ReportType;
  }
  return fallbackType;
}

function normalizePriority(input: unknown): "LOW" | "MEDIUM" | "HIGH" {
  const value = safeString(input, 20).toUpperCase();
  if (value === "LOW" || value === "MEDIUM" || value === "HIGH") return value;
  return "MEDIUM";
}

async function triageWithAI(payload: {
  title: string;
  type: ReportType;
  description: string;
}): Promise<AiTriageResult | null> {
  try {
    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiApiKey) return null;

    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
    const prompt = [
      "Tu aides a trier des signalements citoyens de voirie urbaine.",
      "Reponds uniquement en JSON avec les cles:",
      "suggested_type, priority, summary, confidence, reason.",
      "Regles:",
      "- suggested_type dans: VOIRIE, ECLAIRAGE, DECHETS, INONDATION, SECURITE, AUTRE.",
      "- priority dans: LOW, MEDIUM, HIGH.",
      "- summary court (max 140 caracteres).",
      "- confidence nombre entre 0 et 1.",
      "- reason court (max 140 caracteres).",
    ].join("\n");

    const userPayload = {
      title: payload.title,
      type: payload.type,
      description: payload.description || "",
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = parseJsonObjectFromText(content);
    if (!parsed) return null;

    const confidenceRaw = Number(parsed.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? clampNumber(confidenceRaw, 0, 1)
      : 0.6;

    return {
      suggestedType: normalizeSuggestedType(parsed.suggested_type, payload.type),
      priority: normalizePriority(parsed.priority),
      summary: safeString(parsed.summary, 220),
      confidence,
      reason: safeString(parsed.reason, 220),
      model,
      processedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return badRequest("Method not allowed", 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return badRequest("Missing Supabase environment variables", 500);
    }

    const body = await req.json();
    const title = String(body?.title || "").trim();
    const type = String(body?.type || "").trim().toUpperCase();
    const description = String(body?.description || "").trim();
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);

    if (!title || !type || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return badRequest("Missing required report fields");
    }
    if (!(REPORT_TYPES as readonly string[]).includes(type)) {
      return badRequest("Invalid report type");
    }

    if (title.length > 160 || description.length > 1000) {
      return badRequest("Input too long");
    }

    const sourceIp = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(sourceIp || "unknown")
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sourceHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { count, error: countError } = await admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("source_hash", sourceHash)
      .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

    if (countError) {
      return badRequest("Rate limit check failed", 500);
    }
    if ((count || 0) >= 4) {
      return badRequest("Too many submissions. Try again later.", 429);
    }

    const ai = await triageWithAI({
      title,
      type: type as ReportType,
      description,
    });

    const insertPayload: Record<string, unknown> = {
      title,
      type,
      status: "NOUVEAU",
      description,
      latitude,
      longitude,
      source_hash: sourceHash,
    };
    if (ai) {
      insertPayload.ai_suggested_type = ai.suggestedType;
      insertPayload.ai_priority = ai.priority;
      insertPayload.ai_summary = ai.summary;
      insertPayload.ai_confidence = ai.confidence;
      insertPayload.ai_reason = ai.reason;
      insertPayload.ai_model = ai.model;
      insertPayload.ai_processed_at = ai.processedAt;
    }

    const { error: insertError } = await admin.from("reports").insert(insertPayload);

    if (insertError) {
      return badRequest("Insert failed: " + insertError.message, 500);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return badRequest("Unexpected error: " + (err as Error).message, 500);
  }
});
