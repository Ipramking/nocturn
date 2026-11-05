import { createHash } from "node:crypto";

// A deliberately leaky "vibecoded app" so judges can watch NOCTURN catch a leak.
// Every key is junk derived from today's date: realistic shape, never valid, nothing
// key-shaped committed, and stable all day so repeat shifts don't report them as "new".

const junk = (n: number, label: string) => {
  const day = new Date().toISOString().slice(0, 10);
  let out = "";
  for (let i = 0; out.length < n; i++) {
    out += createHash("sha256").update(`nocturn-demo:${day}:${label}:${i}`).digest("base64").replace(/[^A-Za-z0-9]/g, "");
  }
  return out.slice(0, n);
};

function fakeServiceRoleJwt() {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ iss: "supabase", role: "service_role", ref: junk(20, "ref").toLowerCase() })}.${junk(43, "jwt")}`;
}

export function GET() {
  const config = {
    OPENAI_API_KEY: `sk-proj-${junk(56, "openai")}`,
    SUPABASE_SERVICE_ROLE: fakeServiceRoleJwt(),
    STRIPE_KEY: `${["sk", "live"].join("_")}_${junk(32, "stripe")}`,
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
