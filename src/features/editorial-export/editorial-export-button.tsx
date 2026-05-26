/**
 * Editorial export button (SC-I-9 A17 path-B).
 *
 * Mounted in the Editorial bin header (per UI integration Option A from
 * the SC-I-9 dispatch — SC-I-7 menu integration is not yet shipped, so
 * placing the trigger inside the bin keeps the surface coherent without
 * blocking on the File/Edit/View work). Clicking the button drives the
 * orchestrator (`exportToFcpxml`) and the browser download helper
 * (`downloadFcpxml`), with idle / generating / success / error states
 * surfaced inline so the user gets feedback for the multi-step network
 * + XML composition pipeline.
 *
 * Success state auto-resets after a short interval so the button is
 * ready for re-export without requiring a separate "reset" action.
 */

import { useEffect, useState } from 'react'
import { Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { createLogger } from '@/shared/logging/logger'
import type { BackboneClient } from '@/infrastructure/storage/reelcinema'
import { exportToFcpxml, type ExportToFcpxmlResult } from './editorial-export-client'
import { downloadFcpxml } from './download-trigger'

const log = createLogger('editorial-export/button')
const SUCCESS_RESET_MS = 3500

type ExportState =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'success'; result: ExportToFcpxmlResult }
  | { kind: 'error'; message: string }

interface EditorialExportButtonProps {
  projectId: string
  client: BackboneClient
  /** Optional human-readable project name; falls back to a projectId-derived label. */
  projectName?: string
  /** Disable the button externally (e.g. while the bin is loading). */
  disabled?: boolean
}

export function EditorialExportButton({
  projectId,
  client,
  projectName,
  disabled,
}: EditorialExportButtonProps) {
  const [state, setState] = useState<ExportState>({ kind: 'idle' })

  useEffect(() => {
    if (state.kind !== 'success') return
    const timer = setTimeout(() => setState({ kind: 'idle' }), SUCCESS_RESET_MS)
    return () => clearTimeout(timer)
  }, [state])

  const busy = state.kind === 'generating'
  const isDisabled = disabled || busy

  async function handleClick() {
    setState({ kind: 'generating' })
    try {
      const result = await exportToFcpxml(client, projectId, { projectName })
      downloadFcpxml(result.xml, result.filename)
      setState({ kind: 'success', result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('FCPXML export failed', { projectId, message })
      setState({ kind: 'error', message })
    }
  }

  return (
    <div className="flex items-center gap-2" data-testid="editorial-export">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        aria-label="Export to Resolve"
        aria-busy={busy}
        data-testid="editorial-export-button"
        className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 bg-foreground/5 px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-foreground hover:bg-foreground/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {state.kind === 'generating' ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : state.kind === 'success' ? (
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
        ) : state.kind === 'error' ? (
          <AlertCircle className="w-3 h-3 text-destructive" />
        ) : (
          <Download className="w-3 h-3" />
        )}
        <span>Export to Resolve</span>
      </button>
      {state.kind === 'success' && (
        <span
          className="text-[10px] text-muted-foreground"
          data-testid="editorial-export-success"
          role="status"
        >
          Exported {state.result.summary.exportedSceneCount} scene
          {state.result.summary.exportedSceneCount === 1 ? '' : 's'}
          {state.result.summary.skippedScenes.length > 0
            ? ` · ${state.result.summary.skippedScenes.length} skipped`
            : ''}
        </span>
      )}
      {state.kind === 'error' && (
        <span
          className="text-[10px] text-destructive"
          data-testid="editorial-export-error"
          role="alert"
        >
          {state.message}
        </span>
      )}
    </div>
  )
}
