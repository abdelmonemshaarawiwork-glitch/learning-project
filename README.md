# BURN TOOL

**Advanced Burn Assessment & ICU Management Platform** — a local-first, offline-capable Progressive Web App for burn assessment (TBSA), fluid-resuscitation estimates, intake/output, monitoring, timeline and reporting.

> **Clinical decision-support software. All calculations and outputs require review by a qualified healthcare professional. This software is not a substitute for clinical judgment.**
>
> BURN TOOL has **not** undergone formal clinical validation or regulatory review. It never prescribes, orders or adjusts treatment. See [docs/CLINICAL_VALIDATION.md](docs/CLINICAL_VALIDATION.md).

## Safety model in one paragraph

Every clinical reference (Lund and Browder, Rule of Nines, palm values, urine-output targets) and every fluid protocol (Parkland, modified Brooke, institution-defined) is a **versioned dataset** with source, population, age range and a verification record. Bundled templates contain values transcribed from the cited publications but ship **NOT CONFIGURED**: calculations stay disabled until a clinician compares the values with the primary source and records a verification (name, role, date, attestation). Verification stores a SHA-256 hash of the content; any later change invalidates it. No warning thresholds, urine-output targets or attention-flag numbers are invented — they are empty until configured.

## Features

| Area | What it does |
|---|---|
| Dashboard | Live counts, 14-day activity chart, latest-TBSA chart, recent assessments / events / fluid records, configurable attention flags (each shows its rule), backup reminder, quick actions |
| Patients | Create / edit / delete (typed confirmation, cascade), search, filter, sort, duplicate warning, profile with assessments, fluids, I/O, observations, timeline, report and JSON export |
| Burn assessment | 10-step workflow; Lund and Browder (age columns), Rule of Nines (adult, paediatric limitation acknowledgement), Palm method (clinician-entered palm %); five depths; superficial excluded; indeterminate reported separately with upper bound; validation; history, amendment (never overwrites) and comparison |
| 3D body mapping | React Three Fiber viewer: rotate / zoom / pan (mouse & touch), anterior / posterior / lateral views, reset, region selection, colour overlays; licensed-model integration via `public/models/manifest.json`; clearly labelled development mannequin; 2D map fallback without WebGL |
| Fluid management | Verified-protocol estimates: formula, total, phase windows, time since injury vs. since resuscitation, administered (from intake records), remaining, schedule chart, assumptions, snapshots |
| Intake & output | Hourly records, daily totals, cumulative intake/output/balance, charts, interval filter, edit / delete |
| Urine output | mL/kg/h calculator with validation; labels results only against a verified age-specific target |
| Monitoring | Vital signs & labs (incl. BP pairs, custom parameters), history, trends, interval comparison, transparent user-configured thresholds |
| Timeline | Automatic admission / assessment events plus 15 event types; filter, edit, delete |
| Reports | 9 PDF report types (patient summary … complete report) with header, patient ID, page numbers, disclaimer, vector body map; print; JSON export of selected patients |
| Backup & restore | Full or per-patient JSON; optional AES-GCM-256 encryption (PBKDF2-SHA-256, 600 000 iterations); checksum, version checks, preview, duplicate strategies (skip / replace / copy with ID remapping), per-record error report |
| Settings | Theme, units (kg/lb, cm/in, °C/°F), date/time format, default method, reference & protocol configuration, urine targets, thresholds, attention flags, backup, data management (storage, audit log, delete all), privacy & about |
| PWA | Installable, offline application shell, offline indicator, update prompt (never auto-reloads); patient data only in IndexedDB |

## Requirements

* Node.js 20+ (developed with Node 22) and npm 10+
* A modern browser (Chrome/Edge 111+, Safari 16.4+, Firefox 115+)

## Commands

```bash
npm install                 # install dependencies
npm run dev                 # development server (http://localhost:5173)
npm test                    # unit + component tests (Vitest, jsdom, fake-indexeddb)
npm run typecheck           # strict TypeScript check
npm run build               # type-check + production build into dist/ (incl. service worker)
npm run preview             # serve the production build (http://localhost:4173)
npm run test:e2e            # Playwright end-to-end tests (builds and serves automatically)
npm run icons               # regenerate PWA icons from SVG
```

`npm run test:e2e` uses Chromium. If Playwright browsers are not installed on your machine, run `npx playwright install chromium` first.

> The service worker is only active in the production build (`npm run build && npm run preview` or a deployed copy). The dev server does not register it.

## Deploying

`dist/` is a static site. Serve it over **HTTPS** (required for service workers and Web Crypto) from any static host. SPA fallback: unknown paths must return `index.html` (the service worker also handles this once installed). A strict Content-Security-Policy is injected at build time; no third-party origins are contacted.

## Installing the PWA on a phone or tablet

1. Open the deployed HTTPS address in the device browser and wait for “BURN TOOL is ready to work offline”.
2. **Android (Chrome):** menu ⋮ → *Install app* (or *Add to Home screen*).
   **iOS / iPadOS (Safari):** Share → *Add to Home Screen*.
3. Launch from the home-screen icon. The app now works without a network connection.
4. When an update is available a notice appears; save your work, then choose *Reload*.

Data is stored per browser and per device. Installing on a second device does **not** copy data — use backup & restore.

## Backing up and restoring patient data

* **Back up:** Settings → *Backup & restore* → choose *All application data* or *Selected patients* → optionally tick *Encrypt* and enter a password (≥ 10 characters, never stored, cannot be recovered) → *Export backup*. Store the file securely: unencrypted backups contain readable patient data.
* **Restore:** Settings → *Backup & restore* → *Choose backup file…* → (enter the password for encrypted files) → review the preview (checksum, versions, record counts, duplicates, invalid records) → choose how to treat duplicates → *Import*. Import runs in a single transaction: it either fully succeeds or changes nothing.
  * *Keep local version* (default) skips records that already exist.
  * *Replace* overwrites local records (requires typing `REPLACE`); verified reference datasets and protocols are never replaced.
  * *Import as copies* adds patients with new IDs and remaps all relationships.
* Per-patient exports are also available from a patient’s profile and from Reports.

## Documentation

* [PROJECT_STATUS.md](PROJECT_STATUS.md) — status, tests executed, limitations, next steps
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure, data flow, 3D model integration, PWA
* [docs/DATABASE.md](docs/DATABASE.md) — schema, indexes, migrations, backup format
* [docs/MEDICAL_CALCULATIONS.md](docs/MEDICAL_CALCULATIONS.md) — every formula, rule and rounding convention
* [docs/REFERENCES.md](docs/REFERENCES.md) — bundled reference datasets and their sources
* [docs/CLINICAL_VALIDATION.md](docs/CLINICAL_VALIDATION.md) — checklist required before clinical use
* [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — how to use each module

## Technology

React 19 · TypeScript (strict) · Vite 7 · Tailwind CSS 4 · shadcn-style components on Radix UI · Lucide · React Router 7 · Zustand · Dexie 4 (IndexedDB) · React Hook Form + Zod 4 · Three.js + React Three Fiber + Drei · Recharts · jsPDF + jspdf-autotable · vite-plugin-pwa / Workbox · date-fns · Vitest + React Testing Library · Playwright.

## Privacy

No backend, no cloud database, no analytics, no tracking, no external API calls. Patient records live only in this browser’s IndexedDB, which the application does **not** encrypt — protect the device (screen lock, disk encryption). Clearing site data or uninstalling deletes records permanently unless a backup exists.
