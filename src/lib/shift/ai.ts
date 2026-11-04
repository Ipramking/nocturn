import type { AiNotes, Finding, ShiftReport } from "./types";

// The lite model takes over when the main one is overloaded (503) or rate-limited.
const MODELS = [process.env.GEMINI_MODEL ?? "gemini-flash-latest", "gemini-flash-lite-latest"];
const RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;

export function rankedFindings(report: ShiftReport): Finding[] {
  return report.checks
    .flatMap((c) => c.findings)
    .filter((f) => f.severity !== "info")
    .sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

export function templatePrompt(finding: Finding, url: string) {
  return [
    `My live app at ${url} has this problem: ${finding.title}.`,
    finding.detail,
    finding.evidence ? `Evidence: ${finding.evidence}` : "",
    `Suggested fix: ${finding.fix}`,
    "Find where this lives in my codebase, make the smallest change that fixes it, list the files you changed, and don't break existing behaviour.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function fallbackNotes(report: ShiftReport): AiNotes {
  const ranked = rankedFindings(report);
  const critical = ranked.filter((f) => f.severity === "critical").length;
  const headline =
    critical > 0
      ? `${critical} urgent issue${critical === 1 ? "" : "s"} need you before anything else`
      : ranked.length === 0
        ? "Quiet night. Nothing needed you."
        : `${ranked.length} thing${ranked.length === 1 ? "" : "s"} to tidy up this morning`;
  const top = ranked.slice(0, 3).map((f) => f.title.toLowerCase());
  return {
    headline,
    summary: ranked.length
      ? `Shift score ${report.score}/100. Start with: ${top.join("; ")}. Each fix below comes with a prompt you can paste into your AI coding tool.`
      : `Shift score ${report.score}/100. Every check came back clean.`,
    prompts: Object.fromEntries(ranked.map((f) => [f.id, templatePrompt(f, report.finalUrl)])),
    source: "fallback",
  };
}

export async function writeNotes(report: ShiftReport): Promise<AiNotes> {
  const fallback = fallbackNotes(report);
  const key = process.env.GEMINI_API_KEY;
  const ranked = rankedFindings(report).slice(0, 10);
  if (!key || ranked.length === 0) return fallback;

  const brief = ranked.map((f) => ({ id: f.id, severity: f.severity, title: f.title, detail: f.detail, evidence: f.evidence, fix: f.fix }));
  const prompt = `You are NOCTURN, an overnight engineer handing over a morning report to a solo builder who vibecodes with AI tools.
App: ${report.finalUrl}
Shift score: ${report.score}/100 (grade ${report.grade})
Findings (most severe first): ${JSON.stringify(brief)}

Return JSON only, shaped exactly like:
{"headline": string, "summary": string, "prompts": {"<finding id>": string}}

Rules:
- headline: under 12 words, calm and specific, like a night-shift handover. No hype, no emoji.
- summary: 2-3 sentences in plain English: what matters most this morning and why, then what can wait.
- prompts: one entry per finding id above. Each is a paste-ready instruction for an AI coding assistant (Claude Code, Cursor, Lovable): state the problem, the likely place in a typical Next.js/Vite app, the exact change, and how to verify it. Under 90 words each.
- Evidence is already masked. Never invent or reconstruct a secret value.`;

  try {
    let res: Response | null = null;
    for (const model of MODELS) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (res.ok || ![429, 500, 503].includes(res.status)) break;
    }
    if (!res?.ok) return fallback;
    const json = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallback;
    const parsed = JSON.parse(text) as Partial<AiNotes>;
    return {
      headline: typeof parsed.headline === "string" && parsed.headline ? parsed.headline : fallback.headline,
      summary: typeof parsed.summary === "string" && parsed.summary ? parsed.summary : fallback.summary,
      // Keep a prompt for every finding even if the model skipped some.
      prompts: { ...fallback.prompts, ...(parsed.prompts ?? {}) },
      source: "gemini",
    };
  } catch {
    return fallback;
  }
}
