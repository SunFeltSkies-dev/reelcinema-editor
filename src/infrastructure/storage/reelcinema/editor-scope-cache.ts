/**
 * Editor-scope OPFS cache factory (SC-I-1).
 *
 * The Path B iframe integration places the editor at the `/editor/`
 * same-origin subpath inside ReelCinema. Under that boundary, the
 * editor's OPFS storage gets its own namespace so it cannot collide
 * with the host page's OPFS subtree (which may grow its own caches
 * for cast/cinematography/storyboard surfaces, sharing the same
 * origin's `navigator.storage.getDirectory()` root).
 *
 * Layout under `navigator.storage.getDirectory()`:
 *   editor/
 *     projects/
 *       {projectId}/
 *         cache/
 *           assets/                ← OpfsAssetCache (proxy/master/thumbnail)
 *             {assetId}/...
 *           derived/               ← OpfsDerivedCache namespaces
 *             {namespace}/...
 *
 * Per A24 (client-side processing canonical) + A25.1 (workspace-fs
 * File System Access API replaced; OPFS becomes primary client-side
 * persistence), this is the canonical client-side cache scope for the
 * iframe. Source-of-truth bytes live on B2 (per A13 hybrid storage);
 * OPFS is cache-only, so eviction is safe at any time — a cache miss
 * falls through to a B2 fetch via signed URL.
 *
 * The default (`reelcinema/assets/...`, `reelcinema/derived/...`)
 * cache layout still works for callers that don't pass project scope;
 * this module is purely additive.
 */

import {
  OpfsAssetCache,
  type CacheEntryMeta,
  type OpfsCacheConfig,
} from './opfs-cache'
import { OpfsDerivedCache, type OpfsDerivedCacheConfig } from './opfs-derived-cache'

export type { CacheEntryMeta }

const EDITOR_ROOT_SEGMENT = 'editor'
const PROJECTS_SEGMENT = 'projects'
const CACHE_SEGMENT = 'cache'
const ASSETS_SEGMENT = 'assets'
const DERIVED_SEGMENT = 'derived'

/**
 * Returns the OPFS path segments for an editor-scope project's cache
 * root: `editor/projects/{projectId}/cache`. Exposed for tests +
 * advanced callers that want to walk the editor subtree directly
 * (e.g., a "clear all cache for project X" surface).
 */
export function editorScopeProjectCacheRoot(projectId: string): readonly string[] {
  return [EDITOR_ROOT_SEGMENT, PROJECTS_SEGMENT, projectId, CACHE_SEGMENT]
}

/**
 * Returns the OPFS path segments for the editor-scope assets cache
 * for a given project: `editor/projects/{projectId}/cache/assets`.
 */
export function editorScopeAssetCachePath(projectId: string): readonly string[] {
  return [...editorScopeProjectCacheRoot(projectId), ASSETS_SEGMENT]
}

/**
 * Returns the OPFS path segments for the editor-scope derived cache
 * parent for a given project:
 * `editor/projects/{projectId}/cache/derived`. Sibling namespaces
 * live under this parent.
 */
export function editorScopeDerivedCacheParent(projectId: string): readonly string[] {
  return [...editorScopeProjectCacheRoot(projectId), DERIVED_SEGMENT]
}

/**
 * Constructs an `OpfsAssetCache` rooted at the editor-scope assets
 * subtree for the given project. Behaves exactly like the canonical
 * `OpfsAssetCache` (read/write/invalidate/LRU eviction primitives
 * preserved); only the OPFS root path differs.
 */
export function createEditorScopeAssetCache(
  projectId: string,
  config: Omit<OpfsCacheConfig, 'rootPath'> = {},
): OpfsAssetCache {
  return new OpfsAssetCache({
    ...config,
    rootPath: editorScopeAssetCachePath(projectId),
  })
}

/**
 * Constructs an `OpfsDerivedCache` rooted at the editor-scope derived
 * subtree for the given project + namespace. Behaves exactly like the
 * canonical `OpfsDerivedCache` (read/write/invalidate/LRU eviction
 * per-namespace primitives preserved); only the OPFS parent path
 * differs.
 *
 * Example: `createEditorScopeDerivedCache(projectId, 'waveforms')`
 * resolves to `editor/projects/{projectId}/cache/derived/waveforms/...`.
 */
export function createEditorScopeDerivedCache(
  projectId: string,
  namespace: string,
  config: Omit<OpfsDerivedCacheConfig, 'namespace' | 'parentPath'> = {},
): OpfsDerivedCache {
  return new OpfsDerivedCache({
    ...config,
    namespace,
    parentPath: editorScopeDerivedCacheParent(projectId),
  })
}
