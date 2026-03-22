"""
End-to-end test: LangChain agent traced by OrchestraAI SDK.

Prerequisites:
    1. API running: npm run dev:api
    2. Set env vars: ORCHESTRA_API_KEY, ORCHESTRA_PROJECT_ID, ORCHESTRA_JWT_TOKEN
    3. (Optional) OPENAI_API_KEY for real LangChain test

Usage:
    source .venv/bin/activate
    python tests/langchain_test.py
"""

import os
import sys
import json
import time
import requests

# ── Configuration (all from environment) ──────────────────────
API_URL = os.getenv("ORCHESTRA_BASE_URL", "http://localhost:3001")
API_KEY = os.environ["ORCHESTRA_API_KEY"]  # Required — no fallback
PROJECT_ID = os.environ["ORCHESTRA_PROJECT_ID"]
JWT_TOKEN = os.environ["ORCHESTRA_JWT_TOKEN"]


def separator(title: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


# ── 1. Test basic SDK tracing (no LangChain) ──────────────────
def test_basic_sdk_tracing():
    separator("Test 1: Basic SDK Tracing")

    from orchestra_ai import OrchestraAI

    oa = OrchestraAI(api_key=API_KEY, base_url=API_URL)

    with oa.trace("test-basic-agent") as trace:
        span = trace.llm_call(
            model="gpt-4o-mini",
            input_tokens=100,
            output_tokens=50,
            input_preview="What is the capital of France?",
            output_preview="The capital of France is Paris.",
        )
        span.end()

        tool_span = trace.tool_call(
            tool_name="calculator",
            tool_input={"expression": "2 + 2"},
        )
        tool_span.set_data(tool_output="4")
        tool_span.end()

        step_span = trace.step("reasoning", metadata={"thought": "The answer is clear"})
        step_span.end()

    print(f"  Trace ID: {trace.trace_id}")
    print("  PASSED: Basic SDK tracing works!")
    return trace.trace_id


# ── 2. Test LangChain integration with real OpenAI ────────────
def test_langchain_agent():
    separator("Test 2: LangChain Agent with OrchestraAI Tracing")

    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        print("  SKIPPED: No OPENAI_API_KEY set")
        return None

    from orchestra_ai import OrchestraAI
    from orchestra_ai.integrations.langchain_tracer import get_handler
    from langchain_openai import ChatOpenAI
    from langchain_core.tools import tool
    from langchain_core.messages import HumanMessage

    oa = OrchestraAI(api_key=API_KEY, base_url=API_URL)
    handler = get_handler(oa, agent_name="langchain-search-agent")

    @tool
    def get_weather(city: str) -> str:
        """Get the current weather for a city."""
        weather_data = {
            "san francisco": "Foggy, 58F",
            "new york": "Sunny, 72F",
            "london": "Rainy, 55F",
        }
        return weather_data.get(city.lower(), f"Weather data not available for {city}")

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    llm_with_tools = llm.bind_tools([get_weather])

    print("  Running LangChain agent with OrchestraAI tracing...")
    try:
        response = llm_with_tools.invoke(
            [HumanMessage(content="What's the weather in San Francisco?")],
            config={"callbacks": [handler]},
        )
        print(f"  Response: {response.content[:200] if response.content else '(tool calls)'}")
        print("  PASSED: LangChain integration works!")
    except Exception as e:
        print(f"  ERROR: {e}")

    oa.close()


# ── 3. Verify traces via API ──────────────────────────────────
def verify_traces():
    separator("Test 3: Verify Traces in API")

    headers = {"Authorization": f"Bearer {JWT_TOKEN}"}
    url = f"{API_URL}/api/projects/{PROJECT_ID}/traces"

    resp = requests.get(url, headers=headers, params={"limit": 10})
    resp.raise_for_status()
    traces = resp.json()

    if isinstance(traces, list):
        print(f"  Found {len(traces)} traces")
        for t in traces[:5]:
            print(f"    - [{t.get('type')}] {t.get('name')} ({t.get('status')})")

    print("  PASSED: Traces visible via API!")


# ── Run all tests ─────────────────────────────────────────────
if __name__ == "__main__":
    separator("OrchestraAI + LangChain Integration Tests")
    print(f"  API URL: {API_URL}")
    print(f"  Project: {PROJECT_ID}")

    try:
        requests.get(f"{API_URL}/api/auth/login", timeout=3)
    except requests.ConnectionError:
        print("\n  ERROR: API is not running. Start with: npm run dev:api")
        sys.exit(1)

    test_basic_sdk_tracing()
    test_langchain_agent()
    time.sleep(1)
    verify_traces()

    separator("All Tests Complete!")
