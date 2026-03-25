import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddObservationTypes1711700000000 implements MigrationInterface {
  name = 'AddObservationTypes1711700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new observation types matching Langfuse's model
    await queryRunner.query(`ALTER TYPE "trace_type_enum" ADD VALUE IF NOT EXISTS 'embedding'`);
    await queryRunner.query(`ALTER TYPE "trace_type_enum" ADD VALUE IF NOT EXISTS 'evaluator'`);
    await queryRunner.query(`ALTER TYPE "trace_type_enum" ADD VALUE IF NOT EXISTS 'guardrail'`);
    await queryRunner.query(`ALTER TYPE "trace_type_enum" ADD VALUE IF NOT EXISTS 'chain'`);
  }

  public async down(): Promise<void> {
    // Cannot remove enum values in PostgreSQL
  }
}
