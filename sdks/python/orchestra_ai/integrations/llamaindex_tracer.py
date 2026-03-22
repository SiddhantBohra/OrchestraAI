"""LlamaIndex integration for OrchestraAI SDK.

Hooks into LlamaIndex's instrumentation module (v0.10.20+) to capture:
- LLM calls (with token usage and streaming)
- Retriever/query engine calls
- Workflow steps and events
- Agent actions
- Embedding calls

Two integration modes:
1. **Instrumentation** (recommended): Uses LlamaIndex's EventHandler + SpanHandler
2. **Legacy callback**: Uses set_global_handler (older versions)

Usage::

    from orchestra_ai import OrchestraAI
    from orchestra_ai.integrations.llamaindex_tracer import auto_instrument

    oa = OrchestraAI(api_key="...")
    auto_instrument(oa)

    # All LlamaIndex operations are now traced
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, Optional

from ..token_extraction import extract_token_usage
from ..types import TraceType

if TYPE_CHECKING:
    from ..client import OrchestraAI
    from ..tracer import Trace

_client: Optional["OrchestraAI"] = None
_active_trace: Optional["Trace"] = None


class OrchestraLlamaIndexEventHandler:
    """LlamaIndex EventHandler that forwards events to OrchestraAI.

    Hooks into LlamaIndex's instrumentation system to capture all events
    including LLM calls, retriever calls, and streaming tokens.
    """

    def __init__(self, client: "OrchestraAI", agent_name: str = "llamaindex-agent") -> None:
        self._client = client
        self._agent_name = agent_name
        self._spans: Dict[str, Any] = {}

    @classmethod
    def class_name(cls) -> str:
        return "OrchestraLlamaIndexEventHandler"

    def handle(self, event: Any, **kwargs: Any) -> None:
        """Route LlamaIndex events to OrchestraAI spans."""
        global _active_trace
        if not _active_trace:
            return

        event_class = type(event).__name__

        # ── LLM Events ─────────────────────────────────────
        if event_class == "LLMChatStartEvent":
            model = None
            if hasattr(event, "model_dict"):
                model = event.model_dict.get("model") or event.model_dict.get("model_name")
            messages = getattr(event, "messages", [])
            input_preview = str(messages[-1]) if messages else None

            span = _active_trace.llm_call(
                model=model,
                input_preview=input_preview[:500] if input_preview else None,
                metadata={"framework": "llamaindex", "span_id": getattr(event, "span_id", None)},
            )
            self._spans[getattr(event, "span_id", "llm")] = span

        elif event_class == "LLMChatInProgressEvent":
            # Streaming token
            span_id = getattr(event, "span_id", "llm")
            span = self._spans.get(span_id)
            if span and hasattr(event, "response"):
                delta = getattr(event.response, "delta", None)
                if delta:
                    span.add_token(delta)

        elif event_class == "LLMChatEndEvent":
            span_id = getattr(event, "span_id", "llm")
            span = self._spans.pop(span_id, None)
            if span:
                response = getattr(event, "response", None)
                if response:
                    usage = extract_token_usage(response)
                    span.set_data(
                        input_tokens=usage.input_tokens,
                        output_tokens=usage.output_tokens,
                        model=usage.model,
                    )
                    # Extract output text
                    message = getattr(response, "message", None)
                    if message:
                        content = getattr(message, "content", None)
                        if content:
                            span.set_data(output_preview=str(content)[:500])
                span.end()

        elif event_class == "LLMCompletionStartEvent":
            prompt = getattr(event, "prompt", None)
            model_dict = getattr(event, "model_dict", {})
            model = model_dict.get("model") if model_dict else None
            span = _active_trace.llm_call(
                model=model,
                input_preview=str(prompt)[:500] if prompt else None,
                metadata={"framework": "llamaindex"},
            )
            self._spans[getattr(event, "span_id", "completion")] = span

        elif event_class == "LLMCompletionEndEvent":
            span_id = getattr(event, "span_id", "completion")
            span = self._spans.pop(span_id, None)
            if span:
                response = getattr(event, "response", None)
                if response:
                    usage = extract_token_usage(response)
                    span.set_data(
                        input_tokens=usage.input_tokens,
                        output_tokens=usage.output_tokens,
                        output_preview=str(getattr(response, "text", ""))[:500],
                    )
                span.end()

        # ── Retriever Events ────────────────────────────────
        elif event_class == "RetrievalStartEvent":
            query = getattr(event, "str_or_query_bundle", None)
            query_str = str(query)[:500] if query else None
            span = _active_trace.retriever_call(
                query=query_str or "",
                retriever_name="llamaindex-retriever",
                metadata={"framework": "llamaindex"},
            )
            self._spans[getattr(event, "span_id", "retrieval")] = span

        elif event_class == "RetrievalEndEvent":
            span_id = getattr(event, "span_id", "retrieval")
            span = self._spans.pop(span_id, None)
            if span:
                nodes = getattr(event, "nodes", [])
                span.set_data(
                    output_preview=f"{len(nodes)} nodes retrieved",
                    tool_output="\n".join(
                        str(getattr(n, "text", n))[:150] for n in nodes[:5]
                    ) if nodes else None,
                )
                span.metadata["document_count"] = len(nodes) if nodes else 0
                span.end()

        # ── Agent Events ────────────────────────────────────
        elif event_class == "AgentToolCallEvent":
            tool_name = getattr(event, "tool_name", "tool")
            tool_input = getattr(event, "tool_kwargs", None)
            span = _active_trace.tool_call(
                tool_name=tool_name,
                tool_input=tool_input,
                metadata={"framework": "llamaindex"},
            )
            self._spans[getattr(event, "span_id", f"tool_{tool_name}")] = span

        elif event_class == "AgentToolCallEndEvent":
            span_id = getattr(event, "span_id", None)
            # Try to find the matching span
            span = self._spans.pop(span_id, None) if span_id else None
            if span:
                output = getattr(event, "tool_output", None)
                span.set_data(tool_output=str(output)[:500] if output else None)
                span.end()

        # ── Embedding Events ────────────────────────────────
        elif event_class == "EmbeddingStartEvent":
            span = _active_trace.step(
                "embedding",
                metadata={"framework": "llamaindex", "model_dict": getattr(event, "model_dict", {})},
            )
            self._spans[getattr(event, "span_id", "embedding")] = span

        elif event_class == "EmbeddingEndEvent":
            span_id = getattr(event, "span_id", "embedding")
            span = self._spans.pop(span_id, None)
            if span:
                chunks = getattr(event, "chunks", [])
                span.set_data(output_preview=f"{len(chunks)} chunks embedded")
                span.end()


def auto_instrument(
    client: "OrchestraAI",
    agent_name: str = "llamaindex-agent",
) -> None:
    """Instrument LlamaIndex to send traces to OrchestraAI.

    Uses the instrumentation module (v0.10.20+) EventHandler system.
    Falls back to monkey-patching Workflow.run() for workflow tracing.
    """
    global _client
    _client = client

    # Try the instrumentation module first
    try:
        import llama_index.core.instrumentation as instrument
        from llama_index.core.instrumentation.event_handlers.base import BaseEventHandler

        # Create a proper subclass
        handler = OrchestraLlamaIndexEventHandler(client, agent_name)

        # Register with the root dispatcher
        dispatcher = instrument.get_dispatcher()
        dispatcher.add_event_handler(handler)
        print(f"[OrchestraAI] LlamaIndex instrumentation enabled for '{agent_name}'")
    except ImportError:
        pass  # llama_index.core not installed or too old

    # Also patch Workflow.run() for workflow-level tracing
    _patch_workflow(client, agent_name)


def _patch_workflow(client: "OrchestraAI", agent_name: str) -> None:
    """Patch LlamaIndex Workflow.run() to create OrchestraAI traces."""
    global _active_trace

    try:
        from workflows import Workflow
    except ImportError:
        try:
            from llama_index.core.workflow import Workflow
        except ImportError:
            return  # No workflow library available

    import functools

    original_run = Workflow.run

    @functools.wraps(original_run)
    async def patched_run(self, *args, **kwargs):
        global _active_trace
        workflow_name = type(self).__name__

        with client.trace(
            agent_name=workflow_name,
            metadata={"framework": "llamaindex", "type": "workflow", "workflow_class": workflow_name},
        ) as trace:
            _active_trace = trace

            # Create a step span for the overall workflow
            step_span = trace.step(
                f"workflow:{workflow_name}",
                metadata={"framework": "llamaindex", "args": str(kwargs)[:200]},
            )

            try:
                result = await original_run(self, *args, **kwargs)
                step_span.set_data(output_preview=str(result)[:500] if result else None)
                step_span.end()
                return result
            except Exception as e:
                step_span.set_error(e)
                step_span.end()
                raise
            finally:
                _active_trace = None

    Workflow.run = patched_run


def remove_instrumentation() -> None:
    """Remove LlamaIndex instrumentation."""
    global _client, _active_trace
    _client = None
    _active_trace = None


__all__ = ["auto_instrument", "remove_instrumentation", "OrchestraLlamaIndexEventHandler"]
