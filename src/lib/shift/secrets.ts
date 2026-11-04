import type { Finding, Severity } from "./types";

interface Pattern {
  name: string;
  re: RegExp;
  severity: Severity;
  fix: string;
  /** Extra gate to cut false positives; receives the match and ~80 chars around it. */
  accept?: (match: string, context: string) => boolean | Severity;
}

const ROTATE = "Rotate it now in the provider's dashboard, then move the call behind a server route so the key never ships to the browser.";
const RPC_FIX =
  "dApps often ship an RPC URL to the browser, but anyone can copy this one and burn your quota. Lock it to your domains in the provider's dashboard (allowlist), or proxy RPC calls through a server route.";

const PATTERNS: Pattern[] = [
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{32,}/g, severity: "critical", fix: ROTATE },
  {
    name: "OpenAI API key",
    re: /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g,
    severity: "critical",
    fix: ROTATE,
    accept: (m) => !m.startsWith("sk-ant-"),
  },
  {
    name: "Google / Gemini API key",
    re: /AIza[0-9A-Za-z_-]{35}/g,
    severity: "high",
    fix: "If this is a Gemini or Maps key, rotate it and call the API from a server route. If it is a Firebase web config key it is public by design, but restrict it to your domains in Google Cloud.",
    // Firebase web config keys are meant to be public; downgrade when it sits in a Firebase config.
    accept: (_m, ctx) => (/authDomain|firebase|projectId|messagingSenderId/i.test(ctx) ? "info" : true),
  },
  { name: "Stripe secret key", re: /\b(?:sk|rk)_live_[0-9A-Za-z]{24,}/g, severity: "critical", fix: ROTATE },
  { name: "AWS access key ID", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: "high", fix: ROTATE },
  { name: "GitHub token", re: /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{36}\b|github_pat_[A-Za-z0-9_]{60,}/g, severity: "critical", fix: ROTATE },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{20,}/g, severity: "high", fix: ROTATE },
  { name: "Groq API key", re: /\bgsk_[A-Za-z0-9]{40,}/g, severity: "critical", fix: ROTATE },
  { name: "Replicate token", re: /\br8_[A-Za-z0-9]{36,}/g, severity: "critical", fix: ROTATE },
  { name: "Resend API key", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/g, severity: "high", fix: ROTATE },
  { name: "Brevo API key", re: /\bxkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}/g, severity: "high", fix: ROTATE },
  { name: "SendGrid API key", re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, severity: "high", fix: ROTATE },
  { name: "Hugging Face token", re: /\bhf_[A-Za-z0-9]{34,}/g, severity: "high", fix: ROTATE },
  { name: "Alchemy RPC key", re: /https?:\/\/[a-z0-9-]+\.g\.alchemy\.com\/v2\/[A-Za-z0-9_-]{24,}/g, severity: "medium", fix: RPC_FIX },
  { name: "Infura RPC key", re: /https?:\/\/[a-z0-9-]+\.infura\.io\/v3\/[a-f0-9]{32}/g, severity: "medium", fix: RPC_FIX },
  { name: "QuickNode endpoint", re: /https?:\/\/[a-z0-9-]+\.[a-z0-9-]+\.quiknode\.pro\/[a-f0-9]{30,}/g, severity: "medium", fix: RPC_FIX },
  {
    name: "Private key block",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    severity: "critical",
    fix: "A private key is bundled into your frontend. Treat it as compromised: revoke it, generate a new one, and keep it server-side only.",
  },
  {
    name: "Wallet private key",
    re: /\b0x[a-fA-F0-9]{64}\b/g,
    severity: "critical",
    fix: "Anything holding funds under this key should be moved to a fresh wallet right away. Sign on the server or with the user's wallet, never with a key in the bundle.",
    // 32-byte hex is everywhere (hashes, tx ids); only flag it next to key-ish names.
    accept: (_m, ctx) => /priv(ate)?_?key|secret|mnemonic|signer|deployer_?key/i.test(ctx),
  },
];

const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function entropy(s: string) {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function looksFake(token: string) {
  return /x{6,}|0{8,}|1234567|example|your[_-]?(api)?[_-]?key|placeholder|dummy|test_?key/i.test(token) || entropy(token) < 3.2;
}

export function mask(secret: string) {
  if (secret.length <= 12) return `${secret.slice(0, 3)}…`;
  return `${secret.slice(0, 6)}…${secret.slice(-4)}`;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(part, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** Scan one source (HTML or a JS bundle) and return de-duplicated findings. */
export function scanForSecrets(source: string, origin: string, seen: Set<string>): Finding[] {
  const findings: Finding[] = [];

  const push = (name: string, token: string, severity: Severity, fix: string) => {
    const key = `${name}:${token}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({
      id: `secrets:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${seen.size}`,
      check: "secrets",
      severity,
      title: `${name} exposed in client code`,
      detail: `Found in ${origin}. Anyone who opens your site can copy it from the browser.`,
      evidence: mask(token),
      fix,
    });
  };

  for (const p of PATTERNS) {
    for (const m of source.matchAll(p.re)) {
      const token = m[0];
      if (p.name !== "Private key block" && looksFake(token)) continue;
      const at = m.index ?? 0;
      const context = source.slice(Math.max(0, at - 80), at + token.length + 80);
      const verdict = p.accept ? p.accept(token, context) : true;
      if (verdict === false) continue;
      push(p.name, token, typeof verdict === "string" ? verdict : p.severity, p.fix);
    }
  }

  for (const m of source.matchAll(JWT_RE)) {
    const payload = decodeJwtPayload(m[0]);
    if (payload?.role === "service_role") {
      push(
        "Supabase service-role key",
        m[0],
        "critical",
        "This key bypasses Row Level Security, so anyone can read and write your whole database. Rotate the JWT secret in Supabase, use only the anon key in the browser, and keep service-role calls on the server.",
      );
    }
  }

  return findings;
}

/** Same-site JS paths referenced from inside a bundle (lazy chunks). */
export function chunkRefs(js: string): string[] {
  const out = new Set<string>();
  const re = /["'`]((?:\/|\.\/)?(?:_next\/static\/chunks|assets|static\/js|build)\/[\w\-./]+?\.js)["'`]/g;
  for (const m of js.matchAll(re)) out.add(m[1]);
  return [...out];
}
