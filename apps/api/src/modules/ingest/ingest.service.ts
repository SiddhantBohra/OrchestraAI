import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ProjectsService } from '../projects/projects.service';
import { TracesService } from '../traces/traces.service';
import { AgentsService } from '../agents/agents.service';
import { PoliciesService } from '../policies/policies.service';
import { EventsService } from '../events/events.service';
import { IngestEventDto, IngestBatchDto, IngestTracesDto } from './dto/ingest.dto';
import { TraceType, TraceStatus } from '../traces/entities/trace.entity';
import { AgentStatus, AgentFramework } from '../agents/entities/agent.entity';

@Injectable()
export class IngestService {
  constructor(
    private projectsService: ProjectsService,
    private tracesService: TracesService,
    private agentsService: AgentsService,
    private policiesService: PoliciesService,
    private eventsService: EventsService,
  ) { }

  async validateApiKey(apiKey: string) {
    const project = await this.projectsService.findByApiKey(apiKey);

    if (!project) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (!project.isActive) {
      throw new ForbiddenException('Project is inactive');
    }

    // Check budget
    const budget = await this.projectsService.checkBudget(project.id);
    if (!budget.allowed && project.killSwitchEnabled) {
      throw new ForbiddenException('Budget limit exceeded. Kill-switch activated.');
    }

    return project;
  }

  async ingestEvent(apiKey: string, event: IngestEventDto) {
    const project = await this.validateApiKey(apiKey);

    // Auto-register agent if it doesn't exist, reject if killed
    if (event.agentName) {
      const frameworkStr = (event.metadata?.framework as string) || '';
      const frameworkMap: Record<string, AgentFramework> = {
        langchain: AgentFramework.LANGGRAPH,
        langgraph: AgentFramework.LANGGRAPH,
        openai: AgentFramework.OPENAI_AGENTS,
        crewai: AgentFramework.CREWAI,
        llamaindex: AgentFramework.LLAMAINDEX,
        haystack: AgentFramework.HAYSTACK,
        autogen: AgentFramework.AUTOGEN,
      };
      const framework = frameworkMap[frameworkStr] || AgentFramework.CUSTOM;

      const agent = await this.agentsService.findOrCreate(project.id, {
        name: event.agentName,
        description: `Auto-registered from ${frameworkStr || 'SDK'} trace`,
        framework,
      });

      if (agent.status === AgentStatus.KILLED) {
        throw new ForbiddenException({
          message: `Agent "${event.agentName}" has been killed.`,
          action: 'kill',
        });
      }
    }

    // Evaluate policies (shared logic)
    const policyResult = await this.evaluatePolicies(project, {
      agentId: event.agentId,
      agentName: event.agentName,
      toolName: event.toolName,
    });

    if (!policyResult.allowed) {
      // If policy says KILL, update agent status
      if (policyResult.action === 'kill' && event.agentName) {
        const agent = await this.agentsService.findByNameAndProject(
          event.agentName,
          project.id,
        );
        if (agent) {
          await this.agentsService.updateStatus(agent.id, AgentStatus.KILLED);
        }
      }

      throw new ForbiddenException({
        message: policyResult.reason,
        policyId: policyResult.policyId,
        action: policyResult.action,
      });
    }

    // Create trace
    const trace = await this.tracesService.create(project.id, {
      traceId: event.traceId,
      spanId: event.spanId,
      parentSpanId: event.parentSpanId,
      type: this.mapEventType(event.type),
      name: event.name,
      status: this.mapStatus(event.status),
      startTime: event.startTime,
      endTime: event.endTime,
      agentId: event.agentId,
      agentName: event.agentName,
      model: event.model,
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      cost: event.cost,
      toolName: event.toolName,
      toolArgs: event.toolArgs,
      toolResult: event.toolResult,
      input: this.redactPII(event.input),
      output: this.redactPII(event.output),
      errorType: event.errorType,
      errorMessage: event.errorMessage,
      metadata: event.metadata,
    }, project.customPricing);

    // Emit real-time event via SSE
    this.eventsService.emitTrace({
      projectId: project.id,
      trace: {
        id: trace.id,
        traceId: trace.traceId,
        spanId: trace.spanId,
        parentSpanId: trace.parentSpanId,
        type: trace.type,
        name: trace.name,
        status: trace.status,
        agentName: trace.agentName,
        model: trace.model,
        cost: trace.cost ? Number(trace.cost) : undefined,
        totalTokens: trace.totalTokens,
        durationMs: trace.durationMs,
        toolName: trace.toolName,
        errorMessage: trace.errorMessage,
        createdAt: trace.createdAt,
      },
    });

    // Update project spend
    if (trace.cost) {
      await this.projectsService.updateSpend(project.id, Number(trace.cost));
    }

    // Update agent metrics if agent run completed
    if (event.type === 'agent_run' && event.endTime && event.agentName) {
      const agent = await this.agentsService.findByNameAndProject(
        event.agentName,
        project.id,
      );
      if (agent) {
        const success = event.status === 'completed';
        const tokens = (event.promptTokens || 0) + (event.completionTokens || 0);
        await this.agentsService.recordRun(
          agent.id,
          success,
          tokens,
          Number(trace.cost) || 0,
        );
      }
    }

    return {
      id: trace.id,
      status: 'accepted',
      warnings: policyResult.warnings,
    };
  }

  async ingestBatch(apiKey: string, batch: IngestBatchDto) {
    const settled = await Promise.allSettled(
      batch.events.map((event) => this.ingestEvent(apiKey, event)),
    );

    const results = settled.map((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        return { ...outcome.value, event: batch.events[i].spanId };
      }
      return {
        status: 'rejected',
        event: batch.events[i].spanId,
        error: (outcome.reason as any)?.message ?? String(outcome.reason),
      };
    });

    return {
      accepted: results.filter((r) => r.status === 'accepted').length,
      rejected: results.filter((r) => r.status === 'rejected').length,
      results,
    };
  }

  async ingestOTLP(apiKey: string, data: IngestTracesDto) {
    const project = await this.validateApiKey(apiKey);
    const results = [];

    for (const resourceSpan of data.resourceSpans) {
      const resourceAttrs = resourceSpan.resource?.attributes || {};

      for (const scopeSpan of resourceSpan.scopeSpans) {
        for (const span of scopeSpan.spans) {
          try {
            const attrs = span.attributes || {};
            const agentId = (attrs['orchestra.agent.id'] as string) || undefined;
            const agentName = (attrs['orchestra.agent.name'] as string) || undefined;
            const toolName = (attrs['orchestra.tool.name'] as string) || undefined;
            const promptTokens = attrs['gen_ai.usage.prompt_tokens'] != null
              ? Number(attrs['gen_ai.usage.prompt_tokens'])
              : undefined;
            const completionTokens = attrs['gen_ai.usage.completion_tokens'] != null
              ? Number(attrs['gen_ai.usage.completion_tokens'])
              : undefined;

            // Evaluate policies (same path as SDK ingest)
            const policyResult = await this.evaluatePolicies(
              project, { agentId, agentName, toolName },
            );
            if (!policyResult.allowed) {
              results.push({
                spanId: span.spanId,
                status: 'rejected',
                error: policyResult.reason,
              });
              continue;
            }

            const trace = await this.tracesService.create(project.id, {
              traceId: span.traceId,
              spanId: span.spanId,
              parentSpanId: span.parentSpanId,
              type: this.inferTypeFromAttributes(attrs),
              name: span.name,
              status: this.mapOTLPStatus(span.status?.code),
              startTime: Math.floor(span.startTimeUnixNano / 1_000_000),
              endTime: span.endTimeUnixNano
                ? Math.floor(span.endTimeUnixNano / 1_000_000)
                : undefined,
              agentId,
              agentName,
              model: (attrs['gen_ai.request.model'] || attrs['llm.model']) as string || undefined,
              promptTokens,
              completionTokens,
              cost: attrs['orchestra.cost'] != null ? Number(attrs['orchestra.cost']) : undefined,
              toolName,
              input: this.redactPII(attrs['gen_ai.prompt'] as string),
              output: this.redactPII(attrs['gen_ai.completion'] as string),
              attributes: attrs,
              metadata: resourceAttrs,
            }, project.customPricing);

            // Update spend and agent metrics
            if (trace.cost) {
              await this.projectsService.updateSpend(project.id, Number(trace.cost));
            }

            results.push({
              spanId: span.spanId,
              status: 'accepted',
              id: trace.id,
              warnings: policyResult.warnings,
            });
          } catch (error: any) {
            results.push({ spanId: span.spanId, status: 'rejected', error: error.message });
          }
        }
      }
    }

    return {
      accepted: results.filter((r) => r.status === 'accepted').length,
      rejected: results.filter((r) => r.status === 'rejected').length,
    };
  }

  /**
   * Shared policy evaluation logic used by both SDK and OTLP ingest paths.
   */
  private async evaluatePolicies(
    project: any,
    context: { agentId?: string; agentName?: string; toolName?: string },
  ) {
    let recentCallCount: number | undefined;
    let recentTokenCount: number | undefined;

    if (context.agentId) {
      const recentWindow = new Date(Date.now() - 60_000);
      const recentTraces = await this.tracesService.countRecentByAgent(
        project.id,
        context.agentId,
        recentWindow,
      );
      recentCallCount = recentTraces.count;
      recentTokenCount = recentTraces.tokens;
    }

    return this.policiesService.evaluate(project.id, {
      agentId: context.agentId,
      agentName: context.agentName,
      toolName: context.toolName,
      currentSpend: Number(project.currentSpend),
      recentCallCount,
      recentTokenCount,
    });
  }

  private mapEventType(type: string): TraceType {
    const map: Record<string, TraceType> = {
      agent_run: TraceType.AGENT_RUN,
      step: TraceType.STEP,
      tool_call: TraceType.TOOL_CALL,
      llm_call: TraceType.LLM_CALL,
      retriever: TraceType.RETRIEVER,
      agent_action: TraceType.AGENT_ACTION,
      human_input: TraceType.HUMAN_INPUT,
      embedding: TraceType.EMBEDDING,
      evaluator: TraceType.EVALUATOR,
      guardrail: TraceType.GUARDRAIL,
      chain: TraceType.CHAIN,
      error: TraceType.ERROR,
    };
    return map[type] || TraceType.STEP;
  }

  private mapStatus(status?: string): TraceStatus {
    const map: Record<string, TraceStatus> = {
      started: TraceStatus.STARTED,
      completed: TraceStatus.COMPLETED,
      failed: TraceStatus.FAILED,
      timeout: TraceStatus.TIMEOUT,
    };
    return map[status || 'started'] || TraceStatus.STARTED;
  }

  private mapOTLPStatus(code?: number): TraceStatus {
    if (code === 2) return TraceStatus.FAILED;
    return TraceStatus.COMPLETED; // UNSET (0) and OK (1) both map to completed
  }

  private inferTypeFromAttributes(attrs: Record<string, any>): TraceType {
    if (attrs['orchestra.type']) {
      return this.mapEventType(attrs['orchestra.type'] as string);
    }
    if (attrs['gen_ai.request.model'] || attrs['llm.model']) {
      return TraceType.LLM_CALL;
    }
    if (attrs['orchestra.tool.name']) {
      return TraceType.TOOL_CALL;
    }
    return TraceType.STEP;
  }

  // Basic PII redaction - in production, use a proper library
  private redactPII(text?: string): string | undefined {
    if (!text) return text;

    // Email
    let redacted = text.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[REDACTED_EMAIL]',
    );

    // Phone numbers (basic)
    redacted = redacted.replace(
      /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      '[REDACTED_PHONE]',
    );

    // SSN
    redacted = redacted.replace(/\d{3}-\d{2}-\d{4}/g, '[REDACTED_SSN]');

    // Credit card (basic)
    redacted = redacted.replace(/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g, '[REDACTED_CC]');

    return redacted;
  }
}
