/**
 * LangChain integration for OrchestraAI SDK
 *
 * Creates ONE trace per top-level invocation and nests all internal
 * chains, LLM calls, tool calls, and retrievers as child spans.
 */

import type { OrchestraAI } from '../client';
import type { Trace } from '../tracer';
import type { Span } from '../tracer';
import { SpanStatus } from '../types';
import { extractTokenUsage } from '../token-extraction';

function preview(value: unknown, max = 500): string | undefined {
  if (value == null) return undefined;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export interface LangChainHandlerOptions {
  /** OrchestraAI client */
  client: OrchestraAI;
  /** Agent/graph name */
  agentName?: string;
  /** Session ID for multi-turn conversations */
  sessionId?: string;
  /** Default metadata for all spans */
  metadata?: Record<string, unknown>;
}

/**
 * Create a LangChain callback handler that emits OrchestraAI traces/spans.
 *
 * One trace is created for the root chain invocation. All nested chains,
 * LLM calls, tool calls, and retrievers become child spans.
 */
export function createLangChainHandler(options: LangChainHandlerOptions): any {
  let rootTrace: Trace | null = null;
  const spans = new Map<string, Span>();
  const runToParent = new Map<string, string>(); // runId → parentRunId

  /** Get or create the root trace. Only the first chain creates a trace. */
  function ensureTrace(runId: string, parentRunId?: string, name?: string): Trace {
    if (parentRunId) runToParent.set(runId, parentRunId);

    if (!rootTrace) {
      const traceName = options.agentName || name || 'langchain-agent';
      rootTrace = options.client.startTrace(traceName, {
        sessionId: options.sessionId,
        metadata: { ...options.metadata, framework: 'langchain' },
      });
    }
    return rootTrace;
  }

  /** Check if this is the root run (no parent). */
  function isRootRun(runId: string): boolean {
    return !runToParent.has(runId);
  }

  return {
    name: 'orchestra-langchain-handler',

    // ── Chain (graph/sequence/runnable) ──────────────────────

    handleChainStart(serialized: any, inputs: any, runId: string, parentRunId?: string): void {
      const trace = ensureTrace(runId, parentRunId, serialized?.name);
      const chainName = serialized?.id?.[serialized.id.length - 1]
        || serialized?.name
        || 'chain';

      const span = trace.step(chainName, {
        metadata: { framework: 'langchain', runId, inputs: preview(inputs, 200) },
      });
      spans.set(runId, span);
    },

    handleChainEnd(outputs: any, runId: string): void {
      const span = spans.get(runId);
      if (span) {
        span.setData({ outputPreview: preview(outputs) });
        span.end();
        spans.delete(runId);
      }

      // If this is the root run, end the trace
      if (isRootRun(runId) && rootTrace) {
        rootTrace.end();
        rootTrace = null;
        runToParent.clear();
      }
    },

    handleChainError(error: any, runId: string): void {
      const span = spans.get(runId);
      if (span) {
        span.setError(error instanceof Error ? error : new Error(String(error)));
        span.end(SpanStatus.ERROR);
        spans.delete(runId);
      }

      if (isRootRun(runId) && rootTrace) {
        rootTrace.error(error instanceof Error ? error : new Error(String(error)));
        rootTrace.end();
        rootTrace = null;
        runToParent.clear();
      }
    },

    // ── LLM ─────────────────────────────────────────────────

    handleLLMStart(llm: any, prompts: string[], runId: string, parentRunId?: string): void {
      const trace = ensureTrace(runId, parentRunId);
      const model = llm?.kwargs?.model || llm?.kwargs?.model_name || llm?.model || llm?.modelName || 'llm';
      const span = trace.llmCallSpan({
        model,
        inputPreview: preview(prompts?.[0]),
        metadata: { framework: 'langchain', runId },
      });
      spans.set(runId, span);
    },

    handleChatModelStart(llm: any, messages: any[][], runId: string, parentRunId?: string): void {
      const trace = ensureTrace(runId, parentRunId);
      const model = llm?.kwargs?.model || llm?.kwargs?.model_name || llm?.model || llm?.modelName || 'llm';

      // Extract last user message as input preview
      let inputPreview: string | undefined;
      if (messages?.[0]) {
        const lastMsg = messages[0][messages[0].length - 1];
        const content = lastMsg?.content || lastMsg?.kwargs?.content;
        inputPreview = preview(content);
      }

      const span = trace.llmCallSpan({
        model,
        inputPreview,
        metadata: { framework: 'langchain', runId },
      });
      spans.set(runId, span);
    },

    handleLLMEnd(output: any, runId: string): void {
      const span = spans.get(runId);
      if (!span) return;

      // Extract tokens — try multiple shapes
      const usage = extractTokenUsage(output);
      const llmUsage = output?.llmOutput?.tokenUsage || output?.llm_output?.token_usage;

      span.setData({
        inputTokens: usage.inputTokens ?? llmUsage?.promptTokens ?? llmUsage?.prompt_tokens,
        outputTokens: usage.outputTokens ?? llmUsage?.completionTokens ?? llmUsage?.completion_tokens,
        model: usage.model,
      });

      // Extract output text
      const text = output?.generations?.[0]?.[0]?.message?.content
        || output?.generations?.[0]?.[0]?.text
        || output?.text;
      if (text) span.setData({ outputPreview: preview(text) });

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

    // ── Tool ─────────────────────────────────────────────────

    handleToolStart(tool: any, input: any, runId: string, parentRunId?: string): void {
      const trace = ensureTrace(runId, parentRunId);
      const toolName = tool?.name || tool?.id?.[tool.id.length - 1] || 'tool';
      const span = trace.toolCall({
        toolName,
        toolInput: typeof input === 'string' ? { input } : input,
        metadata: { framework: 'langchain', runId },
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

    // ── Retriever ────────────────────────────────────────────

    handleRetrieverStart(serialized: any, query: any, runId: string, parentRunId?: string): void {
      const trace = ensureTrace(runId, parentRunId);
      const name = serialized?.id?.[serialized.id.length - 1] || 'retriever';
      const span = trace.retrieverCall({
        query: typeof query === 'string' ? query : JSON.stringify(query),
        retrieverName: name,
        metadata: { framework: 'langchain', runId },
      });
      spans.set(runId, span);
    },

    handleRetrieverEnd(documents: any, runId: string): void {
      const span = spans.get(runId);
      if (!span) return;
      const count = Array.isArray(documents) ? documents.length : 0;
      span.setData({ outputPreview: `${count} documents retrieved` });
      span.end();
      spans.delete(runId);
    },
  };
}
