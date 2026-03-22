import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('prompts')
@Index(['projectId', 'name'])
export class Prompt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column()
  name: string; // e.g. "rag-system-prompt"

  @Column()
  version: number; // Auto-incremented per name

  @Column({ type: 'text' })
  template: string; // The actual prompt template

  @Column({ type: 'jsonb', nullable: true })
  variables: string[]; // Template variables, e.g. ["context", "question"]

  @Column({ type: 'varchar', nullable: true })
  model: string; // Recommended model

  @Column({ type: 'jsonb', nullable: true })
  modelConfig: Record<string, any>; // temperature, max_tokens, etc.

  @Column({ type: 'varchar', nullable: true })
  tag: string; // e.g. "production", "staging", "experiment-1"

  @Column({ type: 'text', nullable: true })
  notes: string; // Change notes for this version

  @Column({ type: 'varchar', nullable: true })
  createdBy: string; // User ID who created this version

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
