import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHumanInputTraceType1711500000000 implements MigrationInterface {
  name = 'AddHumanInputTraceType1711500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "trace_type_enum" ADD VALUE IF NOT EXISTS 'human_input'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL doesn't support removing enum values — this is a no-op.
    // The value remains but is harmless if unused.
  }
}
