/**
 * Single import seam for editorial-export -> editorial-bin dependencies.
 */

export { loadEditorialBin } from '@/features/editorial-bin/editorial-bin-client'
export type {
  CinematographyHandoffResponse,
  DirectorsViewCinematographyHandoffResponse,
  EditorialSceneEnvelope,
  EditorialShotSnapshot,
} from '@/features/editorial-bin/types'
