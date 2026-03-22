import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdAndTags1711600000000 implements MigrationInterface {
  name = 'AddUserIdAndTags1711600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "traces" ADD COLUMN IF NOT EXISTS "userId" varchar`);
    await queryRunner.query(`ALTER TABLE "traces" ADD COLUMN IF NOT EXISTS "tags" text`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_traces_sessionId" ON "traces" ("sessionId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_traces_userId" ON "traces" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_traces_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_traces_sessionId"`);
    await queryRunner.query(`ALTER TABLE "traces" DROP COLUMN IF EXISTS "tags"`);
    await queryRunner.query(`ALTER TABLE "traces" DROP COLUMN IF EXISTS "userId"`);
  }
}
