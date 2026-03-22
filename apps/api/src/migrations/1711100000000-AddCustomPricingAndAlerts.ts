import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomPricingAndAlerts1711100000000 implements MigrationInterface {
  name = 'AddCustomPricingAndAlerts1711100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add customPricing JSONB column to projects
    await queryRunner.query(`
      ALTER TABLE "projects"
      ADD COLUMN IF NOT EXISTS "customPricing" jsonb DEFAULT NULL
    `);

    // Create policy_alerts table for alert history
    await queryRunner.query(`
      CREATE TYPE "alert_severity_enum" AS ENUM ('info', 'warning', 'critical')
    `);

    await queryRunner.query(`
      CREATE TABLE "policy_alerts" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "policyId" uuid NOT NULL,
        "projectId" uuid NOT NULL,
        "agentId" character varying,
        "agentName" character varying,
        "severity" "alert_severity_enum" NOT NULL DEFAULT 'warning',
        "type" "policy_type_enum" NOT NULL,
        "action" "policy_action_enum" NOT NULL,
        "reason" text NOT NULL,
        "context" jsonb,
        "acknowledged" boolean NOT NULL DEFAULT false,
        "acknowledgedAt" TIMESTAMP,
        "acknowledgedBy" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_policy_alerts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_policy_alerts_policy" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_policy_alerts_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_policy_alerts_project_created" ON "policy_alerts" ("projectId", "createdAt" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_policy_alerts_severity" ON "policy_alerts" ("projectId", "severity", "acknowledged")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "policy_alerts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "alert_severity_enum"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "customPricing"`);
  }
}
