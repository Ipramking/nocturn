import { siteUrl } from "@/lib/site";
import { latestShift } from "@/lib/store";

export const runtime = "nodejs";

// One click to a real Morning Report: the latest shift on the built-in leaky demo app.
export async function GET(req: Request) {
  const base = siteUrl(req);
  const demo = `${base}/demo/leaky`;
  const latest = await latestShift(demo).catch(() => null);
  const target = latest ? `${base}/r/${latest.id}` : `${base}/?url=${encodeURIComponent(demo)}`;
  return Response.redirect(target, 307);
}
