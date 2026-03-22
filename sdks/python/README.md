# OrchestraAI Python SDK

The official Python SDK for [OrchestraAI](https://github.com/your-org/orchestra-ai) - observability & control plane for autonomous AI agents.

## Installation

```bash
pip install orchestra-ai
```

## Quick Start

```python
from orchestra_ai import OrchestraAI

# Initialize the client
oa = OrchestraAI(api_key="your-api-key")

# Basic tracing
with oa.trace("my-agent") as trace:
    # Your agent logic here
    result = trace.llm_call(
        model="gpt-4o",
        input_tokens=150,
        output_tokens=50,
        latency_ms=1200
    )
```

## Framework Integrations

### LangGraph

```python
from orchestra_ai.integrations import langgraph_tracer

# Auto-instrument your LangGraph
langgraph_tracer.auto_instrument(oa)
```

This wraps `CompiledGraph.invoke/ainvoke` to start an `agent_run` trace and attach the LangChain handler for node/tool/LLM spans.

### LangChain (Runnable / Agents)

```python
from orchestra_ai.integrations import langchain_tracer

handler = langchain_tracer.get_handler(oa, agent_name="my-agent")

# Attach to any Runnable/agent
result = runnable.invoke(input, callbacks=[handler])
# Or async: await runnable.ainvoke(input, callbacks=[handler])

# The handler emits chain/node, tool, and LLM spans with token usage and previews
```

### OpenAI Agents SDK

```python
from orchestra_ai.integrations import openai_agents_tracer

openai_agents_tracer.auto_instrument(oa)
```

### CrewAI

```python
from orchestra_ai.integrations import crewai_tracer

crewai_tracer.auto_instrument(oa)
```

## Features

- **Automatic Tracing**: Capture all LLM calls, tool invocations, and agent steps
- **Cost Tracking**: Real-time token usage and cost calculation
- **Policy Enforcement**: Budget limits, rate limiting, PII redaction
- **Kill-Switch**: Emergency stop for runaway agents
- **OTEL Compatible**: Export traces in OpenTelemetry format

## License

MIT
