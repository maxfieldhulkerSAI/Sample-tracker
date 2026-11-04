// Server mode: one assistant turn via Gemini, returning the reply and any actions.
// Secrets: GEMINI_API_KEY
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { geminiChat, GeminiError } from "../_shared/gemini.ts";
import { buildTrackerChatPrompt, parseActions, type Message, type TrackerState } from "../_shared/prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY is not configured" }, 500);

    const { messages, trackerState } = (await req.json()) as { messages: Message[]; trackerState: TrackerState };
    const text = await geminiChat(GEMINI_API_KEY, buildTrackerChatPrompt(trackerState), messages);
    return json(parseActions(text));
  } catch (error) {
    console.error("tracker-chat:", error);
    const status = error instanceof GeminiError ? error.status : 500;
    return json({ error: error instanceof Error ? error.message : "Failed to process chat" }, status);
  }
});
