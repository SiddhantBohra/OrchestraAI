"""
OpenAI Agents SDK — traced by OrchestraAI.

Auto-instruments the OpenAI Python SDK to capture every chat completion call
with token usage, model name, latency, and I/O previews — zero code changes
to your agent logic.

Prerequisites:
    pip install -e sdks/python
    pip install openai

Run:
    export ORCHESTRA_API_KEY=oai_...
    export OPENAI_API_KEY=sk-...
    python examples/openai_agents.py
"""

import os
from openai import OpenAI
from orchestra_ai import OrchestraAI
from orchestra_ai.integrations import openai_agents_tracer

# ── Setup ──────────────────────────────────────────────────────
oa = OrchestraAI(
    api_key=os.environ["ORCHESTRA_API_KEY"],
    base_url=os.getenv("ORCHESTRA_BASE_URL", "http://localhost:3001"),
)

# Auto-instrument OpenAI SDK — patches Completions.create globally
openai_agents_tracer.auto_instrument(oa)

client = OpenAI()  # Uses OPENAI_API_KEY from env

# ── Run agent logic (every LLM call is auto-traced) ───────────
print("=== OpenAI SDK with OrchestraAI Auto-Instrumentation ===\n")

# Call 1: Planning
print("1. Planning step...")
plan = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "You are a research assistant. Plan your approach."},
        {"role": "user", "content": "I need a summary of recent advances in AI agent safety."},
    ],
    max_tokens=200,
)
print(f"   Plan: {plan.choices[0].message.content[:150]}...")

# Call 2: Research
print("\n2. Research step...")
research = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "You are a research analyst. Be thorough but concise."},
        {"role": "user", "content": "What are the key approaches to AI agent safety in 2024-2025?"},
    ],
    max_tokens=400,
)
print(f"   Research: {research.choices[0].message.content[:150]}...")

# Call 3: Synthesis
print("\n3. Synthesis step...")
summary = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "Synthesize the following into a 3-sentence summary."},
        {"role": "user", "content": research.choices[0].message.content or ""},
    ],
    max_tokens=150,
)
print(f"   Summary: {summary.choices[0].message.content}")

# Show total usage
total_in = sum(r.usage.prompt_tokens for r in [plan, research, summary] if r.usage)
total_out = sum(r.usage.completion_tokens for r in [plan, research, summary] if r.usage)
print(f"\nTotal tokens: {total_in} in / {total_out} out")

print("\nAll 3 LLM calls were auto-traced to OrchestraAI!")
print("Check traces at http://localhost:3000/dashboard/traces")

# Clean up
openai_agents_tracer.remove_instrumentation()
oa.close()
