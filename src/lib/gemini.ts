// Gemini generateContent with fallbacks. The main model gets the shorter
// budget so that, when it's overloaded and hangs, the lite model still has time
// to answer inside the same request.
const MAIN = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const LITE = "gemini-flash-lite-latest";
// Demand spikes (503) are usually brief, so the lite model gets a second try after a pause.
const ATTEMPTS = [
  { model: MAIN, timeoutMs: 12_000, waitMs: 0 },
  { model: LITE, timeoutMs: 15_000, waitMs: 0 },
  { model: LITE, timeoutMs: 15_000, waitMs: 2_000 },
];
const RETRYABLE = [429, 500, 503];

/** Returns the first usable response, or null if every attempt failed or no key is set. */
export async function geminiGenerate(body: unknown): Promise<Response | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  for (const { model, timeoutMs, waitMs } of ATTEMPTS) {
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;
      if (!RETRYABLE.includes(res.status)) return null;
    } catch {
      // Timed out or network error: try the next model.
    }
  }
  return null;
}
