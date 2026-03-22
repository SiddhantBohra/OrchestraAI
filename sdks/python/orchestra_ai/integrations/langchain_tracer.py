"""LangChain integration for OrchestraAI SDK.

Captures: chain runs, LLM calls (with streaming), tool calls, retriever
calls, agent actions/reasoning, and errors — all as nested trace spans.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional, Union

from ..token_extraction import extract_token_usage
from ..types import TraceType

if TYPE_CHECKING:
    from ..client import OrchestraAI
    from ..tracer import Trace, Span


class OrchestraLangChainHandler:
    """LangChain callback handler that forwards events to OrchestraAI.

    Supports LangChain's full callback interface including:
    - Chain start/end/error
    - LLM start/end/error + streaming via on_llm_new_token
    - Tool start/end/error
    - Retriever start/end (vector search, RAG)
    - Agent action/finish (reasoning + decisions)
    """

    def __init__(
        self,
        client: "OrchestraAI",
        agent_name: Optional[str] = None,
        session_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self._client = client
        self._agent_name = agent_name
        self._session_id = session_id
        self._metadata = metadata or {}
        self._traces: Dict[str, "Trace"] = {}
        self._spans: Dict[str, "Span"] = {}

    # ─── Helpers ──────────────────────────────────────────────

    def _get_trace(self, run_id: str, parent_run_id: Optional[str]) -> Optional["Trace"]:
        if parent_run_id and parent_run_id in self._traces:
            return self._traces[parent_run_id]
        return self._traces.get(run_id)

    # ─── Chain ────────────────────────────────────────────────

    def on_chain_start(self, serialized: Any, inputs: Any, run_id: str, parent_run_id: Optional[str] = None, **kwargs: Any) -> None:
        try:
            from ..tracer import Trace
        except Exception:
            return

        name = self._agent_name or _get_name(serialized) or "langchain-agent"

        trace_meta = {**self._metadata, "framework": "langchain"}
        if self._session_id:
            trace_meta["session_id"] = self._session_id

        trace = Trace(
            client=self._client,
            agent_name=name,
            metadata=trace_meta,
        )
        trace.__enter__()
        self._traces[run_id] = trace

        span = trace.step(name, metadata={"framework": "langchain", "run_id": run_id, "inputs": _preview(inputs, 300)})
        self._spans[run_id] = span

    def on_chain_end(self, outputs: Any, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        trace = self._traces.pop(run_id, None)
        if span:
            span.set_data(output_preview=_preview(outputs))
            span.end()
        if trace:
            trace.__exit__(None, None, None)

    def on_chain_error(self, error: Exception, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        trace = self._traces.pop(run_id, None)
        if span:
            span.set_error(error)
            span.end()
        if trace:
            trace.__exit__(type(error), error, None)

    # ─── LLM ─────────────────────────────────────────────────

    def on_llm_start(self, serialized: Any, prompts: list[str], run_id: str, parent_run_id: Optional[str] = None, **kwargs: Any) -> None:
        trace = self._get_trace(run_id, parent_run_id)
        if not trace:
            return

        model = (
            _get_name(serialized, "model_name", "model")
            or _deep_get(serialized, "kwargs", "model_name")
            or _deep_get(serialized, "kwargs", "model")
            or kwargs.get("invocation_params", {}).get("model_name")
            or kwargs.get("invocation_params", {}).get("model")
        )
        span = trace.llm_call(
            model=model or "llm",
            input_preview=_preview(prompts[0] if prompts else None),
            metadata={"framework": "langchain", "run_id": run_id, "parent_run_id": parent_run_id},
        )
        self._spans[run_id] = span

    def on_llm_new_token(self, token: str, run_id: str, **kwargs: Any) -> None:
        """Capture streaming tokens as they arrive."""
        span = self._spans.get(run_id)
        if span:
            span.add_token(token)

    def on_llm_end(self, output: Any, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        if not span:
            return

        usage = extract_token_usage(output)

        # Extract generated text for preview (non-streaming path)
        text = _extract_generation_text(output)

        span.set_data(
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            model=usage.model,
            output_preview=_preview(text),  # streaming tokens handled in Span.end()
        )
        span.end()

    def on_llm_error(self, error: Exception, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        if not span:
            return
        span.set_error(error)
        span.end()

    # ─── Tool ─────────────────────────────────────────────────

    def on_tool_start(self, serialized: Any, input_str: str, run_id: str, parent_run_id: Optional[str] = None, **kwargs: Any) -> None:
        trace = self._get_trace(run_id, parent_run_id)
        if not trace:
            return
        tool_name = _get_name(serialized) or "tool"
        span = trace.tool_call(
            tool_name=tool_name,
            tool_input={"input": input_str},
            metadata={"framework": "langchain", "run_id": run_id, "parent_run_id": parent_run_id},
        )
        self._spans[run_id] = span

    def on_tool_end(self, output: Any, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        if not span:
            return
        span.set_data(tool_output=_preview(output))
        span.end()

    def on_tool_error(self, error: Exception, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        if not span:
            return
        span.set_error(error)
        span.end()

    # ─── Retriever ────────────────────────────────────────────

    def on_retriever_start(self, serialized: Any, query: str, run_id: str, parent_run_id: Optional[str] = None, **kwargs: Any) -> None:
        """Trace vector search / RAG retrieval."""
        trace = self._get_trace(run_id, parent_run_id)
        if not trace:
            return
        retriever_name = _get_name(serialized) or "retriever"
        span = trace.retriever_call(
            query=query,
            retriever_name=retriever_name,
            metadata={"framework": "langchain", "run_id": run_id, "parent_run_id": parent_run_id},
        )
        self._spans[run_id] = span

    def on_retriever_end(self, documents: Any, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        if not span:
            return

        # Summarize retrieved documents
        doc_count = len(documents) if isinstance(documents, (list, tuple)) else 0
        doc_summary = []
        if isinstance(documents, (list, tuple)):
            for doc in documents[:5]:
                content = getattr(doc, "page_content", None) or str(doc)
                source = getattr(doc, "metadata", {}).get("source", "") if hasattr(doc, "metadata") else ""
                preview = content[:150] + "..." if len(content) > 150 else content
                doc_summary.append(f"[{source}] {preview}" if source else preview)

        span.set_data(
            output_preview=f"{doc_count} documents retrieved",
            tool_output="\n---\n".join(doc_summary) if doc_summary else None,
        )
        span.metadata["document_count"] = doc_count
        span.end()

    def on_retriever_error(self, error: Exception, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        if not span:
            return
        span.set_error(error)
        span.end()

    # ─── Agent Action / Finish ────────────────────────────────

    def on_agent_action(self, action: Any, run_id: str, parent_run_id: Optional[str] = None, **kwargs: Any) -> None:
        """Trace agent reasoning: the thought process + chosen action."""
        trace = self._get_trace(run_id, parent_run_id)
        if not trace:
            return

        # LangChain AgentAction has: tool, tool_input, log
        tool = getattr(action, "tool", None) or (action.get("tool") if isinstance(action, dict) else None)
        tool_input = getattr(action, "tool_input", None) or (action.get("tool_input") if isinstance(action, dict) else None)
        log = getattr(action, "log", None) or (action.get("log") if isinstance(action, dict) else None)

        span = trace.agent_action(
            action=tool or "action",
            tool_name=tool,
            tool_input=str(tool_input)[:500] if tool_input else None,
            thought=log,
            metadata={"framework": "langchain", "run_id": run_id, "parent_run_id": parent_run_id},
        )
        self._spans[f"agent_action_{run_id}"] = span

    def on_agent_finish(self, finish: Any, run_id: str, **kwargs: Any) -> None:
        """Trace agent final answer: the return value + reasoning log."""
        # End any pending agent_action span
        action_span = self._spans.pop(f"agent_action_{run_id}", None)
        if action_span:
            action_span.end()

        # Record the final output on the parent trace/chain span
        trace = self._get_trace(run_id, None)
        if not trace:
            return

        output = getattr(finish, "return_values", None) or (finish.get("return_values") if isinstance(finish, dict) else None)
        log = getattr(finish, "log", None) or (finish.get("log") if isinstance(finish, dict) else None)

        span = trace.agent_action(
            action="finish",
            thought=log,
            metadata={"framework": "langchain", "run_id": run_id, "final": True},
        )
        span.set_data(output_preview=_preview(output))
        span.end()


# ─── Public API ───────────────────────────────────────────────

def get_handler(
    client: "OrchestraAI",
    agent_name: Optional[str] = None,
    session_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> OrchestraLangChainHandler:
    """Return a LangChain callback handler for OrchestraAI.

    Args:
        client: OrchestraAI client instance.
        agent_name: Name for the traced agent.
        session_id: Optional session/thread ID for multi-turn conversations.
        metadata: Additional metadata attached to every trace.
    """
    return OrchestraLangChainHandler(
        client=client,
        agent_name=agent_name,
        session_id=session_id,
        metadata=metadata,
    )


def auto_instrument(
    client: "OrchestraAI",
    agent_name: Optional[str] = None,
    session_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> OrchestraLangChainHandler:
    """Alias for get_handler for API symmetry."""
    return get_handler(client=client, agent_name=agent_name, session_id=session_id, metadata=metadata)


# ─── Helpers ──────────────────────────────────────────────────

def _preview(value: Any, limit: int = 500) -> Optional[str]:
    if value is None:
        return None
    try:
        text = value if isinstance(value, str) else str(value)
        return text[:limit] + "..." if len(text) > limit else text
    except Exception:
        return None


def _get_name(obj: Any, *attrs: str) -> Optional[str]:
    """Extract a name from a serialized object by trying multiple attribute/key paths."""
    for attr in attrs or ("name",):
        val = getattr(obj, attr, None)
        if val:
            return val
        if isinstance(obj, dict):
            val = obj.get(attr)
            if val:
                return val
    # Fallback: try "name" if not in attrs
    if "name" not in attrs:
        val = getattr(obj, "name", None) or (obj.get("name") if isinstance(obj, dict) else None)
        if val:
            return val
    return None


def _deep_get(obj: Any, *keys: str) -> Optional[str]:
    """Walk nested dict keys, e.g. _deep_get(obj, 'kwargs', 'model')."""
    if not isinstance(obj, dict):
        return None
    current = obj
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
        if current is None:
            return None
    return current if isinstance(current, str) else None


def _extract_generation_text(output: Any) -> Optional[str]:
    """Extract text from a LangChain LLMResult/ChatResult."""
    if hasattr(output, "generations"):
        generations = output.generations
        if generations and generations[0]:
            gen = generations[0][0]
            # ChatGeneration has .message.content, Generation has .text
            if hasattr(gen, "message") and hasattr(gen.message, "content"):
                return gen.message.content
            if hasattr(gen, "text"):
                return gen.text
    if isinstance(output, dict):
        return output.get("text")
    return None


__all__ = ["get_handler", "auto_instrument", "OrchestraLangChainHandler"]
