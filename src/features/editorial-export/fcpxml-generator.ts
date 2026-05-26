/**
 * FCPXML 1.10 generator (SC-I-9 A17 path-B).
 *
 * Pure function — takes a normalized scene list + signed asset URLs and
 * returns the FCPXML document string plus a summary. No network, no
 * filesystem, no DOM; orchestrated separately by `editorial-export-client.ts`.
 *
 * Output target: DaVinci Resolve 18+ import. FCPXML 1.10 is the version
 * Resolve 18 settled on for compatibility with FCP X 10.6 round-trips;
 * Resolve also accepts 1.9 and 1.11. Resolve is lenient on optional
 * attributes but strict on `<format>` + asset `<media-rep>` presence.
 *
 * Frame-rate math: FCPXML uses rational time values. A 24fps timeline
 * has a frame duration of 1/24s; durations on the spine are expressed
 * as `${frames}/24s`. We round take durations to the nearest frame so
 * the spine is gap-free. Per-shot 8s Veo clips → 192 frames.
 *
 * Six-slot context is embedded as a `<note>` element on each `<asset-clip>`.
 * Resolve preserves notes through import and renders them in the
 * clip inspector. Closes the V1 "audit trail" need: editors see what
 * the Cinematographer locked at the time of cut without re-deriving from
 * the source repo.
 */

import type {
  FcpxmlExportSummary,
  FcpxmlFrameRate,
  FcpxmlInput,
  FcpxmlOutput,
  FcpxmlScene,
} from './types'

const DEFAULT_FRAME_RATE: FcpxmlFrameRate = 24
const DEFAULT_TAKE_DURATION_SECONDS = 8
const FORMAT_ID = 'r1'
const FORMAT_NAME = 'FFVideoFormat1080p24'
const TIMELINE_WIDTH = 1920
const TIMELINE_HEIGHT = 1080
const TIMELINE_COLOR_SPACE = '1-1-1 (Rec. 709)'

/** XML 1.0 entity escapes for both text content and attribute values. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Round seconds to whole frames at the target rate. */
function secondsToFrames(seconds: number, frameRate: FcpxmlFrameRate): number {
  const rounded = Math.max(1, Math.round(seconds * frameRate))
  return rounded
}

/** Format a frame count as an FCPXML rational time (e.g. "192/24s"). */
function framesToFcpxmlTime(frames: number, frameRate: FcpxmlFrameRate): string {
  return `${frames}/${frameRate}s`
}

function takeAssetId(scene: FcpxmlScene): string {
  return `a-${scene.sceneId}-t${scene.take.takeNumber}`
}

function formatSixSlotNote(scene: FcpxmlScene): string {
  const { sixSlot } = scene
  const lines = [
    'ReelCinema six-slot shot brief:',
    `Camera: ${sixSlot.camera}`,
    `Action: ${sixSlot.action}`,
    `Identity/Dialogue: ${sixSlot.identityDialogue}`,
    `Delivery: ${sixSlot.delivery}`,
    `Preservation: ${sixSlot.preservation}`,
    `Audio: ${sixSlot.audio}`,
  ]
  return lines.join('\n')
}

/**
 * Compose a complete FCPXML 1.10 document from the normalized scene list.
 *
 * Pure: same input always produces the same output. The caller is
 * responsible for filtering out scenes with unresolved assets BEFORE
 * calling this — but as a safety net, scenes whose take has an empty
 * `src` get reported via the summary so the UI can warn the user
 * rather than emit a broken FCPXML.
 */
export function composeFcpxml(input: FcpxmlInput): FcpxmlOutput {
  const frameRate = input.frameRate ?? DEFAULT_FRAME_RATE

  const validScenes: FcpxmlScene[] = []
  const skipped: FcpxmlExportSummary['skippedScenes'] = []
  for (const scene of input.scenes) {
    if (!scene.take.src) {
      skipped.push({
        sceneId: scene.sceneId,
        sceneName: scene.sceneName,
        reason: 'first-take-not-rendered',
      })
      continue
    }
    validScenes.push(scene)
  }

  const sceneFrames = validScenes.map((scene) =>
    secondsToFrames(
      scene.take.durationSeconds > 0 ? scene.take.durationSeconds : DEFAULT_TAKE_DURATION_SECONDS,
      frameRate,
    ),
  )
  const totalFrames = sceneFrames.reduce((sum, n) => sum + n, 0)
  const sequenceDuration = framesToFcpxmlTime(totalFrames > 0 ? totalFrames : 1, frameRate)

  const formatLine =
    `    <format id="${FORMAT_ID}" name="${FORMAT_NAME}" ` +
    `frameDuration="1/${frameRate}s" ` +
    `width="${TIMELINE_WIDTH}" height="${TIMELINE_HEIGHT}" ` +
    `colorSpace="${escapeXml(TIMELINE_COLOR_SPACE)}"/>`

  const assetLines = validScenes.map((scene, index) => {
    const frames = sceneFrames[index] ?? 1
    const assetId = takeAssetId(scene)
    const assetName = `${scene.sceneName} — Take ${scene.take.takeNumber}`
    return (
      `    <asset id="${escapeXml(assetId)}" name="${escapeXml(assetName)}" ` +
      `start="0s" duration="${framesToFcpxmlTime(frames, frameRate)}" ` +
      `hasVideo="1" hasAudio="1" format="${FORMAT_ID}" ` +
      `videoSources="1" audioSources="1" audioChannels="2">\n` +
      `      <media-rep kind="original-media" src="${escapeXml(scene.take.src)}"/>\n` +
      `    </asset>`
    )
  })

  let cursorFrames = 0
  const clipLines = validScenes.map((scene, index) => {
    const frames = sceneFrames[index] ?? 1
    const assetId = takeAssetId(scene)
    const offset = framesToFcpxmlTime(cursorFrames, frameRate)
    const duration = framesToFcpxmlTime(frames, frameRate)
    const note = escapeXml(formatSixSlotNote(scene))
    cursorFrames += frames
    return (
      `          <asset-clip name="${escapeXml(scene.sceneName)}" ref="${escapeXml(assetId)}" ` +
      `offset="${offset}" duration="${duration}" start="0s">\n` +
      `            <note>${note}</note>\n` +
      `          </asset-clip>`
    )
  })

  const projectName = escapeXml(input.projectName)

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE fcpxml>\n` +
    `<fcpxml version="1.10">\n` +
    `  <resources>\n` +
    `${formatLine}\n` +
    (assetLines.length > 0 ? `${assetLines.join('\n')}\n` : '') +
    `  </resources>\n` +
    `  <library>\n` +
    `    <event name="ReelCinema Export — ${projectName}">\n` +
    `      <project name="${projectName}">\n` +
    `        <sequence format="${FORMAT_ID}" duration="${sequenceDuration}" ` +
    `tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">\n` +
    `          <spine>\n` +
    (clipLines.length > 0 ? `${clipLines.join('\n')}\n` : '') +
    `          </spine>\n` +
    `        </sequence>\n` +
    `      </project>\n` +
    `    </event>\n` +
    `  </library>\n` +
    `</fcpxml>\n`

  const summary: FcpxmlExportSummary = {
    exportedSceneCount: validScenes.length,
    exportedTakeCount: validScenes.length,
    skippedScenes: skipped,
    totalScenesConsidered: input.scenes.length,
  }

  return { xml, summary }
}
