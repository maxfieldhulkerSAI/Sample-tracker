// Server mode: Gemini plans the song, Stable Audio 3 renders each sample.
// Secrets: STABILITY_API_KEY, GEMINI_API_KEY
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { planAndGenerateSong } from "../_shared/song.ts";
import { StabilityError } from "../_shared/stability.ts";
import { GeminiError } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stability = Deno.env.get("STABILITY_API_KEY");
    const gemini = Deno.env.get("GEMINI_API_KEY");
    if (!stability) return json({ error: "STABILITY_API_KEY is not configured" }, 500);
    if (!gemini) return json({ error: "GEMINI_API_KEY is not configured" }, 500);

    const { description, patternLength = 64, tracks = 4 } = await req.json();
    if (!description) return json({ error: "Description is required" }, 400);

    const song = await planAndGenerateSong({ stability, gemini }, description, patternLength, tracks, (stage) => console.log(stage));
    return json(song);
  } catch (error) {
    console.error("generate-song:", error);
    const status = error instanceof StabilityError || error instanceof GeminiError ? error.status : 500;
    return json({ error: error instanceof Error ? error.message : "Failed to generate song" }, status);
  }
});
