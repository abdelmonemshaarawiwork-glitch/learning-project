# User guide

> Clinical decision-support software. All calculations and outputs require review by a qualified healthcare professional. This software is not a substitute for clinical judgment.

## First start

1. Read and accept the disclaimer and privacy notice.
2. **Configure clinical references before use** (Settings):
   * *Clinical references* — open each dataset, compare every value with the cited source, click **Verify**, enter your name, role and date and confirm the attestation.
   * *Fluid protocols* — verify only the protocols used locally; create an institution-defined protocol if needed.
   * *Urine targets* — enter your institution's age-specific targets and their reference, then verify. Until then, urine-output results are not labelled.
   * *Warning thresholds* / *Attention flags* — optional, from local policy.
3. Settings → *Preferences*: units (kg/lb, cm/in, °C/°F), date/time format, default method, theme.

Anything not verified shows **NOT CONFIGURED** and its calculation is disabled.

## Patients

*Patients → Add patient.* Use an anonymised identifier where possible. Date of birth (preferred) or age, weight (needed for fluids and urine output), admission and injury times. A patient ID (`BT-…`) is generated automatically. A warning appears if a patient with the same name (and compatible date of birth) exists.

The patient profile has tabs for assessments, fluid calculations, intake/output, observations and timeline, plus **Edit**, **New assessment**, **Report**, **Export data** and **Delete** (you must type the patient ID; all linked records are deleted).

## Burn assessment

*Burn Assessment → Start assessment* (for the selected patient):

1. Patient · 2. Date & time (and assessor) · 3. Method — Lund and Browder (age column suggested from age; can be overridden), Rule of Nines (adults; a limitation must be acknowledged for younger patients) or Palm method (enter the %TBSA of one of *this patient's* palm-equivalents).
4–6. **Regions:** select a region on the 3D model, the 2D map or the region list; choose a depth with the depth buttons (S, SPT, DPT, FT, IND — never assumed); enter % of the region involved (quick buttons 25/50/75/100). Several depths can be recorded in one region (max 100 % combined). Remove or edit entries at any time.
7–8. **Review:** eligible TBSA, indeterminate area (not included) and upper bound, superficial area (excluded), per-depth totals, warnings, breakdown and calculation details, comparison with the previous assessment.
9–10. **Save** creates a permanent record; then download the assessment report.

The draft is saved automatically on this device and can be continued later or discarded. *History & comparison* lists all assessments and compares any two. From an assessment: **Amend** (creates a new version, the original is kept as superseded), **New from this** (repeat assessment), **PDF**, **Print**, **Delete**.

## 3D body mapping

Drag to rotate, scroll/pinch to zoom, right-drag/two-finger drag to pan; **Anterior / Posterior / Left lateral / Right lateral / Reset**. Without a draft it shows the latest saved assessment; start or continue an assessment to edit regions here. The bundled model is a schematic development mannequin and is labelled as not anatomically accurate. If WebGL is unavailable, the 2D map is used.

## Fluid management

Select a **verified** protocol, check weight, TBSA (pre-filled from the latest assessment; indeterminate areas are flagged), time of injury and resuscitation start. Results: formula, estimated volume, phase windows, time since injury and since resuscitation start, administered (IV crystalloid intake records by default, from the protocol's reference time), remaining estimate, schedule chart and assumptions. **Record administered fluid** adds an intake record. **Save snapshot** stores the calculation. Estimates are not orders or pump settings.

## Intake & output

Choose an interval (last 24 h, 72 h, today, since admission, all, custom). **Add intake / Add output** (mL, category, time, details, notes). Tabs: records (edit/delete), hourly, daily, charts, by category. Net balance = intake − output.

*Urine output calculator* (button on the Intake & output page): weight, volume (or "use recorded urine volume"), start and end → mL/kg/h. Save it as an observation.

## Clinical monitoring

**Add observation** (heart rate, blood pressure, MAP, temperature, respiratory rate, SpO₂, lactate, creatinine, urine output, weight or custom parameters). History shows threshold checks with the threshold used; Trends charts one parameter with configured threshold lines; Compare intervals shows mean/min/max for two periods.

## Clinical timeline

Admission and assessments appear automatically. **Add event** (dressing, debridement, surgery, infection assessment, cultures, antibiotics, transfer, discharge, note…). Filter by type and date, change sort order, edit or delete.

## Reports

Select the patient, report type (1–9), optional assessment and date range → **Download PDF** or **Print**. *Export selected patient records* produces a JSON file that can be restored elsewhere.

## Backup & restore

See the README section "Backing up and restoring patient data". Back up regularly — data exists only in this browser on this device. A dashboard reminder can be set in Settings → Backup & restore.

## Data management

Storage usage, persistent-storage request, record counts, audit log and **Delete all data** (type `DELETE ALL DATA`).
