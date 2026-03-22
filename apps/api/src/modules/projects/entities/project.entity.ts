import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Agent } from '../../agents/entities/agent.entity';
import { Policy } from '../../policies/entities/policy.entity';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ unique: true })
  apiKey: string; // Stores bcrypt hash (new projects) or plaintext (legacy)

  @Column({ type: 'varchar', nullable: true })
  apiKeyPrefix: string; // First 12 chars for lookup (e.g. "oai_02083c5f")

  @Column({ default: true })
  isActive: boolean;

  // Cost governance
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 100 })
  budgetLimit: number; // Monthly budget in USD

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  currentSpend: number;

  @Column({ default: true })
  killSwitchEnabled: boolean;

  @Column({ type: 'jsonb', nullable: true })
  customPricing: Record<string, { input: number; output: number }> | null;

  @ManyToOne(() => User, (user) => user.projects)
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column()
  ownerId: string;

  @OneToMany(() => Agent, (agent) => agent.project)
  agents: Agent[];

  @OneToMany(() => Policy, (policy) => policy.project)
  policies: Policy[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
