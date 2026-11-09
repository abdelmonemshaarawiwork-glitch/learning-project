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
    photo-assessment/ PhotoAssessmentPage, PhotoAnnotator (tracing), imageProcessing, photoAreas
    fluid-management/ intake-output/ urine-output/ clinical-monitoring/ timeline/
    reports/          ReportsPage, reportTypes, pdf/ (builder, sections, reportData, runReport)
    settings/         tabs: preferences, references, protocols, urine targets, thresholds, flags, backup/, data, about
  database/           db.ts, schema.ts, migrations/, repositories/, validation.ts (Zod), backup/, bootstrap.ts
  engines/            tbsa/, fluids/, urine-output/, fluid-balance/, thresholds/, integrity/, photo-planimetry/
  reference-data/     bundled templates (NOT CONFIGURED)
  constants/ hooks/ stores/ types/ utils/ styles/ tests/
public/  icons/ models/ (MakeHuman CC0 GLB, manifest, licence, README) favicon.svg
scripts/ generate-icons.mjs, build-anatomical-model.mjs
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
* **Bundled realistic model:** `public/models/makehuman-body.glb` is built by `scripts/build-anatomical-model.mjs` from the **CC0** MakeHuman base mesh (hm08) and its default skeleton weights (sources and SHA-256 hashes recorded in `manifest.json → provenance`). Pipeline: every vertex is assigned to its highest-weight bone → bones map to body segments; buttocks and genitalia/perineum are carved from the pelvic region by geometric rules; anterior/posterior is decided per original quad from its normal (+Z for head, neck, trunk, upper arm and lower limb; the palm direction, derived from thumb and finger positions, for the hand; a blend from the arm's front at the elbow to the palm at the wrist for the forearm; dorsum vs. sole/heel for the foot); labels are smoothed over face adjacency. Result: one mesh per segment surface (33) plus non-selectable eyes, ~0.57 MB. The manifest marks `anatomicallyReviewed: false`; the viewer says so.
* **Loading:** `model3d/modelManifest.ts` validates `manifest.json` (file, licence with attribution and redistribution permission, mesh → segment map, forward axis). The GLB is loaded with Drei `useGLTF` with Draco **and Meshopt disabled** (no CDN, no WebAssembly — the CSP forbids both). If loading fails, an error boundary inside the canvas switches to the development mannequin. Replacing the model = new GLB + manifest (see `public/models/README.md`).
* **Selection:** taps are detected with native pointer events and an explicit raycast (≤ 6 px movement = tap, otherwise rotate/pan), with sub-pixel retries so a ray exactly on a mesh seam (the body midline) still hits. Hover uses R3F events. The viewer exposes `data-model-ready`, `data-camera-view` and `data-camera-settled` for tests.
* **Development mannequin:** procedural lathe-surface mannequin (`model3d/mannequin.ts`), one mesh per segment surface, labelled *not anatomically accurate*; used only as a fallback.
* **Fallback:** `BodyMapSwitcher` detects WebGL; without it (or if the 3D view throws) the accessible 2D SVG map is shown. The 2D map is keyboard-operable.

## PWA & offline

* `vite-plugin-pwa` (generateSW). Precache: all JS/CSS/HTML/icons/fonts/models (~3.5 MB). `navigateFallback: index.html`. **No runtime caching** — patient data is never placed in Cache Storage.
* Registration is `prompt`-type: an update notice appears and the page is only reloaded when the user clicks *Reload*.
* `useOnlineStatus` drives the offline indicator; all features work offline (nothing needs the network).
* `navigator.storage.persist()` is requested at start-up; status is shown in Settings → Data management.

## Photo-assisted estimate

* Capture via `<input type="file" accept="image/*" capture="environment">` (opens the camera on phones/tablets; works offline) or the gallery. `imageProcessing.ts` honours EXIF orientation, downsizes to ≤ 1600 px and re-encodes to JPEG (removes EXIF/GPS). Consent confirmation is required before capture and stored on each photo.
* `PhotoAnnotator` draws on an SVG overlay in normalised coordinates (freehand trace → Ramer–Douglas–Peucker simplification), with zoom/pan, undo/redo and a shape list; tracing is auto-saved (debounced) to `clinicalPhotos`.
* `engines/photo-planimetry` rasterises shapes, measures each photo and pools views (formula in MEDICAL_CALCULATIONS §8). Proposed rows are applied to the shared assessment draft (Lund and Browder only) after explicit confirmation; the normal TBSA engine and verification gate then apply.

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
