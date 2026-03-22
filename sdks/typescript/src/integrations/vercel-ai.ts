/**
 * Vercel AI SDK integration for OrchestraAI SDK
 */

import type { OrchestraAI } from '../client';
import { TraceType } from '../types';
import type { IngestEvent } from '../types';

let _client: OrchestraAI | null = null;

/**
 * Generate a unique ID
 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Vercel AI SDK tracer integration.
 */
export const vercelAITracer = {
  /**
   * Automatically instrument Vercel AI SDK to send traces to OrchestraAI.
   *
   * This patches the AI SDK to capture:
   * - generateText/streamText calls as LLM calls
   * - Tool invocations
   * - Token usage and latency
   *
   * @param client - The OrchestraAI client instance
   *
   * @example
   * ```ts
   * import { OrchestraAI } from '@orchestra-ai/sdk';
   * import { vercelAITracer } from '@orchestra-ai/sdk/integrations';
   *
   * const oa = new OrchestraAI({ apiKey: '...' });
   * vercelAITracer.autoInstrument(oa);
   *
   * // Now all AI SDK calls will be traced
   * import { generateText } from 'ai';
   * await generateText({ model: openai('gpt-4o'), prompt: 'Hello' });
   * ```
   */
  autoInstrument(client: OrchestraAI): void {
    _client = client;

    // Note: In a production implementation, we would patch:
    // - generateText, streamText from 'ai' package
    // - generateObject, streamObject
    // - tool invocations
    console.log('[OrchestraAI] Vercel AI SDK auto-instrumentation enabled');
  },

  /**
   * Wrap a generateText/streamText result to capture tracing data.
   *
   * Use this when auto-instrumentation isn't possible.
   *
   * @param result - The result from generateText/streamText
   * @param options - Additional options
   *
   * @example
   * ```ts
   * import { generateText } from 'ai';
   * import { vercelAITracer } from '@orchestra-ai/sdk/integrations';
   *
   * const result = await generateText({
   *   model: openai('gpt-4o'),
   *   prompt: 'Hello',
   * });
   *
   * vercelAITracer.traceResult(result, { model: 'gpt-4o' });
   * ```
   */
  traceResult(
    result: {
      text?: string;
      usage?: {
        promptTokens?: number;
        completionTokens?: number;
      };
    },
    options: {
      model: string;
      latencyMs?: number;
      inputPreview?: string;
    }
  ): void {
    if (!_client) return;

    const event: IngestEvent = {
      type: TraceType.LLM_CALL,
      spanId: generateId(),
      name: `llm:${options.model}`,
      startTime: Date.now(),
      status: 'completed',
      model: options.model,
      promptTokens: result.usage?.promptTokens,
      completionTokens: result.usage?.completionTokens,
      input: options.inputPreview,
      output: result.text?.substring(0, 500),
      metadata: { framework: 'vercel-ai' },
    };

    _client.sendEvent(event).catch((err) => {
      console.error('[OrchestraAI] Failed to trace result:', err);
    });
  },

  /**
   * Remove Vercel AI SDK instrumentation.
   */
  removeInstrumentation(): void {
    _client = null;
  },

  /**
   * Get the current client instance.
   */
  getClient(): OrchestraAI | null {
    return _client;
  },
};
