import { askEngineer, parseChat } from "@/lib/engineer";
import { checkPasteSafety, pasteBlockedMessage, redactSecrets } from "@/lib/shift/secrets";
import { clientIp, rateLimited } from "@/lib/site";
import { getShift } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 64_000) return reply({ error: "That conversation is too long" }, 413);
  const parsed = parseChat(await req.json().catch(() => null));
  if ("error" in parsed) return reply({ error: parsed.error }, 400);

  // Paste safety comes first: a key in the latest message never reaches the model, the store or a log.
  const leaks = checkPasteSafety(parsed.messages[parsed.messages.length - 1].content);
  if (leaks.length) return reply({ blocked: true, message: pasteBlockedMessage(leaks) });

  if (rateLimited(`engineer:${clientIp(req)}`, 20, 10 * 60_000)) {
    return reply({ error: "That's a lot of questions in 10 minutes. Give the night engineer a moment." }, 429);
  }
  const report = await getShift(parsed.shiftId).catch(() => undefined);
  if (report === undefined) return reply({ error: "Couldn't load that report. Try again in a moment." }, 503);
  if (!report) return reply({ error: "Report not found" }, 404);

  // Earlier turns could carry a key pasted before this check existed, or edited client history.
  const history = parsed.messages.map((m) => ({ ...m, content: redactSecrets(m.content) }));
  return reply({ reply: redactSecrets(await askEngineer(report, history)) });
}
