import { promises as fs } from "node:fs";
import path from "node:path";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import type { ShiftReport } from "./shift/types";

// Neon Postgres via node-postgres on the pooled URL (Neon's guidance for Vercel
// Fluid compute); a JSON file under .data/ for local dev without a database.
// Tables are created by `pnpm db:migrate` over the direct URL, not at runtime.

export interface Watch {
  id: string;
  url: string;
  email: string | null;
  telegramChatId: string | null;
  linkToken: string;
  active: boolean;
  lastShiftId: string | null;
  createdAt: string;
}

// pg already verifies the certificate for sslmode=require; say so to keep behaviour across pg upgrades.
const connectionString = process.env.DATABASE_URL?.replace("sslmode=require", "sslmode=verify-full");
const pool = connectionString ? new Pool({ connectionString, max: 5 }) : null;
// Lets Vercel close idle clients before a function instance is suspended.
if (pool) attachDatabasePool(pool);

const DATA_DIR = path.join(process.cwd(), ".data");
async function readFile<T>(name: string): Promise<Record<string, T>> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, name), "utf8"));
  } catch {
    return {};
  }
}
async function writeFile<T>(name: string, data: Record<string, T>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, name), JSON.stringify(data));
}

export async function saveShift(report: ShiftReport) {
  if (pool) {
    await pool.query(
      `insert into shifts (id, url, score, grade, report)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (id) do update set report = excluded.report, score = excluded.score, grade = excluded.grade`,
      [report.id, report.finalUrl, report.score, report.grade, JSON.stringify(report)],
    );
    return;
  }
  const all = await readFile<ShiftReport>("shifts.json");
  all[report.id] = report;
  await writeFile("shifts.json", all);
}

export async function getShift(id: string): Promise<ShiftReport | null> {
  if (pool) {
    const { rows } = await pool.query<{ report: ShiftReport }>("select report from shifts where id = $1", [id]);
    return rows[0]?.report ?? null;
  }
  return (await readFile<ShiftReport>("shifts.json"))[id] ?? null;
}

type HistoryRow = Pick<ShiftReport, "id" | "score" | "grade" | "finishedAt">;

export async function shiftHistory(url: string, limit = 14): Promise<HistoryRow[]> {
  if (pool) {
    const { rows } = await pool.query<HistoryRow>(
      `select id, score, grade, report->>'finishedAt' as "finishedAt"
       from shifts where url = $1 order by created_at desc limit $2`,
      [url, limit],
    );
    return rows;
  }
  return Object.values(await readFile<ShiftReport>("shifts.json"))
    .filter((r) => r.finalUrl === url)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .slice(0, limit)
    .map(({ id, score, grade, finishedAt }) => ({ id, score, grade, finishedAt }));
}

type WatchRow = {
  id: string;
  url: string;
  email: string | null;
  telegram_chat_id: string | null;
  link_token: string;
  active: boolean;
  last_shift_id: string | null;
  created_at: Date;
};
const fromRow = (r: WatchRow): Watch => ({
  id: r.id,
  url: r.url,
  email: r.email,
  telegramChatId: r.telegram_chat_id,
  linkToken: r.link_token,
  active: r.active,
  lastShiftId: r.last_shift_id,
  createdAt: new Date(r.created_at).toISOString(),
});

export async function saveWatch(w: Watch) {
  if (pool) {
    await pool.query(
      `insert into watches (id, url, email, telegram_chat_id, link_token, active, last_shift_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set url = excluded.url, email = excluded.email,
         telegram_chat_id = excluded.telegram_chat_id, active = excluded.active, last_shift_id = excluded.last_shift_id`,
      [w.id, w.url, w.email, w.telegramChatId, w.linkToken, w.active, w.lastShiftId],
    );
    return;
  }
  const all = await readFile<Watch>("watches.json");
  all[w.id] = w;
  await writeFile("watches.json", all);
}

export async function getWatch(id: string): Promise<Watch | null> {
  if (pool) {
    const { rows } = await pool.query<WatchRow>("select * from watches where id = $1", [id]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  return (await readFile<Watch>("watches.json"))[id] ?? null;
}

export async function getWatchByToken(token: string): Promise<Watch | null> {
  if (pool) {
    const { rows } = await pool.query<WatchRow>("select * from watches where link_token = $1", [token]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  return Object.values(await readFile<Watch>("watches.json")).find((w) => w.linkToken === token) ?? null;
}

export async function activeWatches(limit = 50): Promise<Watch[]> {
  if (pool) {
    const { rows } = await pool.query<WatchRow>("select * from watches where active order by created_at limit $1", [limit]);
    return rows.map(fromRow);
  }
  return Object.values(await readFile<Watch>("watches.json")).filter((w) => w.active).slice(0, limit);
}
