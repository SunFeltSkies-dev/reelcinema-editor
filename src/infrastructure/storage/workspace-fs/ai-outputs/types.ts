/**
 * Shared envelope for every AI-derived analysis output stored under
 * `media/{id}/cache/ai/{kind}.json`.
 *
 * One file per `AiOutputKind`. Envelope fields are identical across kinds so
 * invalidation logic works uniformly. Service-specific data goes inside `data`.
 */

import type { MediaCaption } from '@/infrastructure/analysis'

/**
 * Registry of AI output kinds. Adding a new AI service means:
 * 1. Add its name here.
 * 2. Add its payload type to `AiOutputPayloads` below.
 * 3. (Optional) Add a thin wrapper in `workspace-fs/` that calls
 *    `readAiOutput/writeAiOutput` with that kind.
 */
export type AiOutputKind = 'captions' | 'scenes'

/**
 * Typed payload per kind. Matches the `data` field on `AiOutput<T>`.
 * New kinds must be registered here so the storage API stays strongly typed.
 */
export interface AiOutputPayloads {
  captions: CaptionsPayload
  scenes: ScenesPayload
}

/**
 * Current schema version for the envelope itself. Bump when the envelope
 * shape changes (not when a payload changes — that's the payload's concern).
 */
export const AI_OUTPUT_SCHEMA_VERSION = 1

export interface AiOutput<K extends AiOutputKind> {
  schemaVersion: typeof AI_OUTPUT_SCHEMA_VERSION
  kind: K
  mediaId: string
  /** Stable service identifier, e.g. `"whisper-wasm"`, `"lfm-captioning"`. */
  service: string
  /** Model id/version, e.g. `"whisper-small"`, `"lfm-2.5-vl"`. */
  model: string
  /** Service-specific inputs that affect the output (quantization, threshold, sample interval). */
  params: Record<string, unknown>
  createdAt: number
  updatedAt: number
  data: AiOutputPayloads[K]
}

/* ───────────────── Payload shapes ───────────────── */

export type CaptionsPayload = {
  sampleIntervalSec?: number
  /**
   * Identifier of the text embedding model whose vectors live in the
   * companion `captions-embeddings.bin` file. Absence means embeddings
   * haven't been computed yet (keyword search still works).
   */
  embeddingModel?: string
  /** Dimension of each text embedding vector, e.g. 384 for all-MiniLM-L6-v2. */
  embeddingDim?: number
  /**
   * Identifier of the image (CLIP) embedding model whose vectors live
   * in `captions-image-embeddings.bin`. Independent of the text model;
   * present only when thumbnails have been visually indexed.
   */
  imageEmbeddingModel?: string
  /** Dimension of each image embedding vector, e.g. 512 for CLIP base. */
  imageEmbeddingDim?: number
  /**
   * SHA-256 of the source media bytes. When present, this envelope was
   * saved via the shared content-addressable cache — embedding bins and
   * caption thumbnails live under `content/{shard}/{hash}/ai/` and are
   * shared across every mediaId that resolves to the same hash. Per-caption
   * `thumbRelPath` values point into the content tree in this mode.
   */
  contentHash?: string
  captions: MediaCaption[]
}

export interface SceneCutPayload {
  frame: number
  time: number
  /** Service-defined motion metadata (histogram distance, flow magnitude, etc.). */
  motion: unknown
  verified?: boolean
}

export interface ScenesPayload {
  method: 'histogram' | 'optical-flow'
  sampleIntervalMs: number
  verificationModel?: string
  fps: number
  cuts: SceneCutPayload[]
}
