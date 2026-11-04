"use client";

import { useState } from "react";

interface Created {
  id: string;
  telegramLink: string | null;
  channels: { email: boolean; telegram: boolean };
}

export default function WatchPanel({ url, lastShiftId }: { url: string; lastShiftId?: string }) {
  const host = new URL(url).hostname;
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created | null>(null);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, email, lastShiftId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't start the watch");
      setCreated(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const watchUrl = `${window.location.origin}/watch/${created.id}`;
    return (
      <section className="panel rise rounded-2xl p-5 sm:p-7">
        <p className="text-[11px] tracking-[0.3em] text-phosphor">NIGHT WATCH · ON</p>
        <h3 className="mt-2 font-display text-2xl">{host} is on the night shift.</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Every night NOCTURN runs a full shift and leaves your Morning Report on your watch page
          {created.channels.email && email ? ", emails it to you" : ""}
          {created.channels.telegram ? " and can DM it to you on Telegram" : ""}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={watchUrl} className="inline-flex min-h-11 items-center rounded-md bg-phosphor px-4 text-sm font-bold text-ink hover:brightness-110">
            Open my watch
          </a>
          {created.telegramLink && (
            <a
              href={created.telegramLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center rounded-md border border-phosphor/40 px-4 text-sm font-semibold text-phosphor hover:bg-phosphor/10"
            >
              Connect Telegram
            </a>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">Bookmark your watch link. It&apos;s the key to your watch, so keep it private.</p>
      </section>
    );
  }

  return (
    <section className="panel rounded-2xl p-5 sm:p-7">
      <p className="text-[11px] tracking-[0.3em] text-phosphor">NIGHT WATCH</p>
      <h3 className="mt-2 font-display text-2xl">Want this every morning?</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Put {host} on Night Watch. NOCTURN runs this shift every night and hands you the report when you wake up. Email and Telegram are optional.
      </p>
      <form onSubmit={start} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="watch-email" className="sr-only">Email (optional)</label>
        <input
          id="watch-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@email.com (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-ink/70 px-3 text-sm text-text placeholder:text-muted/60 focus:border-phosphor focus:outline-none"
        />
        <button disabled={busy} className="min-h-11 rounded-md bg-phosphor px-4 text-sm font-bold text-ink transition hover:brightness-110 disabled:opacity-60">
          {busy ? "Clocking in…" : "Start Night Watch"}
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
