import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1711000000000 implements MigrationInterface {
  name = 'InitialSchema1711000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "agent_framework_enum" AS ENUM (
        'langgraph', 'openai-agents', 'crewai', 'mastra', 'llamaindex', 'haystack', 'autogen', 'custom'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "agent_status_enum" AS ENUM ('active', 'idle', 'error', 'killed')
    `);
    await queryRunner.query(`
      CREATE TYPE "trace_type_enum" AS ENUM ('agent_run', 'step', 'tool_call', 'llm_call', 'error')
    `);
    await queryRunner.query(`
      CREATE TYPE "trace_status_enum" AS ENUM ('started', 'completed', 'failed', 'timeout')
    `);
    await queryRunner.query(`
      CREATE TYPE "policy_type_enum" AS ENUM ('budget', 'rate_limit', 'tool_permission', 'runaway_detection', 'pii_redaction')
    `);
    await queryRunner.query(`
      CREATE TYPE "policy_action_enum" AS ENUM ('allow', 'block', 'warn', 'escalate', 'kill')
    `);

    // Users
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar NOT NULL,
        "passwordHash" varchar NOT NULL,
        "name" varchar NOT NULL,
        "company" varchar,
        "role" varchar NOT NULL DEFAULT 'user',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // Projects
    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "description" varchar,
        "apiKey" varchar NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "budgetLimit" decimal(10,2) NOT NULL DEFAULT 100,
        "currentSpend" decimal(10,2) NOT NULL DEFAULT 0,
        "killSwitchEnabled" boolean NOT NULL DEFAULT true,
        "ownerId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_projects_apiKey" UNIQUE ("apiKey"),
        CONSTRAINT "PK_projects" PRIMARY KEY ("id"),
        CONSTRAINT "FK_projects_owner" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE NO ACTION
      )
    `);

    // Agents
    await queryRunner.query(`
      CREATE TABLE "agents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "description" varchar,
        "framework" "agent_framework_enum" NOT NULL DEFAULT 'custom',
        "status" "agent_status_enum" NOT NULL DEFAULT 'idle',
        "version" varchar,
        "metadata" jsonb,
        "allowedTools" text,
        "totalRuns" int NOT NULL DEFAULT 0,
        "successfulRuns" int NOT NULL DEFAULT 0,
        "failedRuns" int NOT NULL DEFAULT 0,
        "totalTokens" bigint NOT NULL DEFAULT 0,
        "totalCost" decimal(10,4) NOT NULL DEFAULT 0,
        "lastRunAt" TIMESTAMP,
        "projectId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_agents_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);

    // Traces
    await queryRunner.query(`
      CREATE TABLE "traces" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "traceId" varchar NOT NULL,
        "spanId" varchar NOT NULL,
        "parentSpanId" varchar,
        "type" "trace_type_enum" NOT NULL,
        "name" varchar NOT NULL,
        "status" "trace_status_enum" NOT NULL DEFAULT 'started',
        "startTime" bigint NOT NULL,
        "endTime" bigint,
        "durationMs" int,
        "projectId" uuid NOT NULL,
        "agentId" varchar,
        "agentName" varchar,
        "model" varchar,
        "promptTokens" int,
        "completionTokens" int,
        "totalTokens" int,
        "cost" decimal(10,6),
        "toolName" varchar,
        "toolArgs" jsonb,
        "toolResult" text,
        "input" text,
        "output" text,
        "errorType" varchar,
        "errorMessage" text,
        "errorStack" text,
        "attributes" jsonb,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_traces" PRIMARY KEY ("id")
      )
    `);

    // Trace indexes
    await queryRunner.query(`CREATE INDEX "IDX_traces_project_created" ON "traces" ("projectId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_traces_agent_created" ON "traces" ("agentId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_traces_traceId" ON "traces" ("traceId")`);
    await queryRunner.query(`CREATE INDEX "IDX_traces_parentSpanId" ON "traces" ("parentSpanId")`);

    // Policies
    await queryRunner.query(`
      CREATE TABLE "policies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "description" varchar,
        "type" "policy_type_enum" NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "priority" int NOT NULL DEFAULT 0,
        "conditions" jsonb NOT NULL,
        "action" "policy_action_enum" NOT NULL DEFAULT 'warn',
        "notifications" jsonb,
        "projectId" uuid NOT NULL,
        "triggerCount" int NOT NULL DEFAULT 0,
        "lastTriggeredAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_policies" PRIMARY KEY ("id"),
        CONSTRAINT "FK_policies_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);

    // Ensure uuid-ossp extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "policies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "traces"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "projects"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "policy_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "policy_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "trace_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "trace_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_framework_enum"`);
  }
}
