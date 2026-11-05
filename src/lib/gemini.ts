// Gemini generateContent with a fallback model. The main model gets the shorter
// budget so that, when it's overloaded and hangs, the lite model still has time
// to answer inside the same request.
const MODELS = [process.env.GEMINI_MODEL ?? "gemini-flash-latest", "gemini-flash-lite-latest"];
const TIMEOUTS_MS = [12_000, 15_000];
const RETRYABLE = [429, 500, 503];

/** Returns the first usable response, or null if every model failed or no key is set. */
export async function geminiGenerate(body: unknown): Promise<Response | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  for (const [i, model] of MODELS.entries()) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUTS_MS[i] ?? 15_000),
      });
      if (res.ok) return res;
      if (!RETRYABLE.includes(res.status)) return null;
    } catch {
      // Timed out or network error: try the next model.
    }
  }
  return null;
}
