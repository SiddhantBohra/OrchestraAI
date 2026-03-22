/**
 * Kill Switch Demo — OrchestraAI stops a runaway agent mid-execution.
 *
 * Creates a project with a tiny $0.05 budget, then runs an agent
 * that makes LLM calls in a loop. When the budget is exhausted, the API
 * returns a kill signal and the SDK throws AgentKilledException.
 *
 * Prerequisites:
 *   1. API running: npm run dev:api
 *   2. Docker: docker compose up -d postgres redis
 *
 * Run:
 *   npx tsx examples/kill_switch_demo.ts
 */

import { OrchestraAI, AgentKilledException } from '../sdks/typescript/src';

const API_URL = process.env.ORCHESTRA_BASE_URL || 'http://localhost:3001';

async function setupProject(): Promise<{ apiKey: string; projectId: string }> {
  // Register (ignore if exists)
  await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'killswitch-ts@example.com',
      password: 'DemoPass123!',
      name: 'Kill Switch TS Demo',
    }),
  }).catch(() => {});

  // Login
  const authRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'killswitch-ts@example.com',
      password: 'DemoPass123!',
    }),
  });
  const auth = await authRes.json() as { accessToken: string };
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${auth.accessToken}`,
  };

  // Create project with tiny budget
  const projectRes = await fetch(`${API_URL}/api/projects`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Kill Switch TS Demo',
      budgetLimit: 0.05,
      killSwitchEnabled: true,
    }),
  });
  const project = await projectRes.json() as {
    id: string;
    rawApiKey?: string;
    apiKey: string;
    budgetLimit: string;
  };

  const apiKey = project.rawApiKey || project.apiKey;
  console.log(`  Project: ${project.id.slice(0, 12)}...`);
  console.log(`  Budget:  $${project.budgetLimit}`);
  console.log(`  Kill Switch: enabled`);

  // Create default policies
  await fetch(`${API_URL}/api/projects/${project.id}/policies/defaults`, {
    method: 'POST',
    headers,
  });

  return { apiKey, projectId: project.id };
}

async function runAgentUntilKilled(apiKey: string): Promise<number> {
  const oa = new OrchestraAI({ apiKey, baseUrl: API_URL });

  console.log('\n  Starting agent loop (will be killed when budget exhausted)...\n');

  let callCount = 0;

  try {
    await oa.trace('runaway-demo-agent', async (trace) => {
      while (true) {
        callCount++;

        // Simulate an expensive LLM call (~$0.0125 per call)
        await trace.llmCall({
          model: 'gpt-4o',
          inputTokens: 1000,
          outputTokens: 500,
          inputPreview: `Call #${callCount}: Summarize this document...`,
          outputPreview: 'Here is the summary...',
        });

        console.log(`    Call #${callCount} — sent (cost ~$0.0125 per call)`);
        await new Promise((r) => setTimeout(r, 300));
      }
    });
  } catch (error) {
    if (error instanceof AgentKilledException) {
      console.log(`\n  KILLED after ${callCount} calls!`);
      console.log(`  Reason: ${error.reason}`);
      console.log(`  Action: ${error.action}`);
    } else {
      console.log(`\n  Stopped: ${(error as Error).message}`);
    }
  }

  return callCount;
}

async function main() {
  console.log('='.repeat(60));
  console.log('  OrchestraAI Kill Switch Demo (TypeScript)');
  console.log('='.repeat(60));

  console.log('\n[1] Setting up project with $0.05 budget...');
  const { apiKey, projectId } = await setupProject();

  console.log('\n[2] Running agent in a loop...');
  const calls = await runAgentUntilKilled(apiKey);

  console.log('\n' + '='.repeat(60));
  console.log(`  Demo complete — agent was killed after ${calls} calls`);
  console.log('  The kill switch prevented unlimited spending.');
  console.log('='.repeat(60));
}

main().catch(console.error);
