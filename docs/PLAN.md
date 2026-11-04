# NOCTURN — the night shift for your vibecoded app

Vibeathon 02 ("Night shift") entry. Submissions close **Mon 9 Nov 2026 22:00 UTC**; target submit **Sun 8 Nov**, Monday is buffer (entries editable until deadline).

**Tagline:** Paste your live URL before bed. NOCTURN works the night and hands you a Morning Report with fixes your AI can paste.

## Why this wins (mapped to the rubric)
| Criterion (weight) | How NOCTURN scores |
|---|---|
| Execution (30) | Every check is real and runs on any URL a judge pastes, including their own app. No wallet or login needed to try it. |
| Launch potential (25) | Every vibecoder ships a live URL and sleeps; leaked keys + broken prod are common and costly. Nightly Watch + verifiable health history for apps raising on Vibestarter. |
| Originality (20) | Health/security scan reframed as an overnight shift with a time-lapse and a morning handover; on-chain shift log. |
| Craft & UX (15) | Night-sky terminal, 22:00→06:00 time-lapse, sunrise reveal, mobile-first, 1-tap copy on every fix prompt. |
| Vibecoding leverage (10) | Gemini writes ranked fixes as paste-ready prompts for Claude/Cursor/Lovable; built with Claude Code. |

## Product
1. **Run a Shift** (no login): paste URL (+ optional public repo, optional Base contract). Checks stream live over SSE while the night time-lapse plays (~40s), sunrise reveals the report.
2. **Checks** (read-only GETs, nothing intrusive):
   - Uptime, TTFB/latency (multiple samples), HTTP→HTTPS, TLS cert expiry
   - Security headers (CSP, HSTS, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
   - **Leaked secrets in client JS bundles** (OpenAI/Anthropic/Gemini/Stripe/AWS/Supabase service-role/private keys/etc.); shown masked, never stored in full
   - Lighthouse perf/SEO/a11y/best-practices via PageSpeed Insights API
   - Broken links (same-origin, capped crawl), meta/OG/favicon/robots/sitemap/viewport
   - Optional: repo deps vs OSV.dev + committed `.env` check; Base contract verified-source/proxy/owner read
3. **Morning Report**: score + ranked findings; Gemini writes a plain-English summary and a copyable fix prompt per finding. Deterministic fallback text if Gemini fails or quota runs out.
4. **Share**: public report page `/r/[id]` + OG image card (score, key stats).
5. **Night Watch** (nightly real shift, Vercel cron): delivery via channel adapters, each env-gated and independent:
   - In-app (always): watch dashboard with history
   - Email (Brevo) — on if `BREVO_API_KEY` set
   - Telegram — on if `TELEGRAM_BOT_TOKEN` set; link via `t.me/<bot>?start=<token>` deep link
   - Failure in one channel is logged, never blocks the others
6. **Shift Log on Base** (optional, wallet connect): attest report hash + score via EAS on Base (verify predeploy addresses before use); report page shows the verified badge.

**Roadmap only (in README/pitch, not built):** ERC-7715 session keys, treasury agent, auto-fix PRs, $VIBES-staked compute tiers.

## Stack
Next.js 16 + TypeScript + Tailwind 4 (pnpm) on Vercel · Neon Postgres · Gemini `gemini-flash-latest` · Brevo · Telegram Bot API · wagmi/viem + Coinbase Smart Wallet · EAS on Base.
Env (never in chat or git): `GEMINI_API_KEY`, `DATABASE_URL`, `PSI_API_KEY` (optional), `BREVO_API_KEY`, `TELEGRAM_BOT_TOKEN`, `CRON_SECRET`.

## Safety (non-negotiable)
- SSRF guard: http(s) only, DNS-resolve and block private/loopback/link-local/metadata ranges, re-check every redirect, cap body size, time and crawl depth.
- Rate limit per IP; cron route requires `CRON_SECRET`.
- Leaked-secret findings are masked in UI, DB, logs and share cards.

## Build checklist
**Day 1 (Tue–Wed) — engine**
- [ ] Scaffold Next.js app, git init (local only), env template
- [ ] SSRF-safe fetch helper + tests
- [ ] Checks: uptime/TLS/headers/secrets/meta/links/PSI, each a pure module returning typed findings
- [ ] Run engine against 10 real live URLs; tune false positives

**Day 2 (Wed) — the Shift**
- [ ] SSE route streaming check progress
- [ ] Night time-lapse UI (clock 22:00→06:00, sky, terminal log, sunrise reveal), mobile-first

**Day 3 (Thu) — Morning Report**
- [ ] Gemini summary + fix prompts with fallback; copy buttons
- [ ] Neon persistence, `/r/[id]` share page, OG image

**Day 4 (Fri) — Night Watch + Base**
- [ ] Watch signup, cron route, channel adapters (in-app, email, Telegram)
- [ ] EAS attestation on Base + verified badge

**Day 5 (Sat) — polish + proof**
- [ ] Copy, empty/error/loading states, a11y, phone + desktop pass
- [ ] Optional repo/contract checks if time allows
- [ ] Demo video (60–90s), screenshots

**Day 6 (Sun) — ship**
- [ ] Deploy (with owner's OK), submit at app.vibestarter.xyz/vibeathon/submit with the applying wallet
- [ ] Mon: buffer, edits only

## Phase 2 (decided 2026-11-04)
Phase 1 core is built and verified locally (see commits). Next, in order:
1. **Deploy** (with owner's OK): private repo, Vercel, env keys, Neon. Unblocks the leaky demo and the Telegram webhook.
2. **Motion redesign** (inspo: e1genqq "motion studio" post; 3 more references pending from owner), using the `motion` library:
   - CLOCK IN button morphs into the shift clock, which morphs into the score ring at sunrise
   - the 7 checks as a fanned 3D card stack that flip and settle on springs as results land; tap a card to expand it into its findings (shared-element transition)
   - **Night is dark, morning is light:** sunrise wipes the terminal into a bright editorial Morning Report (ghosted italic serif headline, mono eyebrows, pill filters All / Critical / Headers / Secrets…)
   - optional sound, muted by default (night hum, tick per check, dawn chime) via Web Audio
   - full `prefers-reduced-motion` fallbacks; phone + laptop
3. **Ask the Night Engineer**: per-report chat grounded in its findings (Gemini). Every user message goes through the secrets scanner first; pasted keys are masked and the user is told to rotate.
4. **Live Night Board**: anonymous ticker of recent shifts (framework/host type, issues caught), no URLs or names.
5. **PWA**: manifest, icons, standalone install on phone and laptop.
6. **Base / Farcaster mini app**: manifest at `/.well-known/farcaster.json` (owner signs account association), mini-app SDK ready call, report pages as embeddable mini-app cards.
7. Base EAS shift log (optional, cut first).

No native apps before the deadline; Capacitor wrappers only if there's traction after. No open chatroom.

## Cut order if behind
Base attestation → Telegram → repo/contract checks → email. Never cut: real checks, time-lapse, Morning Report, share page.
