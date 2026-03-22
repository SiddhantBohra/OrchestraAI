import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Policy, PolicyType, PolicyAction } from './entities/policy.entity';
import { PolicyAlert, AlertSeverity } from './entities/policy-alert.entity';
import {
  CreatePolicyDto,
  UpdatePolicyDto,
  PolicyEvaluationResult,
  PolicyWarning,
} from './dto/policy.dto';

interface EvaluationContext {
  agentId?: string;
  agentName?: string;
  toolName?: string;
  currentSpend?: number;
  recentCallCount?: number;
  recentTokenCount?: number;
  consecutiveFailures?: number;
}

@Injectable()
export class PoliciesService {
  constructor(
    @InjectRepository(Policy)
    private policiesRepository: Repository<Policy>,
    @InjectRepository(PolicyAlert)
    private alertsRepository: Repository<PolicyAlert>,
  ) {}

  async create(projectId: string, dto: CreatePolicyDto): Promise<Policy> {
    const policy = this.policiesRepository.create({
      ...dto,
      projectId,
    });
    return this.policiesRepository.save(policy);
  }

  async findAllByProject(projectId: string): Promise<Policy[]> {
    return this.policiesRepository.find({
      where: { projectId },
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Policy> {
    const policy = await this.policiesRepository.findOne({ where: { id } });
    if (!policy) {
      throw new NotFoundException('Policy not found');
    }
    return policy;
  }

  async update(id: string, dto: UpdatePolicyDto): Promise<Policy> {
    const policy = await this.findOne(id);
    Object.assign(policy, dto);
    return this.policiesRepository.save(policy);
  }

  async delete(id: string): Promise<void> {
    const policy = await this.findOne(id);
    await this.policiesRepository.remove(policy);
  }

  /**
   * Evaluate all active policies for a project.
   *
   * WARN policies are non-blocking: they add to `warnings` but don't reject.
   * BLOCK/KILL policies are blocking: they reject immediately.
   * ESCALATE policies allow the request but create critical alerts and fire notifications.
   */
  async evaluate(
    projectId: string,
    context: EvaluationContext,
  ): Promise<PolicyEvaluationResult> {
    const policies = await this.policiesRepository.find({
      where: { projectId, isActive: true },
      order: { priority: 'DESC' },
    });

    const warnings: PolicyWarning[] = [];

    for (const policy of policies) {
      const result = this.evaluatePolicy(policy, context);

      if (!result.allowed) {
        const isWarn = policy.action === PolicyAction.WARN;
        const isEscalate = policy.action === PolicyAction.ESCALATE;

        if (isWarn || isEscalate) {
          // Non-blocking: collect as warning, create alert, continue
          warnings.push({
            policyId: policy.id,
            policyName: policy.name,
            action: policy.action,
            reason: result.reason!,
          });
          await this.recordTrigger(policy, context, result.reason!);
        } else {
          // Blocking: BLOCK or KILL
          await this.recordTrigger(policy, context, result.reason!);
          return { ...result, warnings };
        }
      }
    }

    return {
      allowed: true,
      policyId: null,
      policyName: null,
      action: null,
      reason: null,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // ─── Policy evaluation by type ────────────────────────────

  private evaluatePolicy(
    policy: Policy,
    context: EvaluationContext,
  ): PolicyEvaluationResult {
    const { conditions } = policy;

    // Check agent scope
    if (conditions.agentIds && conditions.agentIds.length > 0) {
      if (context.agentId && !conditions.agentIds.includes(context.agentId)) {
        return this.allowResult();
      }
    }
    if (conditions.agentNames && conditions.agentNames.length > 0) {
      if (context.agentName && !conditions.agentNames.includes(context.agentName)) {
        return this.allowResult();
      }
    }

    switch (policy.type) {
      case PolicyType.BUDGET:
        return this.evaluateBudgetPolicy(policy, context);
      case PolicyType.RATE_LIMIT:
        return this.evaluateRateLimitPolicy(policy, context);
      case PolicyType.TOOL_PERMISSION:
        return this.evaluateToolPolicy(policy, context);
      case PolicyType.RUNAWAY_DETECTION:
        return this.evaluateRunawayPolicy(policy, context);
      default:
        return this.allowResult();
    }
  }

  private evaluateBudgetPolicy(
    policy: Policy,
    context: EvaluationContext,
  ): PolicyEvaluationResult {
    const { conditions } = policy;
    if (conditions.maxBudget && context.currentSpend !== undefined) {
      if (context.currentSpend >= conditions.maxBudget) {
        return this.blockResult(policy, `Budget limit exceeded ($${context.currentSpend.toFixed(2)} / $${conditions.maxBudget})`);
      }
    }
    return this.allowResult();
  }

  private evaluateRateLimitPolicy(
    policy: Policy,
    context: EvaluationContext,
  ): PolicyEvaluationResult {
    const { conditions } = policy;
    if (conditions.maxRequests && context.recentCallCount !== undefined) {
      if (context.recentCallCount >= conditions.maxRequests) {
        return this.blockResult(policy, `Rate limit exceeded (${context.recentCallCount}/${conditions.maxRequests} requests)`);
      }
    }
    return this.allowResult();
  }

  private evaluateToolPolicy(
    policy: Policy,
    context: EvaluationContext,
  ): PolicyEvaluationResult {
    const { conditions } = policy;
    if (!context.toolName) return this.allowResult();

    if (conditions.blockedTools && conditions.blockedTools.includes(context.toolName)) {
      return this.blockResult(policy, `Tool "${context.toolName}" is blocked`);
    }
    if (conditions.allowedTools && conditions.allowedTools.length > 0) {
      if (!conditions.allowedTools.includes(context.toolName)) {
        return this.blockResult(policy, `Tool "${context.toolName}" is not in allowed list`);
      }
    }
    return this.allowResult();
  }

  private evaluateRunawayPolicy(
    policy: Policy,
    context: EvaluationContext,
  ): PolicyEvaluationResult {
    const { conditions } = policy;

    if (conditions.maxLoopsPerMinute && context.recentCallCount !== undefined) {
      if (context.recentCallCount >= conditions.maxLoopsPerMinute) {
        return this.blockResult(policy, `Runaway detected: ${context.recentCallCount} calls/min (limit: ${conditions.maxLoopsPerMinute})`);
      }
    }
    if (conditions.maxTokensPerMinute && context.recentTokenCount !== undefined) {
      if (context.recentTokenCount >= conditions.maxTokensPerMinute) {
        return this.blockResult(policy, `Runaway detected: ${context.recentTokenCount} tokens/min (limit: ${conditions.maxTokensPerMinute})`);
      }
    }
    if (conditions.maxConsecutiveFailures && context.consecutiveFailures !== undefined) {
      if (context.consecutiveFailures >= conditions.maxConsecutiveFailures) {
        return this.blockResult(policy, `Too many consecutive failures (${context.consecutiveFailures})`);
      }
    }
    return this.allowResult();
  }

  // ─── Helpers ──────────────────────────────────────────────

  private allowResult(): PolicyEvaluationResult {
    return { allowed: true, policyId: null, policyName: null, action: null, reason: null };
  }

  private blockResult(policy: Policy, reason: string): PolicyEvaluationResult {
    return {
      allowed: false,
      policyId: policy.id,
      policyName: policy.name,
      action: policy.action,
      reason,
    };
  }

  /**
   * Record a policy trigger: increment counter + create a PolicyAlert.
   */
  private async recordTrigger(
    policy: Policy,
    context: EvaluationContext,
    reason: string,
  ): Promise<void> {
    // Increment trigger counter
    await this.policiesRepository.update(policy.id, {
      triggerCount: () => '"triggerCount" + 1',
      lastTriggeredAt: new Date(),
    });

    // Map action to severity
    const severityMap: Record<string, AlertSeverity> = {
      [PolicyAction.WARN]: AlertSeverity.WARNING,
      [PolicyAction.BLOCK]: AlertSeverity.CRITICAL,
      [PolicyAction.KILL]: AlertSeverity.CRITICAL,
      [PolicyAction.ESCALATE]: AlertSeverity.CRITICAL,
    };

    // Create alert record
    const alert = this.alertsRepository.create({
      policyId: policy.id,
      projectId: policy.projectId,
      agentId: context.agentId,
      agentName: context.agentName,
      severity: severityMap[policy.action] || AlertSeverity.WARNING,
      type: policy.type,
      action: policy.action,
      reason,
      context: context as Record<string, any>,
    });
    await this.alertsRepository.save(alert);

    // Fire webhook notification if configured
    if (policy.notifications?.webhook) {
      this.fireWebhook(policy.notifications.webhook, alert).catch(() => {});
    }
  }

  /**
   * Fire a webhook notification (fire-and-forget).
   */
  private async fireWebhook(url: string, alert: PolicyAlert): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'policy.triggered',
          alert: {
            id: alert.id,
            severity: alert.severity,
            type: alert.type,
            action: alert.action,
            reason: alert.reason,
            agentName: alert.agentName,
            createdAt: alert.createdAt,
          },
        }),
      });
    } catch {
      // Webhook failures should not break the ingest pipeline
    }
  }

  // ─── Alerts query methods ─────────────────────────────────

  async getAlerts(
    projectId: string,
    filters?: {
      severity?: AlertSeverity;
      acknowledged?: boolean;
      limit?: number;
    },
  ): Promise<PolicyAlert[]> {
    const where: any = { projectId };
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.acknowledged !== undefined) where.acknowledged = filters.acknowledged;

    return this.alertsRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: filters?.limit || 50,
      relations: ['policy'],
    });
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<PolicyAlert> {
    const alert = await this.alertsRepository.findOne({ where: { id: alertId } });
    if (!alert) throw new NotFoundException('Alert not found');

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = userId;
    return this.alertsRepository.save(alert);
  }

  async getUnacknowledgedCount(projectId: string): Promise<number> {
    return this.alertsRepository.count({
      where: { projectId, acknowledged: false },
    });
  }

  // ─── Default policies ─────────────────────────────────────

  async createDefaultPolicies(projectId: string): Promise<void> {
    const defaults: CreatePolicyDto[] = [
      {
        name: 'Daily Budget Alert',
        description: 'Warn when daily spend exceeds $10',
        type: PolicyType.BUDGET,
        conditions: { maxBudget: 10, budgetPeriod: 'daily' },
        action: PolicyAction.WARN,
        priority: 10,
      },
      {
        name: 'Runaway Detection',
        description: 'Kill agent if more than 50 calls per minute',
        type: PolicyType.RUNAWAY_DETECTION,
        conditions: { maxLoopsPerMinute: 50, maxTokensPerMinute: 100000 },
        action: PolicyAction.KILL,
        priority: 100,
      },
    ];

    for (const dto of defaults) {
      await this.create(projectId, dto);
    }
  }
}
