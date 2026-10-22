# JobPilot

An internship and job-search copilot. It finds fresh roles from company job boards, scores them against your resume, drafts tailored applications with AI, autofills application forms with a Chrome extension, and tracks your pipeline.

You still review and submit every application yourself. JobPilot only reads public job-board APIs and never logs into LinkedIn, Naukri or any other site as you.

## Features

| | |
|---|---|
| **Discover** | A daily cron pulls every open role from 45+ companies through the official public APIs of Greenhouse, Lever and Ashby. To add a company, paste its careers URL. |
| **Match** | A deterministic scorer (0–100) weighs skill overlap (100+ skill taxonomy with aliases), title fit against your target roles, seniority (internship and new-grad roles rank first), and location or remote preference. |
| **Tailor** | One click calls Claude with structured outputs and returns an honest fit score, strengths, gaps with fixes, rewritten resume bullets, ATS keywords, a cover letter and a referral email. Everything comes only from facts in your resume. |
| **Autofill** | A Manifest V3 Chrome extension fills name, contact, links, education and saved screening answers, and attaches your resume PDF across frames. It never presses Submit. |
| **Track** | A pipeline with the stages saved → applied → assessment → interview → offer / rejected, plus notes. The extension's *Mark applied* button logs the job. |

## Tech stack

- **Next.js 16** (App Router, Server Actions, Route Handlers, `proxy.ts` auth gate), React 19, Tailwind CSS 4
- **Postgres** through Drizzle ORM: Neon or Supabase in production, embedded **PGlite** for zero-setup local development
- **Claude API** (`@anthropic-ai/sdk`) with Zod structured outputs, server-side refusal fallback and a per-user daily quota
- Auth: bcrypt password hashes with signed JWT session cookies (`jose`), plus bearer API tokens for the extension
- Vercel Cron for the daily job refresh

```
Vercel Cron ──► /api/cron/fetch ──► Greenhouse / Lever / Ashby APIs
                     │
                     ▼
             Postgres (companies, jobs) ──► matcher ──► matches (per user)
                     ▲                                     │
Next.js app (dashboard, jobs, tracker, profile) ◄──────────┘
     │  └─► /api/analyze ──► Claude (fit + tailored kit)
     ▼
Chrome extension ──► /api/extension/* (bearer token) ──► autofill + "mark applied"
```

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign up. With no `DATABASE_URL` set, an embedded Postgres (PGlite) is created in `~/.jobpilot/pglite` (override with `PGLITE_DIR`) and seeded automatically. On the dashboard, press **Refresh jobs** to pull roles, then fill in your **Profile**.

To enable AI tailoring, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`.

## Deploy to Vercel (free tier)

1. **Database:** create a free Postgres database on [Neon](https://neon.tech) or Supabase and copy its connection string.
2. **Schema:** apply the schema once (it's idempotent, so it's safe to re-run):
   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate
   ```
3. **Push** this folder to a GitHub repository and import it at [vercel.com/new](https://vercel.com/new).
4. **Environment variables:** in the Vercel project settings, add `DATABASE_URL`, `AUTH_SECRET` (any long random string), `CRON_SECRET` (another random string), `ANTHROPIC_API_KEY`, and optionally `AI_DAILY_LIMIT`.
5. **Deploy.** `vercel.json` schedules the daily refresh at 02:30 UTC. To get jobs right away, press **Refresh jobs** once.

## Install the Chrome extension

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the `extension/` folder.
2. In JobPilot, go to **Extension**, generate an API token, and paste it plus your server URL into the extension's settings.
3. On any application form, click **Autofill this page**, review the highlighted fields, and submit.

## Project layout

```
db/schema.sql               Postgres schema (idempotent)
db/seed-companies.json      Default companies (all verified live)
scripts/migrate.mjs         Applies schema + seeds to DATABASE_URL
src/lib/sources/            Greenhouse / Lever / Ashby fetchers + HTML→text
src/lib/skills.ts           Skill taxonomy and extraction
src/lib/matcher.ts          Scoring and per-user match materialisation
src/lib/ingest.ts           Concurrent refresh with upserts and closed-job detection
src/lib/ai.ts               Claude structured-output fit analysis
src/app/(app)/              Dashboard, jobs, job detail, applications, companies, profile, extension
src/app/api/                analyze, cron/fetch, extension/{profile,resume,applied}
extension/                  Chrome MV3 extension (popup + injected fill script)
```

## Ideas for next iterations

- Gmail API integration that moves applications to *assessment* or *interview* when matching emails arrive
- Telegram or email alerts for new 80%+ matches
- Embedding-based semantic matching (pgvector) on top of the keyword scorer
- Per-company referral tracking and follow-up reminders
