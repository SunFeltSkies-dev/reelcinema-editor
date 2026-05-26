/**
 * Editorial export feature (SC-I-9) — A17 path-B Resolve XML handoff.
 *
 * Consumes the Cinematography→Editorial envelope chain via the shipped
 * BackboneClient + `loadEditorialBin` orchestrator and produces an
 * FCPXML 1.10 document that imports cleanly into DaVinci Resolve 18+.
 *
 * Surface:
 *   - `<EditorialExportButton>` — mounted in the Editorial bin header
 *     (Option A per SC-I-9 UI ruling)
 *   - `exportToFcpxml(client, projectId, options)` — pure-ish orchestrator
 *     for programmatic invocation (future menu integration / E2E hooks)
 *   - `composeFcpxml(input)` — pure generator for unit testing + reuse
 */

export { EditorialExportButton } from './editorial-export-button'
export { exportToFcpxml } from './editorial-export-client'
export type { ExportToFcpxmlOptions, ExportToFcpxmlResult } from './editorial-export-client'
export { composeFcpxml, escapeXml } from './fcpxml-generator'
export { downloadFcpxml } from './download-trigger'
export type {
  FcpxmlExportSummary,
  FcpxmlInput,
  FcpxmlOutput,
  FcpxmlScene,
  FcpxmlSkippedScene,
  FcpxmlTake,
} from './types'
