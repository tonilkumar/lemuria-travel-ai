import Anthropic from '@anthropic-ai/sdk';
import { dependencyFailure } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { AIProvider, GenerationRequest, GenerationResult } from './types.js';

/**
 * Anthropic adapter.
 *
 * The only file in the codebase that imports a model vendor's SDK. Everything
 * above it talks to `AIProvider`.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly model: string;
  readonly isConfigured = true;

  private readonly client: Anthropic;
  private readonly maxOutputTokens: number;

  constructor(config: { apiKey: string; model: string; maxOutputTokens: number }) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model;
    this.maxOutputTokens = config.maxOutputTokens;
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const startedAt = Date.now();

    try {
      const common = {
        model: this.model,
        max_tokens: request.maxOutputTokens ?? this.maxOutputTokens,
        // Drafting a paragraph of quotation copy is not a reasoning problem;
        // low effort keeps latency and cost down without hurting the output.
        output_config: { effort: request.effort ?? 'low' },
        // The system prompt is stable across every call for a given kind, so
        // caching it turns the repeated instructions into a near-free prefix.
        system: [
          {
            type: 'text' as const,
            text: request.system,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        messages: [{ role: 'user' as const, content: request.prompt }],
      };

      // Structured output when the caller wants a list back, plain text otherwise.
      const response = request.jsonSchema
        ? await this.client.messages.create({
            ...common,
            output_config: {
              ...common.output_config,
              // The SDK's JSON output format takes the schema only; the
              // caller's `name` is kept for logging, not sent.
              format: { type: 'json_schema' as const, schema: request.jsonSchema.schema },
            },
          })
        : await this.client.messages.create(common);

      const latencyMs = Date.now() - startedAt;

      // A safety decline arrives as a 200 with stop_reason "refusal" — it is
      // not an exception, and retrying it would just spend money again.
      if (response.stop_reason === 'refusal') {
        const category = response.stop_details?.category ?? null;
        logger.warn({ category }, 'AI provider declined the request');
        return {
          text: '',
          provider: this.name,
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          latencyMs,
          refused: true,
          refusalReason: category ?? 'declined',
        };
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      let parsed: unknown;
      if (request.jsonSchema && text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          // Leave `parsed` undefined; the caller falls back to the raw text
          // rather than throwing away a usable draft.
          logger.warn('AI returned unparseable JSON for a schema request');
        }
      }

      return {
        text,
        parsed,
        provider: this.name,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs,
        refused: false,
      };
    } catch (err) {
      // Typed SDK errors, most specific first.
      if (err instanceof Anthropic.RateLimitError) {
        throw dependencyFailure('The AI service is busy. Try again in a moment.', err);
      }
      if (err instanceof Anthropic.AuthenticationError) {
        logger.error('AI provider rejected the configured credentials');
        throw dependencyFailure('The AI service is not configured correctly.', err);
      }
      if (err instanceof Anthropic.BadRequestError) {
        throw dependencyFailure('The AI service rejected that request.', err);
      }
      if (err instanceof Anthropic.APIConnectionError) {
        throw dependencyFailure('Could not reach the AI service.', err);
      }
      if (err instanceof Anthropic.APIError) {
        throw dependencyFailure('The AI service returned an error.', err);
      }
      throw err;
    }
  }
}
