"""LangChain/LangGraph integration for OrchestraAI SDK.

Creates ONE trace per top-level invocation and nests all internal
chains, LLM calls, tool calls, and retrievers as child spans.

Filters out noisy internal runnables (RunnableSequence, RunnableLambda,
ChannelWrite, etc.) to keep the trace tree clean and readable.

Usage::

    from orchestra_ai.integrations.langchain_tracer import get_handler

    handler = get_handler(oa)  # just pass the client
    result = chain.invoke(input, config={"callbacks": [handler]})
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional, Set

from ..token_extraction import extract_token_usage

if TYPE_CHECKING:
    from ..client import OrchestraAI
    from ..tracer import Trace, Span

# Internal LangChain/LangGraph runnables that add noise to the trace tree
_NOISE_RUNNABLES: Set[str] = {
    "RunnableSequence",
    "RunnableLambda",
    "RunnableParallel",
    "RunnablePassthrough",
    "RunnableAssign",
    "ChannelWrite",
    "ChannelRead",
    "__start__",
    "__end__",
}


class OrchestraLangChainHandler:
    """LangChain callback handler that forwards events to OrchestraAI.

    One trace per top-level invocation. Internal runnables are filtered.
    LLM calls, tool calls, retrievers, and agent actions are captured.
    """

    def __init__(
        self,
        client: "OrchestraAI",
        agent_name: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        show_internal_runnables: bool = False,
    ) -> None:
        self._client = client
        self._agent_name = agent_name
        self._session_id = session_id
        self._user_id = user_id
        self._tags = tags
        self._metadata = metadata or {}
        self._show_noise = show_internal_runnables

        self._root_trace: Optional["Trace"] = None
        self._spans: Dict[str, "Span"] = {}
        self._run_parents: Dict[str, str] = {}  # run_id -> parent_run_id
        self._skipped: Set[str] = set()  # run_ids skipped as noise
        self._root_run_id: Optional[str] = None

    # ─── Internal helpers ──────────────────────────────────────

    def _ensure_trace(self, run_id: str, parent_run_id: Optional[str], auto_name: str = "agent") -> "Trace":
        if parent_run_id:
            self._run_parents[run_id] = parent_run_id

        if self._root_trace is None:
            from ..tracer import Trace
            name = self._agent_name or auto_name
            self._root_trace = Trace(
                client=self._client,
                agent_name=name,
                session_id=self._session_id,
                user_id=self._user_id,
                tags=self._tags,
                metadata={**self._metadata, "framework": "langchain"},
            )
            self._root_trace.__enter__()
            self._root_run_id = run_id
        return self._root_trace

    def _is_root(self, run_id: str) -> bool:
        return run_id == self._root_run_id

    def _is_noise(self, name: str) -> bool:
        return not self._show_noise and name in _NOISE_RUNNABLES

    # ─── Chain ─────────────────────────────────────────────────

    def on_chain_start(self, serialized: Any, inputs: Any, run_id: str, parent_run_id: Optional[str] = None, **kwargs: Any) -> None:
        # Same name resolution as Langfuse: kwargs["name"] > serialized["name"] > serialized["id"][-1]
        kwargs_name = kwargs.get("name")
        serialized_name = _get_langchain_run_name(serialized)
        chain_name = kwargs_name or serialized_name

        # Skip noise — but NEVER skip if kwargs.name is meaningful
        # (LangGraph wraps nodes in RunnableSequence, so serialized is noise but kwargs.name is real)
        if not kwargs_name and self._is_noise(chain_name):
            self._skipped.add(run_id)
            if parent_run_id:
                self._run_parents[run_id] = parent_run_id
            return

        display_name = kwargs_name or serialized_name
        trace = self._ensure_trace(run_id, parent_run_id, display_name)

        span = trace.step(display_name, metadata={"framework": "langchain", "run_id": run_id})
        span.set_data(input_preview=_preview(inputs, 500))
        self._spans[run_id] = span

    def on_chain_end(self, outputs: Any, run_id: str, **kwargs: Any) -> None:
        if run_id in self._skipped:
            self._skipped.discard(run_id)
            # If this was the root, close the trace
            if self._is_root(run_id) and self._root_trace:
                self._root_trace.__exit__(None, None, None)
                self._cleanup()
            return

        span = self._spans.pop(run_id, None)
        if span:
            span.set_data(output_preview=_preview(outputs))
            span.end()

        if self._is_root(run_id) and self._root_trace:
            self._root_trace.__exit__(None, None, None)
            self._cleanup()

    def on_chain_error(self, error: Exception, run_id: str, **kwargs: Any) -> None:
        if run_id in self._skipped:
            self._skipped.discard(run_id)
            if self._is_root(run_id) and self._root_trace:
                self._root_trace.__exit__(type(error), error, None)
                self._cleanup()
            return

        span = self._spans.pop(run_id, None)
        if span:
            span.set_error(error)
            span.end()

        if self._is_root(run_id) and self._root_trace:
            self._root_trace.__exit__(type(error), error, None)
            self._cleanup()

    # ─── LLM ───────────────────────────────────────────────────

    def on_llm_start(self, serialized: Any, prompts: list[str], run_id: str, parent_run_id: Optional[str] = None, **kwargs: Any) -> None:
        trace = self._ensure_trace(run_id, parent_run_id)
        model = (
            _get_name(serialized, "model_name", "model")
            or _deep_get(serialized, "kwargs", "model_name")
            or _deep_get(serialized, "kwargs", "model")
            or kwargs.get("invocation_params", {}).get("model_name")
            or kwargs.get("invocation_params", {}).get("model")
            or "llm"
        )
        span = trace.llm_call(
            model=model,
            input_preview=_preview(prompts[0] if prompts else None),
            metadata={"framework": "langchain", "run_id": run_id},
        )
        self._spans[run_id] = span

    def on_chat_model_start(self, serialized: Any, messages: list, run_id: str, parent_run_id: Optional[str] = None, **kwargs: Any) -> None:
        trace = self._ensure_trace(run_id, parent_run_id)
        model = (
            _deep_get(serialized, "kwargs", "model")
            or _deep_get(serialized, "kwargs", "model_name")
            or _get_name(serialized, "model_name", "model")
            or kwargs.get("invocation_params", {}).get("model")
            or kwargs.get("invocation_params", {}).get("model_name")
            or "llm"
        )

        input_preview = None
        if messages and messages[0]:
            last_msg = messages[0][-1] if isinstance(messages[0], list) else messages[0]
            content = getattr(last_msg, "content", None)
            if content is None and isinstance(last_msg, dict):
                content = last_msg.get("content")
            input_preview = _preview(content)

        span = trace.llm_call(
            model=model,
            input_preview=input_preview,
            metadata={"framework": "langchain", "run_id": run_id},
        )
        self._spans[run_id] = span

    def on_llm_new_token(self, token: str, run_id: str, **kwargs: Any) -> None:
        span = self._spans.get(run_id)
        if span:
            span.add_token(token)

    def on_llm_end(self, output: Any, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        if not span:
            return

        usage = extract_token_usage(output)
        text = _extract_generation_text(output)

        span.set_data(
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            model=usage.model,
            output_preview=_preview(text),
        )
        span.end()

    def on_llm_error(self, error: Exception, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        if span:
            span.set_error(error)
            span.end()

    # ─── Tool ──────────────────────────────────────────────────

    def on_tool_start(self, serialized: Any, input_str: str, run_id: str, parent_run_id: Optional[str] = None, **kwargs: Any) -> None:
        trace = self._ensure_trace(run_id, parent_run_id)
        tool_name = kwargs.get("name") or _get_name(serialized) or "tool"
        span = trace.tool_call(
            tool_name=tool_name,
            tool_input={"input": input_str},
            metadata={"framework": "langchain", "run_id": run_id},
        )
        self._spans[run_id] = span

    def on_tool_end(self, output: Any, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        if span:
            span.set_data(tool_output=_preview(output))
            span.end()

    def on_tool_error(self, error: Exception, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        if span:
            span.set_error(error)
            span.end()

    # ─── Retriever ─────────────────────────────────────────────

    def on_retriever_start(self, serialized: Any, query: str, run_id: str, parent_run_id: Optional[str] = None, **kwargs: Any) -> None:
        trace = self._ensure_trace(run_id, parent_run_id)
        retriever_name = kwargs.get("name") or _get_name(serialized) or "retriever"
        span = trace.retriever_call(
            query=query,
            retriever_name=retriever_name,
            metadata={"framework": "langchain", "run_id": run_id},
        )
        self._spans[run_id] = span

    def on_retriever_end(self, documents: Any, run_id: str, **kwargs: Any) -> None:
        span = self._spans.pop(run_id, None)
        if not span:
            return
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
        if span:
            span.set_error(error)
            span.end()

    # ─── Agent Action / Finish ─────────────────────────────────

    def on_agent_action(self, action: Any, run_id: str, parent_run_id: Optional[str] = None, **kwargs: Any) -> None:
        trace = self._ensure_trace(run_id, parent_run_id)
        if not trace:
            return
        tool = getattr(action, "tool", None) or (action.get("tool") if isinstance(action, dict) else None)
        tool_input = getattr(action, "tool_input", None) or (action.get("tool_input") if isinstance(action, dict) else None)
        log = getattr(action, "log", None) or (action.get("log") if isinstance(action, dict) else None)

        span = trace.agent_action(
            action=tool or "action",
            tool_name=tool,
            tool_input=str(tool_input)[:500] if tool_input else None,
            thought=log,
            metadata={"framework": "langchain", "run_id": run_id},
        )
        self._spans[f"agent_action_{run_id}"] = span

    def on_agent_finish(self, finish: Any, run_id: str, **kwargs: Any) -> None:
        action_span = self._spans.pop(f"agent_action_{run_id}", None)
        if action_span:
            action_span.end()

    # ─── Cleanup ───────────────────────────────────────────────

    def _cleanup(self) -> None:
        self._root_trace = None
        self._root_run_id = None
        self._run_parents.clear()
        self._skipped.clear()


# ─── Public API ────────────────────────────────────────────────

def get_handler(
    client: "OrchestraAI",
    agent_name: Optional[str] = None,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    tags: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    show_internal_runnables: bool = False,
) -> OrchestraLangChainHandler:
    """Return a LangChain/LangGraph callback handler for OrchestraAI.

    Minimal usage — just pass the client::

        handler = get_handler(oa)
        result = chain.invoke(input, config={"callbacks": [handler]})

    Everything is auto-detected: agent name from the chain/graph, model
    from the LLM, tokens from the response. Override with kwargs if needed.
    """
    return OrchestraLangChainHandler(
        client=client,
        agent_name=agent_name,
        session_id=session_id,
        user_id=user_id,
        tags=tags,
        metadata=metadata,
        show_internal_runnables=show_internal_runnables,
    )


def auto_instrument(
    client: "OrchestraAI",
    agent_name: Optional[str] = None,
    session_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> OrchestraLangChainHandler:
    """Alias for get_handler for API symmetry."""
    return get_handler(client=client, agent_name=agent_name, session_id=session_id, metadata=metadata)


# ─── Helpers ───────────────────────────────────────────────────

def _preview(value: Any, limit: int = 500) -> Optional[str]:
    if value is None:
        return None
    try:
        text = value if isinstance(value, str) else str(value)
        return text[:limit] + "..." if len(text) > limit else text
    except Exception:
        return None


def _get_langchain_run_name(serialized: Any) -> str:
    """Extract name from a serialized LangChain runnable (same logic as Langfuse).

    Priority: serialized["name"] > serialized["id"][-1] > "chain"
    """
    if serialized is None:
        return "chain"
    if isinstance(serialized, dict):
        name = serialized.get("name")
        if name:
            return str(name)
        id_list = serialized.get("id")
        if isinstance(id_list, list) and id_list:
            return str(id_list[-1])
    return "chain"


def _get_name(obj: Any, *attrs: str) -> Optional[str]:
    for attr in attrs or ("name",):
        val = getattr(obj, attr, None)
        if val:
            return val
        if isinstance(obj, dict):
            val = obj.get(attr)
            if val:
                return val
    if "name" not in attrs:
        val = getattr(obj, "name", None) or (obj.get("name") if isinstance(obj, dict) else None)
        if val:
            return val
    # Fallback: last element of serialized id array
    if isinstance(obj, dict) and "id" in obj and isinstance(obj["id"], list) and obj["id"]:
        return obj["id"][-1]
    return None


def _deep_get(obj: Any, *keys: str) -> Optional[str]:
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
    if hasattr(output, "generations"):
        generations = output.generations
        if generations and generations[0]:
            gen = generations[0][0]
            if hasattr(gen, "message") and hasattr(gen.message, "content"):
                return gen.message.content
            if hasattr(gen, "text"):
                return gen.text
    if isinstance(output, dict):
        return output.get("text")
    return None


__all__ = ["get_handler", "auto_instrument", "OrchestraLangChainHandler"]
