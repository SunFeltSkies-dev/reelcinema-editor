/**
 * Six-slot modal — displays the canonical A22 six-slot prompt fields
 * for a single take.
 *
 * Field names per DECISIONS A22 (CAMERA / ACTION / IDENTITY+DLG /
 * DELIVERY / PRESERVATION / AUDIO). UI label `IDENTITY+DLG` is the
 * display abbreviation for the canonical field `identity_dialogue`
 * — the underlying field name is invariant per A22; only the
 * display abbreviation is permitted to diverge.
 *
 * Per-slot help tooltips lifted from V1.8 prototype copy
 * (`prototypes/ReelCinema_EditorialPathA_V1.8.html:1314-1319`).
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HelpCircle } from 'lucide-react'
import type { ShotSnapshot } from '@/infrastructure/storage/reelcinema'

interface SixSlotModalProps {
  shot: ShotSnapshot | null
  sceneLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SLOT_DEFINITIONS: ReadonlyArray<{
  key: keyof Pick<
    ShotSnapshot,
    'camera' | 'action' | 'identity_dialogue' | 'delivery' | 'preservation' | 'audio'
  >
  label: string
  help: string
}> = [
  {
    key: 'camera',
    label: 'CAMERA',
    help: 'Framing, lens, and camera motion combined',
  },
  {
    key: 'action',
    label: 'ACTION',
    help: 'The primary physical verb — what happens in the scene',
  },
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

export function SixSlotModal({ shot, sceneLabel, open, onOpenChange }: SixSlotModalProps) {
  if (!shot) return null

  const durationLabel =
    typeof shot.duration_seconds === 'number'
      ? `${shot.duration_seconds.toFixed(1)}s`
      : '— duration unknown'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
