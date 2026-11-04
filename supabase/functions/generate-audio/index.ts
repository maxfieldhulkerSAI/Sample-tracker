// Server mode: one Stable Audio 3 sample, key held as a Supabase secret.
// Secrets: STABILITY_API_KEY
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateStableAudio, bytesToBase64, StabilityError } from "../_shared/stability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const STABILITY_API_KEY = Deno.env.get("STABILITY_API_KEY");
    if (!STABILITY_API_KEY) return json({ error: "STABILITY_API_KEY is not configured" }, 500);

    const { prompt, duration = 10, bpm, key, isMelodic = false } = await req.json();
    if (!prompt) return json({ error: "Prompt is required" }, 400);

    const out = await generateStableAudio(STABILITY_API_KEY, { prompt, duration, bpm, key, isMelodic });
    return json({ audio: bytesToBase64(out.bytes), format: out.format, prompt });
  } catch (error) {
    console.error("generate-audio:", error);
    const status = error instanceof StabilityError ? error.status : 500;
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, status);
  }
});
