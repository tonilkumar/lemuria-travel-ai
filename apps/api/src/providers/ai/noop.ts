import type { AIProvider, GenerationRequest, GenerationResult } from './types.js';

/**
 * Default provider when no AI credentials are configured.
 *
 * Returns an unconfigured result rather than throwing, so a missing key
 * degrades one button instead of breaking a page. Callers check
 * `isConfigured` and tell the user plainly.
 */
export class NoopAIProvider implements AIProvider {
  readonly name = 'noop';
  readonly model = 'none';
  readonly isConfigured = false;

  async generate(_request: GenerationRequest): Promise<GenerationResult> {
    return {
      text: '',
      provider: this.name,
      model: this.model,
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      refused: true,
      refusalReason: 'not_configured',
    };
  }
}
