// Song planner: Gemini writes a PatternPlan, Stable Audio renders each sample.
// Used by the generate-song edge function and by the browser in direct mode.

import { geminiChat, extractJson } from "./gemini.ts";
import { generateStableAudio, bytesToBase64 } from "./stability.ts";
import { buildSongPlanPrompt, type PatternPlan } from "./prompts.ts";

export interface GeneratedSong {
  bpm: number;
  samples: { name: string; audio: string; format: string }[];   // audio is base64
  pattern: PatternPlan["pattern"];
}

export async function planAndGenerateSong(
  keys: { stability: string; gemini: string },
  description: string,
  patternLength = 64,
  tracks = 4,
  onProgress?: (stage: string) => void,
): Promise<GeneratedSong> {
  if (!description) throw new Error("Description is required");

  onProgress?.("Planning the song");
  const planText = await geminiChat(
    keys.gemini,
    buildSongPlanPrompt(patternLength, tracks),
    [{ role: "user", content: description }],
    { json: true },
  );
  const plan = extractJson<PatternPlan>(planText);
  if (!plan?.samples?.length || !Array.isArray(plan.pattern)) throw new Error("The planner returned an incomplete plan");

  const samples: GeneratedSong["samples"] = [];
  for (let i = 0; i < plan.samples.length; i++) {
    const s = plan.samples[i];
    onProgress?.(`Generating sample ${i + 1}/${plan.samples.length}: ${s.name}`);
    const out = await generateStableAudio(keys.stability, {
      prompt: s.prompt,
      duration: Math.min(Math.max(s.duration ?? 4, 1), 22),
    });
    samples.push({ name: s.name, audio: bytesToBase64(out.bytes), format: out.format });
  }

  return { bpm: plan.bpm, samples, pattern: plan.pattern };
}
