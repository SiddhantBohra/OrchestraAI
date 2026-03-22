import { Injectable } from '@nestjs/common';
import { TracesService } from '../traces/traces.service';
import { AgentsService } from '../agents/agents.service';
import { ProjectsService } from '../projects/projects.service';
import { TraceType } from '../traces/entities/trace.entity';

@Injectable()
export class DashboardService {
  constructor(
    private tracesService: TracesService,
    private agentsService: AgentsService,
    private projectsService: ProjectsService,
  ) { }

  async getOverview(projectId: string) {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      agents,
      recentRuns,
      recentErrors,
      costByAgent24h,
      modelUsage24h,
      toolUsage24h,
      runawayAlerts,
    ] = await Promise.all([
      this.agentsService.findAllByProject(projectId),
      this.tracesService.getAgentRuns(projectId, 10),
      this.tracesService.getRecentErrors(projectId, 10),
      this.tracesService.getCostByAgent(projectId, last24h, now),
      this.tracesService.getModelUsage(projectId, last24h, now),
      this.tracesService.getToolUsage(projectId, last24h, now),
      this.tracesService.detectRunaway(projectId, 5, 20),
    ]);

    // Calculate totals
    const totalCost24h = costByAgent24h.reduce(
      (sum, a) => sum + Number(a.totalCost || 0),
      0,
    );
    const totalTokens24h = costByAgent24h.reduce(
      (sum, a) => sum + Number(a.totalTokens || 0),
      0,
    );

    const activeAgents = agents.filter((a) => a.status === 'active').length;
    const erroredAgents = agents.filter((a) => a.status === 'error').length;

    return {
      summary: {
        totalAgents: agents.length,
        activeAgents,
        erroredAgents,
        totalCost24h: totalCost24h.toFixed(4),
        totalTokens24h,
        recentErrorCount: recentErrors.length,
        runawayAlertCount: runawayAlerts.length,
      },
      recentRuns: recentRuns.map((r) => ({
        id: r.id,
        traceId: r.traceId,
        agentName: r.agentName,
        status: r.status,
        durationMs: r.durationMs,
        totalTokens: r.totalTokens,
        cost: r.cost,
        createdAt: r.createdAt,
      })),
      recentErrors: recentErrors.map((e) => ({
        id: e.id,
        traceId: e.traceId,
        agentName: e.agentName,
        name: e.name,
        errorType: e.errorType,
        errorMessage: e.errorMessage,
        createdAt: e.createdAt,
      })),
      costByAgent: costByAgent24h,
      modelUsage: modelUsage24h,
      toolUsage: toolUsage24h,
      runawayAlerts,
    };
  }

  async getCostAnalytics(projectId: string, period: 'day' | 'week' | 'month' = 'week') {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const [costByAgent, modelUsage, budget] = await Promise.all([
      this.tracesService.getCostByAgent(projectId, startDate, now),
      this.tracesService.getModelUsage(projectId, startDate, now),
      this.projectsService.checkBudget(projectId),
    ]);

    const totalCost = costByAgent.reduce((sum, a) => sum + Number(a.totalCost || 0), 0);
    const totalTokens = costByAgent.reduce((sum, a) => sum + Number(a.totalTokens || 0), 0);

    return {
      period,
      startDate,
      endDate: now,
      totalCost: totalCost.toFixed(4),
      totalTokens,
      budgetRemaining: budget.remaining.toFixed(2),
      budgetUtilization: budget.remaining > 0
        ? ((1 - budget.remaining / (budget.remaining + totalCost)) * 100).toFixed(1)
        : 100,
      costByAgent: costByAgent.map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        cost: Number(a.totalCost || 0).toFixed(4),
        tokens: Number(a.totalTokens || 0),
        percentage: totalCost > 0
          ? ((Number(a.totalCost || 0) / totalCost) * 100).toFixed(1)
          : 0,
      })),
      costByModel: modelUsage.map((m) => ({
        model: m.model,
        cost: Number(m.totalCost || 0).toFixed(4),
        tokens: Number(m.totalTokens || 0),
        calls: Number(m.callCount || 0),
        avgLatency: Math.round(Number(m.avgLatency || 0)),
      })),
    };
  }

  async getAgentPerformance(projectId: string, agentId: string) {
    const agent = await this.agentsService.findOne(agentId);
    const metrics = await this.agentsService.getAgentMetrics(agentId);

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentRuns = await this.tracesService.findByProject(projectId, {
      agentId,
      type: TraceType.AGENT_RUN,
      limit: 20,
    });

    return {
      agent: {
        id: agent.id,
        name: agent.name,
        framework: agent.framework,
        status: agent.status,
        version: agent.version,
      },
      metrics,
      recentRuns: recentRuns.map((r) => ({
        id: r.id,
        traceId: r.traceId,
        status: r.status,
        durationMs: r.durationMs,
        totalTokens: r.totalTokens,
        cost: r.cost,
        createdAt: r.createdAt,
      })),
    };
  }
}
