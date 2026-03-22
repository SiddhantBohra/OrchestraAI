/**
 * Type definitions for OrchestraAI SDK
 */

export enum TraceType {
  AGENT_RUN = 'agent_run',
  STEP = 'step',
  TOOL_CALL = 'tool_call',
  LLM_CALL = 'llm_call',
  RETRIEVER = 'retriever',
  AGENT_ACTION = 'agent_action',
  HUMAN_INPUT = 'human_input',
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
  /** Session/thread ID for multi-turn conversations */
  sessionId?: string;
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

export interface RetrieverCallOptions {
  /** Search/retrieval query */
  query: string;
  /** Retriever name (e.g., "vector-search", "bm25") */
  retrieverName?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface AgentActionOptions {
  /** Action name */
  action: string;
  /** Tool being invoked */
  toolName?: string;
  /** Tool input (string) */
  toolInput?: string;
  /** Agent's reasoning/thought */
  thought?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface HumanInputOptions {
  /** What the agent is asking the human */
  prompt: string;
  /** Type of HITL interaction: "approval", "feedback", "input", "escalation" */
  action?: string;
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
  sessionId?: string;
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
