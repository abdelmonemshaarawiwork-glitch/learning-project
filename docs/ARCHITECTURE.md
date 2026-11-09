# Architecture

## Principles

1. **Local-first.** All data lives in IndexedDB on the device. No backend, no external calls; a build-time Content-Security-Policy allows only `'self'`.
2. **Engines are pure.** Clinical logic (`src/engines/`) is framework-free TypeScript, fully unit-tested; UI only gathers input and renders results.
3. **No invented clinical values.** Every clinical constant comes from a versioned, verification-gated dataset (see [REFERENCES.md](REFERENCES.md)).
4. **Never overwrite clinical records silently.** Assessments are immutable; amendments create superseding records; deletions require explicit confirmation.
5. **Graceful degradation.** 3D → 2D map without WebGL; route-level error boundaries; offline operation.

## Source layout

```
src/
  app/                App.tsx, router.tsx (lazy routes), providers/ (DatabaseGate, DisclaimerGate, ErrorBoundary, PwaManager)
  components/
    ui/               design system (button, input/select/checkbox, card, badge, alert, dialog, confirm-dialog, tabs, table, states, stat, field)
    layout/           AppShell (sidebar / tablet rail / mobile drawer + bottom bar), ThemeToggle, nav config
    common/           PageHeader, PatientContextBar, DateTimeInput, ClinicalNotices
  features/
    dashboard/        DashboardPage, attention.ts (flag rules)
    patients/         list, form (RHF + Zod), profile
    burn-assessment/  workflow, history/compare, detail, service.ts, components/ (editors, summaries, mapping panel)
    body-mapping/     BodyMap2D + geometry2d, BodyViewer3D (R3F), BodyMapSwitcher, model3d/ (mannequin, manifest)
    fluid-management/ intake-output/ urine-output/ clinical-monitoring/ timeline/
    reports/          ReportsPage, reportTypes, pdf/ (builder, sections, reportData, runReport)
    settings/         tabs: preferences, references, protocols, urine targets, thresholds, flags, backup/, data, about
  database/           db.ts, schema.ts, migrations/, repositories/, validation.ts (Zod), backup/, bootstrap.ts
  engines/            tbsa/, fluids/, urine-output/, fluid-balance/, thresholds/, integrity/
  reference-data/     bundled templates (NOT CONFIGURED)
  constants/ hooks/ stores/ types/ utils/ styles/ tests/
public/  icons/ models/ (3D asset slot + README) favicon.svg
e2e/     Playwright specs
```

## Data flow

```
UI (React, RHF/Zod forms) ──► repositories (validate, transaction, audit) ──► Dexie/IndexedDB
       ▲                                                                         │
       └──────────── dexie-react-hooks useLiveQuery (reactive reads) ◄───────────┘
UI ──► engines (pure functions) with inputs + verified dataset/protocol from DB ──► results ──► UI / PDF / snapshot
```

* **State:** server-less, so persistent state = IndexedDB. Zustand holds UI state (sidebar, active patient id in localStorage — the id only) and the assessment draft (persisted to the `drafts` table so the workflow and the 3D page share it and it survives reloads).
* **Active patient:** every patient-scoped page uses `useActivePatient()` (`?patient=` URL parameter or remembered id) and `PatientContextBar`. All queries filter by `patientId`; reports assert it again.
* **Settings:** key/value rows merged with typed defaults (`useSettings`).

## Clinical configuration lifecycle

```
bundled template ──ensureBundledTemplates──► NOT CONFIGURED ──clinician verification──► VERIFIED (hash recorded)
       verified ──edit?──► locked → "New version" (NOT CONFIGURED copy) ──verify──► VERIFIED
       any state ──retire──► RETIRED (kept for history)
```

`checkDatasetUsable` / `checkProtocolUsable` re-hash content on every use; a mismatch disables calculation.

## 3D model integration

* `BodyViewer3D` (lazy chunk `vendor-3d`) renders with React Three Fiber, Drei `OrbitControls` (rotate, zoom, pan; mouse and touch), camera presets (anterior, posterior, left/right lateral) and reset. Clicks are ignored when the pointer moved (drag ≠ tap).
* **Body segments** (`constants/clinical.ts`) are the shared vocabulary of the 2D map, the 3D model and the datasets (each dataset row lists the segments it covers, so Rule of Nines "upper limb" highlights arm, forearm and hand).
* **Licensed model:** if `public/models/manifest.json` exists and validates (`model3d/modelManifest.ts`: file, licence with attribution and redistribution permission, mesh → segment map, forward axis, scale), the GLB is loaded with `useGLTF` (no Draco/CDN). Meshes without an explicit surface use the face normal vs. the forward axis. See `public/models/README.md`.
* **Development mannequin:** otherwise a procedural lathe-surface mannequin (`model3d/mannequin.ts`) is used with one mesh per segment surface. It is labelled in the UI as *not anatomically accurate*.
* **Fallback:** `BodyMapSwitcher` detects WebGL; without it (or if the 3D view throws) the accessible 2D SVG map is shown. The 2D map is keyboard-operable.

## PWA & offline

* `vite-plugin-pwa` (generateSW). Precache: all JS/CSS/HTML/icons/fonts/models (~3.5 MB). `navigateFallback: index.html`. **No runtime caching** — patient data is never placed in Cache Storage.
* Registration is `prompt`-type: an update notice appears and the page is only reloaded when the user clicks *Reload*.
* `useOnlineStatus` drives the offline indicator; all features work offline (nothing needs the network).
* `navigator.storage.persist()` is requested at start-up; status is shown in Settings → Data management.

## Reports

`pdf/runReport.ts` loads one patient's data (`reportData.ts`, scope-asserted), builds sections with `PdfBuilder` (jsPDF + autotable, A4, branded header, patient identifier on every page, disclaimer + "Page X of Y" footer, WinAnsi-safe text, vector body map from the same geometry as the on-screen 2D map) and downloads or opens it for printing. jsPDF is loaded only when a report is generated.

## Error handling

* `ErrorBoundary` at app and route level, inline boundary around the 3D viewer.
* `DatabaseGate` explains IndexedDB failures (private mode, quota, blocked by another tab) with retry.
* Repositories throw `ValidationError`s with field paths; UI shows toasts with `describeError` (friendly messages for quota/constraint/open errors).
* `logTechnicalError` logs error name/message/stack only — callers never pass record contents.

## Security notes

* Strict CSP (production), `referrer: no-referrer`, no third-party scripts or fonts (Inter is bundled).
* Backup encryption: Web Crypto AES-GCM-256, PBKDF2-SHA-256 (600 000 iterations), random salt/IV; password never stored.
* Dev-dependency advisories (`npm audit`) affect only build tooling (`workbox-build` transitive deps); `npm audit --omit=dev` reports 0 vulnerabilities.
