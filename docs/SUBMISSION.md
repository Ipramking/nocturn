# Vibeathon 02 submission draft

Submit at app.vibestarter.xyz/vibeathon/submit, signed in with the wallet used to apply. Closes **Mon 9 Nov 2026, 22:00 UTC**; editable until then.

## Required

**Project name:** NOCTURN

**Tagline:** The night shift for your vibecoded app: it checks your live URL overnight and hands you a Morning Report with paste-ready AI fixes.

**Live URL:** https://nocturn-fawn.vercel.app

**What it does and what to try:**
> You ship, you sleep, and the bugs don't. NOCTURN runs a real, read-only "night shift" on any live URL: uptime and latency, TLS, security headers, API keys leaked in your JavaScript bundles, an onchain check of the Base contracts your app talks to, share/SEO readiness, broken links and Lighthouse. It plays as a 22:00 → 06:00 time-lapse over a living night city, and at sunrise you get a Morning Report: a score, what needs you first, and a paste-ready fix prompt for Claude, Cursor or Lovable for every issue. Put your app on Night Watch and it runs every night, tells you what changed overnight, and DMs you on Telegram.
>
> Try, fastest first:
> 1. Sample report, no waiting: nocturn-fawn.vercel.app/sample
> 2. "Try a leaky demo" on the home page: watch it catch three exposed keys (fake ones) as critical.
> 3. Paste your own Vibeathon entry and press CLOCK IN.
> 4. At the bottom of any report, ask the Night Engineer how to fix something (paste a key by mistake and it refuses to send it anywhere).
> 5. NOCTURN on itself scores 100/100, Lighthouse included. Install it as an app from your browser menu.

**AI tools it was built with:** Claude Code (Anthropic) built the app end to end: engine, UI, tests, deployment. Google Gemini runs inside the product to write each Morning Report and its fix prompts, with a lighter Gemini model as automatic fallback.

## Optional
- **Repo:** https://github.com/Ipramking/nocturn (public)
- **Demo video:** `~/nocturn-video/out/nocturn-demo-16x9.mp4` (Remotion, edge-tts voice, FFmpeg mix); upload it (YouTube unlisted or X) and paste the link
- **Screenshot:** a Morning Report at 1440px (we'll export one)
- **X handle:** if you make one for NOCTURN
- **Fundable score link:** optional, shown to judges for information, not scored

## Outreach (post these yourself; real users count toward Launch potential)

**Vibestarter Discord**
> Free night shift for every Vibeathon 02 entry 🌙
> Before the judges open your live URL, let NOCTURN check it: leaked API keys in your JS bundle, missing security headers, broken links, share cards, Lighthouse, and the Base contracts your app talks to. You get a Morning Report with a copy-paste fix prompt for each issue.
> nocturn-fawn.vercel.app (no wallet, no signup, read-only)

**X**
> Vibecoded apps leak API keys more than you'd think.
> NOCTURN works the night shift on your live URL and hands you a Morning Report by sunrise: score, what needs you, and a fix prompt you can paste into your AI.
> Free for every #Vibeathon02 builder → nocturn-fawn.vercel.app
