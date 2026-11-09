# Medical calculations

All calculation logic lives in `src/engines/` as pure, framework-independent TypeScript with unit tests. React components never compute clinical values themselves.

**No engine contains clinical reference values.** Percentages, coefficients, phases and targets are passed in from versioned datasets (`src/reference-data/` templates → IndexedDB) that must be clinically verified before use (see `engines/integrity`).

## 1. Usability gate (`engines/integrity`)

A dataset or protocol is used only if **all** hold:

1. `status === 'verified'` with a verification record (verifier, role, date, attestation);
2. the SHA-256 of the canonical JSON of `{kind, version, ageRangeYears, data}` (datasets) or `{version, ageRangeYears, parameters}` (protocols) equals the hash stored at verification;
3. structural checks pass:
   * regional charts: every age column sums to **exactly 100 %** (tolerance 10⁻⁶), no negative or missing values, unique region rows, each body-segment surface mapped to exactly one row;
   * protocols: coefficient > 0, period > 0, phases contiguous from hour 0 to the period end, phase fractions sum to 1;
   * urine targets: at least one target with a min and/or max, valid bands.

Otherwise the UI shows **NOT CONFIGURED** with the reasons and disables the calculation.

## 2. TBSA (`engines/tbsa`)

### Burn depth rules

| Depth | Counts towards TBSA |
|---|---|
| Superficial | **No** (reported as "superficial, excluded") |
| Superficial partial thickness | Yes |
| Deep partial thickness | Yes |
| Full thickness | Yes |
| Indeterminate | **No** — reported separately; never silently classified |

Reported values: **eligible TBSA**, **indeterminate area**, **upper bound** = eligible + indeterminate, **superficial area**, and per-depth totals.

### Regional methods (Lund and Browder, Rule of Nines)

For each entry: `contribution = referencePercent(region, surface, ageColumn) × involvement% / 100`.

Validation (errors block the result):

* involvement must be a finite number, `0 ≤ x ≤ 100` (decimals allowed); negatives and > 100 are rejected;
* the same region surface + depth may be entered only once (`DUPLICATE_ENTRY`);
* the sum of involvement across depths for one region surface must not exceed 100 % (`REGION_OVER_100`);
* region/surface must exist in the dataset; an age column must be selected; the total must not exceed 100 %.

Warnings/info: indeterminate present, superficial excluded, zero involvement, no entries, patient age outside the dataset's documented population (requires explicit acknowledgement before saving), manually overridden age column.

**Age column selection.** The age in completed years (from date of birth at the assessment time, else the recorded age) selects the column whose `[min, max)` range contains it. For the bundled Lund and Browder template: <1 → "0", 1–4 → "1", 5–9 → "5", 10–14 → "10", 15 → "15", ≥16 → "Adult". *This mapping is an application convention and is part of what must be verified.* For a single-column dataset (adult Rule of Nines) that column is used and the age limitation is shown and must be acknowledged.

### Palm method

`contribution = palm-equivalents × palm%`, where *palm%* is the %TBSA of one palm-equivalent of **this** patient, entered by the clinician (optionally pre-filled from a *verified* palm reference option). Palm% must be `0 < x ≤ 100`; palm-equivalents ≥ 0; total ≤ 100 %. The assumption and its source are stored with the assessment.

### Rounding

* Exact values are kept and stored (`tbsaExact`, per-region `tbsaContribution`).
* Totals are summed from **unrounded** contributions (compensated summation) and rounded **once**.
* Rounding is **half away from zero** (`toPrecision(15)` guard against binary artefacts, e.g. 1.005 → 1.01).
* Display precision: regional contributions 2 decimals; TBSA totals 1 decimal. A displayed total can therefore differ slightly from the sum of displayed contributions — the stored exact values are authoritative.

### Stored with every assessment

Method, assessment date/time, age at assessment and its source, age column, dataset id + version + name (or palm reference text), totals (eligible, exact, indeterminate, superficial, upper bound), warnings, limitation acknowledgement, regional breakdown (label, depth, involvement or palm-equivalents, reference %, exact contribution, eligibility, mapped body segments), notes, created timestamp. Assessments are immutable: amendments create a new record that supersedes the old one.

## 3. Fluid resuscitation estimate (`engines/fluids`)

Inputs: weight (kg, > 0), TBSA (0 < x ≤ 100), time of injury, optional resuscitation start (≥ injury), calculation time (≥ injury), administered volume, and a **verified** protocol.

```
total (mL)        = coefficient (mL/kg/%TBSA) × weight (kg) × TBSA (%)
reference time    = time of injury  | start of resuscitation   (per protocol)
phase volume      = total × phase fraction
phase window      = reference time + [startHour, endHour)
phase average     = phase volume ÷ window length      (descriptive only — NOT an infusion rate)
schedule cumulative(t) = Σ phase volume × clamp((t − phaseStart) / phaseLength, 0, 1)
administered      = Σ intake records in the protocol's counted categories from the reference time to the calculation time
remaining         = total − administered               (negative ⇒ administered exceeds the estimate)
```

Both *time since injury* and *time since resuscitation start* are shown separately. Warnings: late resuscitation start relative to a time-of-injury reference (and how much of the first window remains), resuscitation start missing, administered above estimate, period elapsed.

The bundled Parkland and modified Brooke templates (coefficients 4 and 2 mL/kg/%TBSA, 24 h, ½ in the first 8 h from injury) are **not configured** until verified. No result is ever converted into an order or pump setting.

## 4. Urine output (`engines/urine-output`)

```
rate (mL/kg/h) = urine volume (mL) ÷ weight (kg) ÷ duration (h)
```

Validation: weight > 0, volume ≥ 0, valid start and end, end after start, duration > 0. Rate is stored exactly and displayed to 2 decimals. A result is labelled *below / within / above* **only** when a verified target dataset contains a target whose age (and optional weight) band matches the patient; the label always shows the target and its source. Without one the result is shown unlabelled.

## 5. Fluid balance (`engines/fluid-balance`)

```
total intake  = Σ intake records
total output  = Σ output records
net balance   = total intake − total output
```

Intervals are `[start, end)`. Hourly and daily buckets use the device's local time zone; cumulative values start at the beginning of the selected interval. Every aggregation requires a patient id and throws `PatientMixError` if any record belongs to another patient.

## 6. Observation thresholds (`engines/thresholds`)

User-configured only (none shipped). For an enabled threshold with matching parameter and unit: `below` if value < low, `above` if value > high (bounds inclusive of "within"). The message always names the threshold used and is never a diagnosis. Blood pressure thresholds can target systolic or diastolic values. A MAP estimate (DBP + ⅓ pulse pressure) is displayed as information only when entering BP.

## 7. Attention flags (`features/dashboard/attention.ts`)

Data-quality flags (indeterminate depth, unconfigured references) are on by default. Numeric rules (TBSA ≥ X, no assessment within N h, no I/O within N h) have **no default value** and are inactive until a value is entered. Observation and urine flags use only configured thresholds / verified targets. Every flag displays its rule.
