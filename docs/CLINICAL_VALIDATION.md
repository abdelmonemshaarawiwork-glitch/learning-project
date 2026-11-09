# Clinical validation checklist

BURN TOOL **has not been clinically validated** and has no regulatory clearance. Automated tests verify that the software implements the documented rules; they do not establish clinical safety or effectiveness. Before any clinical use, the deploying organisation must complete and document at least the steps below. Keep signed copies outside the application.

## A. Governance

- [ ] Intended use, user groups and clinical settings defined and approved.
- [ ] Applicable medical-device / software-as-a-medical-device regulation assessed for your jurisdiction.
- [ ] Clinical safety officer (or equivalent) appointed; hazard log created.
- [ ] Information-governance review: local storage on shared devices, device encryption, screen lock, backup handling, retention and disposal.

## B. Reference data verification (per device / deployment)

For each dataset, compare **every value** with the primary source and local policy, then record verification in the app.

- [ ] Lund and Browder chart: all 33 region-surface rows × 6 columns; column totals = 100 %; age-to-column convention accepted (or a new version created with local bands).
- [ ] Rule of Nines (adult): values; lower age bound; anterior/posterior split convention.
- [ ] Palm method options: values and populations; local teaching on palm with/without digits.
- [ ] Urine-output targets: enter age-/weight-specific targets with source; verify.
- [ ] Parkland and/or modified Brooke and/or institutional protocol: coefficient, period, time reference, phases, fluid, counted intake categories, applicability notes; verify only the protocols in local use; retire others.
- [ ] Observation warning thresholds entered from local policy with source text.
- [ ] Attention-flag numeric rules set (or left off) per local policy.
- [ ] Verification records (name, role, date) and content hashes recorded in the clinical safety file.

## C. Calculation verification

Using independent worked examples (spreadsheet or hand calculation reviewed by a second clinician):

- [ ] TBSA: zero, single full region, partial regions, multiple depths in one region, superficial-only, indeterminate, all age columns, Rule of Nines adult and child (limitation shown), palm method.
- [ ] Rounding conventions accepted (contributions 2 dp, totals 1 dp, half away from zero; exact values stored).
- [ ] Fluid estimate: total volume, phase windows from injury vs. resuscitation start, late start warning, administered/remaining with pre-hospital fluids, period elapsed.
- [ ] Urine output: rate, duration validation, target labelling only with verified targets.
- [ ] Fluid balance: totals, hourly/daily buckets in the local time zone, cumulative balance, interval boundaries.
- [ ] Threshold warnings display the threshold and are worded as non-diagnostic.

## D. Usability & workflow

- [ ] Assessment workflow tested by representative clinicians on desktop, tablet and phone.
- [ ] 2D map orientation (R/L = patient's right/left) understood by users.
- [ ] 3D viewer: the development mannequin is **not anatomically accurate** — decide whether to use it, disable it (Settings → prefer 2D map) or integrate a licensed, reviewed anatomical model (`public/models/README.md`).
- [ ] Reports reviewed for content, legibility and correct patient identification.
- [ ] Error messages understood; NOT CONFIGURED states understood.

## E. Data protection & resilience

- [ ] Backup procedure (frequency, storage location, encryption, password custody) defined and tested.
- [ ] Restore tested on a second device; duplicate strategies understood.
- [ ] Behaviour when browser data is cleared / storage is evicted understood; persistent storage requested.
- [ ] Offline operation tested after installation on each device type.
- [ ] Audit log reviewed (contains identifiers and actions only).

## F. Release management

- [ ] Version of the application and of each verified dataset/protocol recorded.
- [ ] Update procedure defined (the PWA prompts before reloading).
- [ ] Re-verification procedure after any dataset change.
- [ ] Incident reporting route for suspected calculation or display errors.

Sign-off: ____________________ (clinical safety)   ____________________ (clinical lead)   Date: __________
