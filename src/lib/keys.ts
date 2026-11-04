// API keys for direct mode. They live in this browser's localStorage only and
// are sent only to the provider they belong to (api.stability.ai, Gemini).

const STORAGE_KEY = "groovecraft.keys";

export interface ApiKeys {
  stability: string;
  gemini: string;
}

const EMPTY: ApiKeys = { stability: "", gemini: "" };
const listeners = new Set<(k: ApiKeys) => void>();

export function getKeys(): ApiKeys {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

export function setKeys(next: Partial<ApiKeys>): ApiKeys {
  const merged = { ...getKeys(), ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // storage unavailable (private mode); keys live for this page load only
  }
  listeners.forEach((fn) => fn(merged));
  return merged;
}

export function onKeysChange(fn: (k: ApiKeys) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const KEY_LINKS = {
  stability: "https://platform.stability.ai/account/keys",
  gemini: "https://aistudio.google.com/apikey",
};
