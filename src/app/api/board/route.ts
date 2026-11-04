import { boardTotals, recentShifts } from "@/lib/store";

export const runtime = "nodejs";

// Anonymous by construction: the store returns platform kinds and counts, never URLs, hosts or ids.
export async function GET(req: Request) {
  const raw = Number(new URL(req.url).searchParams.get("limit") ?? 12);
  const limit = Number.isFinite(raw) ? Math.min(30, Math.max(1, Math.floor(raw))) : 12;
  try {
    const [shifts, totals] = await Promise.all([recentShifts(limit), boardTotals()]);
    return Response.json({ shifts, totals }, { headers: { "cache-control": "s-maxage=30, stale-while-revalidate=60" } });
  } catch {
    return Response.json({ error: "The board is offline right now" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
