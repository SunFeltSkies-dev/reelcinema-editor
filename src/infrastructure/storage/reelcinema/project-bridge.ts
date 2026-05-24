/**
 * Project-library bridge — translates the backbone
 * `GET /api/projects/:id/library` response into the lean
 * `ImportedProjectLibrary` shape ReelCinema consumes on the library /
 * project-media surface.
 *
 * Mirrors the SC-3.b bridge pattern: a pure converter that exposes the
 * honest intersection between backbone reality and ReelCinema consumer
 * expectations. Read-only — write-path association is implicit in asset
 * creation on the backbone (`asset.project_id` is set at POST time;
 * there is no separate "associate-media-with-project" surface needed).
 *
 * Why bridge instead of wholesale workspace-fs/projects + project-media
 * swap (same shape of scope-honesty note as SC-3.b):
 *
 * - workspace-fs/projects.ts manages `FileSystemDirectoryHandle` lifecycle,
 *   `rootFolderHandle` registry stash/restore, trash markers, and an
 *   index.json rebuild under a key-lock — none of which has a backbone
 *   analog (the backbone treats projects as Postgres rows with no
 *   filesystem-handle dimension at all).
 *
 * - workspace-fs/project-media.ts maintains `media-links.json` per project
 *   with drift-repair (backfilling missing associations + pruning
 *   orphans) — drift exists because the workspace-fs source-of-truth is
 *   split across project dirs and a global media dir. The backbone
 *   doesn't have that split: `asset.project_id` IS the association, full
 *   stop. The bridge therefore exposes the read path; there is no
 *   drift-repair to port because there is no drift to repair.
 *
 * - workspace-fs/projects.ts exposes project-metadata reads
 *   (`getProject`, `getAllProjects`, `getDBStats`). The backbone has a
 *   `Project` model row but NO `GET /api/projects/:id` endpoint
 *   currently — only library/stage/cast/notifications nested resources.
 *   Project-metadata bridging therefore waits on a CC8 endpoint
 *   addition; it's out of scope for this chunk.
 *
 * What this chunk DOES deliver: the library read surface that
 * library-panel / project-media-list consumers will adopt during
 * SC-3.d-f rewires.
 */

import type { Asset, ProjectLibraryResponse } from './types'
import { assetToImportedAsset, type ImportedAsset } from './asset-bridge'

/**
 * Project library state as ReelCinema consumes it. Flat `assets` list +
 * pre-grouped `assetsByType` for surfaces that switch on category.
 *
 * `total` mirrors the backbone count so callers can sanity-check that
 * grouping/flattening didn't drop rows.
 */
export interface ImportedProjectLibrary {
  projectId: string
  assets: ImportedAsset[]
  assetsByType: Record<string, ImportedAsset[]>
  total: number
}

/**
 * Pure converter — no network, no cache. Translates a backbone
 * `ProjectLibraryResponse` into the `ImportedProjectLibrary` shape.
 *
 * Each `Asset` row is run through `assetToImportedAsset` so consumers
 * get a uniform `ImportedAsset` everywhere whether they reach assets via
 * single-id (`useImportedAsset`) or via project listing (this bridge).
 */
export function libraryToImportedProjectLibrary(
  response: ProjectLibraryResponse,
): ImportedProjectLibrary {
  const assetsByType: Record<string, ImportedAsset[]> = {}
  const assets: ImportedAsset[] = []
  for (const [type, rows] of Object.entries(response.assets_by_type)) {
    const converted = rows.map((row: Asset) => assetToImportedAsset(row))
    assetsByType[type] = converted
    assets.push(...converted)
  }
  return {
    projectId: response.project_id,
    assets,
    assetsByType,
    total: response.total,
  }
}
