import { deliverMorningReport, type Delivery } from "@/lib/notify";
import { writeNotes } from "@/lib/shift/ai";
import { runShift } from "@/lib/shift/engine";
import { siteUrl } from "@/lib/site";
import { activeWatches, saveShift, saveWatch, type Watch } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

// Vercel Cron calls this nightly with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("forbidden", { status: 403 });
  }

  const watches = await activeWatches(30);
  const base = siteUrl(req);
  const results: Array<{ id: string; score?: number; delivery?: Delivery; error?: string }> = [];

  const work = async (watch: Watch) => {
    try {
      const report = await runShift(watch.url, () => {});
      report.ai = await writeNotes(report);
      await saveShift(report);
      watch.lastShiftId = report.id;
      await saveWatch(watch);
      results.push({ id: watch.id, score: report.score, delivery: await deliverMorningReport(watch, report, base) });
    } catch (err) {
      results.push({ id: watch.id, error: (err as Error).message });
    }
  };

  // Three shifts at a time keeps us well inside the function time limit.
  const queue = [...watches];
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (let w = queue.shift(); w; w = queue.shift()) await work(w);
  }));

  return Response.json({ ran: results.length, results });
}
