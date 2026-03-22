# OrchestraAI TypeScript SDK

The official TypeScript/JavaScript SDK for [OrchestraAI](https://github.com/your-org/orchestra-ai) - observability & control plane for autonomous AI agents.

## Installation

```bash
npm install @orchestra-ai/sdk
# or
yarn add @orchestra-ai/sdk
# or
pnpm add @orchestra-ai/sdk
```

## Quick Start

```typescript
import { OrchestraAI } from '@orchestra-ai/sdk';

// Initialize the client
const oa = new OrchestraAI({ apiKey: 'your-api-key' });

// Basic tracing
const trace = oa.startTrace('my-agent');

try {
  // Your agent logic here
  await trace.llmCall({
    model: 'gpt-4o',
    inputTokens: 150,
    outputTokens: 50,
    latencyMs: 1200,
  });

  trace.end();
} catch (error) {
  trace.error(error);
}
```

## Framework Integrations

### LangGraph.js

```typescript
import { langGraphTracer } from '@orchestra-ai/sdk/integrations';

langGraphTracer.autoInstrument(oa);
```

This patches `CompiledGraph.invoke/ainvoke` to start an `agent_run` trace and automatically attach the LangChain handler for node/tool/LLM spans.

### LangChain (Runnable / Agents)

```typescript
import { createLangChainHandler } from '@orchestra-ai/sdk/integrations/langchain';

const handler = createLangChainHandler({ client: oa, agentName: 'my-agent' });

// For any Runnable/agent
const result = await runnable.invoke(input, { callbacks: [handler] });

// The handler emits chain/node, tool, and LLM spans with token usage and previews
```

### Vercel AI SDK

```typescript
import { vercelAITracer } from '@orchestra-ai/sdk/integrations';

vercelAITracer.autoInstrument(oa);
```

## Features

- **Automatic Tracing**: Capture all LLM calls, tool invocations, and agent steps
- **Cost Tracking**: Real-time token usage and cost calculation
- **Policy Enforcement**: Budget limits, rate limiting, PII redaction
- **Kill-Switch**: Emergency stop for runaway agents
- **TypeScript First**: Full type safety and IntelliSense support

## License

MIT
