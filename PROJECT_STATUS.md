# PROJECT_STATUS — BurnMatrix

_Last updated: 2026-11-09 · Application v1.2.0 · Database schema v3 (+ accounts database v1)_

## Summary

All ten development phases are implemented, plus two additions in v1.1 — a **realistic 3D anatomical body model** (MakeHuman, CC0) and a **photo-assisted TBSA estimate** — and **local accounts with sign-up / sign-in pages** in v1.2. Type checking, 175 unit/component tests, the production build and 28 Playwright end-to-end tests pass (results below). The application is **not clinically validated**; all bundled clinical references ship **NOT CONFIGURED** and must be verified locally before any calculation is enabled.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Vite + React + strict TS, Tailwind 4, routing, design system (shadcn-style on Radix), responsive shell | ✅ Done |
| 2 | Dexie schema v1→v2 with migration, repositories (Zod validation, transactions, audit), patient CRUD | ✅ Done |
| 3 | TBSA engine (Lund and Browder, Rule of Nines, Palm), integrity/verification gate, reference templates, tests | ✅ Done |
| 4 | 10-step assessment workflow, 2D anatomical map, history/compare, amend/copy/delete | ✅ Done |
| 5 | 3D viewer (R3F/Drei), views, touch/mouse, selection, overlays, licensed-model manifest architecture, WebGL fallback | ✅ Done — realistic CC0 MakeHuman model bundled (v1.1); region boundaries pending clinical review |
| 6 | Fluid management (Parkland, modified Brooke, institutional), intake/output, urine-output calculator | ✅ Done |
| 7 | Clinical monitoring (thresholds, trends, interval comparison), clinical timeline | ✅ Done |
| 8 | 9 PDF report types, print, patient JSON export | ✅ Done |
| 9 | Backup/restore (plain + AES-GCM), PWA (manifest, SW, icons, offline indicator, update prompt) | ✅ Done |
| 10 | Tests, responsive checks, production build, documentation | ✅ Done |
| v1.1-a | Realistic 3D anatomical model: build script (OBJ + skeleton weights → 33 segment-surface meshes), manifest, licence, viewer integration, fallback | ✅ Done |
| v1.2 | Local accounts: sign-up / sign-in pages, PBKDF2 password hashes, lockout, tab or 30-day session, separate clinical database per account (first account adopts pre-existing records), account menu, Settings → Account (profile, change password, delete account), hosted preview republished | ✅ Done |
| Rename | Product renamed **BurnMatrix** (screens, page title, installed-app name, PDF headers, downloaded file names); internal storage identifiers unchanged for compatibility | ✅ Done |
| Hosting | Public website via GitHub Pages: sub-path-aware build (`BT_BASE`, router basename, manifest scope), `404.html` deep-link fallback, deploy workflow (tests → build → deploy); verified locally under `/learning-project/` (sign-up, deep-link reload, 3D model, service worker, offline navigation) | ✅ Done — live once Pages is enabled in repository settings |
| v1.1-b | Photo-assisted estimate: capture (camera/gallery), consent, EXIF-stripping re-encode, clinician tracing (outlines, burns by depth, side-view divider), planimetry engine with view pooling, apply to Lund and Browder draft, photos table (schema v3), backup/restore of photos, cascade delete | ✅ Done |

## Completed features

Dashboard (live stats, charts from real data, recent assessments/events/fluid records, configurable attention flags with visible rules, backup reminder, quick actions, empty states) · Patients (all fields, auto ID, create/edit/delete with typed confirmation and cascade, search/filter/sort, duplicate warning, profile tabs, report, export) · Burn assessment (3 methods, 5 depths, superficial exclusion, indeterminate flagging + upper bound, partial/decimal involvement, validation incl. duplicates and >100 %, age-column selection/override, paediatric limitation acknowledgement, immutable records with amendment chain, comparison) · 3D/2D body mapping · Fluid management · Intake & output · Urine output · Monitoring · Timeline · Reports · Backup & restore · Settings (preferences, units, date/time formats, default method, reference/protocol/urine-target configuration with verification, versions, retire; thresholds; custom parameters; attention flags; backup; data management with storage estimate, persistent storage, audit log, delete all; privacy & disclaimer; dataset inventory) · PWA/offline · Error boundaries, DB error screen, friendly error messages, privacy-safe technical logging.

## Tests executed (this session)

| Suite | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ 0 errors |
| Unit + component (Vitest 5, jsdom, fake-indexeddb) | `npm test` | ✅ **175 passed**, 16 files |
| Coverage | `npx vitest run --coverage` | engines/tbsa 95 % stmts · engines/fluids 91 % · database/backup 91 % · engines/integrity 72 % · all covered files 74 % |
| End-to-end (Playwright 1.63, Chromium) | `npm run test:e2e` | ✅ **28 passed** |
| Production build | `npm run build` | ✅ built; service worker precaches 91 entries (~4.1 MB, incl. the 0.57 MB body model) |
| Dev server smoke | `npm run dev` + browser check | ✅ pages render, no console errors |
| Dependency audit | `npm audit --omit=dev` | ✅ 0 vulnerabilities (dev-only: 4 moderate + 2 low in `workbox-build` transitive deps) |

Unit coverage includes: zero / full / partial involvement, superficial exclusion, multiple regions and depths, pediatric column selection (all 11 age boundaries), invalid input (negative, >100, NaN, unknown region, missing column), rounding (half away from zero, single rounding of totals, decimal artefacts), indeterminate regions, duplicate entries, Rule of Nines mapping and paediatric applicability, palm method; fluid estimates (configured, missing configuration, invalid weight/TBSA, time intervals, resuscitation-start reference, phase validation); urine output (calculation, weight/duration/volume validation, target selection/labelling); fluid balance (totals, net, buckets, date filter, patient separation); thresholds; integrity hashing/tamper detection; DB CRUD, relationships, cascade delete, transaction rollback, v1→v2 migration, verification workflow; backup (full/patient scope, restore, skip/replace/copy, checksum tampering, incompatible versions, invalid records, encryption round-trip and wrong password); attention flags; report scoping and all 9 PDF types; 3D mannequin coverage/orientation; model manifest validation; BodyMap2D, ConfirmDialog, RegionalEditor components.

v1.1 additions — unit: GLB/manifest coverage of all 33 segment surfaces; planimetry rasterisation, side-view divider split, overlap precedence, out-of-outline burns, impossible surfaces, view pooling formula, scale independence, rounding cap, hand-off to the Lund and Browder engine; photo backup round-trip, consent enforcement, cascade delete, v1→v3 migration. E2E: realistic model loads with attribution and anterior/posterior taps select the right surfaces; mannequin fallback without a manifest; full photo workflow (consent gate, front + lateral tracing with divider, pooled ≈ 66.7 %, apply to draft, TBSA 1.0 %).

v1.2 additions — unit: password hashing/salting/rules, sign-up validation and case-insensitive duplicate email, sign-in success and identical error for wrong password / unknown email, lockout and expiry, profile update, password change, account deletion removes its database, patient isolation between account databases, adoption of pre-account records by the first account only, tab vs. device session, expired session, no password in session. E2E: sign-up validation → sign-up → account menu → sign-out → duplicate email refused → wrong password → sign-in with data intact; two accounts see only their own patients; session survives reload and "keep me signed in" survives a new tab; change password and delete account; sign-in page fits a 390 px phone. Every other E2E test now starts by creating a fresh account.

E2E coverage: patient create/search/filter/sort/edit/reload persistence/delete; form validation and duplicate warning; Lund and Browder workflow (blocked until verified, superficial excluded, indeterminate flagged, >100 % rejected, save, PDF download, repeat assessment, history comparison); Rule of Nines child limitation; Palm method; fluid estimate (NOT CONFIGURED gate, Parkland numbers, time since injury vs. resuscitation, administered/remaining, invalid weight/TBSA); I/O totals, net balance, patient separation, edit/delete, interval filter, hourly view; urine output; monitoring thresholds, BP, trends; timeline CRUD/filter; complete report PDF; backup → delete all → restore, duplicate detection; encrypted backup; offline PWA (SW install, offline reload, navigation, persistence, backup offline); 3D viewer selection and camera views; WebGL-unavailable 2D fallback; no horizontal overflow on 16 routes at mobile (390 px), tablet (820 px) and desktop (1280 px); mobile drawer/bottom bar; collapsible tablet sidebar.

Not automated: WebKit/Safari and Firefox runs (only Chromium is available in this environment), real-device PWA installation on iOS/Android, printing to a physical printer, screen-reader audit.

## Known limitations

1. **No clinical validation or regulatory review.** See `docs/CLINICAL_VALIDATION.md`.
2. **Reference values are unverified transcriptions** until a clinician verifies them in the app. Lund and Browder (1944) bibliographic details could not be confirmed in PubMed.
3. **3D model region boundaries are approximate.** The bundled realistic model (MakeHuman base mesh, CC0) was segmented automatically; boundaries have not been clinically reviewed and the viewer says so. The base mesh is a single neutral adult body shape (no age, sex or habitus variants; slight breast form), so it does not represent individual patients or children.
4. **Photo-assisted estimates are clinician-traced and not validated.** No automatic burn or depth detection. 2D photographs foreshorten curved surfaces; the view-pooling rule is a documented geometric heuristic. Estimates can be applied only to Lund and Browder drafts and only after explicit review. Photos are not embedded in PDF reports.
5. IndexedDB data is **not encrypted** by the application (only exported backups can be). Accounts (v1.2) are local to one browser and separate users' records at the interface level; they are not a security boundary against someone with access to the browser profile or developer tools. No password recovery.
6. No data synchronisation between devices (by design).
7. Region colouring on the maps shows the most severe depth per region surface; exact distribution within a region is not drawn.
8. Times use the device's local time zone for display and hourly/daily bucketing; records are stored in UTC.
9. Paediatric maintenance fluids, electrical/inhalation-injury adjustments and protocol-specific colloid phases are not modelled (an institutional protocol can define phases and counted categories only).
10. PDF uses standard Helvetica (WinAnsi); unsupported symbols are transliterated (e.g. "≥" → ">=").

## Required external assets

* None required. The 3D model (MakeHuman, CC0), fonts and icons are bundled.
* Optional: a different or clinically reviewed glTF model + manifest (see `public/models/README.md`).

## Clinical reference datasets still requiring verification

All of them (by design, verification happens on each deployment):

* `lund-browder-1944@1.0.0` — values + age-to-column convention
* `rule-of-nines-adult@1.0.0` — values + adult age bound (16 y) + anterior/posterior split
* `palm-rossiter-1996@1.0.0` — option values
* `urine-output-targets-local@1.0.0` — **empty**, targets must be entered
* `parkland@1.0.0`, `modified-brooke-adult@1.0.0` — parameters
* `institutional-protocol@0.1.0` — **blank**, all parameters must be entered
* Observation warning thresholds and numeric attention flags — none configured by default

## Next steps (suggested)

1. Complete `docs/CLINICAL_VALIDATION.md` with the clinical safety team; verify datasets on each device.
2. Clinically review the 3D model's region boundaries (then set `anatomicallyReviewed: true`), and evaluate the photo-assisted estimate against independent clinical estimates.
3. Run the E2E suite on WebKit and Firefox (`npx playwright install webkit firefox`, add projects) and on physical iOS/Android devices.
4. Accessibility audit with a screen reader.
5. Optional: application-level encryption of each account's database with a key derived from its password (would make the sign-in a real protection of stored data).
