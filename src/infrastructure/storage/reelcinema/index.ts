/**
 * ReelCinema storage adapter (SC-3.a foundation).
 *
 * Replaces the workspace-fs source-of-truth with a hybrid model per A13:
 *   - Postgres (project, timeline, edit history) via backbone API
 *   - B2 (asset master + proxy + thumbnail blobs) via signed URLs
 *   - OPFS (proxy/master cache) for scrub/preview performance
 *
 * Subsequent SC-3 sub-chunks rewire the workspace-fs modules to flow
 * through this package. SC-3.a leaves workspace-fs intact — pure
 * addition.
 */

export { BackboneClient } from './backbone-client'
export { OpfsAssetCache } from './opfs-cache'
export type { OpfsCacheConfig, CacheEntryMeta } from './opfs-cache'
export { useAsset } from './use-asset'
export type { UseAssetOptions, UseAssetResult } from './use-asset'
export { assetToImportedAsset } from './asset-bridge'
export type { ImportedAsset } from './asset-bridge'
export { useImportedAsset } from './use-imported-asset'
export type { UseImportedAssetOptions, UseImportedAssetResult } from './use-imported-asset'
export { libraryToImportedProjectLibrary } from './project-bridge'
export type { ImportedProjectLibrary } from './project-bridge'
export { useProjectLibrary } from './use-project-library'
export type { UseProjectLibraryOptions, UseProjectLibraryResult } from './use-project-library'
export type {
  Asset,
  AssetApprovalState,
  AssetTarget,
  BackboneConfig,
  ProjectLibraryResponse,
  SignUrlRequest,
  SignedUrlResponse,
} from './types'
export { BackboneError } from './types'
