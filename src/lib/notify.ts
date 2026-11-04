import { rankedFindings } from "./shift/ai";
import { changeLine } from "./shift/changes";
import type { ShiftReport } from "./shift/types";
import type { Watch } from "./store";

// Each channel is independent and switches on only when its env is set.
// A failing channel is reported, never thrown, so the others still deliver.

export type Delivery = Record<"inApp" | "email" | "telegram", "sent" | "skipped" | "failed">;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const channels = {
  email: Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM),
  telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME),
};

export function telegramLink(token: string) {
  return channels.telegram ? `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${token}` : null;
}

export async function sendTelegram(chatId: string, html: string) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`telegram ${res.status}`);
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": process.env.BREVO_API_KEY! },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM, name: "NOCTURN" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`brevo ${res.status}`);
}

export async function deliverMorningReport(watch: Watch, report: ShiftReport, siteUrl: string): Promise<Delivery> {
  const link = `${siteUrl}/r/${report.id}`;
  const host = new URL(report.finalUrl).hostname;
  const top = rankedFindings(report).slice(0, 3);
  const headline = report.ai?.headline ?? "Your morning report is ready";
  const out: Delivery = { inApp: "sent", email: "skipped", telegram: "skipped" };

  const jobs: Promise<void>[] = [];
  if (channels.telegram && watch.telegramChatId) {
    const c = report.changes;
    const text = [
      `<b>NOCTURN · Morning Report</b>`,
      `${esc(host)} scored <b>${report.score}/100</b> (${report.grade})`,
      esc(headline),
      ...(c
        ? [
            `<b>What changed overnight:</b> ${esc(changeLine(c))}`,
            ...c.added.slice(0, 2).map((f) => `🆕 ${esc(f.title)}`),
            ...c.resolved.slice(0, 2).map((f) => `✅ Fixed: ${esc(f.title)}`),
          ]
        : top.map((f) => `• ${esc(f.title)}`)),
      `<a href="${link}">Open the full report</a>`,
    ].join("\n");
    jobs.push(
      sendTelegram(watch.telegramChatId, text).then(
        () => void (out.telegram = "sent"),
        () => void (out.telegram = "failed"),
      ),
    );
  }
  if (channels.email && watch.email) {
    const html = `<div style="font-family:ui-monospace,Menlo,monospace;background:#05070d;color:#d8ffe4;padding:28px;border-radius:12px">
      <p style="color:#5cffa1;letter-spacing:.2em;font-size:12px;margin:0 0 12px">NOCTURN · MORNING REPORT</p>
      <h1 style="font-size:22px;margin:0 0 6px">${esc(host)} · ${report.score}/100 (${report.grade})</h1>
      <p style="margin:0 0 16px;color:#a9c7b4">${esc(headline)}</p>
      ${report.changes ? `<p style="margin:0 0 16px;color:#ffc261">What changed overnight: ${esc(changeLine(report.changes))}</p>` : ""}
      <ul style="padding-left:18px;margin:0 0 20px">${top.map((f) => `<li>${esc(f.title)}</li>`).join("")}</ul>
      <a href="${link}" style="display:inline-block;background:#5cffa1;color:#05070d;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Open the full report</a>
    </div>`;
    jobs.push(
      sendEmail(watch.email, `${host}: ${report.score}/100 · ${headline}`, html).then(
        () => void (out.email = "sent"),
        () => void (out.email = "failed"),
      ),
    );
  }
  await Promise.all(jobs);
  return out;
}
