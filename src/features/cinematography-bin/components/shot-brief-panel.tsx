/**
 * Shot Brief Reference panel — per-scene editorial intent surfaced
 * from the Cinematography handoff envelope (A23 fields:
 * `shot_brief_visual_purpose` / `shot_brief_editorial_note` /
 * `shot_brief_open_questions`).
 *
 * Layout mirrors V1.8 prototype shot-brief-panel
 * (`ReelCinema_EditorialPathA_V1.8.html:768-780`). Fields are
 * read-only display; editing happens on the Cinematography page
 * (consumer-owned-GET pattern — consumer never writes).
 */

import { FileText } from 'lucide-react'
import type { CinematographyToEditorialHandoff } from '@/infrastructure/storage/reelcinema'

interface ShotBriefPanelProps {
  handoff: CinematographyToEditorialHandoff
  sceneLabel: string
}

interface FieldProps {
  label: string
  value: string | null
  tone?: 'default' | 'warn' | 'question'
}

function Field({ label, value, tone = 'default' }: FieldProps) {
  if (!value) return null
  const toneClass =
    tone === 'warn'
      ? 'text-amber-400'
      : tone === 'question'
        ? 'text-muted-foreground'
        : 'text-foreground'
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
        {label}
      </div>
      <div className={`text-[11px] leading-relaxed ${toneClass}`}>{value}</div>
    </div>
  )
}

export function ShotBriefPanel({ handoff, sceneLabel }: ShotBriefPanelProps) {
  const hasAnyBriefContent =
    handoff.shot_brief_visual_purpose ||
    handoff.shot_brief_editorial_note ||
    handoff.shot_brief_open_questions
  if (!hasAnyBriefContent) return null

  return (
    <div className="px-2 py-2 border-l-2 border-primary/30 bg-foreground/[0.02] flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <FileText className="w-3 h-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Shot Brief · {sceneLabel}
        </span>
      </div>
      <Field label="Visual Purpose" value={handoff.shot_brief_visual_purpose} />
      <Field label="Editorial Note" value={handoff.shot_brief_editorial_note} tone="warn" />
      <Field label="Open Questions" value={handoff.shot_brief_open_questions} tone="question" />
    </div>
  )
}
