import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';

export enum PolicyType {
  BUDGET = 'budget',
  RATE_LIMIT = 'rate_limit',
  TOOL_PERMISSION = 'tool_permission',
  RUNAWAY_DETECTION = 'runaway_detection',
  PII_REDACTION = 'pii_redaction',
}

export enum PolicyAction {
  ALLOW = 'allow',
  BLOCK = 'block',
  WARN = 'warn',
  ESCALATE = 'escalate',
  KILL = 'kill',
}

@Entity('policies')
export class Policy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: PolicyType })
  type: PolicyType;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number; // Higher = evaluated first

  // Policy conditions
  @Column({ type: 'jsonb' })
  conditions: {
    // Budget policy
    maxBudget?: number;
    budgetPeriod?: 'hourly' | 'daily' | 'monthly';
    
    // Rate limit
    maxRequests?: number;
    windowSeconds?: number;
    
    // Tool permission
    allowedTools?: string[];
    blockedTools?: string[];
    
    // Runaway detection
    maxLoopsPerMinute?: number;
    maxTokensPerMinute?: number;
    maxConsecutiveFailures?: number;
    
    // Agent scope
    agentIds?: string[];
    agentNames?: string[];
  };

  // Action when policy triggers
  @Column({ type: 'enum', enum: PolicyAction, default: PolicyAction.WARN })
  action: PolicyAction;

  // Notification settings
  @Column({ type: 'jsonb', nullable: true })
  notifications: {
    email?: string[];
    webhook?: string;
    slack?: string;
  };

  @ManyToOne(() => Project, (project) => project.policies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  projectId: string;

  @Column({ type: 'int', default: 0 })
  triggerCount: number;

  @Column({ nullable: true })
  lastTriggeredAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
