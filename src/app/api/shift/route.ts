import { writeNotes } from "@/lib/shift/ai";
import { runShift } from "@/lib/shift/engine";
import { BlockedUrlError, normalizeUrl } from "@/lib/shift/safe-fetch";
import type { ShiftEvent } from "@/lib/shift/types";
import { clientIp, rateLimited } from "@/lib/site";
import { saveShift } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 90;

// Streams the shift as NDJSON: one ShiftEvent per line, ending with "done".
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  if (!body.url) return Response.json({ error: "Paste the live URL of your app" }, { status: 400 });
  try {
    normalizeUrl(body.url);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  if (rateLimited(`shift:${clientIp(req)}`, 6, 10 * 60_000)) {
    return Response.json({ error: "Too many shifts from you in 10 minutes. Give it a moment." }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ShiftEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        const report = await runShift(body.url!, emit);
        emit({ type: "log", line: "Night engineer is writing your Morning Report", level: "info" });
        report.ai = await writeNotes(report);
        await saveShift(report).catch(() => emit({ type: "log", line: "Couldn't save the report link", level: "warn" }));
        emit({ type: "done", report });
      } catch (err) {
        emit({ type: "error", message: err instanceof BlockedUrlError ? err.message : "The shift crashed. Try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
