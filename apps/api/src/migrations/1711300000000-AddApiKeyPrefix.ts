import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiKeyPrefix1711300000000 implements MigrationInterface {
  name = 'AddApiKeyPrefix1711300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add prefix column for fast lookup
    await queryRunner.query(`
      ALTER TABLE "projects"
      ADD COLUMN IF NOT EXISTS "apiKeyPrefix" character varying
    `);

    // Add sessionId to traces
    await queryRunner.query(`
      ALTER TABLE "traces"
      ADD COLUMN IF NOT EXISTS "sessionId" character varying
    `);

    // Index for prefix-based API key lookup
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_projects_apiKeyPrefix" ON "projects" ("apiKeyPrefix")
    `);

    // Index for session-based trace queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_traces_sessionId" ON "traces" ("sessionId")
    `);

    // Backfill prefix for existing plaintext keys
    await queryRunner.query(`
      UPDATE "projects"
      SET "apiKeyPrefix" = LEFT("apiKey", 12)
      WHERE "apiKeyPrefix" IS NULL AND "apiKey" LIKE 'oai_%'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_traces_sessionId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_projects_apiKeyPrefix"`);
    await queryRunner.query(`ALTER TABLE "traces" DROP COLUMN IF EXISTS "sessionId"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "apiKeyPrefix"`);
  }
}
