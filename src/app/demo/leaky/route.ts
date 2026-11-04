import { randomBytes } from "node:crypto";

// A deliberately leaky "vibecoded app" so judges can watch NOCTURN catch a leak.
// Every key is random junk generated per request: realistic shape, never valid,
// and nothing key-shaped is committed to the repo.

const junk = (n: number) =>
  randomBytes(n * 2)
    .toString("base64")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, n);

function fakeServiceRoleJwt() {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ iss: "supabase", role: "service_role", ref: junk(20).toLowerCase() })}.${junk(43)}`;
}

export function GET() {
  const config = {
    OPENAI_API_KEY: `sk-proj-${junk(56)}`,
    SUPABASE_SERVICE_ROLE: fakeServiceRoleJwt(),
    STRIPE_KEY: `${["sk", "live"].join("_")}_${junk(32)}`,
  };
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>MoonPet · AI pet that never sleeps</title>
</head>
<body style="font-family:system-ui;background:#111;color:#eee;padding:40px">
<h1>MoonPet</h1>
<p>A demo app built in one night. It ships its secrets to every visitor, which is exactly what NOCTURN catches. All keys on this page are random fakes.</p>
<a href="/demo/leaky/pricing">Pricing</a>
<script>window.__APP_CONFIG__ = ${JSON.stringify(config)};</script>
</body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
