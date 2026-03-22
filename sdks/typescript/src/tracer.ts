/**
 * Tracing functionality for OrchestraAI SDK
 */

import type { OrchestraAI } from './client';
import type {
  TraceOptions,
  SpanOptions,
  LLMCallOptions,
  ToolCallOptions,
  IngestEvent,
} from './types';
import { TraceType, SpanStatus } from './types';

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
  }
}

/**
 * Represents a complete trace for an agent run.
 */
export class Trace {
  private client: OrchestraAI;
  readonly agentName: string;
  readonly agentId: string;
  readonly traceId: string;
  readonly rootSpanId: string;
  readonly startTime: number;
  private endTime: number | null = null;
  private status: SpanStatus = SpanStatus.RUNNING;
  private metadata: Record<string, unknown>;
  private pendingEvents: IngestEvent[] = [];
  private currentSpanId: string;

  constructor(client: OrchestraAI, agentName: string, options?: TraceOptions) {
    this.client = client;
    this.agentName = agentName;
    this.agentId = options?.agentId || generateId();
    this.traceId = generateId();
    this.rootSpanId = generateId();
    this.currentSpanId = this.rootSpanId;
    this.startTime = Date.now();
    this.metadata = options?.metadata || {};

    // Send agent_run start event
    this.addPendingEvent({
      type: TraceType.AGENT_RUN,
      traceId: this.traceId,
      spanId: this.rootSpanId,
      name: `agent:${this.agentName}`,
      startTime: this.startTime,
      status: 'started',
      agentId: this.agentId,
      agentName: this.agentName,
      metadata: this.metadata,
    });
  }

  /**
   * Create a new step span.
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
   */
  llmCallSpan(options: LLMCallOptions): Span {
    const span = new Span(
      this,
      `llm:${options.model}`,
      TraceType.LLM_CALL,
      { parentSpanId: this.currentSpanId, metadata: options.metadata }
    );
    span.setData({
      model: options.model,
      inputTokens: options.inputTokens,
      outputTokens: options.outputTokens,
      latencyMs: options.latencyMs,
      inputPreview: options.inputPreview,
      outputPreview: options.outputPreview,
    });
    return span;
  }

  /**
   * Record an LLM call (convenience method).
   */
  async llmCall(options: LLMCallOptions): Promise<void> {
    const span = this.llmCallSpan(options);
    span.end();
  }

  /**
   * Record a tool call (convenience method).
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
      errorMessage: error.message,
      errorType: error.name,
    };
    this.pendingEvents.push(event);
    this.status = SpanStatus.ERROR;
    // Don't flush here — let end() handle the final flush so the end event is included
  }

  /**
   * End the trace successfully.
   */
  end(): void {
    this.endTime = Date.now();
    const finalStatus = this.status === SpanStatus.ERROR ? 'failed' : 'completed';

    // Send agent_run end event
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
      // Log but don't throw - we don't want tracing to break the app
      console.error('[OrchestraAI] Failed to send events:', error);
    }
  }
}
