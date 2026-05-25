/**
 * Wire-shape types for the Editorial bin (SC-I-5).
 *
 * These mirror the actual JSON returned by the ReelCinema backbone for:
 *   - GET /api/projects/{projectId}/directors-view/handoff/cinematography
 *   - GET /api/projects/{projectId}/scenes/{sceneId}/cinematography-handoff
 *
 * The existing `infrastructure/storage/reelcinema/types.ts`
 * `CinematographyToEditorialHandoff` is row-shaped, not wire-shaped, and
 * pre-dates DECISIONS A23. We don't want to mutate it under this chunk
 * (it has other consumers); these local types are the source-of-truth
 * for the bin and stay scoped to the feature.
 */

/** Six-slot per-shot snapshot per DECISIONS A22. */
export interface EditorialShotSnapshot {
  /** UUID of the rendered take asset; nullable until generation completes. */
  asset_id: string | null
  /** 1-indexed take number for the shot. */
  take_number: number
  /** Operator-facing label (e.g. "Shot 1A take 2"). */
  shot_label: string | null
  /** Slot 1: camera instruction (standalone sentence; never embedded). */
  camera: string
  /** Slot 2: action description. */
  action: string
  /** Slot 3: identity + dialogue line. */
  identity_dialogue: string
  /** Slot 4: delivery modifiers. */
  delivery: string
  /** Slot 5: preservation clause. */
  preservation: string
  /** Slot 6: audio direction. */
  audio: string
  duration_seconds: number | null
  poster_asset_id: string | null
}

/** Optional per-scene shot brief (V1.8 prototype fields). */
export interface EditorialShotBrief {
  visual_purpose: string | null
  editorial_note: string | null
  open_questions: string | null
}

/**
 * One row in the Editorial bin: the wire envelope returned by
 * `GET /scenes/{scene_id}/cinematography-handoff` under the `handoff` key.
 */
export interface EditorialSceneEnvelope {
  type: 'cinematography_to_editorial_handoff'
  handoff_id: string
  project_id: string
  scene_id: string
  /** Human-readable scene name snapshotted at lock time (DECISIONS A23). */
  scene_name: string
  locked_by: string
  shots: EditorialShotSnapshot[]
  shot_brief: EditorialShotBrief
  project_lut_asset_id: string | null
  emitted_at: string
  version: number
  locked_at: string | null
  superseded_by: string | null
  previous_version: string | null
  revision_reason: string | null
  revision_requested_at: string | null
}

/** Wrapped response shape for the per-scene handoff GET. */
export interface CinematographyHandoffResponse {
  handoff: EditorialSceneEnvelope | null
}

/**
 * Minimal per-scene shape inside the DV→Cinematography handoff `scenes[]`
 * array (per §8 v2.0.0). The bin only needs `scene_id` for downstream
 * cinematography handoff lookup, but `scene_number` and `scene_identifier`
 * are kept for ordering and fallback labels if cinematography hasn't
 * locked yet.
 */
export interface DirectorsViewSceneListItem {
  scene_id: string
  scene_number: number
  scene_identifier: string
  // §8 v2.0.0 carries more fields (director_intent, briefs, anchor_asset_id,
  // veo_prompt_ready). We intentionally do not bind them here — the bin
  // reads them via the cine→editorial envelope, not the DV one.
}

/** Wire shape of `GET /api/projects/{id}/directors-view/handoff/cinematography`. */
export interface DirectorsViewCinematographyHandoffResponse {
  type: 'director_view'
  project_id: string
  schema_version: string
  emitted_at: string
  scenes: DirectorsViewSceneListItem[]
  handoff_id: string
  version: number
  locked_at: string | null
  superseded_by: string | null
  previous_version: string | null
  revision_reason: string | null
  revision_requested_at: string | null
}
