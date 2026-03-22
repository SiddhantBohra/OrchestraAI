/**
 * Vercel AI SDK integration for OrchestraAI SDK
 *
 * Uses a wrapper approach (wrapGenerateText, wrapStreamText, etc.) since
 * ES modules can't be monkey-patched. Each wrapper intercepts the call,
 * creates a trace with proper spans, and captures model, tokens, cost,
 * latency, input/output, tool calls, streaming tokens, and time-to-first-token.
 *
 * @example
 * ```ts
 * import { OrchestraAI } from '@orchestra-ai/sdk';
 * import { createVercelAITracer } from '@orchestra-ai/sdk/integrations';
 * import { generateText, streamText, generateObject } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 *
 * const oa = new OrchestraAI({ apiKey: '...' });
 * const { wrapGenerateText, wrapStreamText, wrapGenerateObject } = createVercelAITracer({
 *   client: oa,
 *   agentName: 'my-agent',
 * });
 *
 * const tracedGenerateText = wrapGenerateText(generateText);
 * const result = await tracedGenerateText({ model: openai('gpt-4o'), prompt: 'Hello' });
 * ```
 */

import type { OrchestraAI } from '../client';
import type { Trace } from '../tracer';
import { SpanStatus } from '../types';

// ── Helpers ──────────────────────────────────────────────────

function preview(value: unknown, max = 500): string | undefined {
  if (value == null) return undefined;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/**
 * Extract the model identifier string from the Vercel AI SDK model object.
 * The model object typically has a `modelId` property or can be stringified.
 */
function extractModelId(model: unknown): string {
  if (model == null) return 'unknown';
  if (typeof model === 'string') return model;
  const obj = model as Record<string, unknown>;
  if (typeof obj.modelId === 'string') return obj.modelId;
  if (typeof obj.id === 'string') return obj.id;
  // Some provider models expose provider + modelId
  const provider = typeof obj.provider === 'string' ? obj.provider : '';
  const modelId = typeof obj.modelId === 'string' ? obj.modelId : '';
  if (provider && modelId) return `${provider}:${modelId}`;
  return String(model);
}

/**
 * Extract input preview from Vercel AI SDK call options.
 * Supports: prompt (string), messages (array), system (string).
 */
function extractInput(options: Record<string, unknown>): string | undefined {
  if (typeof options.prompt === 'string') {
    return preview(options.prompt);
  }
  if (Array.isArray(options.messages)) {
    const lastMsg = options.messages[options.messages.length - 1] as Record<string, unknown> | undefined;
    if (lastMsg) {
      const content = lastMsg.content ?? lastMsg.text;
      return preview(content);
    }
  }
  if (typeof options.system === 'string') {
    return preview(options.system);
  }
  return undefined;
}

// ── Types ────────────────────────────────────────────────────

/** Usage shape returned by Vercel AI SDK results */
interface VercelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** Tool call shape from Vercel AI SDK */
interface VercelToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/** Tool result shape from Vercel AI SDK */
interface VercelToolResult {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

/** Step shape from Vercel AI SDK's multi-step generateText */
interface VercelStep {
  text: string;
  usage: VercelUsage;
  toolCalls?: VercelToolCall[];
  toolResults?: VercelToolResult[];
  finishReason: string;
}

/** generateText result shape */
interface GenerateTextResult {
  text: string;
  usage: VercelUsage;
  finishReason: string;
  toolCalls?: VercelToolCall[];
  toolResults?: VercelToolResult[];
  steps?: VercelStep[];
  response?: {
    id?: string;
    model?: string;
    timestamp?: Date;
  };
  [key: string]: unknown;
}

/** streamText result shape */
interface StreamTextResult {
  textStream: AsyncIterable<string>;
  text: Promise<string>;
  usage: Promise<VercelUsage>;
  toolCalls: Promise<VercelToolCall[]>;
  finishReason: Promise<string>;
  response?: Promise<{
    id?: string;
    model?: string;
  }>;
  [key: string]: unknown;
}

/** generateObject result shape */
interface GenerateObjectResult {
  object: unknown;
  usage: VercelUsage;
  finishReason?: string;
  response?: {
    id?: string;
    model?: string;
  };
  [key: string]: unknown;
}

/** streamObject result shape */
interface StreamObjectResult {
  object: Promise<unknown>;
  partialObjectStream: AsyncIterable<unknown>;
  usage: Promise<VercelUsage>;
  [key: string]: unknown;
}

// ── Options ──────────────────────────────────────────────────

export interface VercelAITracerOptions {
  /** OrchestraAI client instance */
  client: OrchestraAI;
  /** Agent name for the trace root. Default: 'vercel-ai-agent' */
  agentName?: string;
  /** Session ID for multi-turn conversations */
  sessionId?: string;
  /** User ID for per-user attribution */
  userId?: string;
  /** Tags for trace organization */
  tags?: string[];
  /** Additional metadata to attach to all traces */
  metadata?: Record<string, unknown>;
}

export interface TraceResultOptions {
  /** Model name (auto-detected from result when possible) */
  model?: string;
  /** Input preview (prompt or last message) */
  inputPreview?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ── Factory ──────────────────────────────────────────────────

/**
 * Create a Vercel AI SDK tracer that returns wrapper functions.
 *
 * @example
 * ```ts
 * const tracer = createVercelAITracer({ client: oa, agentName: 'my-agent' });
 *
 * // Wrap the Vercel AI SDK functions
 * const traced = tracer.wrapGenerateText(generateText);
 * const result = await traced({ model: openai('gpt-4o'), prompt: 'Hello' });
 * // Trace is automatically sent to OrchestraAI
 * ```
 */
export function createVercelAITracer(options: VercelAITracerOptions) {
  const {
    client,
    agentName = 'vercel-ai-agent',
    sessionId,
    userId,
    tags,
    metadata: baseMetadata,
  } = options;

  function startTrace(operationName: string): Trace {
    return client.startTrace(agentName, {
      sessionId,
      userId,
      tags,
      metadata: { ...baseMetadata, framework: 'vercel-ai', operation: operationName },
    });
  }

  /**
   * Record tool calls as child spans on a trace.
   */
  function recordToolCalls(
    trace: Trace,
    toolCalls?: VercelToolCall[],
    toolResults?: VercelToolResult[],
  ): void {
    if (!toolCalls || toolCalls.length === 0) return;

    const resultMap = new Map<string, unknown>();
    if (toolResults) {
      for (const tr of toolResults) {
        resultMap.set(tr.toolCallId, tr.result);
      }
    }

    for (const tc of toolCalls) {
      const span = trace.toolCall({
        toolName: tc.toolName,
        toolInput: tc.args,
        metadata: { framework: 'vercel-ai', toolCallId: tc.toolCallId },
      });
      const result = resultMap.get(tc.toolCallId);
      if (result !== undefined) {
        span.setData({ toolOutput: result });
      }
      span.end();
    }
  }

  /**
   * Record multi-step execution as nested spans (steps with LLM calls + tool calls).
   */
  function recordSteps(trace: Trace, steps: VercelStep[], model: string): void {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepSpan = trace.step(`step-${i + 1}`, {
        metadata: { framework: 'vercel-ai', finishReason: step.finishReason },
      });

      // Record the LLM call within this step
      const llmSpan = trace.llmCallSpan({
        model,
        inputTokens: step.usage.promptTokens,
        outputTokens: step.usage.completionTokens,
        outputPreview: preview(step.text),
        metadata: { framework: 'vercel-ai', stepIndex: i },
      });
      llmSpan.end();

      // Record tool calls within this step
      recordToolCalls(trace, step.toolCalls, step.toolResults);

      stepSpan.setData({ outputPreview: preview(step.text) });
      stepSpan.end();
    }
  }

  // ── wrapGenerateText ─────────────────────────────────────

  /**
   * Wrap the Vercel AI SDK `generateText` function to auto-trace.
   *
   * Captures: model, tokens, latency, input/output, tool calls, multi-step execution.
   *
   * @example
   * ```ts
   * import { generateText } from 'ai';
   * const traced = tracer.wrapGenerateText(generateText);
   * const result = await traced({ model: openai('gpt-4o'), prompt: 'Hello' });
   * ```
   */
  function wrapGenerateText<TOptions extends Record<string, unknown>>(
    fn: (options: TOptions) => Promise<GenerateTextResult>,
  ): (options: TOptions) => Promise<GenerateTextResult> {
    return async (callOptions: TOptions): Promise<GenerateTextResult> => {
      const model = extractModelId(callOptions.model);
      const inputPreview = extractInput(callOptions);
      const trace = startTrace('generateText');
      const startTime = Date.now();

      try {
        const result = await fn(callOptions);
        const latencyMs = Date.now() - startTime;
        const responseModel = result.response?.model || model;

        // If multi-step, record each step; otherwise record a single LLM call
        if (result.steps && result.steps.length > 1) {
          recordSteps(trace, result.steps, responseModel);
        } else {
          // Single LLM call span
          const llmSpan = trace.llmCallSpan({
            model: responseModel,
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            latencyMs,
            inputPreview,
            outputPreview: preview(result.text),
            metadata: {
              framework: 'vercel-ai',
              finishReason: result.finishReason,
              operation: 'generateText',
            },
          });
          llmSpan.end();

          // Record tool calls at the top level (single-step)
          recordToolCalls(trace, result.toolCalls, result.toolResults);
        }

        trace.end();
        return result;
      } catch (error) {
        trace.error(error instanceof Error ? error : new Error(String(error)));
        trace.end();
        throw error;
      }
    };
  }

  // ── wrapStreamText ───────────────────────────────────────

  /**
   * Wrap the Vercel AI SDK `streamText` function to auto-trace.
   *
   * Captures: model, streaming tokens, time-to-first-token, final usage, tool calls.
   * The returned result's `textStream` is wrapped to capture tokens as they arrive.
   *
   * @example
   * ```ts
   * import { streamText } from 'ai';
   * const traced = tracer.wrapStreamText(streamText);
   * const result = traced({ model: openai('gpt-4o'), prompt: 'Hello' });
   * for await (const chunk of result.textStream) { process.stdout.write(chunk); }
   * ```
   */
  function wrapStreamText<TOptions extends Record<string, unknown>>(
    fn: (options: TOptions) => StreamTextResult,
  ): (options: TOptions) => StreamTextResult {
    return (callOptions: TOptions): StreamTextResult => {
      const model = extractModelId(callOptions.model);
      const inputPreview = extractInput(callOptions);
      const trace = startTrace('streamText');
      const startTime = Date.now();

      const result = fn(callOptions);

      // Create the LLM span that will track streaming tokens
      const llmSpan = trace.llmCallSpan({
        model,
        inputPreview,
        metadata: { framework: 'vercel-ai', operation: 'streamText' },
      });

      // Wrap the textStream to capture tokens and time-to-first-token
      const originalStream = result.textStream;
      const wrappedStream: AsyncIterable<string> = {
        [Symbol.asyncIterator]() {
          const iterator = originalStream[Symbol.asyncIterator]();
          return {
            async next(): Promise<IteratorResult<string>> {
              const { value, done } = await iterator.next();
              if (!done && value != null) {
                llmSpan.addToken(value);
              }
              return { value, done } as IteratorResult<string>;
            },
            async return(val?: unknown): Promise<IteratorResult<string>> {
              if (iterator.return) return iterator.return(val);
              return { value: undefined as unknown as string, done: true };
            },
            async throw(err?: unknown): Promise<IteratorResult<string>> {
              if (iterator.throw) return iterator.throw(err);
              throw err;
            },
          };
        },
      };

      // Finalize the trace after the stream completes by resolving usage
      const finalizeTrace = async (): Promise<void> => {
        try {
          const [usage, toolCalls] = await Promise.all([
            result.usage,
            result.toolCalls,
          ]);

          llmSpan.setData({
            inputTokens: usage?.promptTokens,
            outputTokens: usage?.completionTokens,
            latencyMs: Date.now() - startTime,
          });
          llmSpan.end();

          recordToolCalls(trace, toolCalls);
          trace.end();
        } catch (error) {
          llmSpan.setError(error instanceof Error ? error : new Error(String(error)));
          llmSpan.end(SpanStatus.ERROR);
          trace.error(error instanceof Error ? error : new Error(String(error)));
          trace.end();
        }
      };

      // Create a wrapped text promise that triggers finalization
      const wrappedTextPromise = result.text.then(async (text) => {
        // Schedule finalization (don't block the text return)
        finalizeTrace().catch((err) => {
          console.error('[OrchestraAI] Vercel AI trace finalization error:', err);
        });
        return text;
      });

      // Return a result that looks like the original but with wrapped stream
      return {
        ...result,
        textStream: wrappedStream,
        text: wrappedTextPromise,
      };
    };
  }

  // ── wrapGenerateObject ───────────────────────────────────

  /**
   * Wrap the Vercel AI SDK `generateObject` function to auto-trace.
   *
   * Captures: model, tokens, latency, input/output (structured object).
   *
   * @example
   * ```ts
   * import { generateObject } from 'ai';
   * import { z } from 'zod';
   * const traced = tracer.wrapGenerateObject(generateObject);
   * const { object } = await traced({
   *   model: openai('gpt-4o'),
   *   schema: z.object({ name: z.string() }),
   *   prompt: 'Generate a name',
   * });
   * ```
   */
  function wrapGenerateObject<TOptions extends Record<string, unknown>>(
    fn: (options: TOptions) => Promise<GenerateObjectResult>,
  ): (options: TOptions) => Promise<GenerateObjectResult> {
    return async (callOptions: TOptions): Promise<GenerateObjectResult> => {
      const model = extractModelId(callOptions.model);
      const inputPreview = extractInput(callOptions);
      const trace = startTrace('generateObject');
      const startTime = Date.now();

      try {
        const result = await fn(callOptions);
        const latencyMs = Date.now() - startTime;
        const responseModel = result.response?.model || model;

        const llmSpan = trace.llmCallSpan({
          model: responseModel,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          latencyMs,
          inputPreview,
          outputPreview: preview(result.object),
          metadata: {
            framework: 'vercel-ai',
            operation: 'generateObject',
            finishReason: result.finishReason,
          },
        });
        llmSpan.end();
        trace.end();
        return result;
      } catch (error) {
        trace.error(error instanceof Error ? error : new Error(String(error)));
        trace.end();
        throw error;
      }
    };
  }

  // ── wrapStreamObject ─────────────────────────────────────

  /**
   * Wrap the Vercel AI SDK `streamObject` function to auto-trace.
   *
   * Captures: model, tokens, latency, streaming partial objects, final object.
   *
   * @example
   * ```ts
   * import { streamObject } from 'ai';
   * import { z } from 'zod';
   * const traced = tracer.wrapStreamObject(streamObject);
   * const result = traced({
   *   model: openai('gpt-4o'),
   *   schema: z.object({ name: z.string() }),
   *   prompt: 'Generate a name',
   * });
   * for await (const partial of result.partialObjectStream) { console.log(partial); }
   * const final = await result.object;
   * ```
   */
  function wrapStreamObject<TOptions extends Record<string, unknown>>(
    fn: (options: TOptions) => StreamObjectResult,
  ): (options: TOptions) => StreamObjectResult {
    return (callOptions: TOptions): StreamObjectResult => {
      const model = extractModelId(callOptions.model);
      const inputPreview = extractInput(callOptions);
      const trace = startTrace('streamObject');
      const startTime = Date.now();

      const result = fn(callOptions);

      const llmSpan = trace.llmCallSpan({
        model,
        inputPreview,
        metadata: { framework: 'vercel-ai', operation: 'streamObject' },
      });

      // Track partial object count for metadata
      let partialCount = 0;

      // Wrap partialObjectStream to track streaming progress
      const originalPartialStream = result.partialObjectStream;
      const wrappedPartialStream: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]() {
          const iterator = originalPartialStream[Symbol.asyncIterator]();
          return {
            async next(): Promise<IteratorResult<unknown>> {
              const iterResult = await iterator.next();
              if (!iterResult.done) {
                partialCount++;
                // Track first partial as "first token" equivalent
                if (partialCount === 1) {
                  llmSpan.addToken(JSON.stringify(iterResult.value).slice(0, 50));
                }
              }
              return iterResult;
            },
            async return(val?: unknown): Promise<IteratorResult<unknown>> {
              if (iterator.return) return iterator.return(val);
              return { value: undefined, done: true };
            },
            async throw(err?: unknown): Promise<IteratorResult<unknown>> {
              if (iterator.throw) return iterator.throw(err);
              throw err;
            },
          };
        },
      };

      // Wrap the object promise to finalize the trace
      const wrappedObjectPromise = result.object.then(
        async (obj) => {
          try {
            const usage = await result.usage;
            llmSpan.setData({
              inputTokens: usage?.promptTokens,
              outputTokens: usage?.completionTokens,
              outputPreview: preview(obj),
              latencyMs: Date.now() - startTime,
            });
            llmSpan.end();
            trace.end();
          } catch (finalizeErr) {
            console.error('[OrchestraAI] Vercel AI trace finalization error:', finalizeErr);
            llmSpan.end();
            trace.end();
          }
          return obj;
        },
        (error) => {
          llmSpan.setError(error instanceof Error ? error : new Error(String(error)));
          llmSpan.end(SpanStatus.ERROR);
          trace.error(error instanceof Error ? error : new Error(String(error)));
          trace.end();
          throw error;
        },
      );

      return {
        ...result,
        partialObjectStream: wrappedPartialStream,
        object: wrappedObjectPromise,
      };
    };
  }

  // ── traceResult (manual) ─────────────────────────────────

  /**
   * Manually trace a Vercel AI SDK result after the call has completed.
   *
   * Use this for one-off tracing when wrapping is inconvenient.
   *
   * @example
   * ```ts
   * const result = await generateText({ model: openai('gpt-4o'), prompt: 'Hello' });
   * tracer.traceResult(result, { model: 'gpt-4o', inputPreview: 'Hello' });
   * ```
   */
  function traceResult(
    result: {
      text?: string;
      object?: unknown;
      usage?: VercelUsage;
      toolCalls?: VercelToolCall[];
      toolResults?: VercelToolResult[];
      finishReason?: string;
      response?: { model?: string };
    },
    options?: TraceResultOptions,
  ): void {
    const resolvedModel = options?.model || result.response?.model || 'unknown';
    const trace = startTrace('traceResult');

    const output = result.text != null ? preview(result.text) : preview(result.object);

    const llmSpan = trace.llmCallSpan({
      model: resolvedModel,
      inputTokens: result.usage?.promptTokens,
      outputTokens: result.usage?.completionTokens,
      inputPreview: options?.inputPreview,
      outputPreview: output,
      metadata: {
        framework: 'vercel-ai',
        operation: 'traceResult',
        finishReason: result.finishReason,
        ...options?.metadata,
      },
    });
    llmSpan.end();

    recordToolCalls(trace, result.toolCalls, result.toolResults);
    trace.end();
  }

  return {
    wrapGenerateText,
    wrapStreamText,
    wrapGenerateObject,
    wrapStreamObject,
    traceResult,
  };
}
