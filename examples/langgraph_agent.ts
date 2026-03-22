/**
 * LangGraph Agent — traced by OrchestraAI (TypeScript).
 *
 * Uses the LangChain callback handler injected into LangGraph's config.
 *
 * Prerequisites:
 *   npm link ./sdks/typescript
 *   npm install @langchain/openai @langchain/langgraph
 *
 * Run:
 *   export ORCHESTRA_API_KEY=oai_...
 *   export OPENAI_API_KEY=sk-...
 *   npx tsx examples/langgraph_agent.ts
 */

import { OrchestraAI } from '../sdks/typescript/src';
import { createLangChainHandler } from '../sdks/typescript/src/integrations/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const oa = new OrchestraAI({
  apiKey: process.env.ORCHESTRA_API_KEY!,
  baseUrl: process.env.ORCHESTRA_BASE_URL || 'http://localhost:3001',
});

const handler = createLangChainHandler({
  client: oa,
  agentName: 'langgraph-ts-agent',
});

// Define tools
const searchDocs = tool(
  async ({ query }: { query: string }) => {
    return `Found 3 documents about '${query}': [doc1, doc2, doc3]`;
  },
  {
    name: 'search_docs',
    description: 'Search the knowledge base',
    schema: z.object({ query: z.string() }),
  }
);

const getStockPrice = tool(
  async ({ symbol }: { symbol: string }) => {
    const prices: Record<string, string> = { AAPL: '$178.50', GOOGL: '$141.20' };
    return prices[symbol.toUpperCase()] || `No data for ${symbol}`;
  },
  {
    name: 'get_stock_price',
    description: 'Get stock price for a ticker',
    schema: z.object({ symbol: z.string() }),
  }
);

async function main() {
  console.log('=== LangGraph Agent with OrchestraAI Tracing (TypeScript) ===\n');

  const llm = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0 });
  const agent = createReactAgent({ llm, tools: [searchDocs, getStockPrice] });

  // Pass callbacks via config — OrchestraAI captures all spans
  const result = await agent.invoke(
    { messages: [{ role: 'user', content: 'Search for AI agents info, then check AAPL stock price' }] },
    { callbacks: [handler] },
  );

  for (const msg of result.messages) {
    const content = msg.content;
    if (content) console.log(`  [${msg._getType()}] ${String(content).slice(0, 200)}`);
  }

  console.log('\nCheck traces at http://localhost:3000/dashboard/traces');
}

main().catch(console.error);
