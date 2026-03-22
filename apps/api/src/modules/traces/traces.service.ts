import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Trace, TraceType, TraceStatus } from './entities/trace.entity';
import { CreateTraceDto, TraceQueryDto, TraceTreeNode } from './dto/trace.dto';
import { MODEL_PRICING } from '@orchestra-ai/shared';

@Injectable()
export class TracesService {
  constructor(
    @InjectRepository(Trace)
    private tracesRepository: Repository<Trace>,
  ) { }

  async create(
    projectId: string,
    dto: CreateTraceDto & { cost?: number },
    customPricing?: Record<string, { input: number; output: number }> | null,
  ): Promise<Trace> {
    const durationMs = dto.endTime ? dto.endTime - dto.startTime : null;
    const totalTokens = (dto.promptTokens || 0) + (dto.completionTokens || 0);

    // Cost priority: SDK-provided > project custom pricing > built-in defaults > null
    const cost = dto.cost
      ?? this.calculateCost(dto.model, dto.promptTokens, dto.completionTokens, customPricing)
      ?? null;

    const tracePayload: DeepPartial<Trace> = {
      ...(dto as DeepPartial<Trace>),
      projectId,
      durationMs,
      totalTokens: totalTokens || null,
      cost,
    };

    const trace = this.tracesRepository.create(tracePayload);

    return this.tracesRepository.save(trace);
  }

  async findByProject(projectId: string, query: TraceQueryDto): Promise<Trace[]> {
    const qb = this.tracesRepository.createQueryBuilder('trace')
      .where('trace.projectId = :projectId', { projectId });

    if (query.agentId) qb.andWhere('trace.agentId = :agentId', { agentId: query.agentId });
    if (query.agentName) qb.andWhere('trace.agentName = :agentName', { agentName: query.agentName });
    if (query.type) qb.andWhere('trace.type = :type', { type: query.type });
    if (query.status) qb.andWhere('trace.status = :status', { status: query.status });
    if (query.traceId) qb.andWhere('trace.traceId = :traceId', { traceId: query.traceId });
    if (query.sessionId) qb.andWhere('trace.sessionId = :sessionId', { sessionId: query.sessionId });
    if (query.userId) qb.andWhere('trace.userId = :userId', { userId: query.userId });
    if (query.model) qb.andWhere('trace.model = :model', { model: query.model });
    if (query.minCost != null) qb.andWhere('trace.cost >= :minCost', { minCost: query.minCost });
    if (query.minDuration != null) qb.andWhere('trace.durationMs >= :minDuration', { minDuration: query.minDuration });

    if (query.startDate) qb.andWhere('trace.createdAt >= :startDate', { startDate: new Date(query.startDate) });
    if (query.endDate) qb.andWhere('trace.createdAt <= :endDate', { endDate: new Date(query.endDate) });

    qb.orderBy('trace.createdAt', 'DESC')
      .take(query.limit || 100)
      .skip(query.offset || 0);

    return qb.getMany();
  }

  async findOne(id: string): Promise<Trace | null> {
    return this.tracesRepository.findOne({ where: { id } });
  }

  async getTraceTree(traceId: string): Promise<TraceTreeNode[]> {
    const traces = await this.tracesRepository.find({
      where: { traceId },
      order: { startTime: 'ASC' },
    });

    return this.buildTree(traces);
  }

  async getAgentRuns(projectId: string, limit = 50): Promise<Trace[]> {
    return this.tracesRepository.find({
      where: { projectId, type: TraceType.AGENT_RUN },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getRecentErrors(projectId: string, limit = 50): Promise<Trace[]> {
    return this.tracesRepository.find({
      where: { projectId, status: TraceStatus.FAILED },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getCostByAgent(projectId: string, startDate: Date, endDate: Date) {
    const result = await this.tracesRepository
      .createQueryBuilder('trace')
      .select('trace.agentId', 'agentId')
      .addSelect('trace.agentName', 'agentName')
      .addSelect('SUM(trace.cost)', 'totalCost')
      .addSelect('SUM(trace.totalTokens)', 'totalTokens')
      .addSelect('COUNT(*)', 'traceCount')
      .where('trace.projectId = :projectId', { projectId })
      .andWhere('trace.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('trace.type = :type', { type: TraceType.LLM_CALL })
      .groupBy('trace.agentId')
      .addGroupBy('trace.agentName')
      .getRawMany();

    return result;
  }

  async getModelUsage(projectId: string, startDate: Date, endDate: Date) {
    const result = await this.tracesRepository
      .createQueryBuilder('trace')
      .select('trace.model', 'model')
      .addSelect('SUM(trace.cost)', 'totalCost')
      .addSelect('SUM(trace.totalTokens)', 'totalTokens')
      .addSelect('COUNT(*)', 'callCount')
      .addSelect('AVG(trace.durationMs)', 'avgLatency')
      .where('trace.projectId = :projectId', { projectId })
      .andWhere('trace.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('trace.type = :type', { type: TraceType.LLM_CALL })
      .groupBy('trace.model')
      .getRawMany();

    return result;
  }

  async getToolUsage(projectId: string, startDate: Date, endDate: Date) {
    const result = await this.tracesRepository
      .createQueryBuilder('trace')
      .select('trace.toolName', 'toolName')
      .addSelect('COUNT(*)', 'callCount')
      .addSelect('SUM(CASE WHEN trace.status = :failed THEN 1 ELSE 0 END)', 'failureCount')
      .addSelect('AVG(trace.durationMs)', 'avgDuration')
      .where('trace.projectId = :projectId', { projectId })
      .andWhere('trace.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('trace.type = :type', { type: TraceType.TOOL_CALL })
      .setParameter('failed', TraceStatus.FAILED)
      .groupBy('trace.toolName')
      .getRawMany();

    return result;
  }

  async countRecentByAgent(
    projectId: string,
    agentId: string,
    since: Date,
  ): Promise<{ count: number; tokens: number }> {
    const result = await this.tracesRepository
      .createQueryBuilder('trace')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(trace.totalTokens), 0)', 'tokens')
      .where('trace.projectId = :projectId', { projectId })
      .andWhere('trace.agentId = :agentId', { agentId })
      .andWhere('trace.createdAt >= :since', { since })
      .getRawOne();

    return {
      count: Number(result?.count ?? 0),
      tokens: Number(result?.tokens ?? 0),
    };
  }

  // Detect runaway agents (loop detection)
  async detectRunaway(projectId: string, windowMinutes = 5, threshold = 20) {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    const result = await this.tracesRepository
      .createQueryBuilder('trace')
      .select('trace.agentId', 'agentId')
      .addSelect('trace.agentName', 'agentName')
      .addSelect('COUNT(*)', 'callCount')
      .addSelect('SUM(trace.totalTokens)', 'tokensBurned')
      .where('trace.projectId = :projectId', { projectId })
      .andWhere('trace.createdAt >= :windowStart', { windowStart })
      .andWhere('trace.type IN (:...types)', { types: [TraceType.LLM_CALL, TraceType.TOOL_CALL] })
      .groupBy('trace.agentId')
      .addGroupBy('trace.agentName')
      .having('COUNT(*) > :threshold', { threshold })
      .getRawMany();

    return result.map((r) => ({
      ...r,
      isRunaway: true,
      recommendation: 'Consider killing this agent or reviewing its logic',
    }));
  }

  private calculateCost(
    model: string | undefined,
    promptTokens: number | undefined,
    completionTokens: number | undefined,
    customPricing?: Record<string, { input: number; output: number }> | null,
  ): number | null {
    if (!model || (!promptTokens && !completionTokens)) return null;

    // Priority: project custom pricing > built-in defaults > null (never guess)
    const pricing = customPricing?.[model] ?? MODEL_PRICING[model];
    if (!pricing) return null;

    const inputCost = ((promptTokens || 0) / 1000) * pricing.input;
    const outputCost = ((completionTokens || 0) / 1000) * pricing.output;

    return Math.round((inputCost + outputCost) * 1000000) / 1000000;
  }

  // Internal LangChain/LangGraph runnables that add noise to the trace tree
  private static readonly NOISE_NAMES = new Set([
    'RunnableSequence', 'RunnableLambda', 'RunnableParallel',
    'RunnablePassthrough', 'RunnableAssign',
    'ChannelWrite', 'ChannelRead',
    '__start__', '__end__',
  ]);

  private buildTree(traces: Trace[]): any[] {
    const map = new Map<string, any>();
    const roots: any[] = [];

    // Deduplicate by spanId — keep the version with most data (completed > started)
    for (const trace of traces) {
      // Filter out noisy internal LangChain runnables
      if (TracesService.NOISE_NAMES.has(trace.name)) continue;
      const existing = map.get(trace.spanId);
      if (existing) {
        // Keep the one with endTime (completed), or the later one
        if (trace.endTime && !existing.endTime) {
          existing.status = trace.status;
          existing.endTime = trace.endTime;
          existing.durationMs = trace.durationMs || existing.durationMs;
          existing.output = trace.output || existing.output;
          existing.cost = trace.cost || existing.cost;
          existing.totalTokens = trace.totalTokens || existing.totalTokens;
          existing.promptTokens = trace.promptTokens || existing.promptTokens;
          existing.completionTokens = trace.completionTokens || existing.completionTokens;
        }
        continue;
      }

      map.set(trace.spanId, {
        id: trace.id,
        spanId: trace.spanId,
        parentSpanId: trace.parentSpanId,
        name: trace.name,
        type: trace.type,
        status: trace.status,
        durationMs: trace.durationMs || 0,
        model: trace.model,
        promptTokens: trace.promptTokens,
        completionTokens: trace.completionTokens,
        totalTokens: trace.totalTokens,
        cost: trace.cost,
        toolName: trace.toolName,
        toolArgs: trace.toolArgs,
        toolResult: trace.toolResult,
        input: trace.input,
        output: trace.output,
        errorType: trace.errorType,
        errorMessage: trace.errorMessage,
        agentName: trace.agentName,
        metadata: trace.metadata,
        startTime: trace.startTime,
        endTime: trace.endTime,
        createdAt: trace.createdAt,
        children: [],
      });
    }

    // Build tree from deduplicated nodes
    for (const node of map.values()) {
      if (node.parentSpanId && map.has(node.parentSpanId)) {
        map.get(node.parentSpanId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}
