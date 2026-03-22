/**
 * Basic Tracing Example — OrchestraAI TypeScript SDK
 *
 * Shows: auto token extraction, tool calls, retriever spans, sessions.
 *
 * Prerequisites:
 *   1. API running: npm run dev:api
 *   2. Set env: ORCHESTRA_API_KEY
 *
 * Run:
 *   npx tsx examples/basic_tracing.ts
 */

import { OrchestraAI } from '../sdks/typescript/src';
import OpenAI from 'openai';

const API_URL = process.env.ORCHESTRA_BASE_URL || 'http://localhost:3001';

async function main() {
  const oa = new OrchestraAI({
    apiKey: process.env.ORCHESTRA_API_KEY!,
    baseUrl: API_URL,
  });

  const openai = new OpenAI({
    baseUrl: process.env.OPENAI_BASE_URL || 'http://localhost:1234/v1',
    apiKey: process.env.OPENAI_API_KEY || 'not-needed',
  });

  console.log('=== OrchestraAI TypeScript SDK — Basic Tracing ===\n');

  await oa.trace('research-agent', async (trace) => {
    // 1. LLM call — tokens auto-extracted from response
    console.log('1. Making LLM call...');
    const response = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || 'gpt-4o',
      messages: [{ role: 'user', content: 'What is Kubernetes in one sentence?' }],
      max_tokens: 100,
    });
    await trace.llmCall({
      response,
      inputPreview: 'What is Kubernetes in one sentence?',
      outputPreview: response.choices[0].message.content ?? '',
    });
    console.log(`   Model: ${response.model}`);
    console.log(`   Tokens: ${response.usage?.prompt_tokens} in / ${response.usage?.completion_tokens} out`);

    // 2. Tool call
    console.log('2. Recording tool call...');
    const toolSpan = trace.toolCall({
      toolName: 'web_search',
      toolInput: { query: 'kubernetes architecture' },
    });
    toolSpan.setData({ toolOutput: 'Master-worker architecture with pods and services.' });
    toolSpan.end();

    // 3. Retriever span
    console.log('3. Recording retriever call...');
    const retSpan = trace.retrieverCall({
      query: 'kubernetes best practices',
      retrieverName: 'vector-search',
    });
    retSpan.setData({ outputPreview: '5 documents retrieved' });
    retSpan.end();

    // 4. Agent action span
    console.log('4. Recording agent action...');
    const actionSpan = trace.agentAction({
      action: 'synthesize',
      thought: 'I have enough context to answer the question.',
    });
    actionSpan.end();

    console.log('\nAll spans recorded!');
  }, { sessionId: 'session-001' });

  console.log('\n=== Done — check the dashboard at http://localhost:3000 ===');
}

main().catch(console.error);
