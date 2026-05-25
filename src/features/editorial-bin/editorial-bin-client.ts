/**
 * Editorial-bin data fetcher (SC-I-5).
 *
 * Drives the bin from existing endpoints — no net-new backend surface:
 *
 *   1. GET .../directors-view/handoff/cinematography → ordered scene list
 *      (DV-locked, ready-for-cinematography scenes only).
 *   2. For each scene, GET .../scenes/{scene_id}/cinematography-handoff
 *      → cinematography envelope (with scene_name per A23 + six-slot per
 *      shot per A22).
 *   3. Skip scenes whose cinematography GET returns `{handoff: null}`
 *      (DV-locked but not yet locked at Cinematography). These appear
 *      in the DV scene list but have no envelope yet — they will once
 *      the Cinematographer locks them.
 *
 * The DV→Cine GET returns 404 when no envelope has been emitted yet
 * (project hasn't reached DV lock). We surface this as an empty-bin
 * state, not an error.
 */

import { BackboneClient, BackboneError } from '@/infrastructure/storage/reelcinema'
import { createLogger } from '@/shared/logging/logger'
import type {
  CinematographyHandoffResponse,
  DirectorsViewCinematographyHandoffResponse,
  EditorialSceneEnvelope,
} from './types'

const log = createLogger('editorial-bin/client')

export interface EditorialBinSnapshot {
  /** Locked cinematography envelopes for this project, in DV scene order. */
  scenes: EditorialSceneEnvelope[]
  /**
   * Scenes that are DV-locked but not yet locked at Cinematography (their
   * `cinematography-handoff` GET returned `{handoff: null}`). Surfaced so
   * the bin can show "awaiting cinematography lock" rows distinct from
   * locked-and-ready rows.
   */
  pending_scenes: Array<{
    scene_id: string
    scene_number: number
    scene_identifier: string
  }>
}

const EMPTY_SNAPSHOT: EditorialBinSnapshot = { scenes: [], pending_scenes: [] }

/**
 * Fetch the DV→Cinematography handoff for the project. Returns `null`
 * when the project has not reached DV lock yet (server 404).
 */
export async function fetchDirectorsViewHandoff(
  client: BackboneClient,
  projectId: string,
): Promise<DirectorsViewCinematographyHandoffResponse | null> {
  try {
    const response = await client.getDirectorsViewToCinematographyHandoff(projectId)
    return response as unknown as DirectorsViewCinematographyHandoffResponse
  } catch (err) {
    if (err instanceof BackboneError && err.status === 404) {
      log.info('No DV→Cine handoff yet for project', { projectId })
      return null
    }
    throw err
  }
}

/**
 * Assemble the Editorial bin snapshot for a project.
 *
 * Returns a snapshot with `scenes: []` + `pending_scenes: []` when the
 * project has no DV→Cine handoff yet (pre-DV-lock state).
 */
export async function loadEditorialBin(
  client: BackboneClient,
  projectId: string,
): Promise<EditorialBinSnapshot> {
  const dvHandoff = await fetchDirectorsViewHandoff(client, projectId)
  if (!dvHandoff) return EMPTY_SNAPSHOT

  const dvScenes = dvHandoff.scenes ?? []
  if (dvScenes.length === 0) return EMPTY_SNAPSHOT

  // Fetch per-scene cinematography envelopes in parallel; sceneId order
  // matches the DV-emitted scenes[] order (the source-of-truth ordering
  // per §8 v2.0.0).
  const responses = await Promise.all(
    dvScenes.map((scene) =>
      client
        .getCinematographyHandoff(projectId, scene.scene_id)
        .then((res) => ({ scene, res: res as CinematographyHandoffResponse }))
        .catch((err) => {
          if (err instanceof BackboneError && err.status === 404) {
            return { scene, res: { handoff: null } satisfies CinematographyHandoffResponse }
          }
          throw err
        }),
    ),
  )

  const scenes: EditorialSceneEnvelope[] = []
  const pending: EditorialBinSnapshot['pending_scenes'] = []
  for (const { scene, res } of responses) {
    if (res.handoff) {
      scenes.push(res.handoff as EditorialSceneEnvelope)
    } else {
      pending.push({
        scene_id: scene.scene_id,
        scene_number: scene.scene_number,
        scene_identifier: scene.scene_identifier,
      })
    }
  }

  return { scenes, pending_scenes: pending }
}
