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

/**
 * Per-shot/take snapshot inside `CinematographyToEditorialHandoff.shots`.
 *
 * Six-slot fields are canonical per DECISIONS A22 — same entity serves
 * dual purpose as shot brief content AND Veo prompt assembly source.
 * Renaming any of the six fields requires A22 supersession first.
 */
export interface ShotSnapshot {
  asset_id: string
  take_number: number
  shot_label: string
  camera: string
  action: string
  identity_dialogue: string
  delivery: string
  preservation: string
  audio: string
  duration_seconds: number | null
  poster_asset_id: string | null
}

/**
 * Cinematography → Editorial handoff envelope per DECISIONS A23.
 *
 * One row per (project_id, scene_id, version). Editorial reads only
 * the current version (server filters `superseded_by_id IS NULL`).
 * Multi-asset linking pattern: query by asset_id via
 * `shots[].asset_id == <asset>` to find parent scene + shot context.
 */
export interface CinematographyToEditorialHandoff {
  id: string
  project_id: string
  organization_id: string
  user_id: string
  scene_id: string
  /**
   * Human-readable scene name captured at lock time per A23 amendment
   * 2026-05-26. Snapshot semantics: rename post-lock requires
   * supersession (new envelope row captures fresh name). NOT NULL on
   * the backbone; legacy backfilled rows default to "Untitled Scene"
   * which consumers should treat as the rendering fallback.
   */
  scene_name: string
  locked_at: string
  locked_by: string
  version: number
  previous_version_id: string | null
  superseded_by_id: string | null
  revision_reason: string | null
  shot_brief_visual_purpose: string | null
  shot_brief_editorial_note: string | null
  shot_brief_open_questions: string | null
  project_lut_asset_id: string | null
  shots: ShotSnapshot[]
  created_at: string
  updated_at: string
}

/**
 * Response from `GET /api/projects/{project_id}/scenes/{scene_id}/cinematography-handoff`.
 *
 * Returns `null` when the scene has no locked handoff yet (Cinematography
 * page has not been locked for this scene). Editorial UI should treat
 * `null` as "no shot brief yet" — not an error.
 */
export interface CinematographyHandoffResponse {
  handoff: CinematographyToEditorialHandoff | null
}

/**
 * Wire shape of `GET /api/projects/{project_id}/directors-view/handoff/cinematography`.
 *
 * Returns the latest non-superseded DV → Cinematography handoff
 * envelope. The Editorial bin (SC-I-5) walks `scenes[]` as the
 * canonical project-scoped ordered scene list. Per-scene shape inside
 * `scenes[]` carries more fields per §8 v2.0.0; here we expose only
 * what the bin needs (the editorial-bin feature defines the richer
 * shape it consumes internally).
 *
 * Server returns 404 when no envelope has been emitted (DV unlocked).
 * Callers map 404 to "empty bin" rather than an error.
 */
export interface DirectorsViewToCinematographyHandoffResponse {
  type: 'director_view'
  project_id: string
  schema_version: string
  emitted_at: string
  scenes: Array<{
    scene_id: string
    scene_number: number
    scene_identifier: string
    /** §8 v2.0.0 carries additional per-scene fields (director_intent,
     * briefs, anchor_asset_id, veo_prompt_ready). Consumers that need
     * them widen this type locally; the backbone surface only commits
     * to what's listed. */
    [key: string]: unknown
  }>
  handoff_id: string
  version: number
  locked_at: string | null
  superseded_by: string | null
  previous_version: string | null
  revision_reason: string | null
  revision_requested_at: string | null
}

/**
 * Single message inside a persona conversation transcript.
 *
 * Mirrors the JSON shape that `backend/app/routes/personas.py:_serialize`
 * emits inside `invocation.conversation` — `role` is `'user' | 'assistant'`
 * and `content` is the text payload. `mode` is tagged per Amendment 1 so
 * structured invocations can be distinguished from conversational turns
 * even when interleaved within one transcript.
 */
export interface PersonaConversationMessage {
  role: 'user' | 'assistant'
  content: string
  mode?: 'conversational' | 'structured'
}

/**
 * Persona invocation envelope as serialized by the backbone (5a
 * provider-stripped). The wire shape is the source of truth for the
 * iframe conversational surface — both `POST /api/personas/invoke`
 * (under `invocation`) and `GET /api/projects/{id}/conversations`
 * return this row shape.
 */
export interface PersonaInvocation {
  id: string
  project_id: string
  persona: string
  page: string | null
  mode: 'conversational' | 'structured'
  conversation: PersonaConversationMessage[]
  metadata: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

/**
 * Request body for `POST /api/personas/invoke` (the SC-I-6 iframe
 * conversational surface uses this to round-trip the Editor / Audio
 * Engineer dialogue).
 *
 * `invocation_id` continuation pattern (architect H-3 ruling 2026-05-26):
 * conversational state lives on Postgres `persona_invocations` rather
 * than OPFS for V1. Pass an existing `invocation_id` to append to that
 * row's transcript; omit to start a fresh conversation row.
 */
export interface InvokePersonaRequest {
  project_id: string
  organization_id: string
  user_id: string
  persona: string
  user_message: string
  mode?: 'conversational' | 'structured'
  page?: string
  model?: string
  max_tokens?: number
  invocation_id?: string
  conversation_history?: PersonaConversationMessage[]
}

/** Response shape for `POST /api/personas/invoke`. */
export interface InvokePersonaResponse {
  invocation: PersonaInvocation
  response: {
    text: string
    stop_reason: string | null
  }
}

/**
 * Query params for `GET /api/projects/{project_id}/conversations`.
 * `organization_id` + `user_id` are required by the backbone (multi-tenant
 * filter per discipline #4); the remaining params are optional filters
 * + pagination.
 */
export interface ListConversationsParams {
  organization_id: string
  user_id: string
  persona?: string
  limit?: number
  offset?: number
}

/** Response shape for `GET /api/projects/{project_id}/conversations`. */
export interface ListConversationsResponse {
  conversations: PersonaInvocation[]
  limit: number
  offset: number
}

/**
 * Bearer token source. Either:
 *   - a static string (fixed token, used in tests or non-iframe builds), OR
 *   - a callback that returns the current token (used to pull from
 *     `AuthContextReceiver` on each request without reconstructing the
 *     client; introduced by SC-I-4).
 *
 * `null`/`undefined` returned from the callback signals "no bearer"
 * — the client omits the Authorization header and falls back to
 * Clerk session cookies (the primary auth path per architect
 * amendment #3).
 */
export type BearerTokenSource = string | (() => string | null | undefined)

/** Backbone client configuration. */
export interface BackboneConfig {
  /** Base URL for the ReelCinema backend, e.g. `https://app.reelcinema.com`. */
  baseUrl: string
  /**
   * Optional bearer source. When omitted, the client relies on
   * same-origin Clerk session cookies (the primary auth path per
   * architect amendment #3). For dynamic tokens (e.g. fed from
   * `AuthContextReceiver`), pass a callback.
   */
  bearerToken?: BearerTokenSource
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
