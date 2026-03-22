/**
 * LangChain/LangGraph integration for OrchestraAI SDK
 *
 * Creates ONE trace per top-level invocation and nests all internal
 * chains, LLM calls, tool calls, and retrievers as child spans.
 *
 * Filters out noisy internal runnables (RunnableSequence, RunnableLambda,
 * ChannelWrite, etc.) to keep the trace tree clean and readable.
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

// Internal LangChain/LangGraph runnables that add noise to the trace tree
const NOISE_RUNNABLES = new Set([
  'RunnableSequence',
  'RunnableLambda',
  'RunnableParallel',
  'RunnablePassthrough',
  'RunnableAssign',
  'ChannelWrite',
  'ChannelRead',
  '__start__',
  '__end__',
]);

export interface LangChainHandlerOptions {
  /** OrchestraAI client */
  client: OrchestraAI;
  /** Agent/graph name — auto-detected from the chain/graph if omitted */
  agentName?: string;
  /** Session ID for multi-turn conversations */
  sessionId?: string;
  /** User ID for per-user attribution */
  userId?: string;
  /** Tags for trace organization */
  tags?: string[];
  /** Default metadata for all spans */
  metadata?: Record<string, unknown>;
  /** Show internal runnables (RunnableSequence, etc.) in the trace tree. Default: false */
  showInternalRunnables?: boolean;
}

/**
 * Create a LangChain/LangGraph callback handler for OrchestraAI.
 *
 * Minimal usage — just pass the client:
 * ```ts
 * const handler = createLangChainHandler({ client: oa });
 * await graph.invoke(input, { callbacks: [handler] });
 * ```
 */
export function createLangChainHandler(options: LangChainHandlerOptions): any {
  let rootTrace: Trace | null = null;
  const spans = new Map<string, Span>();
  const runToParent = new Map<string, string>();
  const skippedRuns = new Set<string>(); // runs that were filtered as noise
  const showNoise = options.showInternalRunnables ?? false;

  function ensureTrace(runId: string, parentRunId?: string, autoName?: string): Trace {
    if (parentRunId) runToParent.set(runId, parentRunId);

    if (!rootTrace) {
      // Prefer user-supplied name > auto-detected name (but skip generic class names)
      const genericNames = new Set(['CompiledStateGraph', 'RunnableSequence', 'RunnableLambda', 'AgentExecutor']);
      const traceName = options.agentName
        || (autoName && !genericNames.has(autoName) ? autoName : null)
        || 'agent';
      rootTrace = options.client.startTrace(traceName, {
        sessionId: options.sessionId,
        userId: options.userId,
        tags: options.tags,
        metadata: { ...options.metadata, framework: 'langchain' },
      });
    }
    return rootTrace;
  }

  function isRootRun(runId: string): boolean {
    return !runToParent.has(runId);
  }

  /** Extract the human-readable name from a serialized LangChain object */
  function getName(serialized: any, ...fallbackKeys: string[]): string {
    // Try: serialized.name, serialized.kwargs.name, serialized.id[-1]
    if (serialized?.name) return serialized.name;
    if (serialized?.kwargs?.name) return serialized.kwargs.name;
    for (const key of fallbackKeys) {
      if (serialized?.[key]) return serialized[key];
    }
    if (serialized?.id && Array.isArray(serialized.id)) {
      return serialized.id[serialized.id.length - 1] || 'unknown';
    }
    return 'unknown';
  }

  /** Check if a chain name is internal noise */
  function isNoise(name: string): boolean {
    return !showNoise && NOISE_RUNNABLES.has(name);
  }

  return {
    name: 'orchestra-langchain-handler',

    // ── Chain (graph/sequence/runnable) ──────────────────────

    // Match Langfuse's proven signature: (chain, inputs, runId, parentRunId?, tags?, metadata?, runType?, name?)
    async handleChainStart(serialized: any, inputs: any, runId: string, parentRunId?: string, _tags?: string[], _metadata?: Record<string, unknown>, _runType?: string, name?: string): Promise<void> {
      const nodeName = name ?? serialized?.id?.at?.(-1)?.toString(); // Same logic as Langfuse
      const serializedName = getName(serialized);
      const chainName = nodeName || serializedName;

      // Skip noise — but NEVER skip if runName is a real node name
      if (!nodeName && isNoise(chainName)) {
        skippedRuns.add(runId);
        if (parentRunId) runToParent.set(runId, parentRunId);
        return;
      }

      const displayName = nodeName || serializedName;
      const trace = ensureTrace(runId, parentRunId, displayName);

      const span = trace.step(displayName, {
        metadata: { framework: 'langchain', runId },
      });
      span.setData({ inputPreview: preview(inputs, 500) });
      spans.set(runId, span);
    },

    handleChainEnd(outputs: any, runId: string): void {
      if (skippedRuns.delete(runId)) return; // was filtered

      const span = spans.get(runId);
      if (span) {
        span.setData({ outputPreview: preview(outputs) });
        span.end();
        spans.delete(runId);
      }

      if (isRootRun(runId) && rootTrace) {
        rootTrace.end();
        rootTrace = null;
        runToParent.clear();
        skippedRuns.clear();
      }
    },

    handleChainError(error: any, runId: string): void {
      if (skippedRuns.delete(runId)) return;

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
        skippedRuns.clear();
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

    // (llm, messages, runId, parentRunId?, extraParams?, tags?, metadata?, runName?)
    handleChatModelStart(llm: any, messages: any[][], runId: string, parentRunId?: string, _extra?: any, _tags2?: string[], _meta?: any, _runName?: string): void {
      const trace = ensureTrace(runId, parentRunId);
      const model = llm?.kwargs?.model || llm?.kwargs?.model_name || llm?.model || llm?.modelName || 'llm';

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

    handleLLMNewToken(token: string, _idx: any, runId: string): void {
      const span = spans.get(runId);
      if (span) {
        span.addToken(token);
      }
    },

    handleLLMEnd(output: any, runId: string): void {
      const span = spans.get(runId);
      if (!span) return;

      const usage = extractTokenUsage(output);
      const llmUsage = output?.llmOutput?.tokenUsage || output?.llm_output?.token_usage;

      span.setData({
        inputTokens: usage.inputTokens ?? llmUsage?.promptTokens ?? llmUsage?.prompt_tokens,
        outputTokens: usage.outputTokens ?? llmUsage?.completionTokens ?? llmUsage?.completion_tokens,
        model: usage.model,
      });

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

    // Match Langfuse: (tool, input, runId, parentRunId?, tags?, metadata?, name?)
    async handleToolStart(tool: any, input: any, runId: string, parentRunId?: string, _tags?: string[], _metadata?: Record<string, unknown>, name?: string): Promise<void> {
      const trace = ensureTrace(runId, parentRunId);
      const finalName = name ?? tool?.name ?? tool?.id?.at?.(-1)?.toString() ?? 'tool';

      const span = trace.toolCall({
        toolName: finalName,
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
      const name = getName(serialized) || 'retriever';
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
