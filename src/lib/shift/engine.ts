import { randomBytes } from "node:crypto";
import {
  checkHeaders,
  checkLighthouse,
  checkLinks,
  checkMeta,
  checkSecrets,
  checkTls,
  checkUptime,
  CHECK_LABELS,
  skipped,
  type ShiftContext,
} from "./checks";
import { normalizeUrl, safeFetch } from "./safe-fetch";
import type { CheckId, CheckResult, ShiftEvent, ShiftReport } from "./types";

const WEIGHTS: Record<CheckId, number> = {
  uptime: 20,
  secrets: 25,
  headers: 15,
  tls: 10,
  meta: 10,
  links: 10,
  lighthouse: 10,
};

export const CHECK_ORDER: CheckId[] = ["uptime", "tls", "headers", "secrets", "meta", "links", "lighthouse"];

export function newShiftId() {
  return randomBytes(6).toString("base64url");
}

export function scoreChecks(checks: CheckResult[]) {
  const counted = checks.filter((c) => c.status !== "skipped" && c.status !== "error");
  const total = counted.reduce((s, c) => s + WEIGHTS[c.check], 0);
  let score = total ? counted.reduce((s, c) => s + c.score * WEIGHTS[c.check], 0) / total : 0;
  // A live leaked key or a down site outweighs any amount of polish.
  if (checks.some((c) => c.findings.some((f) => f.severity === "critical"))) score = Math.min(score, 39);
  score = Math.round(score);
  const grade: ShiftReport["grade"] = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { score, grade };
}

export async function runShift(input: string, emit: (e: ShiftEvent) => void, id = newShiftId()): Promise<ShiftReport> {
  const startedAt = new Date().toISOString();
  const url = normalizeUrl(input);
  emit({ type: "start", url: url.toString(), at: startedAt });

  const logFor = (check?: CheckId) => (line: string, level: "info" | "warn" | "error" = "info") =>
    emit({ type: "log", check, line, level });

  const results = new Map<CheckId, CheckResult>();
  const settle = (r: CheckResult) => {
    results.set(r.check, r);
    emit({ type: "check", result: r });
  };

  const guard = async (check: CheckId, run: () => Promise<CheckResult>) => {
    try {
      settle(await run());
    } catch (err) {
      logFor(check)(`${CHECK_LABELS[check]} failed: ${(err as Error).message}`, "error");
      settle(skipped(check, "Check couldn't complete", "error"));
    }
  };

  // Lighthouse only needs the URL and is the slowest, so it starts first.
  const lighthouse = guard("lighthouse", () =>
    checkLighthouse({ url, log: logFor("lighthouse") }),
  );

  logFor("uptime")(`Clocking in at ${url.hostname}`);
  let page;
  try {
    page = await safeFetch(url, { timeoutMs: 15_000 });
    logFor("uptime")(`${page.status} in ${page.totalMs}ms${page.redirects.length ? ` after ${page.redirects.length} redirect(s)` : ""}`);
  } catch (err) {
    const message = (err as Error).message;
    logFor("uptime")(`Couldn't reach the site: ${message}`, "error");
    settle({
      check: "uptime",
      label: CHECK_LABELS.uptime,
      status: "fail",
      score: 0,
      summary: "Site unreachable",
      findings: [
        {
          id: "uptime:unreachable",
          check: "uptime",
          severity: "critical",
          title: "Site is unreachable",
          detail: `The live URL didn't respond (${message}). Anyone opening it right now sees an error.`,
          fix: "Check that the deployment is live and the domain's DNS points at your host, then redeploy.",
        },
      ],
      ms: 0,
    });
    for (const check of ["tls", "headers", "secrets", "meta", "links"] as CheckId[]) {
      settle(skipped(check, "Skipped, site unreachable"));
    }
    await lighthouse;
    return finish();
  }

  const ctx = (check: CheckId): ShiftContext => ({ url, page, log: logFor(check) });
  await Promise.all([
    guard("uptime", () => checkUptime(ctx("uptime"))),
    guard("tls", () => checkTls(ctx("tls"))),
    guard("headers", () => checkHeaders(ctx("headers"))),
    guard("secrets", () => checkSecrets(ctx("secrets"))),
    guard("meta", () => checkMeta(ctx("meta"))),
    guard("links", () => checkLinks(ctx("links"))),
    lighthouse,
  ]);
  return finish(page.url);

  function finish(finalUrl = url.toString()): ShiftReport {
    const checks = CHECK_ORDER.map((c) => results.get(c) ?? skipped(c, "Not run"));
    const { score, grade } = scoreChecks(checks);
    return { id, url: url.toString(), finalUrl, startedAt, finishedAt: new Date().toISOString(), score, grade, checks };
  }
}
