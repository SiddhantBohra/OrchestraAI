/**
 * Anthropic SDK integration for OrchestraAI (TypeScript).
 *
 * Two modes:
 * 1. Auto-instrument: patches Anthropic SDK to trace all messages.create calls
 * 2. Manual: use recordCall() inside an existing trace
 *
 * @example Auto-instrument
 * ```ts
 * import Anthropic from '@anthropic-ai/sdk';
 * import { anthropicTracer } from '@orchestra-ai/sdk/integrations';
 *
 * const oa = new OrchestraAI({ apiKey: '...' });
 * const anthropic = new Anthropic();
 * anthropicTracer.autoInstrument(oa, anthropic);
 *
 * // All messages.create calls are now traced
 * await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', ... });
 * ```
 *
 * @example Manual tracing
 * ```ts
 * const tracer = createAnthropicTracer({ client: oa });
 * const response = await anthropic.messages.create({ ... });
 * tracer.recordCall(trace, response);
 * ```
 */

import type { OrchestraAI } from '../client';
import type { Trace } from '../tracer';
import { extractTokenUsage } from '../token-extraction';

export interface AnthropicTracerOptions {
  client: OrchestraAI;
  agentName?: string;
  metadata?: Record<string, unknown>;
}

// ─── Auto-instrument ─────────────────────────────────────────

let _client: OrchestraAI | null = null;
let _originalCreate: ((...args: any[]) => any) | null = null;

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Extract output text from an Anthropic Message response */
function extractOutput(response: any): string | undefined {
  const content = response?.content;
  if (Array.isArray(content) && content.length > 0) {
    const text = content[0]?.text;
    if (typeof text === 'string') return text.slice(0, 500);
  }
  return undefined;
}

/** Extract input preview from messages array */
function extractInput(messages: any[]): string | undefined {
  if (!messages || messages.length === 0) return undefined;
  const last = messages[messages.length - 1];
  const content = typeof last === 'string' ? last : last?.content;
  if (typeof content === 'string') return content.slice(0, 500);
  if (Array.isArray(content)) {
    const textBlock = content.find((b: any) => b?.type === 'text');
    return textBlock?.text?.slice(0, 500);
  }
  return undefined;
}

/** Extract tool use blocks from response */
function extractToolCalls(response: any): Array<{ name: string; input: any }> {
  const content = response?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((b: any) => b?.type === 'tool_use')
    .map((b: any) => ({ name: b.name, input: b.input }));
}

export const anthropicTracer = {
  /**
   * Auto-instrument an Anthropic client instance.
   * Patches messages.create to trace every call.
   */
  autoInstrument(client: OrchestraAI, anthropicClient: any): void {
    _client = client;

    const messages = anthropicClient?.messages;
    if (!messages || typeof messages.create !== 'function') {
      console.warn('[OrchestraAI] Could not find anthropic.messages.create to patch');
      return;
    }

    _originalCreate = messages.create.bind(messages);

    messages.create = async function patchedCreate(...args: any[]) {
      const kwargs = args[0] || {};
      const isStreaming = kwargs.stream === true;
      const start = Date.now();

      if (isStreaming) {
        return _handleStream(_originalCreate!, args, kwargs, start);
      }

      // Non-streaming
      const result = await _originalCreate!(...args);
      _recordCall(result, kwargs, start);
      return result;
    };
  },

  removeInstrumentation(anthropicClient?: any): void {
    if (_originalCreate && anthropicClient?.messages) {
      anthropicClient.messages.create = _originalCreate;
    }
    _client = null;
    _originalCreate = null;
  },
};

async function* _handleStream(
  originalCreate: (...args: any[]) => any,
  args: any[],
  kwargs: any,
  start: number,
): AsyncGenerator<any> {
  const stream = await originalCreate(...args);
  const tokens: string[] = [];
  let firstTokenTime: number | null = null;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let model: string | undefined;

  try {
    for await (const event of stream) {
      yield event;

      // Track streaming content
      if (event?.type === 'content_block_delta' && event?.delta?.text) {
        if (firstTokenTime === null) firstTokenTime = Date.now();
        tokens.push(event.delta.text);
      }

      // Extract usage from message events
      if (event?.type === 'message_start' && event?.message?.usage) {
        inputTokens = event.message.usage.input_tokens;
        model = event.message.model;
      }
      if (event?.type === 'message_delta' && event?.usage) {
        outputTokens = event.usage.output_tokens;
      }
    }
  } finally {
    // Record the complete call
    if (_client) {
      const now = Date.now();
      const traceId = generateId();
      const spanId = generateId();

      _client.sendEvent({
        type: 'llm_call' as any,
        traceId,
        spanId,
        name: `llm:${model || kwargs.model || 'claude'}`,
        startTime: start,
        endTime: now,
        status: 'completed',
        model: model || kwargs.model,
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        input: extractInput(kwargs.messages),
        output: tokens.length > 0 ? tokens.join('').slice(0, 500) : undefined,
        metadata: {
          framework: 'anthropic',
          streaming: true,
          timeToFirstTokenMs: firstTokenTime ? firstTokenTime - start : undefined,
        },
      }).catch(() => {});
    }
  }
}

function _recordCall(result: any, kwargs: any, start: number): void {
  if (!_client) return;

  const usage = extractTokenUsage(result);
  const model = usage.model || kwargs.model || 'claude';
  const now = Date.now();
  const toolCalls = extractToolCalls(result);

  const traceId = generateId();
  const spanId = generateId();

  _client.sendEvent({
    type: 'llm_call' as any,
    traceId,
    spanId,
    name: `llm:${model}`,
    startTime: start,
    endTime: now,
    status: 'completed',
    model,
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    input: extractInput(kwargs.messages),
    output: extractOutput(result),
    metadata: {
      framework: 'anthropic',
      auto_instrumented: true,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls.map(t => t.name) } : {}),
    },
  }).catch(() => {});

  // Record tool calls as separate spans
  for (const tc of toolCalls) {
    _client.sendEvent({
      type: 'tool_call' as any,
      traceId,
      spanId: generateId(),
      parentSpanId: spanId,
      name: `tool:${tc.name}`,
      startTime: start,
      endTime: now,
      status: 'completed',
      toolName: tc.name,
      toolArgs: tc.input,
      metadata: { framework: 'anthropic' },
    }).catch(() => {});
  }
}

// ─── Manual tracer (for use inside existing traces) ──────────

/**
 * Create a manual Anthropic tracer for use inside existing traces.
 */
export function createAnthropicTracer(options: AnthropicTracerOptions) {
  return {
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

      const output = extractOutput(response);
      if (output) span.setData({ outputPreview: output });

      // Record tool uses as child spans
      const toolCalls = extractToolCalls(response);
      for (const tc of toolCalls) {
        const toolSpan = trace.toolCall({
          toolName: tc.name,
          toolInput: tc.input,
          metadata: { framework: 'anthropic' },
        });
        toolSpan.end();
      }

      span.end();
    },
  };
}
