"""
Google ADK Agent — traced by OrchestraAI.

Uses the OrchestraAI plugin for Google's Agent Development Kit.
Captures: LLM calls (with tokens), tool invocations, agent lifecycle.

Prerequisites:
    pip install -e sdks/python
    pip install google-adk google-genai

Run:
    export ORCHESTRA_API_KEY=oai_...
    export GOOGLE_API_KEY=...   # or GOOGLE_GENAI_USE_VERTEXAI=1
    python examples/google_adk_agent.py
"""

import asyncio
import os

from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.genai import types as genai_types

from orchestra_ai import OrchestraAI
from orchestra_ai.integrations.google_adk_tracer import OrchestraADKPlugin

# ── Setup ──────────────────────────────────────────────────────
oa = OrchestraAI(
    api_key=os.environ["ORCHESTRA_API_KEY"],
    base_url=os.getenv("ORCHESTRA_BASE_URL", "http://localhost:3001"),
)


# ── Define Tools ───────────────────────────────────────────────
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    data = {"san francisco": "Foggy, 58F", "new york": "Sunny, 72F", "london": "Rainy, 55F"}
    return data.get(city.lower(), f"No weather data for {city}")


def search_docs(query: str) -> str:
    """Search the knowledge base for documents."""
    return f"Found 3 documents about '{query}': [doc1: Overview] [doc2: Details] [doc3: Examples]"


# ── Build Agent ────────────────────────────────────────────────
agent = Agent(
    name="research-assistant",
    model="gemini-2.0-flash",
    description="A research assistant that can check weather and search docs.",
    instruction="You are a helpful research assistant. Use tools when needed. Be concise.",
    tools=[get_weather, search_docs],
)

# ── Create Runner with OrchestraAI Plugin ──────────────────────
plugin = OrchestraADKPlugin(oa, default_agent_name="google-adk-research-agent")

runner = InMemoryRunner(agent=agent)
# Note: InMemoryRunner doesn't support plugins directly — for plugin support
# use Runner(agent=agent, session_service=..., plugins=[plugin])
# For this example, we trace manually:


async def main():
    print("=== Google ADK Agent with OrchestraAI Tracing ===\n")

    # Manual tracing (works with any runner)
    with oa.trace("google-adk-research-agent", metadata={"framework": "google-adk"}) as trace:
        # Run the agent
        user_msg = genai_types.Content(
            role="user",
            parts=[genai_types.Part(text="What's the weather in San Francisco? Also search for AI safety docs.")],
        )

        print("Running agent...\n")
        async for event in runner.run_async(
            user_id="demo_user",
            session_id="demo_session",
            new_message=user_msg,
        ):
            # Capture events as spans
            author = getattr(event, "author", "unknown")
            content = getattr(event, "content", None)

            if content and hasattr(content, "parts"):
                for part in content.parts:
                    # LLM text output
                    if hasattr(part, "text") and part.text:
                        print(f"  [{author}] {part.text[:200]}")
                        if author != "user":
                            # Record as an LLM response step
                            step = trace.step(f"response:{author}")
                            step.set_data(output_preview=part.text[:500])
                            step.end()

                    # Function calls
                    if hasattr(part, "function_call") and part.function_call:
                        fc = part.function_call
                        tool_name = getattr(fc, "name", "unknown_tool")
                        tool_args = dict(getattr(fc, "args", {}))
                        print(f"  [tool call] {tool_name}({tool_args})")

                        with trace.tool_call(tool_name, tool_input=tool_args) as tool_span:
                            pass  # Tool execution happens inside ADK

                    # Function responses
                    if hasattr(part, "function_response") and part.function_response:
                        fr = part.function_response
                        tool_name = getattr(fr, "name", "unknown_tool")
                        result = getattr(fr, "response", {})
                        print(f"  [tool result] {tool_name} -> {str(result)[:100]}")

            # Capture token usage from events
            usage = getattr(event, "usage_metadata", None)
            if usage:
                input_tokens = getattr(usage, "promptTokenCount", None) or \
                               getattr(usage, "prompt_token_count", None)
                output_tokens = getattr(usage, "candidatesTokenCount", None) or \
                                getattr(usage, "candidates_token_count", None)
                if input_tokens or output_tokens:
                    trace.record_llm_call(
                        model="gemini-2.0-flash",
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    )

    print("\nCheck traces at http://localhost:3000/dashboard/traces")
    oa.close()


if __name__ == "__main__":
    asyncio.run(main())
