"""
LangChain ReAct Agent — fully traced by OrchestraAI.

Auto-captures: LLM calls (with tokens), tool invocations, agent reasoning,
retriever calls, chain start/end — all as nested spans.

Prerequisites:
    pip install -e sdks/python
    pip install langchain-openai langchain-core

Run:
    export ORCHESTRA_API_KEY=oai_...
    export OPENAI_API_KEY=sk-...
    python examples/langchain_agent.py
"""

import os
from orchestra_ai import OrchestraAI
from orchestra_ai.integrations.langchain_tracer import get_handler

from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage

# ── Setup ──────────────────────────────────────────────────────
oa = OrchestraAI(
    api_key=os.environ["ORCHESTRA_API_KEY"],
    base_url=os.getenv("ORCHESTRA_BASE_URL", "http://localhost:3001"),
)

# Create a handler — all LangChain callbacks are forwarded to OrchestraAI
handler = get_handler(oa, agent_name="langchain-research-agent", session_id="demo-session")


# ── Tools ──────────────────────────────────────────────────────
@tool
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    data = {"san francisco": "Foggy, 58F", "new york": "Sunny, 72F", "london": "Rainy, 55F"}
    return data.get(city.lower(), f"No data for {city}")


@tool
def calculator(expression: str) -> str:
    """Evaluate a math expression safely."""
    allowed = set("0123456789+-*/.(). ")
    if not all(c in allowed for c in expression):
        return "Invalid expression"
    return str(eval(expression))


# ── Run ────────────────────────────────────────────────────────
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
llm_with_tools = llm.bind_tools([get_weather, calculator])

print("=== LangChain Agent with OrchestraAI Tracing ===\n")
print("Sending query: 'What's the weather in SF? Also what is 42 * 17?'\n")

response = llm_with_tools.invoke(
    [HumanMessage(content="What's the weather in San Francisco? Also what is 42 * 17?")],
    config={"callbacks": [handler]},
)

print(f"Response: {response.content or '(tool calls pending)'}")
if response.tool_calls:
    print(f"Tool calls: {[tc['name'] for tc in response.tool_calls]}")

print("\nCheck traces at http://localhost:3000/dashboard/traces")
oa.close()
