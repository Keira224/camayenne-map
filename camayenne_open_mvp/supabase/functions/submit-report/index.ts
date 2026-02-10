import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function badRequest(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    const type = String(body?.type || "").trim();
    const description = String(body?.description || "").trim();
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);

    if (!title || !type || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return badRequest("Missing required report fields");
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

    const { error: insertError } = await admin.from("reports").insert({
      title,
      type,
      status: "NOUVEAU",
      description,
      latitude,
      longitude,
      source_hash: sourceHash,
    });

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
