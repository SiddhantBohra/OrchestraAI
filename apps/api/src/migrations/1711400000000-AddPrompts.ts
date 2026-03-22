import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrompts1711400000000 implements MigrationInterface {
  name = 'AddPrompts1711400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "prompts" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "projectId" uuid NOT NULL,
        "name" character varying NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "template" text NOT NULL,
        "variables" jsonb,
        "model" character varying,
        "modelConfig" jsonb,
        "tag" character varying,
        "notes" text,
        "createdBy" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_prompts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_prompts_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_prompts_project_name" ON "prompts" ("projectId", "name")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_prompts_project_name_version" ON "prompts" ("projectId", "name", "version")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "prompts"`);
  }
}
