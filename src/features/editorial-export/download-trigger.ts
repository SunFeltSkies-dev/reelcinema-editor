/**
 * FCPXML download trigger (SC-I-9).
 *
 * Browser-side helper that converts an FCPXML string into a Blob and
 * triggers a download via a synthetic anchor click. Split from the
 * orchestrator so the orchestrator stays testable without a DOM mock
 * and so this helper can be swapped for other surfaces (e.g. a future
 * "save to OPFS" route or a server upload path) without touching the
 * generator.
 */

const FCPXML_MIME = 'application/xml'

/**
 * Trigger a browser download of the given FCPXML string under the given
 * filename. No-ops cleanly under non-browser test environments where
 * `document` is undefined — callers should still gate UI invocation on
 * `typeof window !== 'undefined'` if they need to detect the no-op.
 */
export function downloadFcpxml(xml: string, filename: string): void {
  if (typeof document === 'undefined') return

  const blob = new Blob([xml], { type: FCPXML_MIME })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } finally {
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }
}
