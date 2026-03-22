/**
 * Supabase Edge Function: generate-reply
 *
 * Generates AI-powered replies to X posts using Claude.
 *
 * POST /functions/v1/generate-reply
 * Body: ReplyGenerationInput
 * Returns: GeneratedReply[]
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ReplyGenerationInput {
  originalTweet: string;
  tone: "agree" | "disagree" | "add-value" | "funny" | "question";
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
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ReplyGenerationInput = await req.json();
    if (!body.originalTweet || body.originalTweet.length < 5) {
      return new Response(JSON.stringify({ error: "Invalid tweet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toneDescriptions: Record<string, string> = {
      "agree": "agree with and amplify the original point",
      "disagree": "respectfully challenge with a data-backed counter-argument",
      "add-value": "add unique insight or perspective that builds on the original",
      "funny": "be witty and light-hearted while staying on topic",
      "question": "ask a thoughtful follow-up question that drives conversation",
    };

    const toneDesc = toneDescriptions[body.tone] ?? "add value to the conversation";

    const prompt = `You are an expert X (Twitter) engagement strategist.

Original tweet: "${body.originalTweet}"

Generate 3 reply options that ${toneDesc}.

Rules:
- Each reply must be under 280 characters
- Be genuine, not generic
- Drive engagement and replies
- Sound like a real person, not a bot

Return a JSON array of exactly 3 objects:
{
  "content": "the reply text"
}

Only return valid JSON. No markdown.`;

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const rawContent = message.content[0].type === "text" ? message.content[0].text : "[]";

    let parsed: unknown[];
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const match = rawContent.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : [];
    }

    const results = Array.isArray(parsed)
      ? parsed.map((item: unknown, i: number) => ({
          id: `reply-${Date.now()}-${i}`,
          ...(item as object),
          charCount: ((item as { content: string }).content ?? "").length,
          tone: body.tone,
        }))
      : [];

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("generate-reply error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
