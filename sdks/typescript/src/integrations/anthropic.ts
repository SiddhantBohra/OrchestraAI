/**
 * Anthropic SDK integration for OrchestraAI (TypeScript).
 *
 * Since the TS SDK supports auto-extraction from any response with a
 * `usage` object, Anthropic responses work out of the box:
 *
 * ```ts
 * const response = await anthropic.messages.create({ ... });
 * await trace.llmCall({ response }); // tokens + model auto-extracted
 * ```
 *
 * This module provides a convenience wrapper for explicit Anthropic tracing.
 */

import type { OrchestraAI } from '../client';
import type { Trace } from '../tracer';
import { extractTokenUsage } from '../token-extraction';

export interface AnthropicTracerOptions {
  client: OrchestraAI;
  agentName?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create a traced Anthropic wrapper.
 *
 * @example
 * ```ts
 * import Anthropic from '@anthropic-ai/sdk';
 * import { createAnthropicTracer } from '@orchestra-ai/sdk/integrations/anthropic';
 *
 * const tracer = createAnthropicTracer({ client: oa });
 * const anthropic = new Anthropic();
 *
 * // Inside a trace:
 * await oa.trace('my-agent', async (trace) => {
 *   const response = await anthropic.messages.create({ ... });
 *   await trace.llmCall({ response }); // auto-extracts input_tokens, output_tokens, model
 * });
 * ```
 */
export function createAnthropicTracer(options: AnthropicTracerOptions) {
  return {
    /**
     * Record an Anthropic messages.create response as a traced LLM call.
     */
    recordCall(trace: Trace, response: unknown, inputPreview?: string): void {
      const usage = extractTokenUsage(response);
      const span = trace.llmCallSpan({
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        response,
        inputPreview,
        metadata: { ...options.metadata, framework: 'anthropic' },
      });

      // Extract output preview from Anthropic response shape
      const res = response as Record<string, unknown>;
      const content = res?.content;
      if (Array.isArray(content) && content.length > 0) {
        const text = (content[0] as Record<string, unknown>)?.text;
        if (typeof text === 'string') {
          span.setData({ outputPreview: text.slice(0, 500) });
        }
      }

      span.end();
    },
  };
}
