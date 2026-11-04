import { sendTelegram } from "@/lib/notify";
import { siteUrl } from "@/lib/site";
import { getWatchByToken, saveWatch } from "@/lib/store";

export const runtime = "nodejs";

interface Update {
  message?: { chat: { id: number }; text?: string };
}

// Telegram webhook. Linking works via the deep link t.me/<bot>?start=<linkToken>.
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }
  const update = (await req.json().catch(() => ({}))) as Update;
  const msg = update.message;
  if (!msg?.text) return Response.json({ ok: true });

  const chatId = String(msg.chat.id);
  const token = msg.text.match(/^\/start\s+(\S+)/)?.[1];
  if (!token) {
    await sendTelegram(chatId, "I'm NOCTURN. Start a Night Watch on the site, then tap <b>Connect Telegram</b> to get your Morning Reports here.").catch(() => {});
    return Response.json({ ok: true });
  }

  const watch = await getWatchByToken(token);
  if (!watch) {
    await sendTelegram(chatId, "That link has expired. Open your watch page and tap Connect Telegram again.").catch(() => {});
    return Response.json({ ok: true });
  }
  watch.telegramChatId = chatId;
  await saveWatch(watch);
  const host = new URL(watch.url).hostname;
  await sendTelegram(
    chatId,
    `🌙 Clocked in. I'll watch <b>${host}</b> every night and send your Morning Report here.\n<a href="${siteUrl(req)}/watch/${watch.id}">Your watch</a>`,
  ).catch(() => {});
  return Response.json({ ok: true });
}

// One-off: GET /api/telegram?setup=<CRON_SECRET> registers this webhook with Telegram.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("setup") !== process.env.CRON_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: `${siteUrl(req)}/api/telegram`,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message"],
    }),
  });
  return Response.json(await res.json());
}
