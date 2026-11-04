# NOCTURN — the night shift for your vibecoded app

You ship. You sleep. NOCTURN works the night.

Paste your app's live URL. NOCTURN runs a real, read-only "night shift" against it and hands you a **Morning Report**: a score, what needs you first, and a paste-ready fix prompt for every issue so your AI coding tool can fix it.

Built for **Vibeathon 02 · Night shift** on Vibestarter.

## What the shift checks

| Check | What it catches |
|---|---|
| Uptime & latency | Down or erroring homepage, slow time-to-first-byte, long redirect chains |
| TLS & HTTPS | Missing HTTPS, untrusted or expiring certificates, old TLS, no HTTP→HTTPS redirect |
| Security headers | Missing CSP / HSTS / clickjacking protection / nosniff / referrer policy, stack leaks, weak cookies |
| **Leaked secrets** | API keys shipped in your JS bundles (OpenAI, Anthropic, Gemini, Stripe, AWS, GitHub, Supabase service-role, wallet private keys and more), public source maps |
| Share & SEO | Viewport, title, description, og:image / twitter cards, favicon, `noindex` left on, empty-until-JS pages |
| Broken links | Internal links that 404 or crash |
| Lighthouse | Real mobile performance, accessibility, best practices and SEO via PageSpeed Insights |

Findings are scored and ranked; a live leaked key or a down site caps the score, because nothing else matters until that's fixed.

## The experience

- **The shift**: a 22:00 → 06:00 night time-lapse. The checks really run and stream in live, the city lights up as each one finishes, and sunrise brings the report.
- **Morning Report**: Gemini writes the handover and one fix prompt per finding, for Claude Code, Cursor or Lovable. If Gemini isn't configured or fails, built-in templates take over.
- **Share**: every report has a public link with its own share card for X and Farcaster.
- **Night Watch**: put your app on a nightly shift. Reports land on your watch page, and optionally by email (Brevo) and Telegram.

## Safety

NOCTURN fetches URLs strangers paste, so every request is guarded:
- http(s) on standard ports only; no credentials, no private or intranet hostnames
- DNS is checked on every connection, including redirects, so a domain pointing at a private, loopback or cloud metadata address is refused
- body size, time and crawl depth are capped; only same-site bundles and links are fetched
- found secrets are masked everywhere (UI, database, share cards) and never stored in full

## Run it

```bash
pnpm install
cp .env.example .env.local   # all keys optional for local dev
pnpm dev
pnpm test
```

Without `DATABASE_URL`, reports and watches are stored in `.data/` locally. Each delivery channel switches on only when its env vars are set, and a failing channel never blocks the others.

**Telegram setup:** create a bot with @BotFather, set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` and `TELEGRAM_WEBHOOK_SECRET`, deploy, then open `/api/telegram?setup=<CRON_SECRET>` once to register the webhook.

## Stack

Next.js 16 · React 19 · Tailwind 4 · Neon Postgres · Gemini · Brevo · Telegram Bot API · Vercel Cron.

## Roadmap

Session-key autopilot that opens fix PRs overnight, repo dependency scanning (OSV), Base contract checks, an on-chain shift log for apps raising on Vibestarter, and $VIBES-staked compute tiers.
