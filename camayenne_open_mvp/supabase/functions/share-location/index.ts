import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function makeToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

function normalizeBaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    return url.toString();
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
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    const accuracy = body?.accuracy == null ? null : Number(body.accuracy);
    const ttlMinutesRaw = Number(body?.ttlMinutes);
    const ttlMinutes = Number.isFinite(ttlMinutesRaw) ? clampNumber(Math.round(ttlMinutesRaw), 5, 240) : 30;
    const baseUrl = normalizeBaseUrl(body?.baseUrl);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return json({ error: "Latitude/longitude are required" }, 400);
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return json({ error: "Coordinates out of range" }, 400);
    }
    if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000)) {
      return json({ error: "Invalid accuracy" }, 400);
    }

    const sourceIp = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 300);

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

    const now = Date.now();
    const tenMinutesAgoIso = new Date(now - 10 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from("location_shares")
      .select("*", { count: "exact", head: true })
      .eq("source_hash", sourceHash)
      .gte("created_at", tenMinutesAgoIso);

    if (countError) {
      return json({ error: "Rate limit check failed" }, 500);
    }
    if ((count || 0) >= 20) {
      return json({ error: "Too many share links. Try again later." }, 429);
    }

    const token = makeToken();
    const expiresAtIso = new Date(now + ttlMinutes * 60 * 1000).toISOString();

    const { error: insertError } = await admin.from("location_shares").insert({
      token,
      latitude,
      longitude,
      accuracy_m: accuracy == null ? null : Math.round(accuracy),
      source_hash: sourceHash,
      user_agent: userAgent || null,
      expires_at: expiresAtIso,
    });
    if (insertError) {
      return json({ error: "Insert failed", detail: insertError.message }, 500);
    }

    const cutoffIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    await admin
      .from("location_shares")
      .delete()
      .lt("expires_at", cutoffIso);

    let url: string | null = null;
    if (baseUrl) {
      const shareUrl = new URL(baseUrl);
      shareUrl.searchParams.set("s", token);
      url = shareUrl.toString();
    }

    return json({
      ok: true,
      token,
      url,
      expiresAt: expiresAtIso,
      ttlMinutes,
    });
  } catch (err) {
    return json({ error: "Unexpected error", detail: (err as Error).message }, 500);
  }
});
