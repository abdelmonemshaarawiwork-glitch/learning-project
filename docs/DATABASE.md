# Database

IndexedDB via Dexie 4. Defined in `src/database/db.ts`; versions in `src/database/migrations/index.ts`; current store map in `src/database/schema.ts`.

## Databases per account (v1.2)

Internal identifiers (database names, browser-storage keys such as `burn-tool:session`, and the backup `format` values) keep the original `burn-tool` prefix from before the product was renamed **BurnMatrix**, so existing accounts, records and backup files keep working.

| Database | Contents |
|---|---|
| `burn-tool-accounts` | One table `accounts` (`id`, `&email`): display name, role, lower-cased email, PBKDF2-SHA-256 hash + 16-byte salt + iteration count (600 000), `dbName`, created / last sign-in, failed-attempt counter, `lockedUntil`. No passwords, no clinical data. Defined in `src/features/auth/accounts.ts`. |
| `burn-tool-u-<accountId>` | The clinical database of one account (all tables below). |
| `burn-tool` | Clinical database used before accounts existed. If it holds patients, the **first** account created in the browser adopts it, so earlier records are not lost. |

`openDatabase(name)` closes the active clinical database and opens the signed-in account's one; sign-out closes it; *Delete account* (password + typed confirmation) deletes the account row and its clinical database. The session (account id, name, email, database name, expiry; never the password) is kept in `sessionStorage`, or in `localStorage` with *keep me signed in*.

## Tables of a clinical database (schema v3)

| Table | Primary key | Indexes | Notes |
|---|---|---|---|
| `patients` | `id` (UUID) | `&code` (unique), `name`, `status`, `admissionDate`, `createdAt`, `updatedAt` | `code` is the human-readable ID `BT-XXXXXXXX` |
| `assessments` | `id` | `patientId`, `[patientId+assessmentDate]`, `assessmentDate`, `method`, `createdAt` | Immutable; amendments use `supersedesId` / `supersededById` |
| `assessmentRegions` | `id` | `assessmentId`, `patientId` | Regional breakdown snapshot |
| `fluidProtocols` | `id` (`key@version`) | `key`, `status`, `updatedAt` | Versioned, verification-gated |
| `fluidCalculations` | `id` | `patientId`, `[patientId+calculationDate]`, `calculationDate`, `protocolId`, `assessmentId` | Input + result snapshots |
| `intakeRecords` | `id` | `patientId`, `[patientId+dateTime]`, `dateTime`, `category` | mL |
| `outputRecords` | `id` | `patientId`, `[patientId+dateTime]`, `dateTime`, `category` | mL |
| `clinicalObservations` | `id` | `patientId`, `[patientId+dateTime]`, `[patientId+parameter]`, `dateTime`, `parameter` | `value2` = diastolic BP |
| `timelineEvents` | `id` | `patientId`, `[patientId+dateTime]`, `dateTime`, `eventType`, `linkedRecordId` | `system` = created automatically |
| `referenceDatasets` | `id` (`key@version`) | `key`, `kind`, `status` | Lund and Browder, Rule of Nines, palm, urine targets |
| `settings` | `id` (= key) | `&key` | Key/value preferences |
| `auditEvents` | `++id` | `timestamp`, `action`, `entityType`, `entityId` | Non-identifying details only |
| `drafts` | `id` | `updatedAt` | In-progress assessment (v2) |
| `clinicalPhotos` | `id` | `patientId`, `[patientId+dateTime]`, `[patientId+areaId]`, `areaId` | Re-encoded JPEG bytes (`imageData`), area, view, size, tracing (`annotation`), `consentConfirmed` (must be true) (v3) |

Field-level definitions are in `src/types/domain.ts`; runtime validation schemas (also used for backup import) in `src/database/validation.ts`.

### Relationships

```
patients 1─* assessments 1─* assessmentRegions
patients 1─* fluidCalculations *─0..1 assessments
patients 1─* intakeRecords | outputRecords | clinicalObservations | timelineEvents | clinicalPhotos
timelineEvents.linkedRecordId → assessments.id (automatic assessment events)
assessments.referenceDatasetId + referenceVersion → referenceDatasets (by value, kept even if the dataset is retired)
fluidCalculations.protocolId + protocolVersion → fluidProtocols
```

All patient-linked records carry `patientId`. Repositories check that the patient exists inside the write transaction.

## Transactions & integrity

* Every write goes through a repository (`src/database/repositories/`) that validates the record with Zod and writes it plus an audit event in one transaction.
* `createPatient` also adds the admission timeline event; `saveAssessment` adds regions, marks a superseded assessment and adds the timeline event — atomically.
* `deletePatient` deletes the patient and every linked record (and a draft for that patient) in one transaction and audits the counts.
* Web Crypto hashing is performed **outside** transactions (it would otherwise commit them early); the record is re-read and compared (`updatedAt`) inside the transaction.

## Versioning & migrations

| Version | Change |
|---|---|
| 1 | Initial schema |
| 2 | Adds `drafts`; adds `[patientId+parameter]` index on observations; back-fills `patients.mechanismDetails`, `timelineEvents.system` / `linkedRecordType`, `assessments.supersededById` |
| 3 | Adds `clinicalPhotos` (photo-assisted planimetry). No existing data changed |

Rules: never edit a released version; add a new one. Upgrade functions transform data in place and never clear tables. Dexie keeps tables not mentioned in later versions. A unit test opens a raw v1 database with legacy records, upgrades it and checks that nothing is lost.

`ensureBundledTemplates()` runs at start-up and inserts any missing bundled template as NOT CONFIGURED; it never modifies existing records.

## Backup file format

```jsonc
{
  "format": "burn-tool-backup",
  "formatVersion": 1,
  "appVersion": "1.0.0",
  "schemaVersion": 2,
  "exportedAt": "2026-…Z",
  "scope": "all" | "patients",
  "patientIds": ["…"],
  "counts": { "patients": 1, … },
  "checksum": "<sha-256 of canonical JSON of tables>",
  "tables": { "patients": [ … ], …,     // drafts are never exported
              "clinicalPhotos": [ { …, "imageBase64": "…" } ] }   // optional ("Include clinical photographs")
}
```

Encrypted wrapper:

```jsonc
{
  "format": "burn-tool-backup-encrypted",
  "formatVersion": 1,
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<base64 16 bytes>" },
  "cipher": { "name": "AES-GCM", "iv": "<base64 12 bytes>" },
  "ciphertext": "<base64>"
}
```

Restore pipeline (`src/database/backup/index.ts`): parse → (decrypt) → envelope validation → format/schema compatibility (newer versions are refused) → checksum → per-record Zod validation and in-file duplicate ids → referential checks (orphans rejected) → duplicate detection against local ids → preview → apply in **one** transaction with the chosen strategy (`skip-existing`, `replace-existing`, `import-as-copies` with full id remapping). Reference datasets and protocols are never replaced by an import.

## Encryption at rest

Clinical photos are identifiable data; they are stored only in IndexedDB, re-encoded on capture (which drops EXIF metadata such as GPS location), never placed in Cache Storage, and deleted with the patient.

IndexedDB contents are **not** encrypted by the application. Only exported backup files can be encrypted. Rely on device-level encryption and screen locks.
