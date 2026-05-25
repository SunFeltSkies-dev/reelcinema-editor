/**
 * Cinematography Bin — Editorial-side consumer surface for the
 * Cinematography → Editorial handoff envelope (A23) per SC-6.b.
 *
 * Parallel to FreeCut's media-library; consumes ReelCinema backbone
 * Assets directly via the bridge. Mount via `CinematographyBinPanel`
 * from a host editorial page (host wiring is out-of-scope for SC-6.b).
 */

export { CinematographyBinPanel } from './components/cinematography-bin-panel'
export { SceneSection } from './components/scene-section'
export { TakeItem } from './components/take-item'
export { ShotBriefPanel } from './components/shot-brief-panel'
export { SixSlotModal } from './components/six-slot-modal'
