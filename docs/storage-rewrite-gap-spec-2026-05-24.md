# Storage rewrite — workspace-fs retire gap spec (SC-3.f Part 2)

**Author:** CC7 (FreeCut fork worker, ReelCinema parallel-CC)
**Date:** 2026-05-24
**Scope:** Three workspace-fs modules NOT retired in SC-3.f because
their consumer surfaces are larger than a clean bridge-swap can cover
in one chunk, AND because each has either a missing backbone endpoint
or a semantic mismatch with the backbone model that needs a decision
before retire can ship.

**What this doc is:** the *shape* of the missing pieces — endpoint
surfaces, semantic clarifications, and priority ordering — so the
coordinator (CC4) can route to ReelCinema backend work (CC8) and to
Architect-Claude / operator for decisions on the semantic-mismatch
items. It is NOT an implementation spec; it does not name fields,
column types, or backbone routing rules. Those belong to CC8.

**What this doc is NOT:** a proposal to ship any of the three retires
"lightly." If the backbone gaps below don't resolve cleanly, the
workspace-fs modules in question stay in place behind their barrel
re-exports and the SC-3.x series moves on without them.

---

## Per-module gap inventory

### 1. `workspace-fs/media` (198 lines, ~56 consumer files)

**Public surface today** (barrel-re-exported from
`@/infrastructure/storage`):

| Function | Signature (essence) | Direct workspace-fs role |
|---|---|---|
| `getAllMedia` | `() → Promise<MediaMetadata[]>` | Scans `media/` dirs, restores `FileSystemFileHandle` per row |
| `getMedia` | `(id) → Promise<MediaMetadata \| undefined>` | Single read + handle restore |
| `createMedia` | `(MediaMetadata) → Promise<MediaMetadata>` | Stash handle in handles-db, write `metadata.json` |
| `updateMedia` | `(id, Partial<MediaMetadata>) → Promise<MediaMetadata>` | Read-merge-write with handle restash |
| `deleteMedia` | `(id) → Promise<void>` | Remove media dir + drop handles-db entry |
| `validateMediaHandle` | `(id) → Promise<MediaHandleValidation>` | Stat the `FileSystemFileHandle` against last-seen size/mtime |

**Bridge coverage today:** `reelcinema/asset-bridge.ts` +
`reelcinema/use-asset.ts` + `reelcinema/use-imported-asset.ts` already
deliver the read-one path for backbone-sourced assets via
`ImportedAsset`. `BackboneClient.getAsset(id)` exists. No
list/create/update/delete/validate analogs.

**Gaps:**

- **Read-list gap.** `getAllMedia` returns workspace-global media;
  the backbone analog is *per-project* (`asset.project_id` mandatory
  on the backbone row). `listAssets({projectId})` exists on
  `BackboneClient` but exposes `Asset[]`, not `ImportedAsset[]`. Closest
  equivalent of "all media" at the backbone surface is
  `getProjectLibrary(projectId)` — which is project-scoped by design.
  Decision needed: does the FreeCut "all media" surface (which today
  shows the user's entire workspace) get retargeted to per-project on
  the ReelCinema editor (i.e. the library panel only shows the current
  project's assets, period)? If yes, the gap closes by mapping
  `getAllMedia()` → `getProjectLibrary(currentProjectId).assets`. If
  no (some surface really wants cross-project), CC8 needs a
  cross-project endpoint surface.

- **Write-path gap.** No `POST /api/assets`, `PATCH /api/assets/{id}`,
  or `DELETE /api/assets/{id}` analog on `BackboneClient`. FreeCut's
  upload + edit + delete consumers (settings dialog, media panel,
  delete-media flow) have no destination. Whether that destination
  needs to exist for the iframe in V1 at all is a separate question
  (see V1-relevance note below).

- **`validateMediaHandle` semantic mismatch (no port path).** This
  function asks "is the user's file still where it was on disk?" That
  question doesn't apply when bytes live on B2 (B2 *is* the durable
  surface; the answer is always "ok" modulo network errors).
  `MediaHandleValidation`'s `permission` / `missing` / `changed`
  variants are FileSystem-Access-API-shaped concepts that do not
  translate. Decision needed: do all `validateMediaHandle` callers
  collapse to a no-op on the ReelCinema editor (because the iframe
  doesn't import user files at all), or does the iframe still own a
  user-import surface in V1 (in which case workspace-fs/media stays
  for that flow and only the backbone-sourced read path layers on top
  via `ImportedAsset`)?

- **`MediaMetadata` field-set asymmetry.** ~100 fields including
  `fileHandle`, `contentHash`, `keyframeTimestamps`, `gopIntervals`,
  decoded preview audio paths, AI caption envelopes, embedding cache
  refs. None of these live on the backbone `Asset` row, and the
  `asset-bridge.ts` comments call this out explicitly. Two posture
  options at the read surface: (a) `ImportedAsset` stays narrow and
  consumers that need richer fields keep a parallel
  workspace-fs-derived `MediaMetadata` for those concerns; or (b) the
  backbone `Asset` row grows to carry the durable subset (mime,
  duration, dimensions, content hash) so `ImportedAsset` widens. The
  asset-bridge note already pre-stakes posture (a). Confirm at
  Architect level before deciding whether
  `workspace-fs/media.getAllMedia` retire is even on the table.

**V1-relevance asymmetry:** the iframe's V1 surface is **edit a
project that already has assets** (ReelCinema concept/cast/cinematography
upstream pages produced them). Upload-new-media-from-iframe is likely
not in V1 at all — uploads happen on the ReelCinema host pages, not
inside the editor. If that's confirmed, the entire write-path gap
(`createMedia` / `updateMedia` / `deleteMedia`) becomes "no port
needed in V1" and only the read path needs a clean retire story.

---

### 2. `workspace-fs/projects` (218 lines, ~46 consumer files)

**Public surface today** (barrel-re-exported from
`@/infrastructure/storage`):

| Function | Signature (essence) | Direct workspace-fs role |
|---|---|---|
| `getAllProjects` | `() → Promise<Project[]>` | Read workspace index, restore `rootFolderHandle` per row |
| `getProject` | `(id) → Promise<Project \| undefined>` | Read `project.json`, restore handle, skip-if-trashed |
| `createProject` | `(Project) → Promise<Project>` | Write `project.json`, stash handle, refresh index under key-lock |
| `updateProject` | `(id, Partial<Project>) → Promise<Project>` | Read-merge-write + restash + refresh-index |
| `deleteProject` | `(id) → Promise<void>` | Remove project dir + drop handles-db entry + refresh index |
| `getDBStats` | `() → Promise<{projectCount, storageUsed, storageQuota}>` | `navigator.storage.estimate()` + index length |

**Bridge coverage today:** `reelcinema/project-bridge.ts` +
`reelcinema/use-project-library.ts` deliver the *library* read path
per project (`GET /api/projects/:id/library`). NO project-metadata
GET, list, create, update, or delete analog at the backbone API
surface. The bridge file's docstring already calls this out.

**Gaps:**

- **Project-metadata GET gap.** Backbone has a `Project` model row but
  no `GET /api/projects/{id}` or `GET /api/projects` endpoint. Only
  the nested resources (`/library`, `/stage`, `/cast`,
  `/notifications`) exist. A `getProject(id) → Project` analog at
  `BackboneClient` requires a CC8 endpoint addition. Question for
  decision: does the iframe ever need the project-row itself, or does
  it only need the nested resources? If only the nested resources are
  needed, the gap is "rename the bridge concept from 'project' to
  'project resources'" and `getAllProjects` / `getProject` / etc. just
  don't have analogs because they shouldn't.

- **Write-path gap.** No `POST /api/projects`, `PATCH /api/projects/{id}`,
  or `DELETE /api/projects/{id}` analog. Same V1-relevance question
  as media-write: ReelCinema project creation likely happens on the
  host pages (concept → story → cast); the iframe doesn't create
  projects. If confirmed, this whole gap is "no port needed in V1."

- **`getDBStats` semantic mismatch (no port path).** Browser storage
  quota is an OPFS / FileSystem Access API concept — it asks "how
  much of the user's browser quota are we using." That doesn't
  translate when the durable bytes are on B2 (which has its own
  quota, owned server-side). Decision needed: does the iframe surface
  a "storage" indicator at all on the ReelCinema editor? If yes, what
  does it count — local OPFS cache size, B2 usage attributed to the
  user, project count, all three? If no surface needs this, the
  function retires entirely.

- **Soft-delete + trash semantic question.** Workspace-fs has trash
  markers, restore, and a TTL-based sweep
  (`workspace-fs/trash.ts`). The backbone has approval states on
  `Asset` (approved / rejected / pending per the bridge type) but no
  soft-delete-restore-sweep pattern at the project level visible in
  the bridge surface. Decision needed at Architect level: does the
  iframe need a trash-like surface, or does delete-project on the
  ReelCinema editor delegate to the host pages' lifecycle? Open
  question, not blocking on SC-3.

**V1-relevance asymmetry:** strong. The iframe is "edit one project
at a time after the host page navigates to it." Cross-project
project-list (`getAllProjects`) is almost certainly host-page
territory in V1 and the iframe never needs it. If confirmed,
`getAllProjects`, `createProject`, `deleteProject`, `getDBStats`
become "no port needed in V1" and the retire conversation narrows
to `getProject` + `updateProject` for the one project the iframe is
currently editing.

---

### 3. `workspace-fs/project-media` (227 lines, ~22 consumer files)

**Public surface today** (barrel-re-exported from
`@/infrastructure/storage`):

| Function | Signature (essence) | Direct workspace-fs role |
|---|---|---|
| `associateMediaWithProject` | `(projectId, mediaId) → Promise<void>` | Append to per-project `media-links.json` under key-lock |
| `removeMediaFromProject` | `(projectId, mediaId) → Promise<void>` | Remove from `media-links.json` under key-lock |
| `getProjectMediaIds` | `(projectId) → Promise<string[]>` | Read `media-links.json` |
| `getProjectsUsingMedia` | `(mediaId) → Promise<string[]>` | Scan every project's `media-links.json` |
| `getMediaForProject` | `(projectId) → Promise<MediaMetadata[]>` | Read links, backfill from timeline references, prune orphans |
| `collectProjectTimelineMediaIds` | (not barrel-exported; helper for getMediaForProject) | Walk timeline + compositions for media-typed items |

**Bridge coverage today:** `reelcinema/project-bridge.ts` (via
`getProjectLibrary`) is the closest analog. `getMediaForProject` could
in principle delegate to `getProjectLibrary(projectId).assets` — IF
the semantic-mismatch question below resolves.

**Gaps:**

- **Many-to-many vs immutable-at-create mismatch (the central
  question).** workspace-fs allows a single media to be associated
  with multiple projects (a media `getProjectsUsingMedia(mediaId)`
  returns a list, plural). The backbone treats `asset.project_id` as a
  *single* foreign-key column — one asset belongs to one project,
  period. This is not a missing endpoint; it's a different data
  model. Two posture options at Architect level:

  - **Posture A: backbone single-project wins.** The iframe never
    associates one media with two projects; cross-project reuse goes
    through asset library promotion (the ReelCinema "Library actor"
    pattern from CLAUDE.md), where a library asset is *referenced
    by* multiple projects via a different relation (e.g. a join
    table or duplication on import). In this posture,
    `associateMediaWithProject` collapses to "asset creation already
    associated it; no-op." `removeMediaFromProject` collapses to
    "delete asset OR move asset to a different project (mutation
    of the immutable column requires a different endpoint)."
    `getProjectsUsingMedia(mediaId)` collapses to "always returns a
    single-element list of `[asset.project_id]`." `getMediaForProject`
    maps to `getProjectLibrary(projectId).assets`. workspace-fs/project-media
    retires fully.

  - **Posture B: backbone gets a many-to-many relation.** CC8 adds
    a join table or a `project_associations: string[]` field on the
    asset row, and a write-path endpoint to associate / dissociate.
    This is a real data-model change at the backbone, not a
    surface addition. It's outside the gap-spec's scope to propose.

  Strong recommendation that needs Architect adjudication: **Posture A
  is the better default** because it matches the ReelCinema mental
  model (the library-actor pattern explicitly separates "library asset
  reusable across projects" from "project-scoped asset"). The library
  asset is the reuse vehicle; ad-hoc cross-project association is not.
  But "default" is not "decided" — operator + Architect call.

- **Drift-repair semantic obsolescence.** `getMediaForProject`'s
  drift-repair (backfilling missing associations + pruning orphans)
  exists because workspace-fs splits the source-of-truth (associations
  in per-project link files; media in global media dir). The backbone
  doesn't have that split — `asset.project_id` IS the association,
  full stop, and a missing asset is just a missing row. Drift-repair
  has no port and no caller-visible analog; it disappears with the
  retire. Confirm Architect agreement on that posture (it follows from
  Posture A above).

- **Read-path mapping is clean given Posture A.**
  `getProjectMediaIds(projectId)` →
  `getProjectLibrary(projectId).assets.map(a => a.id)`.
  `getMediaForProject(projectId)` →
  `getProjectLibrary(projectId).assets`.
  Both are one-line wrappers and could ship in the same chunk as the
  retire decision.

**V1-relevance asymmetry:** moderate. The read path
(`getProjectMediaIds`, `getMediaForProject`) is alive in the V1
iframe surface — the library panel and scene browser both consume
it. The write path
(`associateMediaWithProject`, `removeMediaFromProject`) is mostly
upload-flow territory; if upload-from-iframe is out of V1 (see media
section above), the write path retires with it.

---

## Proposed backbone-side additions/clarifications (shape only)

These are the shape of the missing pieces — NOT implementation
proposals. CC8 owns the schema, field names, routing, validation, and
auth surface.

1. **Project-metadata GET endpoint.** Some equivalent of "give me the
   `Project` row for `id`." Needed only if the iframe ever consumes the
   project row directly (vs only its nested resources). Open question
   for Architect/CC8.

2. **Per-project asset list endpoint OR confirmation that
   `getProjectLibrary` already serves this role.** The bridge currently
   uses `getProjectLibrary` as the de-facto per-project listing. If
   that's the intended canonical role, document it as such; if there's
   a separate flatter listing endpoint intended, surface it.

3. **Single-project vs many-to-many adjudication for asset ⇄ project
   association.** Strong recommendation: Posture A (single-project,
   library-promotion handles cross-project reuse). Needs Architect
   sign-off because it foreclose Posture B and locks the bridge shape.

4. **`validateMediaHandle` adjudication.** Decide whether the iframe
   has any user-imported (workspace-fs-backed) media at all in V1, or
   whether all media in the iframe is backbone-sourced. Answer
   determines whether workspace-fs/media stays as a parallel surface
   for user imports OR retires fully.

5. **`getDBStats` adjudication.** Decide whether the iframe surfaces a
   storage indicator. Answer determines whether the function has a
   port (and what it counts) or retires.

None of items 1–5 are CC8 implementation tickets yet — they are
*decision requests* for Architect-Claude / operator, with CC8 as the
implementor downstream of each decision.

---

## Priority ordering recommendation

Ordered by retire-clarity (cleanest first):

1. **`project-media` retire (Posture A path).** Cleanest because the
   read path maps 1:1 to existing bridge surface and the
   drift-repair concern disappears with the data-model shift. Blocker:
   Architect sign-off on Posture A. If approved, retire ships in a
   single chunk roughly the same shape as SC-3.f Part 1
   (waveforms): new singleton wrapper that delegates
   `getProjectMediaIds` / `getMediaForProject` to
   `BackboneClient.getProjectLibrary`, write-path functions either
   no-op or throw "not in V1," workspace-fs files delete, barrel
   rewires. Estimated 1 chunk.

2. **`projects` retire (narrow scope: getProject + updateProject for
   the current project).** Requires backbone `GET /api/projects/{id}`
   + `PATCH /api/projects/{id}` analogs IF those surfaces are
   in-V1-iframe. If V1-relevance question resolves to "no, the iframe
   doesn't touch project metadata directly," this retires as
   write-and-list-disappear with no backbone endpoints needed.
   Estimated 1–2 chunks depending on V1-iframe scope decision.

3. **`media` retire.** Most consumers (~56) and biggest semantic
   surface (`validateMediaHandle`, `MediaMetadata` field-set
   asymmetry, write path). Likely needs at minimum: V1-iframe scope
   decision on user-imports, posture on `MediaMetadata` field-set
   asymmetry, and possibly backbone endpoint additions for any
   in-V1 write paths. Estimated 2–3 chunks.

This ordering assumes the SC-3 series continues. If the post-SC-3.f
default (SC-4: AI-lib strip) is the higher-leverage move, the
gap-spec sits as a queued artifact and SC-3.x picks back up after
SC-4 lands its blast-radius cleanly.

---

## Out of scope for this doc (explicit)

- Specific backbone schema proposals (column names, table names,
  validation rules). Those are CC8's call.
- Specific HTTP routing shapes (method + path conventions). CC8 +
  Architect-Claude's call.
- Auth-surface deltas (whether new endpoints need different
  permission posture than existing ones). Architect call.
- Implementation order at CC8 (this doc proposes the FreeCut-side
  retire order; CC8 plans its own backend work).
- Migration strategy for any data that needs to move from
  workspace-fs to backbone for existing FreeCut users (none in V1 —
  ReelCinema editor starts from backbone-only assets per A13).

---

## Coordination handoff

This doc is the deliverable that CC4 routes to operator /
Architect-Claude for the five decision-requests above. Once those
decisions land, the gap converts to concrete retire chunks (or to
"no retire — workspace-fs/X stays as a parallel surface in V1") and
the SC-3 series can either continue with them or hand off to SC-4
and pick the rewires up later.

— CC7
