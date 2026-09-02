/**
 * Provider-agnostic AI interface (spec §47).
 *
 * Business code depends on this, never on a vendor SDK. Swapping providers is
 * one adapter; nothing above this file changes.
 */

export interface GenerationRequest {
  /** Stable instructions. Kept first and constant so it stays cacheable. */
  system: string;
  /** The task, with whatever minimised context the caller assembled. */
  prompt: string;
  maxOutputTokens?: number;
  /** How hard to work at it. Copy drafting is a low-effort task. */
  effort?: 'low' | 'medium' | 'high';
  /**
   * When set, the provider must return JSON matching this schema. Used for
   * list-shaped output (inclusions, exclusions) so the result never has to be
   * recovered by splitting prose on newlines.
   */
  jsonSchema?: { name: string; schema: Record<string, unknown> } | undefined;
}

export interface GenerationResult {
  /** Raw text, or the JSON string when a schema was requested. */
  text: string;
  /** Parsed object when a schema was requested and the response validated. */
  parsed?: unknown;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  /**
   * True when the provider declined the request. Callers surface this rather
   * than retrying — a refusal is information, not a transient failure.
   */
  refused: boolean;
  refusalReason?: string | undefined;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** False for the no-op provider, so callers can explain why nothing happened. */
  readonly isConfigured: boolean;

  generate(request: GenerationRequest): Promise<GenerationResult>;
}
