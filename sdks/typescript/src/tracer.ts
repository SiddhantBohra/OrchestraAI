/**
 * Tracing functionality for OrchestraAI SDK
 */

import { OrchestraAI, AgentKilledException } from './client';
import type {
  TraceOptions,
  SpanOptions,
  LLMCallOptions,
  ToolCallOptions,
  RetrieverCallOptions,
  AgentActionOptions,
  HumanInputOptions,
  IngestEvent,
} from './types';
import { TraceType, SpanStatus } from './types';
import { extractTokenUsage } from './token-extraction';

/**
 * Generate a unique ID (simplified UUID v4)
 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Map SDK SpanStatus to API TraceStatus string.
 */
function mapStatus(status: SpanStatus): string {
  switch (status) {
    case SpanStatus.RUNNING:
      return 'started';
    case SpanStatus.SUCCESS:
      return 'completed';
    case SpanStatus.ERROR:
      return 'failed';
    default:
      return 'started';
  }
}

/**
 * Represents a single span within a trace.
 */
export class Span {
  readonly spanId: string;
  readonly parentSpanId: string;
  readonly name: string;
  readonly spanType: TraceType;
  readonly startTime: number;
  private endTime: number | null = null;
  private status: SpanStatus = SpanStatus.RUNNING;
  private data: Record<string, unknown> = {};
  private metadata: Record<string, unknown>;
  private trace: Trace;
  private streamingTokens: string[] = [];
  private firstTokenTime: number | null = null;

  constructor(
    trace: Trace,
    name: string,
    spanType: TraceType,
    options?: SpanOptions
  ) {
    this.trace = trace;
    this.spanId = generateId();
    this.parentSpanId = options?.parentSpanId || trace.rootSpanId;
    this.name = name;
    this.spanType = spanType;
    this.startTime = Date.now();
    this.metadata = options?.metadata || {};
  }

  /**
   * Set additional data on the span.
   */
  setData(data: Record<string, unknown>): this {
    Object.assign(this.data, data);
    return this;
  }

  /**
   * Accumulate a streaming token. Called by handleLLMNewToken.
   * Tracks time-to-first-token automatically.
   */
  addToken(token: string): void {
    if (this.firstTokenTime === null) {
      this.firstTokenTime = Date.now();
    }
    this.streamingTokens.push(token);
  }

  /**
   * Mark the span as failed with an error.
   */
  setError(error: Error): this {
    this.status = SpanStatus.ERROR;
    this.data.errorMessage = error.message;
    this.data.errorType = error.name;
    return this;
  }

  /**
   * End the span.
   */
  end(status: SpanStatus = SpanStatus.SUCCESS): void {
    this.endTime = Date.now();
    if (this.status !== SpanStatus.ERROR) {
      this.status = status;
    }

    // Auto-extract tokens from response if present
    const response = this.data.response;
    if (response != null && this.data.inputTokens == null) {
      const usage = extractTokenUsage(response);
      if (usage.inputTokens != null) this.data.inputTokens ??= usage.inputTokens;
      if (usage.outputTokens != null) this.data.outputTokens ??= usage.outputTokens;
      if (usage.model && !this.data.model) this.data.model = usage.model;
    }

    // If we accumulated streaming tokens, use as output preview (unless already set)
    if (this.streamingTokens.length > 0 && !this.data.outputPreview) {
      const full = this.streamingTokens.join('');
      this.data.outputPreview = full.length > 500 ? full.slice(0, 500) + '...' : full;
    }

    // Track time-to-first-token in metadata
    if (this.firstTokenTime !== null) {
      this.metadata.timeToFirstTokenMs = this.firstTokenTime - this.startTime;
    }

    const event: IngestEvent = {
      type: this.spanType,
      traceId: this.trace.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      startTime: this.startTime,
      endTime: this.endTime,
      status: mapStatus(this.status),
      agentId: this.trace.agentId,
      agentName: this.trace.agentName,
      sessionId: this.trace.sessionId,
      userId: this.trace.userId,
      tags: this.trace.tags,
      model: this.data.model as string | undefined,
      promptTokens: this.data.inputTokens as number | undefined,
      completionTokens: this.data.outputTokens as number | undefined,
      toolName: this.data.toolName as string | undefined,
      toolArgs: this.data.toolInput as Record<string, unknown> | undefined,
      toolResult: this.data.toolOutput != null ? String(this.data.toolOutput) : undefined,
      input: this.data.inputPreview as string | undefined,
      output: this.data.outputPreview as string | undefined,
      errorMessage: this.data.errorMessage as string | undefined,
      errorType: this.data.errorType as string | undefined,
      metadata: this.metadata,
    };

    this.trace.addPendingEvent(event);
    // Flush eagerly so each span appears in the dashboard as it completes
    this.trace.flushEager();
  }
}

/**
 * Represents a complete trace for an agent run.
 */
export class Trace {
  private client: OrchestraAI;
  readonly agentName: string;
  readonly agentId: string;
  readonly sessionId: string | undefined;
  readonly userId: string | undefined;
  readonly tags: string[] | undefined;
  readonly traceId: string;
  readonly rootSpanId: string;
  readonly startTime: number;
  private endTime: number | null = null;
  private status: SpanStatus = SpanStatus.RUNNING;
  private metadata: Record<string, unknown>;
  private pendingEvents: IngestEvent[] = [];
  private currentSpanId: string;
  private traceInput: string | undefined;
  private traceOutput: string | undefined;

  constructor(client: OrchestraAI, agentName: string, options?: TraceOptions) {
    this.client = client;
    this.agentName = agentName;
    this.agentId = options?.agentId || generateId();
    this.sessionId = options?.sessionId;
    this.userId = options?.userId;
    this.tags = options?.tags;
    this.traceId = generateId();
    this.rootSpanId = generateId();
    this.currentSpanId = this.rootSpanId;
    this.startTime = Date.now();
    this.metadata = options?.metadata || {};

    // Send agent_run start event immediately so it appears in the dashboard in real-time
    this.addPendingEvent({
      type: TraceType.AGENT_RUN,
      traceId: this.traceId,
      spanId: this.rootSpanId,
      name: `agent:${this.agentName}`,
      startTime: this.startTime,
      status: 'started',
      agentId: this.agentId,
      agentName: this.agentName,
      sessionId: this.sessionId,
      metadata: this.metadata,
    });
    // Flush start event eagerly for real-time visibility
    this.flush();
  }

  /** Set the trace-level input (shown in sidebar). */
  setInput(input: string): void {
    this.traceInput = input.length > 500 ? input.slice(0, 500) + '...' : input;
  }

  /** Set the trace-level output. */
  setOutput(output: string): void {
    this.traceOutput = output.length > 500 ? output.slice(0, 500) + '...' : output;
  }

  // ── Span Creators ──────────────────────────────────────────

  /**
   * Create a step span.
   */
  step(name: string, options?: SpanOptions): Span {
    return new Span(this, name, TraceType.STEP, {
      parentSpanId: this.currentSpanId,
      ...options,
    });
  }

  /**
   * Create a tool call span.
   */
  toolCall(options: ToolCallOptions): Span {
    const span = new Span(
      this,
      `tool:${options.toolName}`,
      TraceType.TOOL_CALL,
      { parentSpanId: this.currentSpanId, metadata: options.metadata }
    );
    span.setData({
      toolName: options.toolName,
      toolInput: options.toolInput,
    });
    return span;
  }

  /**
   * Create an LLM call span.
   *
   * Pass `response` to auto-extract model, inputTokens, outputTokens.
   * Explicit values take priority over auto-extracted ones.
   */
  llmCallSpan(options: LLMCallOptions): Span {
    let { model, inputTokens, outputTokens } = options;
    if (options.response != null) {
      const usage = extractTokenUsage(options.response);
      model = model ?? usage.model;
      inputTokens = inputTokens ?? usage.inputTokens;
      outputTokens = outputTokens ?? usage.outputTokens;
    }
    model = model ?? 'unknown';

    const span = new Span(
      this,
      `llm:${model}`,
      TraceType.LLM_CALL,
      { parentSpanId: this.currentSpanId, metadata: options.metadata }
    );
    span.setData({
      model,
      inputTokens,
      outputTokens,
      latencyMs: options.latencyMs,
      inputPreview: options.inputPreview,
      outputPreview: options.outputPreview,
      response: options.response,
    });
    return span;
  }

  /**
   * Create a retriever/search span (e.g., vector search, RAG retrieval).
   */
  retrieverCall(options: RetrieverCallOptions): Span {
    const name = options.retrieverName
      ? `retriever:${options.retrieverName}`
      : 'retriever';
    const span = new Span(this, name, TraceType.RETRIEVER, {
      parentSpanId: this.currentSpanId,
      metadata: options.metadata,
    });
    span.setData({
      inputPreview: options.query?.slice(0, 500),
    });
    return span;
  }

  /**
   * Create an agent reasoning/action span (thought + action decision).
   */
  agentAction(options: AgentActionOptions): Span {
    const span = new Span(
      this,
      `action:${options.action}`,
      TraceType.AGENT_ACTION,
      { parentSpanId: this.currentSpanId, metadata: options.metadata }
    );
    span.setData({
      toolName: options.toolName,
      toolInput: options.toolInput ? { input: options.toolInput } : undefined,
      inputPreview: options.thought?.slice(0, 500),
    });
    return span;
  }

  /**
   * Create a human-in-the-loop span.
   *
   * Use when the agent pauses for human approval, feedback, or input.
   * The span duration captures how long the agent waited.
   *
   * @example
   * ```ts
   * const span = trace.humanInput({ prompt: 'Approve deleting file?', action: 'approval' });
   * const approved = await getHumanApproval();
   * span.setData({ outputPreview: approved ? 'approved' : 'rejected' });
   * span.end();
   * ```
   */
  humanInput(options: HumanInputOptions): Span {
    const action = options.action || 'approval';
    const span = new Span(
      this,
      `human:${action}`,
      TraceType.HUMAN_INPUT,
      { parentSpanId: this.currentSpanId, metadata: { ...options.metadata, hitl_action: action } }
    );
    span.setData({
      inputPreview: options.prompt?.slice(0, 500),
    });
    return span;
  }

  // ── Convenience Methods ────────────────────────────────────

  /**
   * Record an LLM call (convenience — creates span, ends it immediately).
   */
  async llmCall(options: LLMCallOptions): Promise<void> {
    const span = this.llmCallSpan(options);
    span.end();
  }

  /**
   * Record a tool call (convenience).
   */
  async recordToolCall(options: ToolCallOptions & { output?: unknown }): Promise<void> {
    const span = this.toolCall(options);
    if (options.toolOutput !== undefined) {
      span.setData({ toolOutput: options.toolOutput });
    }
    span.end();
  }

  /**
   * Record an error.
   */
  error(error: Error): void {
    const event: IngestEvent = {
      type: TraceType.ERROR,
      traceId: this.traceId,
      spanId: generateId(),
      parentSpanId: this.currentSpanId,
      name: `error:${error.name}`,
      startTime: Date.now(),
      status: 'failed',
      agentId: this.agentId,
      agentName: this.agentName,
      sessionId: this.sessionId,
      errorMessage: error.message,
      errorType: error.name,
    };
    this.pendingEvents.push(event);
    this.status = SpanStatus.ERROR;
  }

  // ── Lifecycle ──────────────────────────────────────────────

  /**
   * End the trace.
   */
  end(): void {
    this.endTime = Date.now();
    const finalStatus = this.status === SpanStatus.ERROR ? 'failed' : 'completed';

    this.addPendingEvent({
      type: TraceType.AGENT_RUN,
      traceId: this.traceId,
      spanId: this.rootSpanId,
      name: `agent:${this.agentName}`,
      startTime: this.startTime,
      endTime: this.endTime,
      status: finalStatus,
      agentId: this.agentId,
      agentName: this.agentName,
      sessionId: this.sessionId,
      input: this.traceInput,
      output: this.traceOutput,
      metadata: this.metadata,
    });

    this.flush();
  }

  /**
   * Add an event to the pending queue.
   */
  addPendingEvent(event: IngestEvent): void {
    this.pendingEvents.push(event);
  }

  /**
   * Flush all pending events to the server.
   *
   * @throws {AgentKilledException} When the API returns a kill/block signal.
   */
  private async flush(): Promise<void> {
    if (this.pendingEvents.length === 0) {
      return;
    }

    const eventsToSend = [...this.pendingEvents];
    this.pendingEvents = [];

    try {
      await this.client.sendEventsBatch(eventsToSend);
    } catch (error) {
      if (error instanceof AgentKilledException) {
        throw error; // Let kill signals propagate — the agent must stop
      }
      // Log but don't throw — network errors shouldn't break the app
      console.error('[OrchestraAI] Failed to send events:', error);
    }
  }
}
