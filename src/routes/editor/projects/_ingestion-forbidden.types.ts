/**
 * A32 iframe ingestion invariant — type-level sentinel.
 *
 * Per DECISIONS A32 (derivation-vs-ingestion architectural boundary), the V1
 * iframe entry route (`./$projectId.tsx`) is forbidden from importing or
 * transitively reaching:
 *   - `@/features/media-library`  — ingestion: drag-and-drop file upload,
 *                                   "Add Media" / "Upload" affordances.
 *   - `@/features/project-bundle` — ingestion: `.rcb` bundle import.
 *
 * Asset creation in V1 iframe is derivation-only (freeze-frame extraction,
 * WebCodecs export). Ingestion re-enables in V1.x when the content moderation
 * pipeline ships (A32.6).
 *
 * The runtime import-graph guard at `__tests__/a32-ingestion-invariant.test.ts`
 * is the load-bearing enforcement. This file is the declarative type-level
 * partner: the `IframeForbidden<T>` mapping resolves any module surface
 * routed through it to `never`, surfacing the invariant in type-checks.
 *
 * Documentation-only module. Production code does not import from here.
 */

import type * as MediaLibraryModule from '@/features/media-library'
import type * as ProjectBundleModule from '@/features/project-bundle'

/**
 * Type-level "never" mapping. Any module type routed through this resolves
 * to `never` — assigning a non-`never` value to it fails type-checking.
 */
export type IframeForbidden<_T> = never

/** Sentinel: iframe-reachable code must not use media-library module surface. */
export type IframeForbiddenMediaLibrary = IframeForbidden<typeof MediaLibraryModule>

/** Sentinel: iframe-reachable code must not use project-bundle module surface. */
export type IframeForbiddenProjectBundle = IframeForbidden<typeof ProjectBundleModule>
