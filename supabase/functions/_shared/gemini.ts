// Google Gemini chat completion over REST. Shared by the browser (direct
// mode, user's own key) and the edge functions (server mode, GEMINI_API_KEY).
// The Gemini API allows cross-origin browser requests, so no proxy is needed.

export const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export class GeminiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * One chat turn. Returns the model's text.
 * @param json  ask for a JSON object back (sets responseMimeType)
 */
export async function geminiChat(
  apiKey: string,
  systemPrompt: string,
  messages: ChatMessage[],
  opts: { json?: boolean; model?: string; retries?: number } = {},
): Promise<string> {
  if (!apiKey) throw new GeminiError(401, "No Google AI (Gemini) API key");
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: opts.json ? { responseMimeType: "application/json" } : {},
  };

  const retries = opts.retries ?? 3;
  let res: Response | null = null;
  let lastText = "";
  for (let attempt = 1; attempt <= retries; attempt++) {
    res = await fetch(GEMINI_URL(opts.model ?? GEMINI_MODEL), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    lastText = await res.text();
    if ([500, 502, 503, 504].includes(res.status) && attempt < retries) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
      continue;
    }
    break;
  }

  if (!res || !res.ok) {
    const status = res?.status ?? 503;
    const hints: Record<number, string> = {
      400: "check the Gemini API key",
      403: "the Gemini key lacks access",
      429: "Gemini rate limit, try again shortly",
    };
    let detail = "";
    try { detail = JSON.parse(lastText)?.error?.message ?? ""; } catch { detail = lastText.slice(0, 200); }
    throw new GeminiError(status, `Gemini ${status}${hints[status] ? ` (${hints[status]})` : ""}${detail ? `: ${detail}` : ""}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text) throw new GeminiError(502, "Gemini returned an empty response");
  return text;
}

/** Pull JSON out of a reply that may be wrapped in a ```json fence. */
export function extractJson<T>(text: string): T {
  let s = text.trim();
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) s = m[1];
  return JSON.parse(s.trim()) as T;
}
