import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface TraceEvent {
  projectId: string;
  trace: {
    id: string;
    traceId: string;
    spanId: string;
    parentSpanId?: string | null;
    type: string;
    name: string;
    status: string;
    agentName?: string | null;
    model?: string | null;
    cost?: number | null;
    totalTokens?: number | null;
    durationMs?: number | null;
    toolName?: string | null;
    errorMessage?: string | null;
    createdAt: Date;
  };
  policyAlert?: {
    id: string;
    severity: string;
    reason: string;
    action: string;
  };
}

@Injectable()
export class EventsService {
  private emitter = new EventEmitter();

  constructor() {
    // Allow many SSE listeners per project
    this.emitter.setMaxListeners(200);
  }

  /**
   * Emit a new trace event. Called by IngestService after saving a trace.
   */
  emitTrace(event: TraceEvent): void {
    this.emitter.emit(`trace:${event.projectId}`, event);
    this.emitter.emit('trace:*', event); // Global listener for admin
  }

  /**
   * Emit a policy alert event. Called by PoliciesService on trigger.
   */
  emitAlert(projectId: string, alert: any): void {
    this.emitter.emit(`alert:${projectId}`, alert);
  }

  /**
   * Subscribe to trace events for a project. Returns cleanup function.
   */
  onTrace(projectId: string, callback: (event: TraceEvent) => void): () => void {
    this.emitter.on(`trace:${projectId}`, callback);
    return () => this.emitter.off(`trace:${projectId}`, callback);
  }

  /**
   * Subscribe to alert events for a project. Returns cleanup function.
   */
  onAlert(projectId: string, callback: (alert: any) => void): () => void {
    this.emitter.on(`alert:${projectId}`, callback);
    return () => this.emitter.off(`alert:${projectId}`, callback);
  }
}
