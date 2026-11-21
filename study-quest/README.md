# Study Quest

**A calm, AI-planned, gamified study companion.** Describe any topic in your own words; Study Quest organises it into **stages → levels → missions**, then helps you work through it one focused session at a time — with XP, a gentle daily streak, achievements and clear progress, without the noise of a game.

English and Arabic (full right-to-left layout) · warm light theme by default, optional dark mode · desktop, tablet and phone.

---

## Features

| Area | What it does |
|---|---|
| **Accounts** | Email/password sign-up and login, Google sign-in, password reset by email, persistent sessions, protected routes, profile, change password, export data, reset progress, delete account. Each user's data is private and syncs across devices. |
| **AI study planner** | Natural-language topic + optional target date, daily time and familiarity → Claude analyses the topic and returns a structured journey: stages, levels (objectives, what each builds on), missions (activity, time estimate, difficulty, required/optional), prerequisites and pacing advice. The plan **streams in as it is written**, can be edited before starting, and can be regenerated with feedback. A labelled **sample planner** works with no AI key. |
| **Quests & levels** | Visual journey map with numbered milestones; levels are *locked / available / in progress / completed*, unlock in order, explain what unlocks them, and can be unlocked early or skipped (with confirmation). Stages and quests complete automatically. |
| **Quest management** | Create with AI or manually; edit titles/descriptions/target dates; pause, resume, archive, restore, delete (typed confirmation); rename, reorder, add, delete and move stages, levels and missions; change estimates; regenerate the rest of a plan while **keeping completed work**. |
| **Focus mode** | Distraction-free page per mission: countdown or stopwatch, start / pause / resume / finish, notes that save automatically, objectives, "finish & complete", next-mission hand-off. A running timer survives refreshes; time away from the page is never counted. |
| **XP & player level** | XP for missions (effort × difficulty), level / stage / quest bonuses and achievement rewards; gentle level curve; every grant recorded in an XP ledger with deterministic ids, so nothing can be rewarded twice. |
| **Streaks** | A day counts when at least one mission is completed, using the user's timezone (correct across midnight and DST). Current and longest streak, study calendar heatmap; no punishments. |
| **Achievements** | 16 quiet milestones (First Mission, 3/7/30-day streaks, Level Master, Study Marathon, Deep Focus, Consistent Learner, …) with progress toward locked ones. |
| **Dashboard** | Greeting, "Up next", player level/XP/streaks, today's goals, study overview with the week's activity, active quests, recent activity, gentle reminders. |
| **Statistics** | Study time daily/weekly/monthly (with table view), cumulative XP, calendar heatmap, per-quest completed vs remaining, XP history. |
| **Study planner schedule** | Upcoming missions spread over the next 7 days within your daily goal, nearest target dates first. |
| **Reminders** | Daily study, daily goal, streak and target-date reminders — in-app cards plus optional browser notifications while the site is open; each at most once a day. |
| **Settings** | Profile, theme, language, daily goals, preferred session length, timezone, reminder preferences and time, account and data management. |

## Architecture

```
Browser (Next.js client components)
  ├─ Firebase Auth (email/password, Google)        – identity
  ├─ Firestore live listeners (read-only)          – instant, cross-device updates
  └─ fetch /api/* with the user's Firebase ID token
        │
Next.js route handlers (server)  ── verify ID token ── zod validation
  ├─ services (Admin SDK, Firestore transactions)  – every write: quests, progress, XP, streaks, achievements, notes, settings
  └─ AI planner (Claude via @anthropic-ai/sdk, structured JSON output, streamed as NDJSON)
```

* **Reads** happen in the browser with live Firestore listeners, so progress updates immediately and on every device.
* **Writes never happen in the browser.** Firestore rules allow each user to read only `users/{uid}/**` and deny all client writes; the API routes verify the ID token and apply changes in transactions with the Admin SDK. XP, streaks and achievements cannot be edited from the client.
* **Pure domain logic** (`src/lib/domain`) — progression rules, XP curve, streaks/dates, achievements, plan merging, schedule, reminders, statistics — is shared by server and client and unit-tested.

```
src/
  app/                 routes: (auth) login/signup/reset · (app) dashboard, quests, planner, achievements, statistics, settings · (focus) study session · api/*
  components/          ui/ (design system) · layout/ · quest/ · planner/ · session/ · dashboard/ · stats/ · settings/ · providers/
  lib/domain/          pure business logic (no framework code)
  lib/server/          services + HTTP helpers (server only)
  lib/ai/              planner: schema, prompt, Claude provider, sample planner
  lib/firebase/        client + admin initialisation
  lib/i18n/            English + Arabic dictionaries, typed keys, plurals, formatting
  lib/hooks/           live data hooks, timer, plan generation
firestore.rules        security rules
tests/unit             57 unit tests (Vitest)
tests/integration      19 tests against the Firebase emulators (services + security rules)
e2e/                   20 Playwright end-to-end tests
```

### Data model (Firestore)

```
users/{uid}                              profile + aggregate stats (XP, level, streaks, totals)
users/{uid}/settings/preferences         theme, language, timezone, goals, reminders
users/{uid}/quests/{questId}             quest + embedded stages → levels → missions (+ cached summary)
users/{uid}/studySessions/{sessionId}    tracked focus sessions (client id → idempotent)
users/{uid}/xpTransactions/{key}         XP ledger; key = mission_{q}_{m} | level_… | stage_… | quest_… | achievement_…
users/{uid}/dailyActivity/{YYYY-MM-DD}   per-day missions, study seconds, XP (user's timezone)
users/{uid}/achievements/{id}            unlocked achievements
users/{uid}/activity/{id}                recent-activity feed
users/{uid}/notes/{questId}__{missionId} mission notes
users/{uid}/usage/{YYYY-MM-DD}           AI generations used today
```

Quests embed their structure (a 300-mission quest is ~150 KB, well under Firestore's 1 MB limit) so completing a mission, unlocking levels and awarding XP happen atomically in one transaction. No composite indexes are needed.

## Run it locally (no credentials needed)

Requirements: Node 20+ (developed on Node 22), Java 11+ (for the Firebase emulators).

```bash
cd study-quest
npm install
npm run dev:emulated        # starts the Auth + Firestore emulators and the app on http://localhost:3000
```

`.env.development` (no secrets) points the app at the emulators and uses the sample planner. To try Claude locally, put `ANTHROPIC_API_KEY=…` and `AI_PROVIDER=auto` in `.env.local`.

## Configure production

### 1. Firebase (free Spark plan is enough)

1. [Firebase console](https://console.firebase.google.com) → **Add project**.
2. **Build → Authentication → Get started → Sign-in method**: enable **Email/Password** and **Google**.
3. **Build → Firestore Database → Create database** (production mode).
4. **Firestore → Rules**: paste the contents of [`firestore.rules`](firestore.rules) and **Publish** (or `npx firebase deploy --only firestore:rules --project <id>`).
5. **Project settings → General → Your apps → Web app**: copy the config values into the `NEXT_PUBLIC_FIREBASE_*` variables.
6. **Project settings → Service accounts → Generate new private key**: put the whole JSON (one line, or base64) in `FIREBASE_SERVICE_ACCOUNT_KEY` — **server-side only, never commit it**.
7. **Authentication → Settings → Authorized domains**: add your site's domain (e.g. `your-site.netlify.app`).

### 2. Claude (optional — without it the labelled sample planner is used)

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Server-side only. |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | |
| `ANTHROPIC_EFFORT` | `medium` | `low` is faster, `high` more thorough. |
| `AI_PROVIDER` | `auto` | `auto` = Claude when a key is set; `mock` forces the sample planner. |
| `AI_DAILY_LIMIT` | `25` | Plan generations per user per day. |

The planner uses structured JSON output validated with zod, streams progress to the browser, and enables Anthropic's server-side **fallback** (`fallbacks: "default"`) so a policy-declined request is retried on the recommended fallback model.

### 3. Deploy (Netlify)

Set all variables from [`.env.example`](.env.example) in **Site configuration → Environment variables**, then deploy this folder (`netlify.toml` is included; Netlify's Next.js runtime handles the API routes). `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing them.

## Tests

| Command | What it covers |
|---|---|
| `npm run typecheck` | strict TypeScript |
| `npm test` | 57 unit tests: dates/timezones/DST, streaks, level states & unlocking, XP curve, achievements, plan validation & progress-preserving merge, sample planner (EN/AR), AI output normalisation, prompt, schedule, reminders, statistics, i18n completeness (both dictionaries share every key and placeholder; Arabic plurals) |
| `npm run test:integration` | 19 tests on the Firebase emulators: bootstrap, settings, quest creation, XP granted once, locked-level refusal, level/stage/quest bonuses, timezone-correct streaks across midnight, unlock/skip, status transitions, edits preserving progress, delete, idempotent sessions & validation, AI quota, export/reset/delete account; **security rules** with the real client SDK (own data readable, others' not, all client writes denied) |
| `npm run test:e2e` | 20 Playwright tests on the real app + emulators: sign-up/login/logout/validation/duplicate/reset, protected routes, persistence across tabs, planner → quest → unlocking → XP/streak/achievements/activity/statistics, unlock early & skip, focus session (timer, pause, notes autosave, restore after reload, complete, next), tracked session recorded, plan editing keeps progress, pause/resume/archive/restore/delete, manual quest, Arabic RTL + dark mode following the account to another device, goals & reminders, export/reset, delete account, no horizontal overflow at 390/820/1280 px, API rejects anonymous/forged tokens and cross-user access |
| `npm run build` | production build |

## Known limitations

* **Reminders** appear in the app and as browser notifications only while a Study Quest tab is open (no push or email service).
* The **sample planner** is rule-based (it extracts sub-topics from your sentence); real topic analysis needs the Claude key.
* **Completing a mission is not undoable** (by design, to keep XP and streaks trustworthy).
* Charts keep a left-to-right time axis in Arabic.
