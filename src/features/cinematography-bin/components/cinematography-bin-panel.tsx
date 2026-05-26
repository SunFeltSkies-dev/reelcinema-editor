/**
 * Cinematography Bin panel — Editorial-side consumer surface for the
 * Cinematography → Editorial handoff (A23) per SC-6.b.
 *
 * Layout inspired by V1.8 prototype scene-grouped takes browser
 * (`prototypes/ReelCinema_EditorialPathA_V1.8.html:725-734` + 768-780
 * + 1314-1319). This is a NEW Editorial surface parallel to FreeCut
 * media-library — it consumes ReelCinema backbone Assets directly via
 * the bridge, not the OPFS-keyed MediaMetadata graph.
 *
 * Scene discovery: scenes are derived from the project library's
 * non-null `scene_id` values (no separate scenes endpoint exists in
 * the bridge yet). For each derived scene, a `SceneSection` runs its
 * own handoff fetch in parallel.
 *
 * Naming (A23 amendment 2026-05-26): once a scene's handoff resolves,
 * `SceneSection` swaps the panel-provided truncated-UUID fallback for
 * `handoff.scene_name`. Unlocked scenes (no handoff yet) keep the
 * truncated UUID since the library response carries no name — the
 * scene-name signal only lands at Cinematography lock time.
 */

import { useMemo, useState } from 'react'
import { Clapperboard, Loader2 } from 'lucide-react'
import {
  useProjectLibrary,
  type BackboneClient,
  type ShotSnapshot,
} from '@/infrastructure/storage/reelcinema'
import type { ImportedProjectLibrary } from '@/infrastructure/storage/reelcinema'
import { SceneSection } from './scene-section'
import { SixSlotModal } from './six-slot-modal'

interface CinematographyBinPanelProps {
  projectId: string
  client: BackboneClient
}

function buildSceneLabel(sceneId: string): string {
  const shortId = sceneId.replace(/-/g, '').slice(0, 8)
  return `SC · ${shortId}`
}

function deriveSceneIds(library: ImportedProjectLibrary): string[] {
  const scenes = new Set<string>()
  for (const asset of library.assets) {
    if (asset.sceneId) scenes.add(asset.sceneId)
  }
  return Array.from(scenes).sort()
}

export function CinematographyBinPanel({ projectId, client }: CinematographyBinPanelProps) {
  const { library, loading, error } = useProjectLibrary({ projectId, client })
  const [modalShot, setModalShot] = useState<{
    shot: ShotSnapshot
    sceneLabel: string
  } | null>(null)

  const sceneIds = useMemo(() => {
    if (!library) return []
    return deriveSceneIds(library)
  }, [library])

  return (
    <>
      <div className="flex flex-col h-full bg-background border-l border-border">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-panel-bg">
          <Clapperboard className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">
            Cinematography Bin
          </span>
          <div className="flex-1" />
          {sceneIds.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {sceneIds.length} {sceneIds.length === 1 ? 'scene' : 'scenes'}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 px-3 py-8 text-[10px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading project library…
            </div>
          )}
          {error && (
            <div className="px-3 py-3 text-[10px] text-destructive">
              Failed to load library: {error.message}
            </div>
          )}
          {!loading && !error && sceneIds.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <Clapperboard className="w-5 h-5 text-muted-foreground/60" />
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                No scenes yet
              </div>
              <div className="text-[10px] text-muted-foreground/80 leading-relaxed">
                Once your Cinematographer pins approved takes to the Editorial queue, they appear
                here ready to cut.
              </div>
            </div>
          )}
          {!loading && !error && sceneIds.length > 0 && (
            <div className="flex flex-col">
              {sceneIds.map((sceneId, index) => (
                <SceneSection
                  key={sceneId}
                  projectId={projectId}
                  sceneId={sceneId}
                  sceneLabel={buildSceneLabel(sceneId)}
                  client={client}
                  defaultOpen={index === 0}
                  onShowSixSlot={(shot, sceneLabel) => setModalShot({ shot, sceneLabel })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <SixSlotModal
        shot={modalShot?.shot ?? null}
        sceneLabel={modalShot?.sceneLabel ?? ''}
        open={modalShot !== null}
        onOpenChange={(open) => {
          if (!open) setModalShot(null)
        }}
      />
    </>
  )
}
