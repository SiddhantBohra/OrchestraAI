import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { TraceType, TraceStatus } from '@orchestra-ai/shared';

export { TraceType, TraceStatus };

@Entity('traces')
@Index(['projectId', 'createdAt'])
@Index(['agentId', 'createdAt'])
@Index(['traceId'])
@Index(['parentSpanId'])
@Index(['sessionId'])
@Index(['userId'])
export class Trace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // OTEL standard fields
  @Column()
  traceId: string;

  @Column()
  spanId: string;

  @Column({ type: 'varchar', nullable: true })
  parentSpanId: string | null;

  @Column({ type: 'enum', enum: TraceType })
  type: TraceType;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: TraceStatus, default: TraceStatus.STARTED })
  status: TraceStatus;

  // Timing
  @Column({ type: 'bigint' })
  startTime: number;

  @Column({ type: 'bigint', nullable: true })
  endTime: number | null;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  // Project & Agent
  @Column()
  projectId: string;

  @Column({ type: 'varchar', nullable: true })
  agentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  agentName: string | null;

  @Column({ type: 'varchar', nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[] | null;

  // LLM specific
  @Column({ type: 'varchar', nullable: true })
  model: string | null;

  @Column({ type: 'int', nullable: true })
  promptTokens: number | null;

  @Column({ type: 'int', nullable: true })
  completionTokens: number | null;

  @Column({ type: 'int', nullable: true })
  totalTokens: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  cost: number | null;

  // Tool specific
  @Column({ type: 'varchar', nullable: true })
  toolName: string | null;

  @Column({ type: 'jsonb', nullable: true })
  toolArgs: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  toolResult: string | null;

  // Input/Output (redacted if needed)
  @Column({ type: 'text', nullable: true })
  input: string | null;

  @Column({ type: 'text', nullable: true })
  output: string | null;

  // Error info
  @Column({ type: 'varchar', nullable: true })
  errorType: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'text', nullable: true })
  errorStack: string | null;

  // Metadata
  @Column({ type: 'jsonb', nullable: true })
  attributes: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
