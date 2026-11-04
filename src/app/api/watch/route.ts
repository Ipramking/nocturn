import { randomBytes } from "node:crypto";
import { channels, telegramLink } from "@/lib/notify";
import { normalizeUrl } from "@/lib/shift/safe-fetch";
import { clientIp, rateLimited } from "@/lib/site";
import { getWatch, saveWatch, shiftHistory, type Watch } from "@/lib/store";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The watch id is an unguessable capability: whoever holds the link manages the watch.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { url?: string; email?: string; lastShiftId?: string };
  let url: URL;
  try {
    url = normalizeUrl(body.url ?? "");
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  const email = body.email?.trim() || null;
  if (email && !EMAIL_RE.test(email)) return Response.json({ error: "That email doesn't look right" }, { status: 400 });
  if (rateLimited(`watch:${clientIp(req)}`, 5, 60 * 60_000)) {
    return Response.json({ error: "Too many watches created from here. Try again later." }, { status: 429 });
  }

  const watch: Watch = {
    id: randomBytes(9).toString("base64url"),
    url: url.toString(),
    email,
    telegramChatId: null,
    linkToken: randomBytes(12).toString("base64url"),
    active: true,
    lastShiftId: body.lastShiftId ?? null,
    createdAt: new Date().toISOString(),
  };
  await saveWatch(watch);
  return Response.json({ id: watch.id, telegramLink: telegramLink(watch.linkToken), channels });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const watch = await getWatch(id);
  if (!watch) return Response.json({ error: "Watch not found" }, { status: 404 });
  const history = await shiftHistory(watch.url).catch(() => []);
  return Response.json({
    watch: { ...watch, linkToken: undefined, telegramLinked: Boolean(watch.telegramChatId) },
    telegramLink: watch.telegramChatId ? null : telegramLink(watch.linkToken),
    channels,
    history,
  });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; active?: boolean; email?: string | null };
  const watch = await getWatch(body.id ?? "");
  if (!watch) return Response.json({ error: "Watch not found" }, { status: 404 });
  if (typeof body.active === "boolean") watch.active = body.active;
  if (body.email !== undefined) {
    const email = body.email?.trim() || null;
    if (email && !EMAIL_RE.test(email)) return Response.json({ error: "That email doesn't look right" }, { status: 400 });
    watch.email = email;
  }
  await saveWatch(watch);
  return Response.json({ ok: true });
}
