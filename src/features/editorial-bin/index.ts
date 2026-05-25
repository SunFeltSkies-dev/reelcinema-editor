/**
 * Editorial Bin (SC-I-5) — Editor-side surface for the
 * Cinematography → Editorial handoff envelope.
 *
 * Mounted from the iframe entry route `/editor/projects/$projectId`.
 * Drives the scene list from the DV → Cinematography handoff so no
 * net-new backend surface is needed.
 */

export { EditorialBin } from './editorial-bin'
export {
  fetchDirectorsViewHandoff,
  loadEditorialBin,
  type EditorialBinSnapshot,
} from './editorial-bin-client'
export type {
  CinematographyHandoffResponse,
  DirectorsViewCinematographyHandoffResponse,
  DirectorsViewSceneListItem,
  EditorialSceneEnvelope,
  EditorialShotBrief,
  EditorialShotSnapshot,
} from './types'
