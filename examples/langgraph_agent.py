"""
LangGraph ReAct Agent — auto-instrumented by OrchestraAI.

Uses `auto_instrument()` to patch LangGraph — no manual callback wiring needed.
All graph invocations (invoke, stream, ainvoke, astream) are traced automatically.

Prerequisites:
    pip install -e sdks/python
    pip install langchain-openai langgraph

Run:
    export ORCHESTRA_API_KEY=oai_...
    export OPENAI_API_KEY=sk-...
    python examples/langgraph_agent.py
"""

import os
from orchestra_ai import OrchestraAI
from orchestra_ai.integrations import langgraph_tracer

from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

# ── Setup ──────────────────────────────────────────────────────
oa = OrchestraAI(
    api_key=os.environ["ORCHESTRA_API_KEY"],
    base_url=os.getenv("ORCHESTRA_BASE_URL", "http://localhost:3001"),
)

# One line — patches all LangGraph graph methods globally
langgraph_tracer.auto_instrument(oa)


# ── Tools ──────────────────────────────────────────────────────
@tool
def search_docs(query: str) -> str:
    """Search the knowledge base for relevant documents."""
    return f"Found 3 documents about '{query}': [doc1: Overview...] [doc2: Details...] [doc3: Examples...]"


@tool
def get_stock_price(symbol: str) -> str:
    """Get the current stock price for a ticker symbol."""
    prices = {"AAPL": "$178.50", "GOOGL": "$141.20", "MSFT": "$415.30"}
    return prices.get(symbol.upper(), f"No data for {symbol}")


# ── Build Graph ────────────────────────────────────────────────
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
agent = create_react_agent(llm, tools=[search_docs, get_stock_price])

# ── Run (automatically traced!) ────────────────────────────────
print("=== LangGraph Agent with OrchestraAI Auto-Instrumentation ===\n")

# invoke() is auto-traced
result = agent.invoke({
    "messages": [{"role": "user", "content": "Search for information about AI agents, then check the stock price of AAPL"}]
})

# Print the final message
for msg in result["messages"]:
    role = getattr(msg, "type", "unknown")
    content = getattr(msg, "content", str(msg))
    if content:
        print(f"  [{role}] {content[:200]}")

# stream() is also auto-traced
print("\n--- Streaming mode ---\n")
for chunk in agent.stream({
    "messages": [{"role": "user", "content": "What's the stock price of GOOGL?"}]
}):
    for key, value in chunk.items():
        print(f"  [{key}] {str(value)[:100]}")

print("\nCheck traces at http://localhost:3000/dashboard/traces")

# Clean up
langgraph_tracer.remove_instrumentation()
oa.close()
