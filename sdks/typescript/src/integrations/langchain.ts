/**
 * LangChain integration for OrchestraAI SDK
 */

import type { OrchestraAI } from '../client';
import type { Trace } from '../tracer';
import type { Span } from '../tracer';
import { SpanStatus } from '../types';

function preview(value: unknown, max = 500): string | undefined {
  if (value == null) return undefined;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export interface LangChainHandlerOptions {
  /** OrchestraAI client */
  client: OrchestraAI;
  /** Agent/graph name (falls back to run name) */
  agentName?: string;
  /** Default metadata for all spans */
  metadata?: Record<string, unknown>;
}

/**
 * Create a LangChain callback handler that emits OrchestraAI traces/spans.
 *
 * Usage:
 * ```ts
 * import { createLangChainHandler } from '@orchestra-ai/sdk/integrations/langchain';
 *
 * const handler = createLangChainHandler({ client: oa, agentName: 'my-agent' });
 * await runnable.invoke(input, { callbacks: [handler] });
 * ```
 */
export function createLangChainHandler(options: LangChainHandlerOptions): any {
  const traces = new Map<string, Trace>();
  const spans = new Map<string, Span>();

  const getTrace = (runId?: string, parentRunId?: string): Trace | undefined => {
    if (parentRunId && traces.has(parentRunId)) return traces.get(parentRunId);
    if (runId && traces.has(runId)) return traces.get(runId);
    return undefined;
  };

  return {
    name: 'orchestra-langchain-handler',

    handleChainStart(serialized: any, inputs: any, runId: string, _parentRunId?: string): void {
      const name = options.agentName || serialized?.name || 'langchain-agent';
      const trace = options.client.startTrace(name, {
        metadata: { ...options.metadata, framework: 'langchain', inputs },
      });
      traces.set(runId, trace);

      const span = trace.step(serialized?.id?.[serialized.id.length - 1] || name, {
        metadata: { framework: 'langchain', runId },
      });
      spans.set(runId, span);
    },

    handleChainEnd(outputs: any, runId: string): void {
      const span = spans.get(runId);
      const trace = traces.get(runId);
      if (span) {
        span.setData({ outputs: preview(outputs) });
        span.end();
        spans.delete(runId);
      }
      if (trace) {
        trace.end();
        traces.delete(runId);
      }
    },

    handleChainError(error: any, runId: string): void {
      const span = spans.get(runId);
      const trace = traces.get(runId);
      if (span) {
        span.setError(error instanceof Error ? error : new Error(String(error)));
        span.end(SpanStatus.ERROR);
        spans.delete(runId);
      }
      if (trace) {
        trace.error(error instanceof Error ? error : new Error(String(error)));
        traces.delete(runId);
      }
    },

    handleLLMStart(llm: any, prompts: string[], runId: string, parentRunId?: string): void {
      const trace = getTrace(runId, parentRunId);
      if (!trace) return;

      const model = llm?.modelName || llm?.model || 'llm';
      const span = trace.llmCallSpan({
        model,
        inputPreview: preview(prompts?.[0]),
        metadata: { framework: 'langchain', runId, parentRunId },
      });
      spans.set(runId, span);
    },

    handleLLMEnd(output: any, runId: string): void {
      const span = spans.get(runId);
      if (!span) return;

      const usage = output?.llmOutput?.tokenUsage || output?.llm_output?.token_usage;
      const promptTokens = usage?.promptTokens || usage?.prompt_tokens;
      const completionTokens = usage?.completionTokens || usage?.completion_tokens;
      const text = output?.generations?.[0]?.[0]?.text || output?.text;

      span.setData({
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        outputPreview: preview(text),
      });
      span.end();
      spans.delete(runId);
    },

    handleLLMError(error: any, runId: string): void {
      const span = spans.get(runId);
      if (!span) return;
      span.setError(error instanceof Error ? error : new Error(String(error)));
      span.end(SpanStatus.ERROR);
      spans.delete(runId);
    },

    handleToolStart(tool: any, input: any, runId: string, parentRunId?: string): void {
      const trace = getTrace(runId, parentRunId);
      if (!trace) return;
      const toolName = tool?.name || tool?.id || 'tool';
      const span = trace.toolCall({
        toolName,
        toolInput: input,
        metadata: { framework: 'langchain', runId, parentRunId },
      });
      spans.set(runId, span);
    },

    handleToolEnd(output: any, runId: string): void {
      const span = spans.get(runId);
      if (!span) return;
      span.setData({ toolOutput: preview(output) });
      span.end();
      spans.delete(runId);
    },

    handleToolError(error: any, runId: string): void {
      const span = spans.get(runId);
      if (!span) return;
      span.setError(error instanceof Error ? error : new Error(String(error)));
      span.end(SpanStatus.ERROR);
      spans.delete(runId);
    },

    // Optional hook for retrievers/other components
    handleRetrieverStart(serialized: any, query: any, runId: string, parentRunId?: string): void {
      const trace = getTrace(runId, parentRunId);
      if (!trace) return;
      const span = trace.step(serialized?.id?.[serialized.id.length - 1] || 'retriever', {
        metadata: { framework: 'langchain', runId, parentRunId, query },
      });
      spans.set(runId, span);
    },

    handleRetrieverEnd(output: any, runId: string): void {
      const span = spans.get(runId);
      if (!span) return;
      span.setData({ output: preview(output) });
      span.end();
      spans.delete(runId);
    },
  };
}
