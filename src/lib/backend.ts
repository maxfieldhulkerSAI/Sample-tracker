// One entry point for the three generation calls, with two modes:
//
// - server: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set at
//   build time, so calls go to the Supabase edge functions in supabase/functions,
//   which hold the provider keys as secrets.
// - direct: no Supabase configured (the GitHub Pages demo). The browser calls
//   api.stability.ai and the Gemini API itself with keys the user pastes into
//   Settings. Both providers allow cross-origin browser requests.
//
// Response shapes match the edge functions, so the components do not care.

import { supabase } from "@/integrations/supabase/client";
import { getKeys } from "@/lib/keys";
import { generateStableAudio, bytesToBase64, type GenerateAudioParams } from "@shared/stability";
import { geminiChat } from "@shared/gemini";
import { planAndGenerateSong, type GeneratedSong } from "@shared/song";
import { buildTrackerChatPrompt, parseActions, type Message, type TrackerState, type ChatAction } from "@shared/prompts";

export type BackendMode = "server" | "direct";

export const backendMode: BackendMode = supabase ? "server" : "direct";

export class MissingKeyError extends Error {
  provider: "stability" | "gemini";
  constructor(provider: "stability" | "gemini") {
    super(provider === "stability"
      ? "Add your Stability API key in Settings to generate samples."
      : "Add your Google AI (Gemini) key in Settings to use the AI features.");
    this.provider = provider;
  }
}

function requireKey(provider: "stability" | "gemini"): string {
  const k = getKeys()[provider].trim();
  if (!k) throw new MissingKeyError(provider);
  return k;
}

async function invoke<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase!.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** One sample. Returns base64 audio plus its format, like the edge function. */
export async function generateAudio(params: GenerateAudioParams): Promise<{ audio: string; format: string; prompt: string }> {
  if (backendMode === "server") return invoke("generate-audio", params);
  const out = await generateStableAudio(requireKey("stability"), params);
  return { audio: bytesToBase64(out.bytes), format: out.format, prompt: params.prompt };
}

/** Plan a song with Gemini and render its samples with Stable Audio. */
export async function generateSong(
  description: string,
  patternLength: number,
  tracks: number,
  onProgress?: (stage: string) => void,
): Promise<GeneratedSong> {
  if (backendMode === "server") return invoke("generate-song", { description, patternLength, tracks });
  const keys = { stability: requireKey("stability"), gemini: requireKey("gemini") };
  return planAndGenerateSong(keys, description, patternLength, tracks, onProgress);
}

/** One assistant turn. Returns the reply text and any actions it asked for. */
export async function trackerChat(messages: Message[], trackerState: TrackerState): Promise<{ message: string; actions: ChatAction[] }> {
  if (backendMode === "server") return invoke("tracker-chat", { messages, trackerState });
  const text = await geminiChat(requireKey("gemini"), buildTrackerChatPrompt(trackerState), messages);
  return parseActions(text);
}
