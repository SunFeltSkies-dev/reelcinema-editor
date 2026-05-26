# A32.2 iframe projects-forbidden invariant

**Status:** Active (V1)
**Authority:** DECISIONS A32.2 — workspace-fs KEEP/RETIRE table + gap-spec D1 + D5 (ratified 2026-05-26)
**Chunk artifact:** SC-I-1b.2 (ratified Option (a) 2026-05-26)
**Re-enablement:** Not applicable — workspace-fs/projects retires permanently from the V1 iframe surface. Project metadata, listing, creation, and deletion remain host-only by design.

## Invariant

The V1 editor iframe entry route — `src/routes/editor/projects/$projectId.tsx`
— and **any module it transitively imports** must not reach:

- `@/infrastructure/storage/workspace-fs/projects`

That module's surface (`getAllProjects`, `getProject`, `createProject`,
`updateProject`, `deleteProject`, `getDBStats`, plus trash-related
helpers) belongs to the legacy non-iframe editor and the classic-editor
routes. The V1 iframe receives only `projectId: string` as input and
resolves all downstream state through `BackboneClient` over HTTP.

## What V1 iframe is allowed to do (project metadata)

| Surface | Module path | Purpose |
|---|---|---|
| HTTP project resolution | `src/infrastructure/storage/reelcinema/BackboneClient` | Resolve project rows, asset listings, and library state via Backbone |
| Path B postMessage auth | `src/infrastructure/iframe-bridge/auth-context-receiver.ts` | Receive bearer + organization context from host (SC-I-3) |
| Host shell snapshot | `src/infrastructure/iframe-bridge/iframe-app-shell.ts` | Read host-pushed auth context for `BackboneClient` |

The iframe entry route accepts a `projectId` URL parameter, hands it to
`EditorialBin` and `PersonaSurface`, and lets those features resolve
metadata via Backbone. No fork-side project store, no cross-project
list, no project-creation affordance.

## Why this exists

Per gap-spec adjudication 2026-05-26:

- **D1 (Path B postMessage project metadata):** host-pushes pattern
  ratified, but CC7 PFV revealed the V1 iframe needs no project
  metadata beyond what `BackboneClient` already returns. The postMessage
  `host:project_metadata` registry expansion is moot in V1; no fork-side
  consumer to push to.
- **D5 (`getDBStats` retire):** no V1 storage indicator surface;
  ReelCinema billing is credit-based (A26), not storage-based.
- **A32.2 KEEP/RETIRE:** `workspace-fs/media` and
  `workspace-fs/project-media` STAY as derivation backing store;
  `workspace-fs/projects` RETIRES from the iframe surface area.

CC7 PFV (Pattern #14 amendment #3 anticipatory) confirmed zero iframe
consumers of `workspace-fs/projects.ts` from the iframe entry's
transitive graph. The invariant pins that reality and prevents drift.

The classic-editor route (`src/features/editor/`, non-iframe entry) is
*not* in scope of this invariant. Classic-editor consumers of
`workspace-fs/projects` are deferred to a separate sunset brief
(V1.x territory; CC7 PFV inventory of 12 direct consumers + 3 tests
captured for that future brief).

## Dual-layer enforcement

### Layer 1 — Runtime import-graph guard

`src/routes/editor/projects/__tests__/projects-iframe-forbidden-invariant.test.ts`
walks the transitive import graph starting from `$projectId.tsx`,
parses import specifiers, and fails if `@/infrastructure/storage/workspace-fs/projects`
appears in the reachable graph.

This is the **load-bearing enforcement**. Any direct or transitive import
of the forbidden specifier from the iframe entry's reachable surface
fails the test.

### Layer 2 — Type-level sentinel

`src/routes/editor/projects/_projects-forbidden.types.ts` declares the
`IframeForbiddenWorkspaceFsProjects` type alias that resolves to `never`
(via the `IframeForbidden<T>` mapping).

The runtime test also includes a `@ts-expect-error` assertion confirming
that assigning a non-`never` value to this sentinel fails type-checking.
If the `IframeForbidden<T> = never` mapping is ever removed or weakened,
the `@ts-expect-error` directive inverts and the test breaks.

This layer is **declarative**; it does not block file-level imports by
itself. Its purpose is to make the invariant visible at the type-system
level for tooling and code review.

## Relationship to SC-I-1b.1

This invariant is the **mechanical mirror** of SC-I-1b.1 (the A32
ingestion invariant). Both close iframe-boundary questions via the same
dual-layer substrate; the architectural grounding differs:

- **SC-I-1b.1 (A32):** ingestion surfaces (file upload, `.rcb` import)
  are forbidden because V1 lacks the content moderation pipeline (A32.6).
- **SC-I-1b.2 (A32.2):** `workspace-fs/projects` is forbidden because
  project metadata management is host territory (A32.2 KEEP/RETIRE);
  V1 iframe is single-project-scoped via `projectId` URL parameter.

The two invariants are independent but share the same enforcement
mechanism. The sentinel files and test files remain separate (one per
invariant) so each ratification is auditable in isolation.

## No re-enablement path

Unlike the A32 ingestion invariant, this boundary is not gated on a
future pipeline. `workspace-fs/projects` retires permanently from the
iframe surface. If a future V1.x feature requires project metadata
beyond what `BackboneClient` already exposes, the canonical path is to
extend `BackboneClient` or add a new postMessage type per the protocol
registry — never to re-import `workspace-fs/projects` into the iframe
graph.

## Classic-editor disposition

CC7 PFV inventoried 12 direct consumers + 3 tests of `workspace-fs/projects`
in classic-editor surfaces. Those consumers are out of scope for this
invariant; their sunset (or migration to `BackboneClient`) is a separate
brief in V1.x territory. The invariant applies only to the iframe entry
route's transitive graph, so classic-editor compile paths remain intact.

## Related decisions

- **A27** — fork-side merges remain operator-gated
- **A32** — derivation-vs-ingestion architectural boundary (sibling
  invariant; ingestion forbidden surfaces)
- **A32.1** — Freeze-frame extraction is the canonical derivation
  pattern for V1 iframe
- **A32.2** — workspace-fs KEEP/RETIRE table (this invariant's grounding)
- **D1 (2026-05-26 gap-spec)** — Path B host-pushes project metadata
  via postMessage; CC7 PFV showed not needed in V1
- **D5 (2026-05-26 gap-spec)** — `getDBStats` retires; no storage
  indicator V1 (A26 credit-based billing)

## Pattern #14 amendment #3 substantiation

SC-I-1b.2 is the second SC-I-1b series chunk to close via "the gap
doesn't exist in V1 because iframe doesn't reach this surface" (after
SC-I-1b.1 REFRAMED). CC7 PFV-against-shipped-reality codified the
invariant the discovery surfaced; the architect-Claude V6 ratification
2026-05-26 ratified Option (a) — invariant-only — as the canonical
closure.
