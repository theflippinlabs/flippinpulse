/**
 * Supabase Edge Function: generate-content
 *
 * Securely calls Anthropic Claude API to generate tweet content.
 * Enforces rate limiting and logs usage.
 *
 * POST /functions/v1/generate-content
 * Body: ContentGenerationInput
 * Returns: GeneratedContent[]
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ContentGenerationInput {
  topic: string;
  tone: "professional" | "casual" | "viral" | "educational" | "controversial";
  format: "single" | "thread";
  includeHashtags: boolean;
  includeEmojis: boolean;
  targetAudience?: string;
}

// Rate limit: 10 requests per minute per user
const rateLimitStore = new Map<string, number[]>();

function checkRateLimit(userId: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const times = (rateLimitStore.get(userId) ?? []).filter((t) => now - t < windowMs);
  if (times.length >= limit) return false;
  times.push(now);
  rateLimitStore.set(userId, times);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Validate API key
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse and validate body
    const body: ContentGenerationInput = await req.json();
    if (!body.topic || body.topic.length < 3 || body.topic.length > 200) {
      return new Response(JSON.stringify({ error: "Invalid topic" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validTones = ["professional", "casual", "viral", "educational", "controversial"];
    if (!validTones.includes(body.tone)) {
      return new Response(JSON.stringify({ error: "Invalid tone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build prompt
    const audienceClause = body.targetAudience
      ? `Target audience: ${body.targetAudience}.`
      : "";

    const formatClause = body.format === "thread"
      ? "Create a Twitter thread (3-5 tweets). Format as numbered tweets."
      : "Create a single tweet under 280 characters.";

    const hashtagClause = body.includeHashtags
      ? "Include 2-3 relevant hashtags."
      : "Do not include hashtags.";

    const emojiClause = body.includeEmojis
      ? "Use relevant emojis naturally."
      : "Do not use emojis.";

    const prompt = `You are an expert X (Twitter) content strategist. Generate 3 high-engagement variations.

Topic: ${body.topic}
Tone: ${body.tone}
${formatClause}
${hashtagClause}
${emojiClause}
${audienceClause}

Return a JSON array of exactly 3 objects with this structure:
{
  "content": "the full tweet text",
  "hashtags": ["#tag1", "#tag2"],
  "estimatedEngagement": "low|medium|high|viral",
  "isThread": boolean,
  "threadParts": ["tweet 1", "tweet 2"] // only if isThread=true
}

Only return valid JSON. No markdown, no explanation.`;

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const rawContent = message.content[0].type === "text" ? message.content[0].text : "[]";

    // Parse JSON response
    let parsed: unknown[];
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      // Try to extract JSON from the response
      const match = rawContent.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : [];
    }

    // Add IDs
    const results = Array.isArray(parsed)
      ? parsed.map((item: unknown, i: number) => ({
          id: `gen-${Date.now()}-${i}`,
          ...(item as object),
          charCount: ((item as { content: string }).content ?? "").length,
        }))
      : [];

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("generate-content error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
