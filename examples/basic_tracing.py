"""
Basic Tracing Example — OrchestraAI Python SDK

Shows: auto token extraction, tool calls, retriever spans, sessions.

Prerequisites:
    1. API running: npm run dev:api
    2. Set env: ORCHESTRA_API_KEY

Run:
    source .venv/bin/activate
    python examples/basic_tracing.py
"""

import os
from openai import OpenAI
from orchestra_ai import OrchestraAI

API_URL = os.getenv("ORCHESTRA_BASE_URL", "http://localhost:3001")

oa = OrchestraAI(
    api_key=os.environ["ORCHESTRA_API_KEY"],
    base_url=API_URL,
)

openai = OpenAI(
    base_url=os.getenv("OPENAI_BASE_URL", "http://localhost:1234/v1"),
    api_key=os.getenv("OPENAI_API_KEY", "not-needed"),
)

print("=== OrchestraAI Python SDK — Basic Tracing ===\n")

with oa.trace("research-agent", session_id="session-001") as trace:
    # 1. LLM call — tokens auto-extracted from response
    print("1. Making LLM call...")
    response = openai.chat.completions.create(
        model=os.getenv("LLM_MODEL", "gpt-4o"),
        messages=[{"role": "user", "content": "What is Kubernetes in one sentence?"}],
        max_tokens=100,
    )
    trace.record_llm_call(
        response=response,
        input_preview="What is Kubernetes in one sentence?",
        output_preview=response.choices[0].message.content,
    )
    print(f"   Model: {response.model}")
    print(f"   Tokens: {response.usage.prompt_tokens} in / {response.usage.completion_tokens} out")

    # 2. Tool call
    print("2. Recording tool call...")
    with trace.tool_call("web_search", tool_input={"query": "kubernetes architecture"}) as tool_span:
        tool_span.set_data(tool_output="Master-worker architecture with pods and services.")

    # 3. Retriever span
    print("3. Recording retriever call...")
    with trace.retriever_call("kubernetes best practices", retriever_name="vector-search") as ret_span:
        ret_span.set_data(output_preview="5 documents retrieved")

    # 4. Agent action span
    print("4. Recording agent action...")
    with trace.agent_action("synthesize", thought="I have enough context to answer.") as action_span:
        pass

    print("\nAll spans recorded!")

print("\n=== Done — check the dashboard at http://localhost:3000 ===")
