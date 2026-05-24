/**
 * Cross-domain analysis types — preserved across the SC-4.g+h strip of
 * `infrastructure/analysis/`. The value-side implementations (captioning,
 * scene-detection, optical-flow, embeddings) were ReelCinema-out-of-scope
 * (browser-side ML inference replaced by upstream personas → kie.ai via
 * Audio Engineer). These type shapes survive because the persisted-analysis
 * storage layer (`workspace-fs/captions.ts`, `workspace-fs/scenes.ts`) +
 * derived consumers (`caption-items.ts`, `thumbnails/sample-strategy.ts`)
 * continue to read legacy persisted records.
 *
 * Move-only relocation — no reshape from the original `infrastructure/analysis/`
 * definitions. See `brief_cc7_sc4g_h_combined_closing_chunk_2026-05-25.md`.
 */

export interface SceneCaptionData {
  caption?: string
  shotType?: string
  subjects?: string[]
  action?: string
  setting?: string
  lighting?: string
  timeOfDay?: string
  weather?: string
}

export interface MediaCaption {
  timeSec: number
  text: string
  sceneData?: SceneCaptionData
  thumbRelPath?: string
  embedding?: number[]
  palette?: Array<{ l: number; a: number; b: number; weight: number }>
}

export interface MotionResult {
  totalMotion: number
  globalMotion: number
  localMotion: number
  isSceneCut: boolean
  dominantDirection: number
  directionCoherence: number
}

export interface SceneCut {
  frame: number
  time: number
  motion: MotionResult
  verified?: boolean
}
