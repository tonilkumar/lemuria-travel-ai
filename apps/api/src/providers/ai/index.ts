import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { AnthropicProvider } from './anthropic.js';
import { NoopAIProvider } from './noop.js';
import type { AIProvider } from './types.js';

let instance: AIProvider | null = null;

/**
 * Resolves the configured AI provider once per process.
 *
 * A provider selected without a key falls back to the no-op with a warning
 * rather than throwing on every request: the rest of the CRM keeps working and
 * the AI buttons explain themselves.
 */
export function getAI(): AIProvider {
  if (instance) return instance;

  if (env.AI_PROVIDER === 'anthropic') {
    if (!env.AI_API_KEY) {
      logger.warn('AI_PROVIDER is anthropic but AI_API_KEY is unset; AI drafting is disabled');
      instance = new NoopAIProvider();
      return instance;
    }
    instance = new AnthropicProvider({
      apiKey: env.AI_API_KEY,
      model: env.AI_MODEL,
      maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    });
    return instance;
  }

  if (env.AI_PROVIDER !== 'noop') {
    logger.warn(
      { provider: env.AI_PROVIDER },
      'No adapter for the configured AI provider; AI drafting is disabled',
    );
  }

  instance = new NoopAIProvider();
  return instance;
}

export type { AIProvider, GenerationRequest, GenerationResult } from './types.js';
