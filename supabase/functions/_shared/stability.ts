// Stable Audio 3 text-to-audio. Shared by the browser (direct mode) and the
// Supabase edge functions (server mode): both have fetch and FormData.
//
// Generation is asynchronous: POST returns 202 with an id, then the results
// endpoint returns 202 while pending and 200 with the audio bytes when done.

export const STABILITY_GENERATE_URL = "https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio";
export const STABILITY_RESULTS_URL = "https://api.stability.ai/v2beta/audio/results";
export const STABILITY_MODEL = "stable-audio-3";

export interface GenerateAudioParams {
  prompt: string;
  duration?: number;      // seconds, clamped to 1..190
  bpm?: number;
  key?: string;           // musical key, e.g. "C minor"
  isMelodic?: boolean;
  outputFormat?: "mp3" | "wav";
  steps?: number;
  cfgScale?: number;
}

export interface GenerateAudioResult {
  bytes: ArrayBuffer;
  format: string;
  prompt: string;         // the prompt actually sent
}

/** Melodic requests get tempo and key appended so loops sit on the grid. */
export function enhancePrompt(p: GenerateAudioParams): string {
  if (p.isMelodic && p.bpm) {
    const keyStr = p.key ? ` in the key of ${p.key}` : "";
    return `${p.prompt}, ${p.bpm} BPM${keyStr}, seamless loop, consistent tempo, single musical phrase`;
  }
  return p.prompt;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class StabilityError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function errorMessage(res: Response): Promise<string> {
  let body = "";
  try { body = await res.text(); } catch { /* ignore */ }
  try {
    const j = JSON.parse(body);
    body = (j.errors && j.errors.join("; ")) || j.message || j.name || body;
  } catch { /* plain text */ }
  const hints: Record<number, string> = {
    401: "check the Stability API key",
    402: "out of Stability credits",
    403: "content moderation, or the key lacks access",
    429: "rate limited, slow down",
  };
  return `Stability API ${res.status}${hints[res.status] ? ` (${hints[res.status]})` : ""}${body ? `: ${body.slice(0, 200)}` : ""}`;
}

/**
 * Generate one clip. Throws StabilityError with the upstream status on failure.
 * @param apiKey   Stability API key (sk-...)
 * @param params   prompt and settings
 * @param timeoutMs how long to poll before giving up (default 2 min)
 */
export async function generateStableAudio(
  apiKey: string,
  params: GenerateAudioParams,
  timeoutMs = 120_000,
): Promise<GenerateAudioResult> {
  if (!apiKey) throw new StabilityError(401, "No Stability API key");
  if (!params.prompt) throw new StabilityError(400, "Prompt is required");

  const prompt = enhancePrompt(params);
  const format = params.outputFormat ?? "mp3";
  const fd = new FormData();
  fd.append("prompt", prompt);
  fd.append("model", STABILITY_MODEL);
  fd.append("duration", String(Math.min(Math.max(params.duration ?? 10, 1), 190)));
  fd.append("output_format", format);
  if (params.steps) fd.append("steps", String(params.steps));
  if (params.cfgScale) fd.append("cfg_scale", String(params.cfgScale));

  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "audio/*" };

  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(STABILITY_GENERATE_URL, { method: "POST", headers, body: fd });
    if (res.status !== 429 || attempt >= 3) break;
    await sleep(3000 * (attempt + 1));
  }

  if (res.status === 200) return { bytes: await res.arrayBuffer(), format, prompt };
  if (res.status !== 202) throw new StabilityError(res.status, await errorMessage(res));

  const { id } = await res.json();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await sleep(1500);
    const poll = await fetch(`${STABILITY_RESULTS_URL}/${encodeURIComponent(id)}`, { headers });
    if (poll.status === 200) return { bytes: await poll.arrayBuffer(), format, prompt };
    if (poll.status !== 202) throw new StabilityError(poll.status, await errorMessage(poll));
  }
  throw new StabilityError(504, "Timed out waiting for Stable Audio to finish");
}

/** Base64 without blowing the stack on large buffers. */
export function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}
