# Soccer Center Recruiting Catalog — Export for Coach Research
**Exported:** 2026-10-25  
**Purpose:** Independent coaching research. Import-ready files keyed to existing program records.

---

## Files in this export

| File | Description | Rows |
|---|---|---|
| `programs-verified.csv` | Active programs, source-verified in Batch 1 audit | 14 |
| `programs-unresolved.csv` | Active programs, not yet source-verified | 140 |
| `programs-inactive.csv` | Deactivated records (no program / duplicate / division fix) | 11 |
| `coaches.csv` | All existing coach records (verified + unverified-name) | 63 |
| `duplicates-mapping.csv` | Canonical vs. duplicate record pairs | 2 |
| `coach-import-template.csv` | One row per active program; pre-filled where coach records exist | 154 |
| `README.md` | This file | — |

---

## Catalog counts

### Active programs by region

| Region | Programs |
|---|---|
| `arizona` | 9 |
| `cal-north` | 26 |
| `cal-south` | 43 |
| `colorado` | 27 |
| `nevada` | 4 |
| `oregon` | 21 |
| `washington` | 24 |
| **Total** | **154** |

### Active programs by association

| Association | Programs |
|---|---|
| NCAA | 154 |

### Active programs by gender

| Gender | Programs |
|---|---|
| mens | 72 |
| womens | 82 |

### Coach records

| Verification status | Count |
|---|---|
| `corrected` | 3 |
| `unverified-name` | 60 |
| **Total** | **63** |

**Active programs with at least one coach record:** 57  
**Active programs with no coach record yet:** 97

---

## Field definitions

### Program fields (programs-*.csv)

| Field | Description |
|---|---|
| `db_id` | UUID assigned by MySQL at seed time (`randomUUID()`). **Empty in this export** — not stored in the JSON source. After seeding, query `SELECT id, import_key FROM sc_college_programs` to retrieve live IDs. |
| `import_key` | **Primary stable identifier.** Unique slug used by the importer and all coach records. Never changes. Format: institution-slug + gender (e.g. `cu-boulder-womens`). |
| `institution` | Full legal institution name. |
| `short_name` | Common short name (e.g. "CU Boulder"). |
| `campus` | `city, state` combined. |
| `gender` | `mens` or `womens`. |
| `region` | Region slug(s). Multiple regions separated by commas. Values: `arizona`, `cal-north`, `cal-south`, `colorado`, `nevada`, `oregon`, `washington`. |
| `city` | City of the institution. |
| `state` | Two-letter US state abbreviation. |
| `varsity` | `yes` = active varsity program. `no` = deactivated (no program / duplicate / division fix). |
| `association` | Governing body: `NCAA`, `NAIA`, `NJCAA`, `NWAC`, `CCCAA`. |
| `division` | Full division string from source (e.g. `NCAA D1`, `NAIA`, `NJCAA D1`). |
| `division_level` | Level only: `D1`, `D2`, `D3`, or the full string for non-NCAA. |
| `conference` | Soccer-specific conference name. May differ from the institution's primary athletic conference. |
| `program_url` | Direct URL to the soccer program page on the institution's athletics site. |
| `athletics_url` | Root of the athletics domain (derived from `program_url`). |
| `staff_url` | Direct URL to the coaching staff page. Use this for coach research. |
| `source_url` | URL of the page used to verify this record. |
| `checked_date` | ISO 8601 date the record was last verified. |
| `verification_status` | See verification status values below. |
| `record_status` | `production_candidate` = active, will be seeded. `inactive_*` = deactivated. |
| `unresolved_fields` | Semicolon-separated list of fields that are empty or unverified. |
| `research_notes` | Internal audit notes. Not displayed to users. |

### Coach fields (coaches.csv, coach-import-template.csv)

| Field | Description |
|---|---|
| `import_key` | **Primary stable identifier for the coach record.** Format: program-import-key + role-slug (e.g. `cu-boulder-womens-hc`). Preserve exactly when returning data. |
| `program_import_key` | Foreign key — matches `import_key` in the programs files. **Required for import.** |
| `institution` | Denormalized from the program record for readability. |
| `gender` | Denormalized from the program record. |
| `region` | Denormalized from the program record. |
| `name` | Coach's full name. |
| `role` | `Head Coach`, `Assistant Coach`, `Goalkeeper Coach`, etc. |
| `email` | Official institutional email. Never a personal address unless `email_is_personal = yes`. |
| `email_is_personal` | `yes` if the email is a personal address (gmail, etc.). `no` or blank = institutional. |
| `phone` | Direct office or mobile number. |
| `staff_page_url` | URL of the staff page where this coach appears. |
| `source_url` | URL used to verify name and contact details. |
| `checked_date` | ISO 8601 date the record was last verified. |
| `verification_status` | See verification status values below. |
| `research_notes` | Internal audit notes. |

### Verification status values

| Value | Meaning |
|---|---|
| `verified` | Name, conference, and URLs confirmed from official source in this audit. |
| `corrected` | A prior incorrect value was corrected from an official source. |
| `conference-confirmed-url-inferred` | Conference confirmed from a third-party schedule; program URL inferred from the institution's known athletics domain — verify URL before seeding coaches. |
| `url-inferred` | URL inferred from the institution's known athletics domain — not directly confirmed. |
| `unverified-name` | Coach name sourced from prior session data; not confirmed against the official staff page. **Withheld from seed until verified.** |
| `no-program-confirmed` | Official athletics page confirms no varsity soccer program exists. Record deactivated. |
| `duplicate-deactivated` | Exact duplicate of a canonical record. Deactivated; canonical record retained. |
| `corrected-division` | Division/association was incorrect (e.g. NCAA D3 + NAIA for a community college). Corrected and deactivated pending re-verification. |
| `not-checked` | Record has not been verified in any audit pass. Treat as unverified. |

---

## Known gaps

1. **No DB IDs in this export.** The `db_id` column is empty for all records. IDs are assigned by `randomUUID()` at seed time and are not stored in the JSON source files. To retrieve live IDs after seeding, run: `SELECT id, import_key FROM sc_college_programs ORDER BY import_key;`

2. **97 active programs have no coach record.** These appear in `coach-import-template.csv` with blank coach fields. Colorado programs are the research priority.

3. **All 60 `unverified-name` coach records are withheld from seed.** Names were sourced from prior session data and have not been confirmed against official staff pages. These records appear in `coaches.csv` with their existing `import_key` values so they can be matched and corrected.

4. **Seattle U athletics domain unresolved.** `seattle-u-mens` and `seattle-u-womens` are listed as WAC; schedule evidence suggests WCC. No working athletics domain was found. Recommend checking the WCC official membership list.

5. **Southwestern College (`southwestern-az-*`) deactivated.** Division was listed as NCAA D3 + NAIA (contradictory). Institution confirmed as a California community college (CCCAA). The `-az` suffix in the import key is suspicious — may be a data-entry error for a different institution. Verify before re-activating.

6. **Arizona Christian University (`arizona-christian-*`) has a division/conference contradiction.** Division is listed as `NCAA D2` but the conference is `NAIA Sun Conference`. The Sun Conference is a NAIA conference, so the correct division is almost certainly `NAIA`, not `NCAA D2`. Both records are flagged with `division_conference_mismatch` in `unresolved_fields`. Verify against acuathletics.com before seeding. **This is an export-only flag — the source JSON was not modified.**

7. **Batch 2 (NAIA) and Batch 3 (junior/community colleges) not yet started.** The current catalog covers NCAA programs only (plus the Southwestern correction). NAIA, NJCAA, NWAC, and CCCAA programs will be added in subsequent batches.

---

## How to return coach data for import

Use `coach-import-template.csv` as your working file. For each program you research:

1. **Preserve `program_import_key` exactly** — this is the foreign key that links the coach to the program.
2. **Preserve `coach_import_key` exactly** for any existing record you are updating. If you are adding a new coach, leave `coach_import_key` blank — the importer will generate one.
3. Fill in `coach_name`, `coach_role`, `coach_email`, `coach_phone`, `staff_page_url`, `source_url`, `checked_date`.
4. Set `verification_status` to `verified` when you have confirmed the data from the official staff page.
5. Set `email_is_personal` to `yes` only if the email is a personal address (gmail, yahoo, etc.).
6. Leave `research_notes` blank or add a brief note if something is unusual.

**Do not add or change `program_import_key` values.** If a program is missing from the template, it is not yet in the catalog — flag it separately.

---

## DB schema reference

The seeder writes to these tables. The `import_key` column is the stable join key.

```sql
-- Programs
sc_college_programs (
  id           VARCHAR(36)  PRIMARY KEY,   -- randomUUID() at seed time
  import_key   VARCHAR(128) UNIQUE,        -- stable identifier; matches import_key in JSON
  institution  VARCHAR(255),
  short_name   VARCHAR(128),
  gender       VARCHAR(8),                 -- 'mens' | 'womens'
  division     VARCHAR(32),
  conference   VARCHAR(128),
  city         VARCHAR(128),
  state        VARCHAR(64),
  regions      VARCHAR(512),               -- comma-separated region slugs
  program_url  VARCHAR(512),
  staff_url    VARCHAR(512),
  checked_date VARCHAR(16),
  source_url   VARCHAR(512),
  active       TINYINT(1) DEFAULT 1,
  created_at   TIMESTAMP,
  updated_at   TIMESTAMP
)

-- Coaches
sc_college_coaches (
  id                VARCHAR(36)  PRIMARY KEY,   -- randomUUID() at seed time
  import_key        VARCHAR(128) UNIQUE,        -- stable identifier
  program_id        VARCHAR(36),                -- FK → sc_college_programs.id
  name              VARCHAR(255),
  role              VARCHAR(128),
  email             VARCHAR(255),
  email_is_personal TINYINT(1),
  phone             VARCHAR(64),
  staff_page_url    VARCHAR(512),
  checked_date      VARCHAR(16),
  source_url        VARCHAR(512),
  active            TINYINT(1) DEFAULT 1,
  created_at        TIMESTAMP,
  updated_at        TIMESTAMP
)
```

**To attach a coach record to a program after seeding:**
```sql
SELECT id FROM sc_college_programs WHERE import_key = 'cu-boulder-womens';
-- Use that id as program_id when inserting the coach row.
```

The seeder resolves `programImportKey → program_id` automatically during the seed run, so you do not need to look up IDs manually when using the import template.

---

*Export generated by `scripts/export-recruiting-catalog.py` on 2026-10-25.*  
*Source files: `src/data/recruiting/college-programs.json` (165 records), `src/data/recruiting/college-coaches.json` (63 records).*
