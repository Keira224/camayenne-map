const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return responseJson({ error: "Method not allowed" }, 405);
  }

  try {
    const orsKey = Deno.env.get("ORS_API_KEY");
    if (!orsKey) {
      return responseJson({ error: "Missing ORS_API_KEY" }, 500);
    }

    const body = await req.json();
    const coordinates = body?.coordinates;
    const preference = body?.preference || "shortest";
    const options = body?.options || undefined;
    const profile = body?.profile || "driving-car";
    const allowedProfiles = new Set(["driving-car", "cycling-regular", "foot-walking"]);
    const allowedPreferences = new Set(["recommended", "shortest", "fastest"]);

    if (!allowedProfiles.has(profile)) {
      return responseJson({ error: "Invalid profile" }, 400);
    }
    if (!allowedPreferences.has(preference)) {
      return responseJson({ error: "Invalid preference" }, 400);
    }
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return responseJson({ error: "Coordinates required" }, 400);
    }

    const payload: Record<string, unknown> = {
      coordinates,
      preference,
    };
    if (options && typeof options === "object") {
      payload.options = options;
    }

    const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;
    const orsRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: orsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await orsRes.text();
    if (!orsRes.ok) {
      return responseJson({ error: "ORS error", detail: text }, orsRes.status);
    }

    return new Response(text, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return responseJson({ error: "Unexpected error", detail: (err as Error).message }, 500);
  }
});
