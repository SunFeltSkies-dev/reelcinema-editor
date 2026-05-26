/**
 * A32.2 iframe projects-forbidden invariant — type-level sentinel.
 *
 * Per DECISIONS A32.2 (KEEP/RETIRE table for workspace-fs surfaces), the
 * legacy `workspace-fs/projects` module retires from the iframe surface
 * area. The V1 iframe entry route (`./$projectId.tsx`) and any module it
 * transitively imports must not reach:
 *
 *   - `@/infrastructure/storage/workspace-fs/projects`
 *
 * Project metadata in the V1 iframe flows exclusively through
 * `BackboneClient` (`@/infrastructure/storage/reelcinema`) over HTTP;
 * cross-project listing, project creation, project deletion, and DB
 * statistics are host territory (A32.2 + D1 + D5 ratifications
 * 2026-05-26). The iframe receives only `projectId: string` and resolves
 * downstream state via Backbone.
 *
 * Mechanism mirrors SC-I-1b.1's ingestion sentinel (see
 * `./_ingestion-forbidden.types.ts`):
 *
 *   - Runtime: `__tests__/projects-iframe-forbidden-invariant.test.ts`
 *     walks the transitive import graph from the iframe entry route
 *     and fails on the forbidden specifier.
 *   - Type-level: `IframeForbiddenWorkspaceFsProjects` resolves to
 *     `never`; the same test uses `@ts-expect-error` to prove the
 *     type system rejects iframe consumption of that module surface.
 *
 * Documentation-only module. Production code does not import from here.
 */

import type * as WorkspaceFsProjectsModule from '@/infrastructure/storage/workspace-fs/projects'

/**
 * Type-level "never" mapping. Any module type routed through this resolves
 * to `never` — assigning a non-`never` value to it fails type-checking.
 */
export type IframeForbidden<_T> = never

/** Sentinel: iframe-reachable code must not use workspace-fs/projects module surface. */
export type IframeForbiddenWorkspaceFsProjects = IframeForbidden<typeof WorkspaceFsProjectsModule>
