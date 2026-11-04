import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { isBlockedIp, normalizeUrl, safeFetch } from "../src/lib/shift/safe-fetch.ts";
import { scanForSecrets } from "../src/lib/shift/secrets.ts";

const rand = (n: number) => randomBytes(n * 2).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, n);

test("private, loopback and metadata addresses are blocked", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "ff02::1"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "76.76.21.21", "2606:4700::1111"]) {
    assert.equal(isBlockedIp(ip), false, ip);
  }
});

test("normalizeUrl adds https and rejects unsafe targets", () => {
  assert.equal(normalizeUrl("example.com").toString(), "https://example.com/");
  assert.equal(normalizeUrl("  https://example.com/app#x ").toString(), "https://example.com/app");
  for (const bad of ["localhost:3000", "http://127.0.0.1", "file:///etc/passwd", "http://user:pw@example.com", "https://example.com:8080", "http://intranet", "http://printer.local", "ftp://example.com"]) {
    assert.throws(() => normalizeUrl(bad), bad);
  }
});

test("a public hostname that resolves to loopback is refused at connect time", async (t) => {
  // localtest.me is public DNS pointing at 127.0.0.1: the classic SSRF bypass.
  try {
    await safeFetch("http://localtest.me/", { timeoutMs: 5000 });
    assert.fail("should have been blocked");
  } catch (err) {
    const msg = (err as Error).message;
    if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return t.skip("no DNS in this environment");
    assert.match(msg, /private address/);
  }
});

test("secrets scanner flags real-looking keys and masks them", () => {
  const openai = `sk-proj-${rand(48)}`;
  const findings = scanForSecrets(`const k="${openai}";`, "main.js", new Set());
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "critical");
  assert.ok(!findings[0].evidence!.includes(openai), "evidence must be masked");
});

test("Supabase service-role JWT is critical, anon key is ignored", () => {
  const jwt = (role: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url")}.${rand(43)}`;
  assert.equal(scanForSecrets(jwt("service_role"), "a.js", new Set())[0]?.severity, "critical");
  assert.equal(scanForSecrets(jwt("anon"), "a.js", new Set()).length, 0);
});

test("placeholders, Firebase config keys and bare hashes don't raise alarms", () => {
  assert.equal(scanForSecrets('key="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"', "a.js", new Set()).length, 0);
  const firebase = scanForSecrets(`firebaseConfig={apiKey:"AIza${rand(35)}",authDomain:"x.firebaseapp.com"}`, "a.js", new Set());
  assert.equal(firebase[0]?.severity, "info");
  const hex = `0x${randomBytes(32).toString("hex")}`;
  assert.equal(scanForSecrets(`txHash:"${hex}"`, "a.js", new Set()).length, 0);
  assert.equal(scanForSecrets(`PRIVATE_KEY:"${hex}"`, "a.js", new Set())[0]?.severity, "critical");
});

test("the same key found twice is reported once", () => {
  const seen = new Set<string>();
  const key = `sk-ant-api03-${rand(60)}`;
  assert.equal(scanForSecrets(key, "a.js", seen).length, 1);
  assert.equal(scanForSecrets(key, "b.js", seen).length, 0);
});
