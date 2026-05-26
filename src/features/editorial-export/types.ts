/**
 * Editorial export (SC-I-9) — A17 path-B Resolve XML (FCPXML) handoff.
 *
 * Input + output shapes for the FCPXML generator + orchestrator. The
 * generator itself is a pure function over these shapes (no network,
 * no DOM, no filesystem); the orchestrator wires the bin envelope +
 * signed-URL resolution + filename composition around it.
 *
 * FCPXML 1.10 was chosen as the target version because it imports cleanly
 * into DaVinci Resolve 18+, Final Cut Pro 10.6+, and Premiere Pro (via
 * the Final Cut import path). The format is the industry-standard
 * interchange for NLE handoff.
 */

/** A single take ready to be placed on the FCPXML spine. */
export interface FcpxmlTake {
  /** UUID from the cinematography envelope (used as asset id prefix). */
  assetId: string
  /** Time-limited signed B2 URL for the master target. */
  src: string
  /** Duration in seconds; defaults to 8.0 when null in the envelope. */
  durationSeconds: number
  /** 1-indexed take number for the shot. */
  takeNumber: number
}

/** Scene-level grouping inside the FCPXML spine. */
export interface FcpxmlScene {
  /** Human-readable scene name (A23 snapshot; closes truncated-UUID UX gap). */
  sceneName: string
  /** Sceneid from the envelope; used for asset-id disambiguation. */
  sceneId: string
  /** Selected take for V1 (typically take 1; V1.x exposes a picker). */
  take: FcpxmlTake
  /** Six-slot context preserved as `<note>` text on the clip. */
  sixSlot: {
    camera: string
    action: string
    identityDialogue: string
    delivery: string
    preservation: string
    audio: string
  }
}

/** Project framerate; V1 ships 24fps to match Veo 3.1 Lite output. */
export type FcpxmlFrameRate = 24

/** Pure input to the generator. */
export interface FcpxmlInput {
  /** Display name embedded in the FCPXML `<event>` and `<project>` elements. */
  projectName: string
  /** Ordered scenes; spine ordering matches array ordering. */
  scenes: FcpxmlScene[]
  /** Frame rate; 24fps is the only V1 value. */
  frameRate?: FcpxmlFrameRate
}

/** Per-scene reason a scene was dropped from the export. */
export interface FcpxmlSkippedScene {
  sceneId: string
  sceneName: string
  reason: 'pending-cinematography-lock' | 'no-takes' | 'first-take-not-rendered'
}

/** Summary returned alongside the XML so the UI can surface counts + warnings. */
export interface FcpxmlExportSummary {
  /** Scenes successfully placed on the spine. */
  exportedSceneCount: number
  /** Takes successfully placed (currently 1:1 with exportedSceneCount). */
  exportedTakeCount: number
  /** Scenes the generator could not include + why. */
  skippedScenes: FcpxmlSkippedScene[]
  /** Total scene rows considered (locked + pending). */
  totalScenesConsidered: number
}

/** Pure output of the generator. */
export interface FcpxmlOutput {
  xml: string
  summary: FcpxmlExportSummary
}
