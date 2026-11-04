import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { changeLine, diffShifts } from "../src/lib/shift/changes.ts";
import { scanForSecrets } from "../src/lib/shift/secrets.ts";
import type { Finding, ShiftReport } from "../src/lib/shift/types.ts";

const finding = (over: Partial<Finding>): Finding => ({
  id: "headers:csp",
  check: "headers",
  severity: "medium",
  title: "No Content-Security-Policy",
  detail: "",
  fix: "",
  ...over,
});

const report = (id: string, score: number, findings: Finding[]): ShiftReport => ({
  id,
  url: "https://app.example/",
  finalUrl: "https://app.example/",
  startedAt: "2026-11-04T22:00:00Z",
  finishedAt: "2026-11-04T22:01:00Z",
  score,
  grade: "B",
  checks: [{ check: "headers", label: "", status: "warn", score, summary: "", findings, ms: 0 }],
});

test("overnight diff reports new, fixed and score change", () => {
  const csp = finding({});
  const hsts = finding({ id: "headers:hsts", title: "No HSTS header" });
  const leak = finding({ id: "secrets:openai:7", check: "secrets", severity: "critical", title: "OpenAI API key exposed in client code", evidence: "sk-pro…ab12" });
  const c = diffShifts(report("now", 70, [hsts, leak]), report("before", 82, [csp, hsts]));
  assert.equal(c.previousId, "before");
  assert.equal(c.scoreDelta, -12);
  assert.deepEqual(c.added.map((f) => f.title), ["OpenAI API key exposed in client code"]);
  assert.deepEqual(c.resolved.map((f) => f.title), ["No Content-Security-Policy"]);
  assert.equal(changeLine(c), "Score -12 · 1 new · 1 fixed");
});

test("the same leaked key isn't 'new' just because its finding id counter moved", () => {
  const a = finding({ id: "secrets:openai:3", check: "secrets", title: "OpenAI API key exposed in client code", evidence: "sk-pro…ab12" });
  const b = { ...a, id: "secrets:openai:9" };
  const c = diffShifts(report("now", 39, [b]), report("before", 39, [a]));
  assert.equal(c.added.length, 0);
  assert.equal(c.resolved.length, 0);
  assert.equal(changeLine(c), "Score unchanged");
});

test("RPC keys shipped in a bundle are flagged medium and masked", () => {
  const alchemy = `https://base-mainnet.g.alchemy.com/v2/${randomBytes(24).toString("base64url")}`;
  const infura = `https://base-mainnet.infura.io/v3/${randomBytes(16).toString("hex")}`;
  const found = scanForSecrets(`const a="${alchemy}";const b="${infura}"`, "app.js", new Set());
  assert.deepEqual(found.map((f) => f.title).sort(), ["Alchemy RPC key exposed in client code", "Infura RPC key exposed in client code"]);
  assert.ok(found.every((f) => f.severity === "medium" && !alchemy.includes(f.evidence!.replace("…", ""))));
});
