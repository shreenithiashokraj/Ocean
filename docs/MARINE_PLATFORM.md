# Marine AI-Driven Unified Data Platform

> Additive, feature-flagged extension for the existing Fisherman Module.
> This document is **new and separate** — the existing `README.md` is untouched.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Foundation: flags, schema (13 new tables), audit, embargo, `/api/marine/status` | **in progress** |
| 2 | Ingestion & QA/QC (CSV/JSON/FASTA/FASTQ full; NetCDF/HDF5/BAM/VCF metadata-level) | planned |
| 3 | Search (`SearchProvider`) & AI/Analytics (`SequenceMatcher`, registry, explainability) | planned |
| 4 | Frontend views & nav wiring (RESEARCHER/ADMIN only) | planned |

## Enabling / Disabling

The platform is **disabled by default**. Enable it by adding to `.env`:

```
MARINE_PLATFORM_ENABLED=true
```

Individual capabilities can be disabled without turning off the whole platform
(all default to *on* when the master flag is set):

```
MARINE_ENABLE_INGEST=true|false
MARINE_ENABLE_SEARCH=true|false
MARINE_ENABLE_AI=true|false
MARINE_ENABLE_WORKSPACES=true|false
MARINE_ENABLE_ANNOTATIONS=true|false
MARINE_ENABLE_AUDIT=true|false
MARINE_ENABLE_EXTERNAL_API=true|false
```

When disabled, every `/api/marine/*` route (except `/api/marine/status`,
which reports the flag state) answers **503** with
`{"error": "...", "marinePlatform": "disabled"}`, and the frontend nav items
are hidden. No existing route, table or component is affected in either state.

## Roles

Marine features are restricted to **RESEARCHER** and **ADMIN**. FISHERMAN has
no access at this stage (by decision).

## New database tables (additive only)

`MarineIngestionJob`, `MarineRecord`, `MarineQcFinding`, `MarineMetadata`,
`MarineSearchIndex`, `MlModel`, `MlModelVersion`, `MlPrediction`,
`MarineAuditLog`, `MarineWorkspace`, `MarineWorkspaceMember`,
`MarineAnnotation`, `MarineEmbargo`.

The full reviewable SQL lives in `prisma/marine-platform-additive.sql`
(generated with `prisma migrate diff` against the pre-marine schema snapshot
`prisma/schema.prisma.pre-marine.bak`). It contains **only `CREATE TABLE` and
`CREATE INDEX` statements — zero `DROP`, zero `ALTER`, zero updates to any
existing table or column.**

⚠️ Pre-existing schema bug fixed additively: `ResearchDataset`/`ResearchDocument`
referenced `User` without the opposite relation fields on `User`, which made
`prisma validate` / `prisma db push` fail on this repo *before* any marine
change. The two missing declarations (`researchDatasets`, `researchDocuments`)
were appended to the `User` model. This is declarative-only — the SQL diff
confirms it produces **no** change to the `User` table itself.

## API namespace

```
GET /api/marine/status     → flag state (always answers, no DB, no auth)
```

Further namespaces arrive in Phases 2–4 (`/api/marine/ingest/*`,
`/api/marine/records/*`, `/api/marine/search/*`, `/api/marine/ai/*`,
`/api/marine/workspaces/*`, `/api/marine/annotations/*`, `/api/marine/audit/*`,
and a versioned external surface `/api/marine/v1/*` with an OpenAPI spec).

## Tests

Node built-in runner, no new dependencies (dev server must be running):

```
node --test tests/marine/
```

`tests/marine/regression-baseline.test.mjs` asserts the existing auth and
researcher endpoints keep their exact contracts and that the marine flag
endpoint behaves as specified.

## Limitations (data honesty)

- Binary scientific formats (NetCDF/HDF5/BAM/VCF) will be ingested at
  **header/metadata level only** in Phase 2 — full binary parsing is out of
  scope for this stack (see Phase 2 section when it lands).
- Explainability outputs (Phase 3) are **statistical/heuristic feature
  importance**, explicitly **not** SHAP-derived; they will be labeled as such
  in every API response.
- The search index is a SQLite-backed provider implementation behind a
  `SearchProvider` interface — a real Elasticsearch/OpenSearch backend can be
  swapped in later without changing calling code. Same for `SequenceMatcher`
  (future BLAST integration).

## Rollback

See the *Rollback* section appended at the end of Phase 4 (flag off + table
drop script). Until then: remove `MARINE_PLATFORM_ENABLED` from `.env` and
restart — the platform goes dark with zero code changes.
