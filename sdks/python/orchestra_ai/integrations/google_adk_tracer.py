"""Google ADK (Agent Development Kit) integration for OrchestraAI.

Implements a ``BasePlugin`` that captures all LLM calls, tool invocations,
and agent lifecycle events across every agent managed by the Runner.

Usage::

    from google.adk.agents import Agent
    from google.adk.runners import Runner
    from orchestra_ai import OrchestraAI
    from orchestra_ai.integrations.google_adk_tracer import OrchestraADKPlugin

    oa = OrchestraAI(api_key="...")

    agent = Agent(name="my-agent", model="gemini-2.0-flash", ...)
    plugin = OrchestraADKPlugin(oa)
    runner = Runner(agent=agent, app_name="my_app", session_service=..., plugins=[plugin])

    # All agent runs are now traced to OrchestraAI
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Dict, Optional

from ..token_extraction import extract_token_usage
from ..types import TraceType

if TYPE_CHECKING:
    from ..client import OrchestraAI
    from ..tracer import Trace, Span


class OrchestraADKPlugin:
    """Google ADK Plugin that sends traces to OrchestraAI.

    Attach to a Runner via ``plugins=[OrchestraADKPlugin(oa)]``.

    Captures:
    - Agent start/end (as agent_run traces)
    - LLM calls (with model, tokens, input/output preview)
    - Tool calls (with args and results)
    - Errors
    """

    def __init__(
        self,
        client: "OrchestraAI",
        default_agent_name: str = "google-adk-agent",
    ) -> None:
        self._client = client
        self._default_agent_name = default_agent_name
        self._traces: Dict[str, "Trace"] = {}  # keyed by invocation_id
        self._spans: Dict[str, "Span"] = {}  # keyed by span_key
        self._llm_start_times: Dict[str, float] = {}

    @property
    def name(self) -> str:
        return "orchestra-ai-plugin"

    # ── Agent Lifecycle ────────────────────────────────────────

    async def before_agent_callback(
        self, *, agent: Any, callback_context: Any, **kwargs: Any
    ) -> None:
        """Start a new OrchestraAI trace when an agent begins."""
        invocation_id = getattr(callback_context, "invocation_id", None) or "unknown"
        agent_name = getattr(agent, "name", None) or self._default_agent_name

        trace = self._client.trace(
            agent_name=agent_name,
            session_id=invocation_id,
            metadata={
                "framework": "google-adk",
                "invocation_id": invocation_id,
                "agent_description": getattr(agent, "description", None),
            },
        )
        trace.__enter__()
        self._traces[invocation_id] = trace
        return None

    async def after_agent_callback(
        self, *, agent: Any, callback_context: Any, **kwargs: Any
    ) -> None:
        """End the OrchestraAI trace when the agent finishes."""
        invocation_id = getattr(callback_context, "invocation_id", None) or "unknown"
        trace = self._traces.pop(invocation_id, None)
        if trace:
            trace.__exit__(None, None, None)
        return None

    # ── LLM Calls ──────────────────────────────────────────────

    async def before_model_callback(
        self, *, callback_context: Any, llm_request: Any, **kwargs: Any
    ) -> None:
        """Capture the start of an LLM call."""
        invocation_id = getattr(callback_context, "invocation_id", None) or "unknown"
        trace = self._traces.get(invocation_id)
        if not trace:
            return None

        # Extract model name from request config
        model = None
        config = getattr(llm_request, "config", None)
        if config:
            model = getattr(config, "model", None)

        # Extract input preview from contents
        input_preview = None
        contents = getattr(llm_request, "contents", None)
        if contents and len(contents) > 0:
            last = contents[-1]
            parts = getattr(last, "parts", None)
            if parts:
                text_parts = [getattr(p, "text", "") for p in parts if hasattr(p, "text")]
                if text_parts:
                    input_preview = " ".join(text_parts)[:500]

        span_key = f"llm_{invocation_id}_{id(llm_request)}"
        span = trace.llm_call(
            model=model or "gemini",
            input_preview=input_preview,
            metadata={"framework": "google-adk"},
        )
        self._spans[span_key] = span
        self._llm_start_times[span_key] = time.time()

        # Store the key on the request for retrieval in after_model
        if not hasattr(callback_context, "_orchestra_span_key"):
            callback_context._orchestra_span_key = span_key

        return None

    async def after_model_callback(
        self, *, callback_context: Any, llm_response: Any, **kwargs: Any
    ) -> None:
        """Capture the end of an LLM call with token usage."""
        span_key = getattr(callback_context, "_orchestra_span_key", None)
        if not span_key:
            # Fallback: find the most recent span
            invocation_id = getattr(callback_context, "invocation_id", None) or "unknown"
            for key in reversed(list(self._spans.keys())):
                if key.startswith(f"llm_{invocation_id}"):
                    span_key = key
                    break

        span = self._spans.pop(span_key, None) if span_key else None
        if not span:
            return None

        # Extract token usage
        usage_metadata = getattr(llm_response, "usage_metadata", None)
        input_tokens = None
        output_tokens = None
        if usage_metadata:
            input_tokens = getattr(usage_metadata, "promptTokenCount", None) or \
                           getattr(usage_metadata, "prompt_token_count", None)
            output_tokens = getattr(usage_metadata, "candidatesTokenCount", None) or \
                            getattr(usage_metadata, "candidates_token_count", None)

        # Extract output preview
        output_preview = None
        content = getattr(llm_response, "content", None)
        if content:
            parts = getattr(content, "parts", None)
            if parts:
                text_parts = [getattr(p, "text", "") for p in parts if hasattr(p, "text")]
                if text_parts:
                    output_preview = " ".join(text_parts)[:500]

        # Calculate latency
        start_time = self._llm_start_times.pop(span_key, None)
        latency_ms = int((time.time() - start_time) * 1000) if start_time else None

        span.set_data(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            output_preview=output_preview,
            latency_ms=latency_ms,
        )
        span.end()
        return None

    # ── Tool Calls ─────────────────────────────────────────────

    async def before_tool_callback(
        self, *, tool_context: Any, tool_args: dict, **kwargs: Any
    ) -> None:
        """Capture the start of a tool call."""
        invocation_id = getattr(tool_context, "invocation_id", None) or "unknown"
        trace = self._traces.get(invocation_id)
        if not trace:
            return None

        function_call_id = getattr(tool_context, "function_call_id", None) or "tool"
        # Try to get tool name from the context
        tool_name = function_call_id

        span_key = f"tool_{invocation_id}_{function_call_id}"
        span = trace.tool_call(
            tool_name=tool_name,
            tool_input=tool_args if tool_args else None,
            metadata={"framework": "google-adk", "function_call_id": function_call_id},
        )
        self._spans[span_key] = span

        if not hasattr(tool_context, "_orchestra_tool_span_key"):
            tool_context._orchestra_tool_span_key = span_key

        return None

    async def after_tool_callback(
        self, *, tool_context: Any, tool_result: dict, **kwargs: Any
    ) -> None:
        """Capture the end of a tool call with results."""
        span_key = getattr(tool_context, "_orchestra_tool_span_key", None)
        span = self._spans.pop(span_key, None) if span_key else None
        if not span:
            return None

        result_str = str(tool_result)[:500] if tool_result else None
        span.set_data(tool_output=result_str)
        span.end()
        return None

    # ── Error Handling ─────────────────────────────────────────

    async def on_model_error_callback(
        self, *, callback_context: Any, error: Any, **kwargs: Any
    ) -> None:
        """Capture LLM errors."""
        span_key = getattr(callback_context, "_orchestra_span_key", None)
        span = self._spans.pop(span_key, None) if span_key else None
        if span:
            err = error if isinstance(error, Exception) else Exception(str(error))
            span.set_error(err)
            span.end()
        return None

    async def on_tool_error_callback(
        self, *, tool_context: Any, error: Any, **kwargs: Any
    ) -> None:
        """Capture tool errors."""
        span_key = getattr(tool_context, "_orchestra_tool_span_key", None)
        span = self._spans.pop(span_key, None) if span_key else None
        if span:
            err = error if isinstance(error, Exception) else Exception(str(error))
            span.set_error(err)
            span.end()
        return None


def create_plugin(
    client: "OrchestraAI",
    agent_name: str = "google-adk-agent",
) -> OrchestraADKPlugin:
    """Create an OrchestraAI plugin for Google ADK Runner.

    Args:
        client: OrchestraAI client instance.
        agent_name: Default agent name for traces.

    Returns:
        Plugin instance to pass to ``Runner(plugins=[...])``
    """
    return OrchestraADKPlugin(client, default_agent_name=agent_name)


__all__ = ["OrchestraADKPlugin", "create_plugin"]
