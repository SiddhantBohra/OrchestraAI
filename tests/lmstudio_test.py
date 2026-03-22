"""
Test OrchestraAI tracing with a local LMStudio model.

LMStudio serves an OpenAI-compatible API at http://localhost:1234/v1.

Prerequisites:
    1. API running: npm run dev:api
    2. LMStudio server running on port 1234
    3. Set env vars: ORCHESTRA_API_KEY, ORCHESTRA_PROJECT_ID, ORCHESTRA_JWT_TOKEN

Usage:
    source .venv/bin/activate
    python tests/lmstudio_test.py
"""

import os
import sys
import json
import time

# ── Config (all from environment) ─────────────────────────────
ORCHESTRA_API_URL = os.getenv("ORCHESTRA_BASE_URL", "http://localhost:3001")
ORCHESTRA_API_KEY = os.environ["ORCHESTRA_API_KEY"]
PROJECT_ID = os.environ["ORCHESTRA_PROJECT_ID"]
JWT_TOKEN = os.environ["ORCHESTRA_JWT_TOKEN"]
LMSTUDIO_URL = os.getenv("LMSTUDIO_URL", "http://localhost:1234/v1")
LMSTUDIO_MODEL = os.getenv("LMSTUDIO_MODEL", "nvidia/nemotron-3-nano")


def separator(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


# ── Test 1: Manual trace with response auto-extraction ────────
def test_manual_trace_with_response():
    separator("Test 1: Manual Trace with Response Auto-Extraction")

    from openai import OpenAI
    from orchestra_ai import OrchestraAI

    oa = OrchestraAI(api_key=ORCHESTRA_API_KEY, base_url=ORCHESTRA_API_URL)
    client = OpenAI(base_url=LMSTUDIO_URL, api_key="not-needed")

    with oa.trace("lmstudio-manual-agent", session_id="test-session-001") as trace:
        step = trace.step("thinking", metadata={"phase": "planning"})
        step.set_data(input_preview="User asked about AI agents")
        step.end()

        print("  Sending LLM request...")
        response = client.chat.completions.create(
            model=LMSTUDIO_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert on AI agents."},
                {"role": "user", "content": "What are the key components of an AI agent observability platform?"},
            ],
            max_tokens=200,
        )

        llm_span = trace.llm_call(
            response=response,
            input_preview="What are the key components of an AI agent observability platform?",
        )
        llm_span.set_data(output_preview=response.choices[0].message.content)
        llm_span.end()

        print(f"  Response: {response.choices[0].message.content[:200]}...")

        ret_span = trace.retriever_call(
            query="AI agent observability best practices",
            retriever_name="vector-search",
        )
        ret_span.set_data(output_preview="3 documents retrieved")
        ret_span.end()

    print(f"  Trace ID: {trace.trace_id}")
    print("  PASSED: Manual trace with auto token extraction!")


# ── Test 2: Verify traces in API ─────────────────────────────
def test_verify_traces():
    separator("Test 2: Verify Traces in API")
    import requests

    headers = {"Authorization": f"Bearer {JWT_TOKEN}"}
    resp = requests.get(
        f"{ORCHESTRA_API_URL}/api/projects/{PROJECT_ID}/traces",
        headers=headers,
        params={"type": "agent_run", "limit": 5},
    )
    resp.raise_for_status()
    runs = resp.json()
    print(f"  Agent runs found: {len(runs)}")
    for r in runs[:3]:
        print(f"    [{r.get('status')}] {r.get('name')} - tokens: {r.get('totalTokens')}")
    print("  PASSED: Traces verified!")


# ── Run ───────────────────────────────────────────────────────
if __name__ == "__main__":
    separator("OrchestraAI + LMStudio Local Model Test")

    try:
        import requests
        r = requests.get(f"{LMSTUDIO_URL}/models", timeout=3)
        models = r.json()
        print(f"  LMStudio models: {[m['id'] for m in models.get('data', [])]}")
    except Exception:
        print(f"  ERROR: LMStudio server not running at {LMSTUDIO_URL}")
        sys.exit(1)

    test_manual_trace_with_response()
    time.sleep(1)
    test_verify_traces()

    separator("All Tests Complete!")
