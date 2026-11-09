# Clinical reference datasets

All bundled datasets and protocols are **templates shipped with status NOT CONFIGURED**. Their values were transcribed by the software developer from the cited publications or from widely reproduced versions of them. They are not usable until a qualified clinician verifies them on the deployment device (Settings → Clinical references / Fluid protocols / Urine targets). Verification is recorded with name, role, date and a SHA-256 hash of the content.

Bibliographic details marked "PubMed" were confirmed against PubMed records during development (PMID and DOI listed). This confirms the *citation*, not the transcribed values — the values must be checked against the full primary source.

| Dataset id | Name | Status shipped | Source |
|---|---|---|---|
| `lund-browder-1944@1.0.0` | Lund and Browder chart | NOT CONFIGURED | Lund CC, Browder NC. *The estimation of areas of burns.* Surg Gynecol Obstet. 1944;79:352–358. **Not indexed in PubMed** — bibliographic details from secondary citations; verify against the primary source. |
| `rule-of-nines-adult@1.0.0` | Rule of Nines (adult) | NOT CONFIGURED | Wallace AB. *The exposure treatment of burns.* Lancet. 1951;1(6653):501–504. PubMed PMID 14805109, [doi:10.1016/s0140-6736(51)91975-7](https://doi.org/10.1016/s0140-6736(51)91975-7) |
| `palm-rossiter-1996@1.0.0` | Palm method reference values | NOT CONFIGURED | Rossiter ND, Chapman P, Haywood IA. *How big is a hand?* Burns. 1996;22(3):230–231. PubMed PMID 8726264, [doi:10.1016/0305-4179(95)00118-2](https://doi.org/10.1016/0305-4179(95)00118-2) |
| `urine-output-targets-local@1.0.0` | Urine output targets (institutional) | NOT CONFIGURED, **empty** | None — must be entered from the institutional protocol |
| `parkland@1.0.0` | Parkland formula | NOT CONFIGURED | Baxter CR, Shires T. *Physiological response to crystalloid resuscitation of severe burns.* Ann N Y Acad Sci. 1968;150(3):874–894. PubMed PMID 4973463, [doi:10.1111/j.1749-6632.1968.tb14738.x](https://doi.org/10.1111/j.1749-6632.1968.tb14738.x) |
| `modified-brooke-adult@1.0.0` | Modified Brooke formula (adult) | NOT CONFIGURED | Pruitt BA Jr, Mason AD Jr, Moncrief JA. *Hemodynamic changes in the early postburn patient: the influence of fluid administration and of a vasodilator (hydralazine).* J Trauma. 1971;11(1):36–46. PubMed PMID 5099912, [doi:10.1097/00005373-197101000-00003](https://doi.org/10.1097/00005373-197101000-00003). Commonly cited as the origin of the modified Brooke approach — confirm attribution and parameters locally. |
| `institutional-protocol@0.1.0` | Institution-defined protocol | NOT CONFIGURED, **blank** | None — all parameters must be entered |

## Transcribed values

### Lund and Browder (% TBSA of each region surface)

Age-dependent (one half of the region, i.e. per surface):

| Column | 0 yr | 1 yr | 5 yr | 10 yr | 15 yr | Adult |
|---|---|---|---|---|---|---|
| A — ½ of head | 9½ | 8½ | 6½ | 5½ | 4½ | 3½ |
| B — ½ of one thigh | 2¾ | 3¼ | 4 | 4¼ | 4½ | 4¾ |
| C — ½ of one lower leg | 2½ | 2½ | 2¾ | 3 | 3¼ | 3½ |

Fixed (anterior + posterior): neck 1 + 1; trunk 13 + 13; buttocks 2½ each (posterior); genitalia 1 (anterior); upper arm 2 + 2; forearm 1½ + 1½; hand 1¼ + 1¼; foot 1¾ + 1¾.

Internal-consistency check (automated, `engines/integrity`): **every age column sums to exactly 100 %.**

Application convention (not part of the original chart): age in completed years selects the column at or below it; 16 years and above use "Adult". The clinician can override the column per assessment (recorded as a limitation).

### Rule of Nines (adult)

Head and neck 9 (4½ anterior + 4½ posterior); each upper limb 9 (4½ + 4½); anterior trunk 18; posterior trunk 18 (includes buttocks); each lower limb 18 (9 + 9); perineum/genitalia 1. Sum 100 %. The equal anterior/posterior split of head-neck and limbs follows teaching diagrams. Documented population: adults; the lower bound of 16 years mirrors the Lund and Browder "Adult" column convention and must be confirmed locally. Use in younger patients shows a limitation that must be acknowledged.

### Palm method

From the abstract of Rossiter et al. (PubMed 8726264): palm alone ≈ 0.5 % (male) / 0.4 % (female) BSA; palm plus palmar surface of the five digits ≈ 0.8 % (male) / 0.7 % (female). The commonly taught "≈ 1 %" value may overestimate burn size in adults. Values for children are not established by this dataset. The clinician always enters the palm-equivalent percentage used for each assessment; a verified option only pre-fills it.

### Parkland / modified Brooke

Parkland: 4 mL × kg × %TBSA over 24 h from injury; ½ in the first 8 h, ½ over the next 16 h; Lactated Ringer's.
Modified Brooke (adult): 2 mL × kg × %TBSA over 24 h from injury; ½ in the first 8 h, ½ over the next 16 h; Lactated Ringer's. The paediatric variant is not included.

### Why no urine-output targets or observation thresholds are bundled

Published targets differ between guidelines, age groups and weight bands, and observation thresholds are institution-specific. Shipping a default would amount to inventing a clinical value. They must be entered with their reference and (for urine targets) verified.

## Changing a dataset

* Verified data is immutable. Use **New version** to create an editable copy, edit it, then verify it.
* Saved assessments and calculations keep the id and version they were calculated with.
* Editing a bundled template file in `src/reference-data/` requires bumping its version and id so existing installations add it as a new dataset (existing records are never modified by `ensureBundledTemplates`).
