/**
 * Single scene's section inside the Cinematography Bin panel.
 *
 * Owns the per-scene `useCinematographyHandoff` call (one hook per
 * scene — N parallel queries managed by React's render tree, not a
 * loop). Renders:
 *   - scene header with take count + collapse chevron
 *   - scene shot brief panel (visual_purpose / editorial_note /
 *     open_questions) when handoff exists
 *   - per-take rows with six-slot info icon
 *
 * Empty / loading / error states surface inline so each scene is
 * independently responsive.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Clapperboard } from 'lucide-react'
import {
  useCinematographyHandoff,
  type BackboneClient,
  type ShotSnapshot,
} from '@/infrastructure/storage/reelcinema'
import { TakeItem } from './take-item'
import { ShotBriefPanel } from './shot-brief-panel'

interface SceneSectionProps {
  projectId: string
  sceneId: string
  sceneLabel: string
  client: BackboneClient
  defaultOpen?: boolean
  onShowSixSlot: (shot: ShotSnapshot, sceneLabel: string) => void
}

export function SceneSection({
  projectId,
  sceneId,
  sceneLabel,
  client,
  defaultOpen = false,
  onShowSixSlot,
}: SceneSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const { handoff, loading, error } = useCinematographyHandoff({
    projectId,
    sceneId,
    client,
  })

  const takeCount = handoff?.shots.length ?? 0
  const ChevIcon = open ? ChevronDown : ChevronRight

  return (
    <div className="border-b border-border/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-foreground/5 transition-colors"
      >
        <ChevIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold">
          {sceneLabel}
        </span>
        <div className="flex-1" />
        {loading && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
            loading…
          </span>
        )}
        {!loading && !error && handoff && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
            {takeCount} {takeCount === 1 ? 'take' : 'takes'}
          </span>
        )}
        {!loading && !error && !handoff && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
            unlocked
          </span>
        )}
        {error && (
          <span className="text-[9px] uppercase tracking-wider text-destructive">error</span>
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-1 pb-2">
          {error && (
            <div className="px-2 py-1.5 text-[10px] text-destructive">
              Failed to load handoff: {error.message}
            </div>
          )}
          {!error && !loading && !handoff && (
            <div className="px-2 py-2 flex items-start gap-2 text-[10px] text-muted-foreground">
              <Clapperboard className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>
                No pinned takes yet. Once your Cinematographer locks this scene, the takes appear
                here ready to cut.
              </span>
            </div>
          )}
          {handoff && (
            <>
              <ShotBriefPanel handoff={handoff} sceneLabel={sceneLabel} />
              {handoff.shots.length === 0 ? (
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground italic">
                  Scene locked with no takes.
                </div>
              ) : (
                handoff.shots.map((shot) => (
                  <TakeItem
                    key={`${shot.asset_id}-${shot.take_number}`}
                    shot={shot}
                    onShowSixSlot={(s) => onShowSixSlot(s, sceneLabel)}
                  />
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
