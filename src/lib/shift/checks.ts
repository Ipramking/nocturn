import { safeFetch, type SafeResponse } from "./safe-fetch";
import { chunkRefs, scanForSecrets } from "./secrets";
import type { CheckId, CheckResult, Finding, Severity } from "./types";

export interface ShiftContext {
  url: URL;
  page: SafeResponse;
  log: (line: string, level?: "info" | "warn" | "error") => void;
}

const PENALTY: Record<Severity, number> = { critical: 60, high: 30, medium: 15, low: 5, info: 0 };

export const CHECK_LABELS: Record<CheckId, string> = {
  uptime: "Uptime & latency",
  tls: "TLS & HTTPS",
  headers: "Security headers",
  secrets: "Leaked secrets",
  meta: "Share & SEO readiness",
  links: "Broken links",
  lighthouse: "Lighthouse (mobile)",
};

export function result(
  check: CheckId,
  started: number,
  findings: Finding[],
  passSummary: string,
  metrics?: CheckResult["metrics"],
  scoreOverride?: number,
): CheckResult {
  const score =
    scoreOverride ?? Math.max(0, 100 - findings.reduce((sum, f) => sum + PENALTY[f.severity], 0));
  const worst = findings.some((f) => f.severity === "critical" || f.severity === "high")
    ? "fail"
    : findings.some((f) => f.severity === "medium" || f.severity === "low")
      ? "warn"
      : "pass";
  const counted = findings.filter((f) => f.severity !== "info").length;
  return {
    check,
    label: CHECK_LABELS[check],
    status: worst,
    score: Math.round(score),
    summary: counted === 0 ? passSummary : `${counted} issue${counted === 1 ? "" : "s"} found`,
    findings,
    metrics,
    ms: Math.round(performance.now() - started),
  };
}

export function skipped(check: CheckId, summary: string, status: "skipped" | "error" = "skipped"): CheckResult {
  return { check, label: CHECK_LABELS[check], status, score: 0, summary, findings: [], ms: 0 };
}

const f = (check: CheckId, slug: string, severity: Severity, title: string, detail: string, fix: string, evidence?: string): Finding => ({
  id: `${check}:${slug}`,
  check,
  severity,
  title,
  detail,
  fix,
  evidence,
});

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// Minified HTML often drops attribute quotes (`name=viewport`), so read all three forms.
function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
}

function tags(html: string, name: string) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => m[0]);
}

// ---------------------------------------------------------------- uptime

export async function checkUptime({ page, log }: ShiftContext): Promise<CheckResult> {
  const started = performance.now();
  const findings: Finding[] = [];
  const samples = [page.ttfbMs];
  for (let i = 0; i < 2; i++) {
    try {
      const probe = await safeFetch(page.url, { readBody: false, timeoutMs: 8000 });
      samples.push(probe.ttfbMs);
    } catch {
      log("A latency probe dropped", "warn");
    }
  }
  const ttfb = median(samples);
  log(`Response time ${ttfb}ms across ${samples.length} samples`);

  if (page.status >= 500) {
    findings.push(f("uptime", "server-error", "critical", `Homepage returns ${page.status}`, "Your live URL is serving a server error right now. Judges and users see a broken page.", "Check your hosting logs for the crash, fix it and redeploy. Add a health check so you hear about it before your users do."));
  } else if (page.status >= 400) {
    findings.push(f("uptime", "client-error", "high", `Homepage returns ${page.status}`, "The URL answers, but with an error page instead of your app.", "Make sure the deployed route exists and isn't behind auth or a preview password."));
  }
  if (ttfb > 1800) {
    findings.push(f("uptime", "slow", "high", "Very slow first byte", `Median time to first byte is ${ttfb}ms. Visitors stare at a blank screen.`, "Cache the page at the edge or make it static, and move slow data fetching off the critical path."));
  } else if (ttfb > 800) {
    findings.push(f("uptime", "slowish", "medium", "Slow first byte", `Median time to first byte is ${ttfb}ms (aim for under 800ms).`, "Serve this route statically or from an edge cache, and check for a cold-starting server or database."));
  }
  if (page.redirects.length > 2) {
    findings.push(f("uptime", "redirect-chain", "low", "Long redirect chain", `${page.redirects.length} redirects before the page loads.`, "Point links straight at the final URL to save a round trip per hop.", page.redirects.join(" → ")));
  }

  return result("uptime", started, findings, `Up, ${ttfb}ms to first byte`, {
    status: page.status,
    ttfbMs: ttfb,
    totalMs: page.totalMs,
    redirects: page.redirects.length,
  });
}

// ---------------------------------------------------------------- tls

export async function checkTls({ page, log }: ShiftContext): Promise<CheckResult> {
  const started = performance.now();
  const findings: Finding[] = [];
  const final = new URL(page.url);

  if (final.protocol !== "https:") {
    findings.push(f("tls", "no-https", "high", "Site isn't served over HTTPS", "Traffic, logins and wallet connections travel unencrypted, and browsers flag the page as not secure.", "Enable HTTPS on your host (Vercel, Netlify and Cloudflare do it free) and redirect all HTTP traffic to it."));
    return result("tls", started, findings, "");
  }

  const cert = page.cert;
  if (cert) {
    log(`Certificate from ${cert.issuer}, ${cert.daysLeft} days left`);
    if (!cert.authorized) {
      findings.push(f("tls", "untrusted", "critical", "Certificate isn't trusted", `Browsers will show a full-page warning (${cert.authError ?? "untrusted"}).`, "Reissue the certificate through your host or Let's Encrypt and make sure the full chain is served."));
    }
    if (cert.daysLeft < 7) {
      findings.push(f("tls", "expiring", "critical", "Certificate expires within a week", `It expires in ${cert.daysLeft} days.`, "Renew now and turn on automatic renewal."));
    } else if (cert.daysLeft < 21) {
      findings.push(f("tls", "expiring-soon", "medium", "Certificate expires soon", `It expires in ${cert.daysLeft} days.`, "Check that auto-renewal is working before it lapses."));
    }
  }
  if (page.tlsProtocol && /TLSv1(\.1)?$/.test(page.tlsProtocol)) {
    findings.push(f("tls", "old-protocol", "high", `Outdated ${page.tlsProtocol}`, "Old TLS versions have known weaknesses.", "Set your host or CDN to TLS 1.2 minimum."));
  }

  try {
    const plain = new URL(final);
    plain.protocol = "http:";
    const probe = await safeFetch(plain, { readBody: false, maxRedirects: 0, timeoutMs: 6000 });
    const loc = String(probe.headers.location ?? "");
    if (probe.status >= 200 && probe.status < 300) {
      findings.push(f("tls", "no-redirect", "medium", "HTTP doesn't redirect to HTTPS", "Someone typing your domain without https:// gets an unencrypted copy of the site.", "Add a permanent (301/308) redirect from http:// to https://, and an HSTS header."));
    } else if (probe.status >= 300 && probe.status < 400 && !loc.startsWith("https:")) {
      log("HTTP redirect target isn't HTTPS", "warn");
    }
  } catch {
    // Port 80 closed is fine: nothing is served in the clear.
  }

  return result("tls", started, findings, `Valid ${page.tlsProtocol ?? "TLS"}, ${cert?.daysLeft ?? "?"} days left`, {
    protocol: page.tlsProtocol ?? "n/a",
    daysLeft: cert?.daysLeft ?? "n/a",
    issuer: cert?.issuer ?? "n/a",
  });
}

// ---------------------------------------------------------------- headers

export async function checkHeaders({ page }: ShiftContext): Promise<CheckResult> {
  const started = performance.now();
  const h = page.headers;
  const findings: Finding[] = [];
  const https = page.url.startsWith("https:");
  const csp = String(h["content-security-policy"] ?? "");

  if (https && !h["strict-transport-security"]) {
    findings.push(f("headers", "hsts", "medium", "No HSTS header", "Browsers may still try HTTP first, which opens a downgrade window.", "Add `Strict-Transport-Security: max-age=63072000; includeSubDomains`."));
  }
  if (!csp) {
    findings.push(f("headers", "csp", "medium", "No Content-Security-Policy", "Without a CSP, one injected script can read everything on the page, including wallet prompts and tokens.", "Start with a report-only CSP that allows your own origin and the CDNs you use, then enforce it."));
  }
  if (!h["x-frame-options"] && !/frame-ancestors/i.test(csp)) {
    findings.push(f("headers", "framing", "medium", "Page can be framed by any site", "Attackers can overlay your UI in an invisible iframe and trick users into clicking (clickjacking).", "Send `X-Frame-Options: DENY` or a CSP `frame-ancestors 'self'`."));
  }
  if (String(h["x-content-type-options"] ?? "").toLowerCase() !== "nosniff") {
    findings.push(f("headers", "nosniff", "low", "Missing X-Content-Type-Options", "Browsers may guess file types, which can turn uploads into scripts.", "Send `X-Content-Type-Options: nosniff`."));
  }
  if (!h["referrer-policy"]) {
    findings.push(f("headers", "referrer", "low", "No Referrer-Policy", "Full URLs (including query tokens) can leak to third-party sites.", "Send `Referrer-Policy: strict-origin-when-cross-origin`."));
  }
  if (h["x-powered-by"]) {
    findings.push(f("headers", "powered-by", "low", "Server advertises its stack", "The X-Powered-By header tells attackers exactly what to target.", "Remove it (in Next.js: `poweredByHeader: false`).", `X-Powered-By: ${h["x-powered-by"]}`));
  }
  const cookies = ([] as string[]).concat(h["set-cookie"] ?? []);
  const weak = cookies.filter((c) => !/;\s*secure/i.test(c) || !/;\s*httponly/i.test(c));
  if (weak.length) {
    findings.push(f("headers", "cookies", "medium", "Cookies without Secure/HttpOnly", `${weak.length} cookie(s) can be read by scripts or sent over HTTP.`, "Set `Secure`, `HttpOnly` and `SameSite=Lax` on session cookies.", weak.map((c) => c.split("=")[0]).join(", ")));
  }

  const present = ["strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"].filter((k) => h[k]).length;
  return result("headers", started, findings, "Hardened headers", { present: `${present}/6` });
}

// ---------------------------------------------------------------- secrets

function sameSite(a: URL, b: URL) {
  const root = (h: string) => h.split(".").slice(-2).join(".");
  return root(a.hostname) === root(b.hostname);
}

export async function checkSecrets({ page, log }: ShiftContext): Promise<CheckResult> {
  const started = performance.now();
  const base = new URL(page.url);
  const seen = new Set<string>();
  const findings: Finding[] = scanForSecrets(page.body, "the page HTML", seen);

  const queue: string[] = [];
  const queued = new Set<string>();
  const enqueue = (raw: string, from: URL) => {
    try {
      const u = new URL(raw, from);
      if (!sameSite(u, base) || queued.has(u.href)) return;
      queued.add(u.href);
      queue.push(u.href);
    } catch {
      /* ignore malformed */
    }
  };
  for (const tag of tags(page.body, "script")) {
    const src = attr(tag, "src");
    if (src) enqueue(src, base);
  }
  for (const tag of tags(page.body, "link")) {
    const rel = attr(tag, "rel").toLowerCase();
    const href = attr(tag, "href");
    if ((rel === "modulepreload" || (rel === "preload" && attr(tag, "as") === "script")) && href) enqueue(href, base);
  }

  const MAX_FILES = 40;
  let scanned = 0;
  let bytes = 0;
  let sourceMaps = 0;
  while (queue.length && scanned < MAX_FILES) {
    const batch = queue.splice(0, 6);
    const results = await Promise.allSettled(
      batch.map((href) => safeFetch(href, { accept: "*/*", maxBytes: 4_000_000, timeoutMs: 10_000 })),
    );
    for (const [i, r] of results.entries()) {
      if (r.status !== "fulfilled" || r.value.status >= 400) continue;
      scanned++;
      bytes += r.value.bytes;
      const js = r.value.body;
      const name = new URL(batch[i]).pathname.split("/").pop() || batch[i];
      findings.push(...scanForSecrets(js, name, seen));
      for (const ref of chunkRefs(js)) enqueue(ref.startsWith("/") ? ref : `/${ref.replace(/^\.\//, "")}`, base);
      if (/\/\/[#@] sourceMappingURL=(?!data:)\S+\.map/.test(js)) sourceMaps++;
    }
  }
  log(`Scanned ${scanned} bundle${scanned === 1 ? "" : "s"} (${Math.round(bytes / 1024)} KB)`);

  if (sourceMaps > 0) {
    const sample = [...queued][0];
    try {
      const map = await safeFetch(`${sample}.map`, { readBody: false, timeoutMs: 6000 });
      if (map.status === 200) {
        findings.push(f("secrets", "sourcemaps", "low", "Source maps are public", "Your original source code (comments, internal routes, logic) can be read in full from the browser.", "Disable production source maps or upload them privately to your error tracker."));
      }
    } catch {
      /* no map served */
    }
  }

  const leaks = findings.filter((x) => x.severity === "critical" || x.severity === "high").length;
  if (leaks) log(`${leaks} exposed key${leaks === 1 ? "" : "s"} found`, "error");
  return result("secrets", started, findings, `No keys exposed in ${scanned} bundle${scanned === 1 ? "" : "s"}`, {
    bundles: scanned,
    kb: Math.round(bytes / 1024),
  });
}

// ---------------------------------------------------------------- meta

const metaContent = (html: string, by: "name" | "property", key: string) => {
  const tag = tags(html, "meta").find((t) => attr(t, by).toLowerCase() === key);
  return tag ? attr(tag, "content") : "";
};

export async function checkMeta({ page, log }: ShiftContext): Promise<CheckResult> {
  const started = performance.now();
  const html = page.body;
  const base = new URL(page.url);
  const findings: Finding[] = [];

  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
  const description = metaContent(html, "name", "description");
  const ogImage = metaContent(html, "property", "og:image");
  const ogTitle = metaContent(html, "property", "og:title");
  const twitterCard = metaContent(html, "name", "twitter:card");
  const viewport = metaContent(html, "name", "viewport");
  const robotsMeta = metaContent(html, "name", "robots");

  if (!viewport) findings.push(f("meta", "viewport", "high", "No mobile viewport", "Phones render the desktop layout zoomed out, so the app is barely usable on mobile.", 'Add `<meta name="viewport" content="width=device-width, initial-scale=1">`.'));
  if (!title) findings.push(f("meta", "title", "medium", "Missing page title", "Tabs, bookmarks and search results show a bare URL.", "Add a `<title>` that says what the app is in a few words."));
  if (!description) findings.push(f("meta", "description", "low", "Missing meta description", "Search and link previews have nothing to show under your name.", "Add a one-sentence meta description."));
  if (!ogImage) findings.push(f("meta", "og-image", "medium", "No share image (og:image)", "Links to your app on X, Farcaster and Discord show as plain text, which hurts every share during voting.", "Add a 1200×630 `og:image` plus `og:title` and `og:description`."));
  else if (!ogTitle) findings.push(f("meta", "og-title", "low", "No og:title", "Share cards fall back to the page title or URL.", "Add `og:title` and `og:description`."));
  if (!twitterCard) findings.push(f("meta", "twitter-card", "low", "No twitter:card", "X shows a small preview instead of a large image card.", 'Add `<meta name="twitter:card" content="summary_large_image">`.'));
  if (!/<html\b[^>]*\blang=/i.test(html)) findings.push(f("meta", "lang", "low", "No language declared", "Screen readers and translators have to guess the page language.", 'Set `<html lang="en">`.'));
  if (/noindex/i.test(robotsMeta)) findings.push(f("meta", "noindex", "medium", "Page tells search engines not to index it", "A leftover `noindex` hides your live app from search.", "Remove the robots `noindex` meta tag for production."));

  const visibleText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (visibleText.length < 80) {
    findings.push(f("meta", "empty-shell", "low", "Page is empty until JavaScript runs", "Crawlers, link unfurlers and AI judges that read raw HTML see an almost blank page.", "Server-render or pre-render the landing page so the core pitch exists in the HTML."));
  }

  const [favicon, robots, sitemap] = await Promise.allSettled([
    tags(html, "link").some((t) => /icon/i.test(attr(t, "rel")))
      ? Promise.resolve({ status: 200 })
      : safeFetch(new URL("/favicon.ico", base), { readBody: false, timeoutMs: 6000 }),
    safeFetch(new URL("/robots.txt", base), { readBody: false, timeoutMs: 6000 }),
    safeFetch(new URL("/sitemap.xml", base), { readBody: false, timeoutMs: 6000 }),
  ]);
  const ok = (r: PromiseSettledResult<{ status: number }>) => r.status === "fulfilled" && r.value.status === 200;
  if (!ok(favicon)) findings.push(f("meta", "favicon", "low", "No favicon", "Your tab shows a blank icon, which reads as unfinished.", "Add a favicon (and an apple-touch-icon)."));
  if (!ok(robots)) findings.push(f("meta", "robots", "info", "No robots.txt", "Optional, but it's where you point crawlers at your sitemap.", "Add a robots.txt that links your sitemap."));
  if (!ok(sitemap)) findings.push(f("meta", "sitemap", "info", "No sitemap.xml", "Optional for a single-page app.", "Generate a sitemap if you have more than a couple of public pages."));

  log(title ? `Title: "${title.slice(0, 60)}"` : "No title tag", title ? "info" : "warn");
  return result("meta", started, findings, "Ready to be shared", {
    title: title.slice(0, 80) || "none",
    ogImage: ogImage ? "yes" : "no",
  });
}

// ---------------------------------------------------------------- links

export async function checkLinks({ page, log }: ShiftContext): Promise<CheckResult> {
  const started = performance.now();
  const base = new URL(page.url);
  const targets = new Set<string>();
  for (const tag of tags(page.body, "a")) {
    const href = attr(tag, "href");
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    try {
      const u = new URL(href, base);
      u.hash = "";
      if (u.origin === base.origin && u.href !== base.href) targets.add(u.href);
    } catch {
      /* ignore */
    }
    if (targets.size >= 25) break;
  }

  const broken: string[] = [];
  const erroring: string[] = [];
  const list = [...targets];
  for (let i = 0; i < list.length; i += 6) {
    const batch = list.slice(i, i + 6);
    const res = await Promise.allSettled(batch.map((href) => safeFetch(href, { readBody: false, timeoutMs: 8000 })));
    res.forEach((r, j) => {
      const path = new URL(batch[j]).pathname;
      if (r.status === "rejected") erroring.push(path);
      else if (r.value.status === 404 || r.value.status === 410) broken.push(path);
      else if (r.value.status >= 500) erroring.push(path);
    });
  }
  log(`Walked ${list.length} internal link${list.length === 1 ? "" : "s"}`);

  const findings: Finding[] = [];
  if (broken.length) findings.push(f("links", "404", broken.length > 2 ? "high" : "medium", `${broken.length} broken link${broken.length === 1 ? "" : "s"}`, "Visitors who click these land on a 404.", "Fix or remove these links, or add redirects for moved pages.", broken.slice(0, 6).join(", ")));
  if (erroring.length) findings.push(f("links", "5xx", "high", `${erroring.length} page${erroring.length === 1 ? "" : "s"} erroring`, "These internal pages fail with a server error or time out.", "Open each route, check the server logs, and fix the crash.", erroring.slice(0, 6).join(", ")));

  return result("links", started, findings, list.length ? `All ${list.length} links resolve` : "Single-page app, no internal links", {
    checked: list.length,
  });
}

// ---------------------------------------------------------------- lighthouse

export async function checkLighthouse({ url, log }: Pick<ShiftContext, "url" | "log">): Promise<CheckResult> {
  const started = performance.now();
  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", url.toString());
  api.searchParams.set("strategy", "mobile");
  for (const c of ["performance", "accessibility", "best-practices", "seo"]) api.searchParams.append("category", c);
  if (process.env.PSI_API_KEY) api.searchParams.set("key", process.env.PSI_API_KEY);

  let json: {
    lighthouseResult?: {
      categories: Record<string, { score: number | null; title: string }>;
      audits: Record<string, { displayValue?: string }>;
    };
  };
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) {
      log(`PageSpeed returned ${res.status}`, "warn");
      return skipped("lighthouse", res.status === 429 ? "PageSpeed quota reached, try again later" : "PageSpeed couldn't audit this page");
    }
    json = await res.json();
  } catch {
    log("PageSpeed audit timed out", "warn");
    return skipped("lighthouse", "PageSpeed audit timed out");
  }

  const cats = json.lighthouseResult?.categories;
  if (!cats) return skipped("lighthouse", "PageSpeed returned no scores");
  const scores = Object.fromEntries(
    Object.entries(cats).map(([k, v]) => [k, Math.round((v.score ?? 0) * 100)]),
  ) as Record<string, number>;
  const findings: Finding[] = [];
  for (const [key, value] of Object.entries(scores)) {
    const name = cats[key].title;
    if (value < 50) findings.push(f("lighthouse", key, "high", `${name} score ${value}`, `Lighthouse rates ${name.toLowerCase()} as poor on mobile.`, `Open PageSpeed Insights for this URL and fix the top ${name.toLowerCase()} opportunities first.`));
    else if (value < 75) findings.push(f("lighthouse", key, "medium", `${name} score ${value}`, `Lighthouse rates ${name.toLowerCase()} as needing work on mobile.`, `Work through the ${name.toLowerCase()} opportunities PageSpeed lists for this URL.`));
    else if (value < 90) findings.push(f("lighthouse", key, "low", `${name} score ${value}`, `Close to good; a few ${name.toLowerCase()} fixes left.`, `Pick off the remaining ${name.toLowerCase()} audits in PageSpeed.`));
  }
  const audits = json.lighthouseResult?.audits ?? {};
  const avg = Object.values(scores).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(scores).length);
  log(`Lighthouse: perf ${scores.performance ?? "?"}, a11y ${scores.accessibility ?? "?"}`);
  return result("lighthouse", started, findings, "Strong across the board", {
    performance: scores.performance ?? "n/a",
    accessibility: scores.accessibility ?? "n/a",
    bestPractices: scores["best-practices"] ?? "n/a",
    seo: scores.seo ?? "n/a",
    lcp: audits["largest-contentful-paint"]?.displayValue ?? "n/a",
    cls: audits["cumulative-layout-shift"]?.displayValue ?? "n/a",
  }, avg);
}
