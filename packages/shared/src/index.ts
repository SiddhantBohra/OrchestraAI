/**
 * Shared types and constants for OrchestraAI
 */

// ============================================
// Enums
// ============================================

export enum AgentFramework {
  LANGGRAPH = 'langgraph',
  OPENAI_AGENTS = 'openai-agents',
  CREWAI = 'crewai',
  MASTRA = 'mastra',
  LLAMAINDEX = 'llamaindex',
  HAYSTACK = 'haystack',
  AUTOGEN = 'autogen',
  CUSTOM = 'custom',
}

export enum AgentStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  KILLED = 'killed',
  ERROR = 'error',
}

export enum TraceType {
  AGENT_RUN = 'agent_run',
  STEP = 'step',
  TOOL_CALL = 'tool_call',
  LLM_CALL = 'llm_call',
  RETRIEVER = 'retriever',
  AGENT_ACTION = 'agent_action',
  HUMAN_INPUT = 'human_input',
  EMBEDDING = 'embedding',
  EVALUATOR = 'evaluator',
  GUARDRAIL = 'guardrail',
  CHAIN = 'chain',
  ERROR = 'error',
}

export enum SpanStatus {
  RUNNING = 'running',
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum TraceStatus {
  STARTED = 'started',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
}

export enum PolicyType {
  BUDGET = 'budget',
  RATE_LIMIT = 'rate_limit',
  TOOL_PERMISSION = 'tool_permission',
  RUNAWAY_DETECTION = 'runaway_detection',
  PII_REDACTION = 'pii_redaction',
}

export enum PolicyAction {
  ALLOW = 'allow',
  WARN = 'warn',
  BLOCK = 'block',
  KILL = 'kill',
  ESCALATE = 'escalate',
}

// ============================================
// Interfaces
// ============================================

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  apiKey: string;
  budgetLimit: number;
  currentSpend: number;
  killSwitchEnabled: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Agent {
  id: string;
  name: string;
  framework: AgentFramework;
  status: AgentStatus;
  description?: string;
  version?: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalTokens: number;
  totalCost: number;
  lastRunAt?: Date;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Trace {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  type: TraceType;
  name: string;
  status: TraceStatus;
  startTime: number;
  endTime?: number | null;
  durationMs?: number | null;
  agentId?: string | null;
  agentName?: string | null;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  cost?: number | null;
  toolName?: string | null;
  toolArgs?: Record<string, unknown> | null;
  toolResult?: string | null;
  input?: string | null;
  output?: string | null;
  errorType?: string | null;
  errorMessage?: string | null;
  errorStack?: string | null;
  attributes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  projectId: string;
  createdAt: Date;
}

export interface Policy {
  id: string;
  name: string;
  type: PolicyType;
  action: PolicyAction;
  description?: string;
  conditions: Record<string, unknown>;
  priority: number;
  isActive: boolean;
  triggerCount: number;
  lastTriggeredAt?: Date;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// API Types
// ============================================

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface IngestEvent {
  type: 'agent_run' | 'step' | 'tool_call' | 'llm_call' | 'retriever' | 'agent_action' | 'error';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  status?: 'started' | 'completed' | 'failed' | 'timeout';
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
  errorType?: string;
  errorMessage?: string;
  errorStack?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Constants
// ============================================

// Prices per 1K tokens (USD). Updated March 2026.
// Source: provider pricing pages. Override per-project via customPricing.
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'o1': { input: 0.015, output: 0.06 },
  'o1-mini': { input: 0.003, output: 0.012 },
  'o1-pro': { input: 0.15, output: 0.6 },
  'o3-mini': { input: 0.00115, output: 0.0044 },

  // Anthropic
  'claude-opus-4-20250514': { input: 0.015, output: 0.075 },
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3.5-haiku': { input: 0.0008, output: 0.004 },

  // Google
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.0-pro': { input: 0.00125, output: 0.01 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },

  // Meta (via API providers)
  'llama-3.1-405b': { input: 0.003, output: 0.003 },
  'llama-3.1-70b': { input: 0.0008, output: 0.0008 },
  'llama-3.1-8b': { input: 0.0001, output: 0.0001 },

  // Mistral
  'mistral-large': { input: 0.002, output: 0.006 },
  'mistral-small': { input: 0.0002, output: 0.0006 },

  // Cohere
  'command-r-plus': { input: 0.002, output: 0.01 },
  'command-r': { input: 0.00015, output: 0.0006 },
};

export const DEFAULT_BUDGET_LIMIT = 100;
export const DEFAULT_RATE_LIMIT = 100; // requests per minute
export const MAX_LOOPS_PER_MINUTE = 50;
export const TRACE_RETENTION_DAYS = 90;

// ============================================
// Utility Functions
// ============================================

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null; // Unknown model — don't guess
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1000000) / 1000000;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
