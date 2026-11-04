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

// Paste safety: things people paste into a chat that the bundle scanner doesn't look for.
const DB_URL_RE = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^\s:/@]+:[^\s@/]{3,}@[^\s/]+/g;
const ASSIGNED_SECRET_RE = /\b[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY)[A-Z0-9_]*\s*[:=]\s*["']?([^\s"'`;,)]{12,})/gi;
// Passwords are short and low-entropy, so only env-style lines (DB_PASSWORD=…) and quoted literals count.
const PASSWORD_RE = /^\s*(?:export\s+)?[\w.-]*pass(?:word|wd)\s*[:=]\s*["']?([^\s"']{6,})["']?\s*$|\bpass(?:word|wd)["']?\s*[:=]\s*["']([^"'\s]{6,})["']/gim;
const WORD_RUN_RE = /\b[a-z]{3,8}(?:\s+[a-z]{3,8}){11,}\b/g;
const PEM_BLOCK_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const REFERENCE_RE = /^(?:process\.env|import\.meta|env\.|\$|<|\{|\[redacted)/;
const PLACEHOLDER_RE = /x{6,}|\*{3,}|0{8,}|1234567|example|your|placeholder|dummy|changeme|password|secret|redacted|\.\.\./i;

function pasteFinding(name: string, evidence: string, fix: string): Finding {
  return {
    id: `paste:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    check: "secrets",
    severity: "critical",
    title: name,
    detail: "Found in your message.",
    evidence,
    fix,
  };
}

// Values the provider patterns already judged (a Firebase web key, a Supabase anon JWT) are left to them.
const knownToken = (v: string) => PATTERNS.some((p) => new RegExp(p.re.source).test(v)) || new RegExp(JWT_RE.source).test(v);
// An assigned value that is a real secret, not a reference like process.env.X, code or a placeholder.
const realSecret = (v: string) => !REFERENCE_RE.test(v) && !knownToken(v) && /\d/.test(v) && /[a-z]/i.test(v) && !looksFake(v);
const realPassword = (v: string) => !REFERENCE_RE.test(v) && !PLACEHOLDER_RE.test(v);

function seedPhraseRun(text: string) {
  if (!/seed|mnemonic|recovery|phrase|wallet/i.test(text)) {
    // Without a hint, only a message that is nothing but the word list counts.
    const words = text.trim().split(/\s+/);
    return [12, 15, 18, 21, 24].includes(words.length) && words.every((w) => /^[a-z]{3,8}$/.test(w)) ? text.trim() : null;
  }
  for (const m of text.matchAll(WORD_RUN_RE)) {
    const n = m[0].split(/\s+/).length;
    if (n >= 12 && n <= 24) return m[0];
  }
  return null;
}

/** Secrets in something a person is about to send (a chat message). Pure; safe in the browser. */
export function checkPasteSafety(text: string): Finding[] {
  const found = scanForSecrets(text, "your message", new Set()).filter((f) => f.severity !== "info");
  for (const m of text.matchAll(DB_URL_RE)) {
    found.push(pasteFinding("Database URL with a password", mask(m[0]), "Change the database password now and keep the URL in your host's environment settings."));
  }
  const assigned = [...text.matchAll(ASSIGNED_SECRET_RE)].map((m) => m[1]).find(realSecret);
  if (assigned) found.push(pasteFinding("Secret value", mask(assigned), ROTATE));
  const password = [...text.matchAll(PASSWORD_RE)].map((m) => m[1] ?? m[2]).find(realPassword);
  if (password && !assigned) {
    found.push(pasteFinding("Password", `${password.length} characters`, "Change that password now, everywhere you used it."));
  }
  const seed = seedPhraseRun(text);
  if (seed) {
    found.push(pasteFinding("Wallet seed phrase", `${seed.split(/\s+/).length} words`, "Move everything this phrase controls to a fresh wallet now."));
  }
  return found;
}

const nameOf = (f: Finding) => f.title.replace(/ exposed in client code$/, "").replace(/^(Private|Wallet|Secret|Database|Password)/, (s) => s.toLowerCase());
const article = (s: string) => (/^[aeiou]/i.test(s) ? "an" : "a");

/** The warning shown instead of sending a message that carries a secret. */
export function pasteBlockedMessage(findings: Finding[]) {
  const named = findings.slice(0, 3).map((f) => `${article(nameOf(f))} ${nameOf(f)} (${f.evidence ?? "masked"})`);
  const list = named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : named[0];
  const funds = findings.some((f) => /wallet|private key/i.test(f.title));
  return [
    `That looks like ${list}.`,
    "NOCTURN stopped it before it went anywhere: it was not sent to the AI and not saved.",
    funds
      ? "Treat it as compromised: delete it from wherever you pasted it and move anything it controls to a fresh key now."
      : "Delete it from wherever you pasted it and rotate it now in the provider's dashboard.",
  ].join(" ");
}

/** Mask every key-shaped token before text goes to a third party. Deliberately broad. */
export function redactSecrets(text: string) {
  let out = text.replace(PEM_BLOCK_RE, "[private key removed]");
  out = out.replace(DB_URL_RE, (m) => `[redacted ${mask(m)}]`);
  for (const p of PATTERNS) out = out.replace(p.re, (m) => `[redacted ${mask(m)}]`);
  out = out.replace(JWT_RE, (m) => `[redacted ${mask(m)}]`);
  out = out.replace(ASSIGNED_SECRET_RE, (m, v: string) => (realSecret(v) ? m.replace(v, `[redacted ${mask(v)}]`) : m));
  out = out.replace(PASSWORD_RE, (m, a?: string, b?: string) => {
    const v = a ?? b;
    return v && realPassword(v) ? m.replace(v, "[password removed]") : m;
  });
  const seed = seedPhraseRun(out);
  return seed ? out.replace(seed, "[seed phrase removed]") : out;
}
