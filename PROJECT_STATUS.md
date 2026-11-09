# PROJECT_STATUS — BURN TOOL

_Last updated: 2026-11-09 · Application v1.0.0 · Database schema v2_

## Summary

All ten development phases are implemented. Type checking, 147 unit/component tests, the production build and 21 Playwright end-to-end tests pass (results below). The application is **not clinically validated**; all bundled clinical references ship **NOT CONFIGURED** and must be verified locally before any calculation is enabled.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Vite + React + strict TS, Tailwind 4, routing, design system (shadcn-style on Radix), responsive shell | ✅ Done |
| 2 | Dexie schema v1→v2 with migration, repositories (Zod validation, transactions, audit), patient CRUD | ✅ Done |
| 3 | TBSA engine (Lund and Browder, Rule of Nines, Palm), integrity/verification gate, reference templates, tests | ✅ Done |
| 4 | 10-step assessment workflow, 2D anatomical map, history/compare, amend/copy/delete | ✅ Done |
| 5 | 3D viewer (R3F/Drei), views, touch/mouse, selection, overlays, licensed-model manifest architecture, WebGL fallback | ✅ Done — **development mannequin only** (no licensed anatomical asset available) |
| 6 | Fluid management (Parkland, modified Brooke, institutional), intake/output, urine-output calculator | ✅ Done |
| 7 | Clinical monitoring (thresholds, trends, interval comparison), clinical timeline | ✅ Done |
| 8 | 9 PDF report types, print, patient JSON export | ✅ Done |
| 9 | Backup/restore (plain + AES-GCM), PWA (manifest, SW, icons, offline indicator, update prompt) | ✅ Done |
| 10 | Tests, responsive checks, production build, documentation | ✅ Done |

## Completed features

Dashboard (live stats, charts from real data, recent assessments/events/fluid records, configurable attention flags with visible rules, backup reminder, quick actions, empty states) · Patients (all fields, auto ID, create/edit/delete with typed confirmation and cascade, search/filter/sort, duplicate warning, profile tabs, report, export) · Burn assessment (3 methods, 5 depths, superficial exclusion, indeterminate flagging + upper bound, partial/decimal involvement, validation incl. duplicates and >100 %, age-column selection/override, paediatric limitation acknowledgement, immutable records with amendment chain, comparison) · 3D/2D body mapping · Fluid management · Intake & output · Urine output · Monitoring · Timeline · Reports · Backup & restore · Settings (preferences, units, date/time formats, default method, reference/protocol/urine-target configuration with verification, versions, retire; thresholds; custom parameters; attention flags; backup; data management with storage estimate, persistent storage, audit log, delete all; privacy & disclaimer; dataset inventory) · PWA/offline · Error boundaries, DB error screen, friendly error messages, privacy-safe technical logging.

## Tests executed (this session)

| Suite | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ 0 errors |
| Unit + component (Vitest 5, jsdom, fake-indexeddb) | `npm test` | ✅ **147 passed**, 13 files |
| Coverage | `npx vitest run --coverage` | engines/tbsa 95 % stmts · engines/fluids 91 % · database/backup 91 % · engines/integrity 72 % · all covered files 74 % |
| End-to-end (Playwright 1.63, Chromium) | `npm run test:e2e` | ✅ **21 passed** |
| Production build | `npm run build` | ✅ built; service worker precaches 90 entries (~3.5 MB) |
| Dev server smoke | `npm run dev` + browser check | ✅ pages render, no console errors |
| Dependency audit | `npm audit --omit=dev` | ✅ 0 vulnerabilities (dev-only: 4 moderate + 2 low in `workbox-build` transitive deps) |

Unit coverage includes: zero / full / partial involvement, superficial exclusion, multiple regions and depths, pediatric column selection (all 11 age boundaries), invalid input (negative, >100, NaN, unknown region, missing column), rounding (half away from zero, single rounding of totals, decimal artefacts), indeterminate regions, duplicate entries, Rule of Nines mapping and paediatric applicability, palm method; fluid estimates (configured, missing configuration, invalid weight/TBSA, time intervals, resuscitation-start reference, phase validation); urine output (calculation, weight/duration/volume validation, target selection/labelling); fluid balance (totals, net, buckets, date filter, patient separation); thresholds; integrity hashing/tamper detection; DB CRUD, relationships, cascade delete, transaction rollback, v1→v2 migration, verification workflow; backup (full/patient scope, restore, skip/replace/copy, checksum tampering, incompatible versions, invalid records, encryption round-trip and wrong password); attention flags; report scoping and all 9 PDF types; 3D mannequin coverage/orientation; model manifest validation; BodyMap2D, ConfirmDialog, RegionalEditor components.

E2E coverage: patient create/search/filter/sort/edit/reload persistence/delete; form validation and duplicate warning; Lund and Browder workflow (blocked until verified, superficial excluded, indeterminate flagged, >100 % rejected, save, PDF download, repeat assessment, history comparison); Rule of Nines child limitation; Palm method; fluid estimate (NOT CONFIGURED gate, Parkland numbers, time since injury vs. resuscitation, administered/remaining, invalid weight/TBSA); I/O totals, net balance, patient separation, edit/delete, interval filter, hourly view; urine output; monitoring thresholds, BP, trends; timeline CRUD/filter; complete report PDF; backup → delete all → restore, duplicate detection; encrypted backup; offline PWA (SW install, offline reload, navigation, persistence, backup offline); 3D viewer selection and camera views; WebGL-unavailable 2D fallback; no horizontal overflow on 16 routes at mobile (390 px), tablet (820 px) and desktop (1280 px); mobile drawer/bottom bar; collapsible tablet sidebar.

Not automated: WebKit/Safari and Firefox runs (only Chromium is available in this environment), real-device PWA installation on iOS/Android, printing to a physical printer, screen-reader audit.

## Known limitations

1. **No clinical validation or regulatory review.** See `docs/CLINICAL_VALIDATION.md`.
2. **Reference values are unverified transcriptions** until a clinician verifies them in the app. Lund and Browder (1944) bibliographic details could not be confirmed in PubMed.
3. **3D model is a schematic development mannequin**, clearly labelled as not anatomically accurate. No properly licensed anatomical asset was available in this environment; the integration architecture (`public/models/manifest.json`) is implemented and validated but has only been exercised by unit tests (no GLB shipped).
4. The development mannequin uses one mesh per segment surface; a licensed model that is not segmented per surface colours the whole mesh with the most severe depth of either surface.
5. IndexedDB data is **not encrypted** by the application (only exported backups can be). No multi-user access control; anyone with the unlocked device can open the app.
6. No data synchronisation between devices (by design).
7. Region colouring on the maps shows the most severe depth per region surface; exact distribution within a region is not drawn.
8. Times use the device's local time zone for display and hourly/daily bucketing; records are stored in UTC.
9. Paediatric maintenance fluids, electrical/inhalation-injury adjustments and protocol-specific colloid phases are not modelled (an institutional protocol can define phases and counted categories only).
10. PDF uses standard Helvetica (WinAnsi); unsupported symbols are transliterated (e.g. "≥" → ">=").

## Required external assets

* Optional: a licensed, anatomically reviewed glTF body model + `public/models/manifest.json` (see `public/models/README.md`).
* No other external assets; fonts and icons are bundled.

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
2. Source and integrate a licensed anatomical 3D model (or set *prefer 2D map*).
3. Run the E2E suite on WebKit and Firefox (`npx playwright install webkit firefox`, add projects) and on physical iOS/Android devices.
4. Accessibility audit with a screen reader.
5. Optional: application-level encryption of IndexedDB with a session passphrase; per-user sign-in for shared devices.
