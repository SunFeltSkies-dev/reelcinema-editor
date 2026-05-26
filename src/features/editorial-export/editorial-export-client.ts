/**
 * Editorial export orchestrator (SC-I-9).
 *
 * Mirrors the SC-I-5 `loadEditorialBin` orchestration shape:
 *   1. Walk the DV→Cine handoff for the ordered scene list.
 *   2. For each locked scene, pick the first take that has a rendered
 *      asset (envelope `shots[].asset_id` non-null).
 *   3. Issue a master-target signed URL per picked take (24h expiry —
 *      the maximum the backbone allows per `SignUrlRequest.expires_in`
 *      clamp [60, 86400]).
 *   4. Feed the assembled scene list into the pure FCPXML generator.
 *
 * Pending scenes (DV-locked but not yet Cinematography-locked) and
 * scenes whose first take has no rendered asset are surfaced via the
 * summary so the UI can warn the user instead of silently dropping
 * coverage. The generated FCPXML still imports cleanly when zero
 * scenes are exportable — Resolve accepts an empty spine and shows
 * the project structure.
 */

import type { BackboneClient } from '@/infrastructure/storage/reelcinema'
import { createLogger } from '@/shared/logging/logger'
import { loadEditorialBin } from '@/features/editorial-bin/editorial-bin-client'
import type {
  EditorialSceneEnvelope,
  EditorialShotSnapshot,
} from '@/features/editorial-bin/types'
import { composeFcpxml } from './fcpxml-generator'
import type { FcpxmlExportSummary, FcpxmlScene } from './types'

const log = createLogger('editorial-export/client')

/** Signed URL TTL in seconds — backbone clamps to [60, 86400]. */
const SIGN_URL_EXPIRES_IN = 86400

export interface ExportToFcpxmlOptions {
  /**
   * Human-readable project name to embed in the FCPXML `<event>` and
   * `<project>` elements. When omitted, the orchestrator falls back to
   * a deterministic label derived from `projectId` so the FCPXML still
   * identifies the source project to the user inside Resolve.
   */
  projectName?: string
}

export interface ExportToFcpxmlResult {
  xml: string
  summary: FcpxmlExportSummary
  filename: string
  projectName: string
}

function pickFirstRenderedTake(
  envelope: EditorialSceneEnvelope,
): EditorialShotSnapshot | null {
  for (const shot of envelope.shots) {
    if (shot.asset_id) return shot
  }
  return null
}

function deriveProjectName(projectId: string, override: string | undefined): string {
  if (override && override.trim().length > 0) return override.trim()
  const short = projectId.slice(0, 8)
  return `ReelCinema Project ${short}`
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function timestampForFilename(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${y}${m}${d}-${hh}${mm}`
}

function composeFilename(projectName: string, now: Date = new Date()): string {
  const slug = slugify(projectName) || 'reelcinema-project'
  return `reelcinema-${slug}-${timestampForFilename(now)}.fcpxml`
}

/**
 * Build the FCPXML document + summary for the project.
 *
 * Caller is responsible for triggering the download (use
 * `download-trigger.ts downloadFcpxml`). This split lets tests assert
 * on the XML + summary independently of the browser anchor-click flow.
 */
export async function exportToFcpxml(
  client: BackboneClient,
  projectId: string,
  options: ExportToFcpxmlOptions = {},
  now: Date = new Date(),
): Promise<ExportToFcpxmlResult> {
  const snapshot = await loadEditorialBin(client, projectId)

  const skippedFromPending: FcpxmlExportSummary['skippedScenes'] = snapshot.pending_scenes.map(
    (scene) => ({
      sceneId: scene.scene_id,
      sceneName: `Scene ${scene.scene_number} · ${scene.scene_identifier}`,
      reason: 'pending-cinematography-lock' as const,
    }),
  )

  const scenesForExport: FcpxmlScene[] = []
  const skippedFromShots: FcpxmlExportSummary['skippedScenes'] = []

  for (const envelope of snapshot.scenes) {
    if (envelope.shots.length === 0) {
      skippedFromShots.push({
        sceneId: envelope.scene_id,
        sceneName: envelope.scene_name,
        reason: 'no-takes',
      })
      continue
    }
    const shot = pickFirstRenderedTake(envelope)
    if (!shot || !shot.asset_id) {
      skippedFromShots.push({
        sceneId: envelope.scene_id,
        sceneName: envelope.scene_name,
        reason: 'first-take-not-rendered',
      })
      continue
    }

    const signed = await client.signAssetUrl(shot.asset_id, {
      target: 'master',
      expires_in: SIGN_URL_EXPIRES_IN,
    })

    scenesForExport.push({
      sceneName: envelope.scene_name,
      sceneId: envelope.scene_id,
      take: {
        assetId: shot.asset_id,
        src: signed.url,
        durationSeconds: shot.duration_seconds ?? 8,
        takeNumber: shot.take_number,
      },
      sixSlot: {
        camera: shot.camera,
        action: shot.action,
        identityDialogue: shot.identity_dialogue,
        delivery: shot.delivery,
        preservation: shot.preservation,
        audio: shot.audio,
      },
    })
  }

  const projectName = deriveProjectName(projectId, options.projectName)
  const { xml, summary: generatorSummary } = composeFcpxml({
    projectName,
    scenes: scenesForExport,
  })

  const summary: FcpxmlExportSummary = {
    exportedSceneCount: generatorSummary.exportedSceneCount,
    exportedTakeCount: generatorSummary.exportedTakeCount,
    totalScenesConsidered:
      snapshot.scenes.length + snapshot.pending_scenes.length,
    skippedScenes: [
      ...skippedFromPending,
      ...skippedFromShots,
      ...generatorSummary.skippedScenes,
    ],
  }

  log.info('FCPXML export composed', {
    projectId,
    exportedScenes: summary.exportedSceneCount,
    skipped: summary.skippedScenes.length,
  })

  return {
    xml,
    summary,
    filename: composeFilename(projectName, now),
    projectName,
  }
}
