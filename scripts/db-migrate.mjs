// Creates NOCTURN's tables. Runs over the direct (unpooled) Neon URL, per Neon's
// guidance for schema changes. Usage: pnpm db:migrate
import pg from "pg";

const url = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)?.replace("sslmode=require", "sslmode=verify-full");
if (!url) {
  console.error("DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`
    create table if not exists shifts (
      id text primary key,
      url text not null,
      score int not null,
      grade text not null,
      report jsonb not null,
      created_at timestamptz not null default now()
    );
    create index if not exists shifts_url_created_idx on shifts (url, created_at desc);

    create table if not exists watches (
      id text primary key,
      url text not null,
      email text,
      telegram_chat_id text,
      link_token text not null unique,
      active boolean not null default true,
      last_shift_id text,
      created_at timestamptz not null default now()
    );
    create index if not exists watches_active_idx on watches (created_at) where active;
  `);
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('shifts', 'watches') order by 1",
  );
  console.log("tables ready:", rows.map((r) => r.table_name).join(", "));
} finally {
  await client.end();
}
