"""
LlamaIndex RAG Pipeline — traced by OrchestraAI.

Auto-instruments LlamaIndex to capture: LLM calls (with streaming + tokens),
retriever calls (with document counts), embedding calls, and agent tool use.

Prerequisites:
    pip install -e sdks/python
    pip install llama-index llama-index-llms-openai

Run:
    export ORCHESTRA_API_KEY=oai_...
    export OPENAI_API_KEY=sk-...
    python examples/llamaindex_rag.py
"""

import os
from orchestra_ai import OrchestraAI
from orchestra_ai.integrations.llamaindex_tracer import auto_instrument

from llama_index.core import VectorStoreIndex, Document, Settings
from llama_index.llms.openai import OpenAI as LlamaOpenAI

# ── Setup ──────────────────────────────────────────────────────
oa = OrchestraAI(
    api_key=os.environ["ORCHESTRA_API_KEY"],
    base_url=os.getenv("ORCHESTRA_BASE_URL", "http://localhost:3001"),
)

# Auto-instrument LlamaIndex
auto_instrument(oa, agent_name="llamaindex-rag-agent")

# Configure LLM
Settings.llm = LlamaOpenAI(model="gpt-4o-mini", temperature=0)

# ── Build Index from Documents ─────────────────────────────────
print("=== LlamaIndex RAG with OrchestraAI Tracing ===\n")

documents = [
    Document(text="OrchestraAI is an observability and control plane for autonomous AI agents. "
             "It provides trace exploration, cost tracking, policy enforcement, and kill switches."),
    Document(text="The OrchestraAI Python SDK supports auto token extraction from OpenAI, "
             "Anthropic, and Google Gemini responses. It integrates with LangChain, LangGraph, "
             "CrewAI, and LlamaIndex."),
    Document(text="The policy engine in OrchestraAI supports budget limits, rate limiting, "
             "tool permissions, and runaway detection. When a policy fires with action 'kill', "
             "the SDK raises AgentKilledException to halt the agent immediately."),
]

print("Building index from 3 documents...")
index = VectorStoreIndex.from_documents(documents)

# ── Query (traced: embedding + retrieval + LLM) ───────────────
query_engine = index.as_query_engine()

print("Querying: 'What is the kill switch feature?'\n")
response = query_engine.query("What is the kill switch feature in OrchestraAI?")

print(f"Answer: {response}\n")

# ── Second query ───────────────────────────────────────────────
print("Querying: 'What frameworks does the SDK support?'\n")
response2 = query_engine.query("What frameworks does the OrchestraAI SDK support?")

print(f"Answer: {response2}\n")

print("Check traces at http://localhost:3000/dashboard/traces")
print("You should see: embedding spans, retriever spans, and LLM call spans")
oa.close()
