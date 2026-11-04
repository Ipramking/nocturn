import { promises as fs } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import type { ShiftReport } from "./shift/types";

// Neon in production; a JSON file under .data/ for local dev without a database.

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

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

let ready: Promise<unknown> | null = null;
function migrate() {
  if (!sql) return Promise.resolve();
  ready ??= (async () => {
    await sql`create table if not exists shifts (
      id text primary key,
      url text not null,
      score int not null,
      grade text not null,
      report jsonb not null,
      created_at timestamptz not null default now()
    )`;
    await sql`create table if not exists watches (
      id text primary key,
      url text not null,
      email text,
      telegram_chat_id text,
      link_token text not null unique,
      active boolean not null default true,
      last_shift_id text,
      created_at timestamptz not null default now()
    )`;
  })();
  return ready;
}

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
  if (sql) {
    await migrate();
    await sql`insert into shifts (id, url, score, grade, report)
      values (${report.id}, ${report.finalUrl}, ${report.score}, ${report.grade}, ${JSON.stringify(report)})
      on conflict (id) do update set report = excluded.report, score = excluded.score, grade = excluded.grade`;
    return;
  }
  const all = await readFile<ShiftReport>("shifts.json");
  all[report.id] = report;
  await writeFile("shifts.json", all);
}

export async function getShift(id: string): Promise<ShiftReport | null> {
  if (sql) {
    await migrate();
    const rows = await sql`select report from shifts where id = ${id}`;
    return (rows[0]?.report as ShiftReport) ?? null;
  }
  return (await readFile<ShiftReport>("shifts.json"))[id] ?? null;
}

export async function shiftHistory(url: string, limit = 14): Promise<Array<Pick<ShiftReport, "id" | "score" | "grade" | "finishedAt">>> {
  if (sql) {
    await migrate();
    const rows = await sql`select id, score, grade, report->>'finishedAt' as "finishedAt"
      from shifts where url = ${url} order by created_at desc limit ${limit}`;
    return rows as Array<Pick<ShiftReport, "id" | "score" | "grade" | "finishedAt">>;
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
  created_at: string;
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
  if (sql) {
    await migrate();
    await sql`insert into watches (id, url, email, telegram_chat_id, link_token, active, last_shift_id)
      values (${w.id}, ${w.url}, ${w.email}, ${w.telegramChatId}, ${w.linkToken}, ${w.active}, ${w.lastShiftId})
      on conflict (id) do update set url = excluded.url, email = excluded.email,
        telegram_chat_id = excluded.telegram_chat_id, active = excluded.active, last_shift_id = excluded.last_shift_id`;
    return;
  }
  const all = await readFile<Watch>("watches.json");
  all[w.id] = w;
  await writeFile("watches.json", all);
}

export async function getWatch(id: string): Promise<Watch | null> {
  if (sql) {
    await migrate();
    const rows = (await sql`select * from watches where id = ${id}`) as WatchRow[];
    return rows[0] ? fromRow(rows[0]) : null;
  }
  return (await readFile<Watch>("watches.json"))[id] ?? null;
}

export async function getWatchByToken(token: string): Promise<Watch | null> {
  if (sql) {
    await migrate();
    const rows = (await sql`select * from watches where link_token = ${token}`) as WatchRow[];
    return rows[0] ? fromRow(rows[0]) : null;
  }
  return Object.values(await readFile<Watch>("watches.json")).find((w) => w.linkToken === token) ?? null;
}

export async function activeWatches(limit = 50): Promise<Watch[]> {
  if (sql) {
    await migrate();
    const rows = (await sql`select * from watches where active order by created_at limit ${limit}`) as WatchRow[];
    return rows.map(fromRow);
  }
  return Object.values(await readFile<Watch>("watches.json")).filter((w) => w.active).slice(0, limit);
}
