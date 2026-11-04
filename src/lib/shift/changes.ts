import type { Finding, ShiftChanges, ShiftReport } from "./types";

// Finding ids for leaked keys include a per-shift counter, so compare on what a
// person would call "the same issue": check, title and (masked) evidence.
const key = (f: Pick<Finding, "check" | "title" | "evidence">) => `${f.check}|${f.title}|${f.evidence ?? ""}`;

const actionable = (r: ShiftReport) => r.checks.flatMap((c) => c.findings).filter((f) => f.severity !== "info");

export function diffShifts(current: ShiftReport, previous: ShiftReport): ShiftChanges {
  const before = new Map(actionable(previous).map((f) => [key(f), f]));
  const now = new Map(actionable(current).map((f) => [key(f), f]));
  return {
    previousId: previous.id,
    previousScore: previous.score,
    previousAt: previous.finishedAt,
    scoreDelta: current.score - previous.score,
    added: [...now.entries()].filter(([k]) => !before.has(k)).map(([, f]) => f),
    resolved: [...before.entries()]
      .filter(([k]) => !now.has(k))
      .map(([, f]) => ({ id: f.id, title: f.title, severity: f.severity })),
  };
}

/** One-line summary for notifications, e.g. "Score +12 · 1 new · 2 fixed". */
export function changeLine(c: ShiftChanges) {
  const parts = [c.scoreDelta === 0 ? "Score unchanged" : `Score ${c.scoreDelta > 0 ? "+" : ""}${c.scoreDelta}`];
  if (c.added.length) parts.push(`${c.added.length} new`);
  if (c.resolved.length) parts.push(`${c.resolved.length} fixed`);
  return parts.join(" · ");
}
