import { normalizeUrl } from "@/lib/shift/safe-fetch";
import { latestShift } from "@/lib/store";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Embeddable "Watched by NOCTURN" badge showing the latest shift score for a host.
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const host = decodeURIComponent((await params).host).replace(/\.svg$/, "");
  let latest = null;
  try {
    latest = await latestShift(normalizeUrl(host).toString());
  } catch {
    latest = null;
  }

  const left = "NOCTURN night shift";
  const right = latest ? `${latest.score}/100 · ${latest.grade}` : "not watched yet";
  const color = !latest ? "#7f9a8c" : latest.score >= 75 ? "#5cffa1" : latest.score >= 50 ? "#ffc261" : "#ff6b7a";
  const lw = 22 + left.length * 6.6;
  const rw = 16 + right.length * 6.8;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="24" role="img" aria-label="${esc(`${left}: ${right}`)}">
  <title>${esc(`${left}: ${right}`)}</title>
  <rect width="${lw + rw}" height="24" rx="5" fill="#04060c"/>
  <rect x="${lw}" width="${rw}" height="24" rx="5" fill="${color}" fill-opacity="0.16"/>
  <circle cx="11" cy="12" r="5" fill="#e8fff0"/><circle cx="13.5" cy="10.5" r="4.4" fill="#04060c"/>
  <g font-family="ui-monospace,Menlo,Consolas,monospace" font-size="11">
    <text x="21" y="16" fill="#d8ffe4">${esc(left)}</text>
    <text x="${lw + 8}" y="16" fill="${color}" font-weight="700">${esc(right)}</text>
  </g>
</svg>`;
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
