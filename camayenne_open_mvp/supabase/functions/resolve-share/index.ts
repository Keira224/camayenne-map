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

function isValidToken(token: string) {
  return /^[a-f0-9]{24,64}$/i.test(token);
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
    const token = String(body?.token || "").trim();
    if (!token || !isValidToken(token)) {
      return json({ error: "Invalid token" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await admin
      .from("location_shares")
      .select("token, latitude, longitude, accuracy_m, created_at, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      return json({ error: "Read failed", detail: error.message }, 500);
    }
    if (!data) {
      return json({ error: "Share not found" }, 404);
    }

    const expiresAtMs = Date.parse(data.expires_at);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      await admin.from("location_shares").delete().eq("token", token);
      return json({ error: "Share expired" }, 410);
    }

    return json({
      ok: true,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy_m,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
    });
  } catch (err) {
    return json({ error: "Unexpected error", detail: (err as Error).message }, 500);
  }
});
