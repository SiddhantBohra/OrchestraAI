/**
 * OrchestraAI Client
 */

import { Trace } from './tracer';
import type { OrchestraAIConfig, TraceOptions, IngestEvent } from './types';

const DEFAULT_BASE_URL = 'https://api.orchestra-ai.dev';
const DEFAULT_TIMEOUT = 30000;

export class OrchestraAI {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private enabled: boolean;

  constructor(config: OrchestraAIConfig) {
    this.apiKey = config.apiKey || process.env.ORCHESTRA_API_KEY || '';
    this.baseUrl = config.baseUrl || process.env.ORCHESTRA_BASE_URL || DEFAULT_BASE_URL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.enabled = config.enabled ?? true;

    if (!this.apiKey && this.enabled) {
      throw new Error(
        'OrchestraAI API key is required. ' +
        'Pass apiKey in config or set ORCHESTRA_API_KEY environment variable.'
      );
    }
  }

  /**
   * Start a new trace for an agent run.
   *
   * @param agentName - Name of the agent
   * @param options - Additional trace options
   * @returns A new Trace instance
   *
   * @example
   * ```ts
   * const trace = oa.startTrace('my-agent');
   * try {
   *   await trace.llmCall({ model: 'gpt-4o', ... });
   *   trace.end();
   * } catch (error) {
   *   trace.error(error);
   * }
   * ```
   */
  startTrace(agentName: string, options?: TraceOptions): Trace {
    return new Trace(this, agentName, options);
  }

  /**
   * Create a trace with a callback function.
   *
   * @param agentName - Name of the agent
   * @param fn - Callback function that receives the trace
   * @returns Result of the callback function
   *
   * @example
   * ```ts
   * const result = await oa.trace('my-agent', async (trace) => {
   *   await trace.llmCall({ model: 'gpt-4o', ... });
   *   return 'done';
   * });
   * ```
   */
  async trace<T>(
    agentName: string,
    fn: (trace: Trace) => Promise<T>,
    options?: TraceOptions
  ): Promise<T> {
    const trace = this.startTrace(agentName, options);
    try {
      const result = await fn(trace);
      trace.end();
      return result;
    } catch (error) {
      trace.error(error as Error);
      throw error;
    }
  }

  /**
   * Send a single event to the ingest API.
   */
  async sendEvent(event: IngestEvent): Promise<Record<string, unknown>> {
    if (!this.enabled) {
      return { ok: true, disabled: true };
    }

    const response = await this.fetch('/api/ingest/event', {
      method: 'POST',
      body: JSON.stringify(event),
    });

    return this.parseJson(response);
  }

  /**
   * Send multiple events to the ingest API.
   */
  async sendEventsBatch(events: IngestEvent[]): Promise<Record<string, unknown>> {
    if (!this.enabled) {
      return { ok: true, disabled: true, count: events.length };
    }

    const response = await this.fetch('/api/ingest/batch', {
      method: 'POST',
      body: JSON.stringify({ events }),
    });

    return this.parseJson(response);
  }

  /**
   * Internal fetch wrapper with auth and timeout.
   */
  private async fetch(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': '@orchestra-ai/sdk/0.1.0',
          ...init.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`OrchestraAI API error: ${response.status} ${response.statusText}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async parseJson(response: Response): Promise<Record<string, unknown>> {
    const data = (await response.json()) as unknown;

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }

    throw new Error('OrchestraAI API error: response is not an object');
  }

  /**
   * Whether tracing is enabled.
   */
  get isEnabled(): boolean {
    return this.enabled;
  }
}
