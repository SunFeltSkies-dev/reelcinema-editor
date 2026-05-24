/**
 * ReelCinema backbone API types.
 *
 * Shapes match `backend/app/routes/assets.py` in the ReelCinema repo
 * (verified against implementation, not brief). Editorial consumes a
 * subset of the 10-endpoint surface — primarily asset read + signed
 * URL issuance.
 *
 * SC-3.a foundation: types here are the contract everything else in
 * `reelcinema/` builds against. Drift between this file and the
 * backbone implementation is a halt-and-surface.
 */

/** Three signable variants per asset row. */
export type AssetTarget = 'proxy' | 'master' | 'thumbnail'

/** Approval lifecycle on an asset row. */
export type AssetApprovalState = 'pending' | 'approved' | 'rejected'

/**
 * Asset metadata as returned by `GET /api/assets/{id}` and list endpoints.
 * `_b2_key` fields are the canonical storage; signed URLs are derived
 * per-request via the sign-url endpoint.
 */
export interface Asset {
  id: string
  project_id: string
  organization_id: string
  user_id: string
  type: string
  approval_state: AssetApprovalState
  proxy_b2_key: string | null
  master_b2_key: string | null
  thumbnail_b2_key: string | null
  source_page: string | null
  source_persona: string | null
  scene_id: string | null
  character_id: string | null
  location_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string | null
  approved_at: string | null
  rejected_at: string | null
  auto_purge_at: string | null
}

/**
 * Response from `POST /api/assets/{id}/sign-url`.
 * `url` is the time-limited signed URL; `expires_in` is seconds from `issued_at`.
 */
export interface SignedUrlResponse {
  asset_id: string
  target: AssetTarget
  key: string
  url: string
  expires_in: number
  issued_at: string
}

export interface SignUrlRequest {
  target: AssetTarget
  /** Seconds; backbone clamps to [60, 86400]. */
  expires_in?: number
}

/**
 * Response from `GET /api/projects/{project_id}/library`.
 *
 * Returns the project's library state for sidebar consumption: every
 * non-rejected asset, grouped by `Asset.type`. Rejected assets are
 * excluded because they're scheduled for purge and shouldn't surface in
 * user-facing library views.
 *
 * The map keys are `Asset['type']` values (16 valid types per A10);
 * `total` is the count of asset rows the response carries.
 */
export interface ProjectLibraryResponse {
  project_id: string
  assets_by_type: Record<string, Asset[]>
  total: number
}

/** Backbone client configuration. */
export interface BackboneConfig {
  /** Base URL for the ReelCinema backend, e.g. `https://app.reelcinema.com`. */
  baseUrl: string
  /**
   * Optional bearer token. When omitted, the client relies on
   * same-origin Clerk session cookies (the primary auth path per
   * architect amendment #3).
   */
  bearerToken?: string
}

export class BackboneError extends Error {
  readonly status: number
  readonly endpoint: string

  constructor(endpoint: string, status: number, message: string) {
    super(`[backbone ${status}] ${endpoint}: ${message}`)
    this.name = 'BackboneError'
    this.endpoint = endpoint
    this.status = status
  }
}
