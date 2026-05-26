/**
 * Editorial Bin (SC-I-5) — the Editor-side surface for the
 * Cinematography → Editorial handoff envelope.
 *
 * Drives the scene list from the DV → Cinematography handoff (project-
 * scoped, ordered, A23-shipped `scene_name` on each per-scene envelope).
 * Scenes that DV-locked but the Cinematographer hasn't yet locked
 * downstream surface as "awaiting cinematography lock" rows distinct
 * from locked-and-ready ones.
 *
 * Layout inspired by the V1.8 prototype scene-grouped takes browser
 * (`prototypes/ReelCinema_EditorialPathA_V1.8.html:725-734` + 768-780
 * + 1314-1319). One card per scene, collapsible, with the scene_name
 * as the primary label (closing the truncated-UUID gap that motivated
 * A23). Each take row links to a six-slot modal showing the canonical
 * A22 prompt fields.
 *
 * Empty / loading / pending states surface inline so the bin is
 * useful even when only part of the pipeline has locked.
 */

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Clapperboard, Info, Loader2, Video } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HelpCircle } from 'lucide-react'
import { createLogger } from '@/shared/logging/logger'
import type { BackboneClient } from '@/infrastructure/storage/reelcinema'
import { EditorialExportButton } from './deps/editorial-export'
import { loadEditorialBin, type EditorialBinSnapshot } from './editorial-bin-client'
import type { EditorialSceneEnvelope, EditorialShotSnapshot } from './types'

const log = createLogger('editorial-bin/panel')

interface EditorialBinProps {
  projectId: string
  client: BackboneClient
  /** Optional human-readable project name for the FCPXML export label. */
  projectName?: string
}

interface SixSlotModalState {
  shot: EditorialShotSnapshot
  sceneLabel: string
}

const SLOT_DEFINITIONS: ReadonlyArray<{
  key: keyof Pick<
    EditorialShotSnapshot,
    'camera' | 'action' | 'identity_dialogue' | 'delivery' | 'preservation' | 'audio'
  >
  label: string
  help: string
}> = [
  { key: 'camera', label: 'CAMERA', help: 'Framing, lens, and camera motion combined' },
  { key: 'action', label: 'ACTION', help: 'The primary physical verb — what happens in the scene' },
  {
    key: 'identity_dialogue',
    label: 'IDENTITY+DLG',
    help: 'Character identity anchor + the line of dialogue being spoken',
  },
  {
    key: 'delivery',
    label: 'DELIVERY',
    help: 'Performance direction: vocal register, physicality, emotional approach',
  },
  {
    key: 'preservation',
    label: 'PRESERVATION',
    help: 'What to lock across takes for visual continuity — prevents identity drift between cuts',
  },
  {
    key: 'audio',
    label: 'AUDIO',
    help: 'Sound Designer audio_slot_6 content — room tone, SFX, sonic presence embedded in this take',
  },
]

function formatDuration(seconds: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—'
  return `${seconds.toFixed(1)}s`
}

function takeRowKey(shot: EditorialShotSnapshot): string {
  return `${shot.asset_id ?? 'no-asset'}-${shot.take_number}`
}

function TakeRow({
  shot,
  onShowSixSlot,
}: {
  shot: EditorialShotSnapshot
  onShowSixSlot: (shot: EditorialShotSnapshot) => void
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border-l-2 border-border/40 hover:border-primary/60 hover:bg-foreground/5 transition-colors group">
      <div className="w-6 h-6 flex items-center justify-center bg-secondary rounded-sm flex-shrink-0">
        <Video className="w-3 h-3 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-foreground">
          Take {shot.take_number} · {formatDuration(shot.duration_seconds)}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {shot.shot_label ?? <span className="italic">unlabeled</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onShowSixSlot(shot)}
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-foreground/10 opacity-60 group-hover:opacity-100 transition-opacity"
        aria-label={`View six-slot prompt for take ${shot.take_number}`}
      >
        <Info className="w-3 h-3" />
      </button>
    </div>
  )
}

function SceneCard({
  envelope,
  defaultOpen,
  onShowSixSlot,
}: {
  envelope: EditorialSceneEnvelope
  defaultOpen: boolean
  onShowSixSlot: (shot: EditorialShotSnapshot, sceneLabel: string) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const ChevIcon = open ? ChevronDown : ChevronRight
  const takeCount = envelope.shots.length
  const sceneLabel = envelope.scene_name

  return (
    <div className="border-b border-border/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-foreground/5 transition-colors"
      >
        <ChevIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold truncate">
          {sceneLabel}
        </span>
        <div className="flex-1" />
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
          {takeCount} {takeCount === 1 ? 'take' : 'takes'}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-1 pb-2">
          {(envelope.shot_brief.visual_purpose ||
            envelope.shot_brief.editorial_note ||
            envelope.shot_brief.open_questions) && (
            <div className="mx-2 mb-1 p-2 bg-foreground/5 rounded text-[10px] text-muted-foreground space-y-1.5">
              {envelope.shot_brief.visual_purpose && (
                <div>
                  <span className="font-semibold uppercase tracking-wider text-foreground/70">
                    Visual purpose
                  </span>
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {envelope.shot_brief.visual_purpose}
                  </div>
                </div>
              )}
              {envelope.shot_brief.editorial_note && (
                <div>
                  <span className="font-semibold uppercase tracking-wider text-foreground/70">
                    Editorial note
                  </span>
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {envelope.shot_brief.editorial_note}
                  </div>
                </div>
              )}
              {envelope.shot_brief.open_questions && (
                <div>
                  <span className="font-semibold uppercase tracking-wider text-foreground/70">
                    Open questions
                  </span>
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {envelope.shot_brief.open_questions}
                  </div>
                </div>
              )}
            </div>
          )}
          {envelope.shots.length === 0 ? (
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground italic">
              Scene locked with no takes.
            </div>
          ) : (
            envelope.shots.map((shot) => (
              <TakeRow
                key={takeRowKey(shot)}
                shot={shot}
                onShowSixSlot={(s) => onShowSixSlot(s, sceneLabel)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function PendingSceneRow({
  scene,
}: {
  scene: { scene_id: string; scene_number: number; scene_identifier: string }
}) {
  return (
    <div className="border-b border-border/40 px-2 py-1.5 flex items-start gap-2">
      <Clapperboard className="w-3 h-3 text-muted-foreground/60 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">
          Scene {scene.scene_number} · {scene.scene_identifier}
        </div>
        <div className="text-[10px] text-muted-foreground/70 italic">
          Awaiting cinematography lock
        </div>
      </div>
    </div>
  )
}

function SixSlotModal({
  state,
  onClose,
}: {
  state: SixSlotModalState | null
  onClose: () => void
}) {
  if (!state) return null
  const { shot, sceneLabel } = state
  const durationLabel =
    typeof shot.duration_seconds === 'number'
      ? `${shot.duration_seconds.toFixed(1)}s`
      : '— duration unknown'

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xs uppercase tracking-wider text-muted-foreground">
            {sceneLabel} · Take {shot.take_number} · Six-Slot Prompt
          </DialogTitle>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Veo 3.1 Lite · {durationLabel}
          </div>
        </DialogHeader>
        <TooltipProvider delayDuration={200}>
          <div className="flex flex-col gap-3">
            {SLOT_DEFINITIONS.map(({ key, label, help }) => (
              <div key={key} className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
                    {label}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Help for ${label}`}
                      >
                        <HelpCircle className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      {help}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {shot[key] || <span className="italic text-muted-foreground">(empty)</span>}
                </div>
              </div>
            ))}
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  )
}

export function EditorialBin({ projectId, client, projectName }: EditorialBinProps) {
  const [snapshot, setSnapshot] = useState<EditorialBinSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [modalState, setModalState] = useState<SixSlotModalState | null>(null)

  useEffect(() => {
    let cancelled = false
    setSnapshot(null)
    setError(null)
    setLoading(true)
    void (async () => {
      try {
        const result = await loadEditorialBin(client, projectId)
        if (cancelled) return
        setSnapshot(result)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        const e = err instanceof Error ? err : new Error(String(err))
        log.error('EditorialBin load failed', { projectId, err: e.message })
        setError(e)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, client])

  const sceneCount = snapshot?.scenes.length ?? 0
  const pendingCount = snapshot?.pending_scenes.length ?? 0
  const isEmpty = !loading && !error && sceneCount === 0 && pendingCount === 0

  const headerCount = useMemo(() => {
    if (sceneCount === 0 && pendingCount === 0) return null
    const parts: string[] = []
    if (sceneCount > 0) parts.push(`${sceneCount} ${sceneCount === 1 ? 'scene' : 'scenes'}`)
    if (pendingCount > 0) parts.push(`${pendingCount} pending`)
    return parts.join(' · ')
  }, [sceneCount, pendingCount])

  return (
    <>
      <div
        className="flex flex-col h-full bg-background border-l border-border"
        data-testid="editorial-bin"
      >
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-panel-bg">
          <Clapperboard className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">
            Editorial Bin
          </span>
          <div className="flex-1" />
          {headerCount && (
            <span className="text-[10px] text-muted-foreground" data-testid="editorial-bin-count">
              {headerCount}
            </span>
          )}
          <EditorialExportButton
            projectId={projectId}
            client={client}
            projectName={projectName}
            disabled={loading || sceneCount === 0}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div
              className="flex items-center justify-center gap-2 px-3 py-8 text-[10px] text-muted-foreground"
              data-testid="editorial-bin-loading"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading scenes…
            </div>
          )}
          {error && (
            <div
              className="px-3 py-3 text-[10px] text-destructive"
              data-testid="editorial-bin-error"
            >
              Failed to load editorial bin: {error.message}
            </div>
          )}
          {isEmpty && (
            <div
              className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
              data-testid="editorial-bin-empty"
            >
              <Clapperboard className="w-5 h-5 text-muted-foreground/60" />
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                No scenes yet
              </div>
              <div className="text-[10px] text-muted-foreground/80 leading-relaxed">
                Once your Director locks scenes for cinematography, they will appear here ready for
                the cut.
              </div>
            </div>
          )}
          {!loading && !error && snapshot && (
            <div className="flex flex-col">
              {snapshot.scenes.map((envelope, index) => (
                <SceneCard
                  key={envelope.scene_id}
                  envelope={envelope}
                  defaultOpen={index === 0}
                  onShowSixSlot={(shot, sceneLabel) => setModalState({ shot, sceneLabel })}
                />
              ))}
              {snapshot.pending_scenes.map((scene) => (
                <PendingSceneRow key={scene.scene_id} scene={scene} />
              ))}
            </div>
          )}
        </div>
      </div>

      <SixSlotModal state={modalState} onClose={() => setModalState(null)} />
    </>
  )
}
