/**
 * OrchestraAI TypeScript SDK
 *
 * Observability & Control Plane for Autonomous AI Agents
 */

export { OrchestraAI, AgentKilledException } from './client';
export { Trace, Span } from './tracer';
export type {
  OrchestraAIConfig,
  TraceOptions,
  SpanOptions,
  LLMCallOptions,
  ToolCallOptions,
  RetrieverCallOptions,
  AgentActionOptions,
  HumanInputOptions,
  IngestEvent,
} from './types';
export { TraceType, SpanStatus } from './types';
export { extractTokenUsage } from './token-extraction';
export type { TokenUsage } from './token-extraction';
