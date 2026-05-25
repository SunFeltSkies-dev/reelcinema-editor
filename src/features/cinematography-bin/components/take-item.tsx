/**
 * Take row — single ShotSnapshot displayed within a SceneSection.
 *
 * Layout mirrors V1.8 prototype (`ReelCinema_EditorialPathA_V1.8.html:725-734`):
 * thumbnail glyph · take number + duration · shot label · six-slot info icon.
 *
 * Pin state from the prototype is omitted here — in the A23 contract,
 * every shot in `handoff.shots` is implicitly the locked set
 * (Cinematography page pins-via-lock; supersession on re-lock). Pin
 * status as a per-take editorial gesture is a future surface.
 */

import { Info, Video } from 'lucide-react'
import type { ShotSnapshot } from '@/infrastructure/storage/reelcinema'

interface TakeItemProps {
  shot: ShotSnapshot
  onShowSixSlot: (shot: ShotSnapshot) => void
}

function formatDuration(seconds: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—'
  return `${seconds.toFixed(1)}s`
}

export function TakeItem({ shot, onShowSixSlot }: TakeItemProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border-l-2 border-border/40 hover:border-primary/60 hover:bg-foreground/5 transition-colors group">
      <div className="w-6 h-6 flex items-center justify-center bg-secondary rounded-sm flex-shrink-0">
        <Video className="w-3 h-3 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-foreground">
          Take {shot.take_number} · {formatDuration(shot.duration_seconds)}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{shot.shot_label}</div>
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
