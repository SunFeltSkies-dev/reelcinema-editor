# A32 iframe ingestion invariant

**Status:** Active (V1)
**Authority:** DECISIONS A32 — derivation-vs-ingestion architectural boundary
**Chunk artifact:** SC-I-1b.1 (REFRAMED, ratified Option (a) 2026-05-26)
**Re-enablement:** V1.x — gated on content moderation pipeline (A32.6)

## Invariant

The V1 editor iframe entry route — `src/routes/editor/projects/$projectId.tsx`
— and **any module it transitively imports** must not reach:

- `@/features/media-library`
- `@/features/project-bundle`

These modules carry **ingestion surfaces** (file drag-and-drop, "Add Media" /
"Upload" affordances, `.rcb` bundle import). V1 does not expose ingestion in
the iframe; only **derivation** asset creation is supported.

## What V1 iframe is allowed to do (derivation)

| Surface | Module path | Purpose |
|---|---|---|
| Freeze-frame extraction | `src/features/timeline/stores/actions/edit/freeze-frame-actions.ts` | Derive a still asset from the current playhead (A32.1) |
| WebCodecs export | export pipelines | Derive a new clip asset from existing assembly (A25.5) |
| Asset listing / signed-URL fetch | `@/infrastructure/storage/reelcinema/BackboneClient` | Read-only consumption of existing assets via Backbone |

Note: freeze-frame and WebCodecs derivation paths currently use
`@/infrastructure/storage` (workspace-fs/media) as their backing store. The
iframe entry route does not directly import those modules; they are reached
only through the timeline / preview feature surfaces. The invariant covers the
*entry route's* transitive graph — derivation paths are reachable from
timeline features but not directly from the iframe route shell.

## Why this exists

A32 establishes the iframe content-safety boundary before V1 launch. Asset
ingestion (user-supplied files entering the system) requires content
moderation review per the operator's policy. Until V1.x ships that pipeline,
the iframe is **derivation-only** by construction.

The classic-editor route (`src/features/editor/`, non-iframe entry) is *not*
in scope of this invariant. A32's scope is iframe per the operator scope
ruling 2026-05-26 (see escalation `escalation_sc_i_1b_1_REFRAMED_brief_vs_shipped_drift_2026-05-26.md`).
Classic-editor surfaces may still expose ingestion affordances; that's a
separate architectural question outside SC-I-1b.1.

## Dual-layer enforcement

### Layer 1 — Runtime import-graph guard

`src/routes/editor/projects/__tests__/a32-ingestion-invariant.test.ts`
walks the transitive import graph starting from `$projectId.tsx`, parses
import specifiers, and fails if any forbidden module path appears.

This is the **load-bearing enforcement**. Any direct or transitive import
of `@/features/media-library` or `@/features/project-bundle` from the
iframe entry's reachable surface fails the test.

### Layer 2 — Type-level sentinel

`src/routes/editor/projects/_ingestion-forbidden.types.ts` declares
`IframeForbiddenMediaLibrary` and `IframeForbiddenProjectBundle` type
aliases that resolve to `never` (via the `IframeForbidden<T>` mapping).

The runtime test also includes `@ts-expect-error` assertions confirming
that assigning a non-`never` value to these sentinels fails type-checking.
If the `IframeForbidden<T> = never` mapping is ever removed or weakened,
the `@ts-expect-error` directives invert and the test breaks.

This layer is **declarative**; it does not block file-level imports by
itself. Its purpose is to make the invariant visible at the type-system
level for tooling and code review.

## Re-enablement path

When the V1.x content moderation pipeline ships (see V2_ROADMAP "Content
Moderation Pipeline" entry):

1. A32.6 ratifies ingestion re-enablement for iframe surface.
2. The `IframeForbidden<T>` sentinels can be relaxed or scoped narrower
   to specific module surfaces still requiring moderation gating.
3. The runtime import-graph guard list is updated to reflect the
   narrower forbidden set.
4. Iframe-reachable code may then re-import the appropriate
   media-library / project-bundle entry points behind the moderation
   gate.

Until then: any attempt to add ingestion UI to V1 iframe surface
violates A32 and breaks the runtime guard test.

## Related decisions

- **A25.5** — WebCodecs export is derivation; preserved in V1
- **A27.1.3** — CC4 autonomous routing for routine in-scope dispatches
- **A30 / A31** — Single-FK asset⇄project ownership model
- **A32.1** — Freeze-frame extraction is the canonical derivation
  pattern for V1 iframe
- **A32.2** — workspace-fs/media + workspace-fs/project-media STAY as
  derivation backing store
- **A32.5** — Iframe ingestion surface removal (this chunk's NEW SCOPE
  per the REFRAMED brief; closed via Option (a) docs-only + guard)

## Pattern #14 amendment #3 substantiation

SC-I-1b.1 evolved through two PFV cycles before landing in this final
shape:

1. **Original SC-I-1b.1** — workspace-fs/project-media retire. Reverted
   after A32 landed (A32.2 preserved workspace-fs/* as derivation
   backing store). Bridge code preserved in git reflog.
2. **REFRAMED SC-I-1b.1** — iframe ingestion surface removal. Halted
   on PFV when brief's removal targets were found not present on
   shipped V1 iframe. Ratified Option (a) docs + guard.
3. **Final shape (this doc + guard tests)** — the discovery itself is
   the artifact: PFV-against-shipped-reality codified the invariant
   that the V1 iframe is ingestion-free by construction.

Architect-Claude V5 codified Pattern #14 amendment #3 (verify
architectural-intent-vs-shipped-reality before drafting multi-module
work briefs) as a result of this chunk's discovery arc.
