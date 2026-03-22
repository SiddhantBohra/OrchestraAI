/**
 * LangChain Agent — traced by OrchestraAI (TypeScript).
 *
 * Auto-captures: LLM calls, tool invocations, chain start/end, retrievers.
 *
 * Prerequisites:
 *   npm link ./sdks/typescript
 *   npm install @langchain/openai @langchain/core
 *
 * Run:
 *   export ORCHESTRA_API_KEY=oai_...
 *   export OPENAI_API_KEY=sk-...
 *   npx tsx examples/langchain_agent.ts
 */

import { OrchestraAI } from '../sdks/typescript/src';
import { createLangChainHandler } from '../sdks/typescript/src/integrations/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const oa = new OrchestraAI({
  apiKey: process.env.ORCHESTRA_API_KEY!,
  baseUrl: process.env.ORCHESTRA_BASE_URL || 'http://localhost:3001',
});

// Create OrchestraAI callback handler
const handler = createLangChainHandler({
  client: oa,
  agentName: 'langchain-ts-agent',
  metadata: { example: 'langchain_agent.ts' },
});

// Define tools
const getWeather = tool(
  async ({ city }: { city: string }) => {
    const data: Record<string, string> = {
      'san francisco': 'Foggy, 58F',
      'new york': 'Sunny, 72F',
    };
    return data[city.toLowerCase()] || `No data for ${city}`;
  },
  {
    name: 'get_weather',
    description: 'Get the current weather for a city',
    schema: z.object({ city: z.string() }),
  }
);

async function main() {
  console.log('=== LangChain Agent with OrchestraAI Tracing (TypeScript) ===\n');

  const llm = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0 });
  const llmWithTools = llm.bindTools([getWeather]);

  const response = await llmWithTools.invoke(
    [new HumanMessage("What's the weather in San Francisco?")],
    { callbacks: [handler] },
  );

  console.log(`Response: ${response.content || '(tool calls pending)'}`);
  console.log('\nCheck traces at http://localhost:3000/dashboard/traces');
}

main().catch(console.error);
