/**
 * Type bridge between the ReelCinema backbone `Asset` row and the
 * lean `ImportedAsset` shape ReelCinema needs at the playback edge.
 *
 * Why a bridge instead of a wholesale `MediaMetadata` replacement:
 *
 * ReelCinema's existing `MediaMetadata` (`@/types/storage`) carries 100+
 * fields that come from importing user-picked files at the filesystem
 * surface — `FileSystemFileHandle`, OPFS paths, content hashes, decoded
 * preview-audio paths, keyframe timestamp arrays, GOP intervals, AI
 * captions, embedding caches, and so on. Most of those fields are
 * artifacts of the workspace-fs model (origin-scoped file handles, lazy
 * blob mirrors, locally-derived analyses).
 *
 * Under A13 hybrid storage, assets come from the backbone API as
 * Postgres rows with B2 keys for proxy / master / thumbnail blobs.
 * There is no `FileSystemFileHandle` — the asset bytes live on B2 and
 * are fetched via signed URL. Locally derived analyses (waveforms, GIF
 * frames, decoded audio) live in OPFS as cache, not in the asset row.
 *
 * Mapping the whole `MediaMetadata` shape onto `Asset` would invent
 * fields that don't exist in the new model. Instead this bridge exposes
 * the *intersection*: the small set of fields that both worlds agree
 * on (id, URL, mime type, size). Consumers that need more (timeline
 * scrub, waveform, etc.) get it from sibling adapters (OPFS cache,
 * future `useAssetWaveform`, etc.), not from a synthetic
 * `MediaMetadata`.
 *
 * Direction of migration:
 *   Phase A — bridge sits alongside `MediaMetadata`. Backbone-sourced
 *             assets surface via `ImportedAsset`; workspace-fs imports
 *             stay on `MediaMetadata`. (this commit)
 *   Phase B — individual consumers rewire to `ImportedAsset` for
 *             backbone-sourced clips. (later SC-3.x chunks)
 *   Phase C — workspace-fs/media.ts retires; `MediaMetadata` either
 *             folds into `ImportedAsset` or stays narrow for legacy
 *             user-picked-file paths if those remain in V1.x. (SC-3.f)
 */

import type { Asset } from './types'

export interface ImportedAsset {
  /** Backbone asset row id. Stable across sessions. */
  id: string
  /** Backbone project id this asset belongs to. */
  projectId: string
  /** MIME type derived from B2 content-type (set at upload time). */
  mimeType: string
  /** Total bytes for the primary target (proxy unless overridden). */
  size?: number
  /** Display name — file name minus extension, or the asset id. */
  displayName: string
  /** ReelCinema asset type (`veo_take`, `user_upload`, etc.). */
  assetType: Asset['type']
  /** Available B2 targets keyed by name. `null` when the variant is unavailable. */
  targets: {
    proxy: string | null
    master: string | null
    thumbnail: string | null
  }
}

/**
 * Convert a backbone `Asset` row into the ReelCinema-facing `ImportedAsset`
 * shape. Pure function — no network, no cache interaction. The caller
 * is responsible for resolving signed URLs (via `useAsset` /
 * `BackboneClient.signAssetUrl`) when it actually needs to play bytes.
 */
export function assetToImportedAsset(asset: Asset): ImportedAsset {
  return {
    id: asset.id,
    projectId: asset.project_id,
    mimeType: inferMimeType(asset),
    size: undefined,
    displayName: deriveDisplayName(asset),
    assetType: asset.type,
    targets: {
      proxy: asset.proxy_b2_key,
      master: asset.master_b2_key,
      thumbnail: asset.thumbnail_b2_key,
    },
  }
}

/**
 * The backbone row doesn't carry mime explicitly — it's recovered from
 * the asset type, with a defensive fallback. veo_take and user_upload
 * are both video; thumbnail blobs carry image content. Tightening this
 * up requires CC8 to expose content-type on the Asset row; until then
 * the inference is good enough for the playback layer.
 */
function inferMimeType(asset: Asset): string {
  switch (asset.type) {
    case 'veo_take':
    case 'user_upload':
      return 'video/mp4'
    case 'nb2_anchor':
    case 'wardrobe_variant':
      return 'image/png'
    default:
      return 'application/octet-stream'
  }
}

function deriveDisplayName(asset: Asset): string {
  const sourceKey = asset.master_b2_key ?? asset.proxy_b2_key
  if (!sourceKey) return asset.id
  const tail = sourceKey.split('/').pop()
  if (!tail) return asset.id
  return tail.replace(/\.[^.]+$/, '')
}
