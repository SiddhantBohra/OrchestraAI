/**
 * OpenAI SDK — traced by OrchestraAI (TypeScript).
 *
 * Uses the SDK's auto token extraction — just pass the response object.
 * No monkey-patching; explicit tracing with zero boilerplate.
 *
 * Prerequisites:
 *   npm link ./sdks/typescript
 *   npm install openai
 *
 * Run:
 *   export ORCHESTRA_API_KEY=oai_...
 *   export OPENAI_API_KEY=sk-...
 *   npx tsx examples/openai_agents.ts
 */

import { OrchestraAI } from '../sdks/typescript/src';
import OpenAI from 'openai';

const oa = new OrchestraAI({
  apiKey: process.env.ORCHESTRA_API_KEY!,
  baseUrl: process.env.ORCHESTRA_BASE_URL || 'http://localhost:3001',
});

const openai = new OpenAI();

async function main() {
  console.log('=== OpenAI SDK with OrchestraAI Tracing (TypeScript) ===\n');

  await oa.trace('openai-research-agent', async (trace) => {
    // Step 1: Planning
    console.log('1. Planning...');
    const plan = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a research assistant. Plan your approach.' },
        { role: 'user', content: 'I need a summary of AI agent safety approaches.' },
      ],
      max_tokens: 200,
    });
    await trace.llmCall({
      response: plan,
      inputPreview: 'Plan: summary of AI agent safety approaches',
      outputPreview: plan.choices[0].message.content ?? '',
    });
    console.log(`   Plan: ${plan.choices[0].message.content?.slice(0, 120)}...`);

    // Step 2: Tool call (simulated)
    console.log('2. Searching docs...');
    const toolSpan = trace.toolCall({
      toolName: 'arxiv_search',
      toolInput: { query: 'AI agent safety 2024' },
    });
    toolSpan.setData({ toolOutput: 'Found 5 papers on AI agent safety' });
    toolSpan.end();

    // Step 3: Synthesis
    console.log('3. Synthesizing...');
    const summary = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Summarize in 3 sentences.' },
        { role: 'user', content: plan.choices[0].message.content || '' },
      ],
      max_tokens: 150,
    });
    await trace.llmCall({
      response: summary,
      inputPreview: 'Synthesize the plan into 3 sentences',
      outputPreview: summary.choices[0].message.content ?? '',
    });
    console.log(`   Summary: ${summary.choices[0].message.content}`);
  }, { sessionId: 'research-session-001' });

  console.log('\nAll calls traced! Check http://localhost:3000/dashboard/traces');
}

main().catch(console.error);
