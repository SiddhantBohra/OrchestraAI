/**
 * Type definitions for OrchestraAI SDK
 */

export enum TraceType {
  AGENT_RUN = 'agent_run',
  STEP = 'step',
  TOOL_CALL = 'tool_call',
  LLM_CALL = 'llm_call',
  ERROR = 'error',
}

export enum SpanStatus {
  RUNNING = 'running',
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface OrchestraAIConfig {
  /** Your OrchestraAI API key */
  apiKey: string;
  /** API base URL (defaults to production) */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Whether tracing is enabled */
  enabled?: boolean;
}

export interface TraceOptions {
  /** Agent ID (auto-generated if not provided) */
  agentId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface SpanOptions {
  /** Parent span ID */
  parentSpanId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface LLMCallOptions {
  /** Model name — auto-detected from response when omitted */
  model?: string;
  /** Raw LLM response object (OpenAI, Anthropic, etc.). Tokens and model are auto-extracted. */
  response?: unknown;
  /** Number of input tokens — auto-detected from response */
  inputTokens?: number;
  /** Number of output tokens — auto-detected from response */
  outputTokens?: number;
  /** Latency in milliseconds */
  latencyMs?: number;
  /** Preview of the input prompt */
  inputPreview?: string;
  /** Preview of the output response */
  outputPreview?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface ToolCallOptions {
  /** Tool name */
  toolName: string;
  /** Tool input parameters */
  toolInput?: Record<string, unknown>;
  /** Tool output */
  toolOutput?: unknown;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface IngestEvent {
  type: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  startTime?: number;
  endTime?: number;
  status?: string;
  agentId?: string;
  agentName?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  input?: string;
  output?: string;
  errorMessage?: string;
  errorType?: string;
  metadata?: Record<string, unknown>;
}
