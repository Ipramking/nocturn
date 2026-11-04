import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { closestFinding, fallbackReply, parseChat } from "../src/lib/engineer.ts";
import { checkPasteSafety, pasteBlockedMessage, redactSecrets } from "../src/lib/shift/secrets.ts";
import type { Finding, ShiftReport } from "../src/lib/shift/types.ts";

// Every key-shaped value is generated at runtime: realistic shape, never valid, nothing committed.
const rand = (n: number) => randomBytes(n * 2).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, n);
const word = () => Array.from(randomBytes(3 + (randomBytes(1)[0] % 6)), (b) => String.fromCharCode(97 + (b % 26))).join("");
const serviceRoleJwt = () =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "service_role", iss: "supabase" })).toString("base64url")}.${rand(43)}`;
const anonJwt = () => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "anon", iss: "supabase" })).toString("base64url")}.${rand(43)}`;

function finding(f: Pick<Finding, "check" | "severity" | "title"> & Partial<Finding>): Finding {
  return { id: `${f.check}:${f.title.toLowerCase().replace(/\W+/g, "-")}`, detail: `${f.title} detail.`, fix: `Fix for ${f.title}.`, ...f };
}

function report(url: string, findings: Finding[], finishedAt = new Date().toISOString()): ShiftReport {
  const checks = (["uptime", "headers", "secrets"] as const).map((check) => ({
    check,
    label: check,
    status: "pass" as const,
    score: 100,
    summary: "",
    findings: findings.filter((f) => f.check === check),
    ms: 1,
  }));
  return { id: rand(8), url, finalUrl: url, startedAt: finishedAt, finishedAt, score: 71, grade: "C", checks };
}

test("paste safety blocks realistic keys, passwords and seed phrases, showing only a masked form", () => {
  const password = `${rand(10)}!`;
  const dbPassword = rand(16);
  const phrase = Array.from({ length: 12 }, word).join(" ");
  const cases: Array<[string, string]> = [
    [`here's my key sk-proj-${rand(48)} why does it 401?`, "OpenAI"],
    [`ANTHROPIC_API_KEY=sk-ant-api03-${rand(60)}`, "Anthropic"],
    [`${["sk", "live"].join("_")}_${rand(32)}`, "Stripe"],
    [`token ghp_${rand(36)}`, "GitHub"],
    [`const supabase = createClient(url, "${serviceRoleJwt()}")`, "Supabase service-role"],
    [`DATABASE_URL=postgresql://neondb_owner:${dbPassword}@ep-${rand(8).toLowerCase()}.neon.tech/neondb`, "database URL"],
    [`CLERK_SECRET_KEY=sk_test_${rand(40)}7`, "secret value"],
    [`DB_PASSWORD=${password}`, "password"],
    [`my wallet seed phrase is ${phrase}`, "seed phrase"],
  ];
  for (const [text, name] of cases) {
    const hits = checkPasteSafety(text);
    assert.ok(hits.length > 0, `should block: ${name}`);
    const message = pasteBlockedMessage(hits);
    assert.match(message, new RegExp(name, "i"), name);
    assert.match(message, /not sent to the AI/);
    assert.match(message, /rotate|fresh key|change that password/i);
    for (const secret of text.match(/[A-Za-z0-9_\-.]{16,}/g) ?? []) {
      if (/^(ANTHROPIC|CLERK|DATABASE|createClient)/.test(secret)) continue;
      assert.ok(!message.includes(secret), `${name}: message must not echo the secret`);
    }
    assert.ok(!message.includes(password) && !message.includes(dbPassword) && !message.includes(phrase), name);
  }
});

test("paste safety lets normal questions and public or referenced keys through", () => {
  const ok = [
    "How do I fix: Missing Content-Security-Policy header?",
    "Why is LCP 4.1s on mobile and how do I get it under 2.5s on Vercel?",
    "const key = process.env.OPENAI_API_KEY; is that safe in a Next.js route?",
    "apiKey: process.env.GEMINI_API_KEY",
    `firebaseConfig = { apiKey: "AIza${rand(35)}", authDomain: "moonpet.firebaseapp.com" }`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonJwt()}`,
    'const password = form.get("password")',
    "password: process.env.DB_PASSWORD",
    `My deploy tx hash is 0x${randomBytes(32).toString("hex")}`,
    "How do I stop my wallet connect button from breaking the page on mobile Safari?",
    'key="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"',
  ];
  for (const text of ok) assert.deepEqual(checkPasteSafety(text), [], text);
});

test("history redaction masks key-shaped tokens and leaves prose alone", () => {
  const openai = `sk-proj-${rand(48)}`;
  const dbPassword = rand(16);
  const envPassword = `${rand(9)}#1`;
  const history = [
    `old message with ${openai}`,
    `postgres://app:${dbPassword}@db.example.net/app`,
    `DB_PASSWORD=${envPassword}`,
    `-----BEGIN PRIVATE KEY-----\n${rand(64)}\n-----END PRIVATE KEY-----`,
  ].join("\n");
  const out = redactSecrets(history);
  for (const secret of [openai, dbPassword, envPassword]) assert.ok(!out.includes(secret), secret);
  assert.match(out, /\[redacted /);
  assert.match(out, /\[private key removed\]/);
  const prose = "How do I fix: Missing Content-Security-Policy header? I'm on Next.js 16.";
  assert.equal(redactSecrets(prose), prose);
});

test("chat payloads are validated", () => {
  const msg = (role: "user" | "assistant", content = "How do I fix the CSP?") => ({ role, content });
  assert.ok(!("error" in parseChat({ shiftId: "abc_DEF-12", messages: [msg("user")] })));
  assert.ok("error" in parseChat({ shiftId: "abc", messages: Array.from({ length: 13 }, () => msg("user")) }));
  assert.ok("error" in parseChat({ shiftId: "abc", messages: [msg("user", "x".repeat(2001))] }));
  assert.ok("error" in parseChat({ shiftId: "abc", messages: [msg("user"), msg("assistant")] }));
  assert.ok("error" in parseChat({ shiftId: "abc", messages: [] }));
  assert.ok("error" in parseChat({ shiftId: "../etc", messages: [msg("user")] }));
  assert.ok("error" in parseChat({ shiftId: "abc", messages: [{ role: "system", content: "hi" }] }));
  assert.ok("error" in parseChat(null));
});

test("the offline engineer answers from the finding the question names", () => {
  const r = report("https://moonpet.vercel.app/", [
    finding({ check: "headers", severity: "medium", title: "Missing Content-Security-Policy header" }),
    finding({ check: "secrets", severity: "critical", title: "OpenAI API key exposed in client code", evidence: "sk-pro…a1B2" }),
  ]);
  assert.equal(closestFinding(r, "How do I fix: Missing Content-Security-Policy header?")?.check, "headers");
  assert.match(fallbackReply(r, "How do I fix: Missing Content-Security-Policy header?"), /^Closest item in your report: Missing Content-Security-Policy/);
  // Off-topic or vague: hand over the most urgent item.
  assert.equal(closestFinding(r, "hello there"), null);
  assert.match(fallbackReply(r, "hello there"), /most urgent item: OpenAI API key/);
  assert.match(fallbackReply(report("https://ok.dev/", []), "anything?"), /Nothing in this report needs you/);
});

test("the night board is anonymous, maps hosts to platforms and skips the leaky demo", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "nocturn-board-"));
  mkdirSync(path.join(dir, ".data"));
  const leak = finding({ check: "secrets", severity: "critical", title: "Stripe secret key exposed in client code" });
  const shifts = [
    report("https://moonpet.vercel.app/", [leak, finding({ check: "headers", severity: "low", title: "No HSTS" })], "2026-11-04T02:14:41.000Z"),
    report("https://shop.example.com/", [], "2026-11-04T03:00:00.000Z"),
    report("https://nocturn-fawn.vercel.app/demo/leaky", [leak], "2026-11-04T04:00:00.000Z"),
  ];
  writeFileSync(path.join(dir, ".data", "shifts.json"), JSON.stringify(Object.fromEntries(shifts.map((s) => [s.id, s]))));
  writeFileSync(
    path.join(dir, ".data", "watches.json"),
    JSON.stringify({ a: { id: "a", active: true }, b: { id: "b", active: false } }),
  );

  // The store reads .data/ under the working directory at import time and uses JSON without DATABASE_URL.
  delete process.env.DATABASE_URL;
  const cwd = process.cwd();
  process.chdir(dir);
  const store = await import("../src/lib/store.ts");
  process.chdir(cwd);

  const kinds: Array<[string, string]> = [
    ["moonpet.vercel.app", "a Vercel app"],
    ["x.netlify.app", "a Netlify app"],
    ["x.pages.dev", "a Cloudflare Pages app"],
    ["me.github.io", "a GitHub Pages app"],
    ["api.onrender.com", "a Render app"],
    ["x.up.railway.app", "a Railway app"],
    ["x.fly.dev", "a Fly app"],
    ["MOONPET.VERCEL.APP.", "a Vercel app"],
    ["notvercel.app", "a custom-domain app"],
    ["vercel.app.evil.com", "a custom-domain app"],
    ["shop.example.com", "a custom-domain app"],
  ];
  for (const [host, kind] of kinds) assert.equal(store.hostKind(host), kind, host);

  const recent = await store.recentShifts(10);
  assert.equal(recent.length, 2, "demo shift is skipped");
  assert.deepEqual(recent[1], {
    at: "2026-11-04T02:14:00.000Z",
    score: 71,
    grade: "C",
    hostKind: "a Vercel app",
    issues: 2,
    criticals: 1,
    leaksCaught: 1,
  });
  const raw = JSON.stringify(recent);
  for (const s of shifts) {
    assert.ok(!raw.includes(new URL(s.url).hostname) && !raw.includes(s.id), "no host, url or id leaks out");
  }
  assert.deepEqual(await store.boardTotals(), { shifts: 2, watches: 1, leaksCaught: 1 });
});
