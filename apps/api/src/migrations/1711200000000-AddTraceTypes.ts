import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTraceTypes1711200000000 implements MigrationInterface {
  name = 'AddTraceTypes1711200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "trace_type_enum" ADD VALUE IF NOT EXISTS 'retriever'`);
    await queryRunner.query(`ALTER TYPE "trace_type_enum" ADD VALUE IF NOT EXISTS 'agent_action'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL doesn't support removing enum values — this is a no-op.
    // The values remain but are unused after rollback.
  }
}
