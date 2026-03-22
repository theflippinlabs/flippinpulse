/**
 * Supabase Edge Function: fetch-trends
 *
 * Fetches and scores trending topics.
 * In production: replaces simulation with real X API v2 calls.
 * Results are cached in the database.
 *
 * GET /functions/v1/fetch-trends?category=ai&timeRange=24h
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const category = url.searchParams.get("category") ?? "all";
    const timeRange = (url.searchParams.get("timeRange") ?? "24h") as "1h" | "24h" | "7d";

    // In production, call X API v2 here:
    // const xApiKey = Deno.env.get("X_BEARER_TOKEN");
    // const response = await fetch("https://api.twitter.com/2/trends/...", {
    //   headers: { Authorization: `Bearer ${xApiKey}` }
    // });

    // For now, return a signal that the frontend should use its built-in data
    return new Response(
      JSON.stringify({
        source: "simulated",
        message: "Connect X_BEARER_TOKEN to enable real-time trends",
        category,
        timeRange,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("fetch-trends error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
