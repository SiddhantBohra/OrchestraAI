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
import { AgentFramework, AgentStatus } from '@orchestra-ai/shared';

export { AgentFramework, AgentStatus };

@Entity('agents')
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: AgentFramework, default: AgentFramework.CUSTOM })
  framework: AgentFramework;

  @Column({ type: 'enum', enum: AgentStatus, default: AgentStatus.IDLE })
  status: AgentStatus;

  @Column({ nullable: true })
  version: string;

  // Runtime metadata
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  // Allowed tools for this agent
  @Column({ type: 'simple-array', nullable: true })
  allowedTools: string[];

  // Metrics
  @Column({ type: 'int', default: 0 })
  totalRuns: number;

  @Column({ type: 'int', default: 0 })
  successfulRuns: number;

  @Column({ type: 'int', default: 0 })
  failedRuns: number;

  @Column({ type: 'bigint', default: 0 })
  totalTokens: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  totalCost: number;

  @Column({ nullable: true })
  lastRunAt: Date;

  @ManyToOne(() => Project, (project) => project.agents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  projectId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
