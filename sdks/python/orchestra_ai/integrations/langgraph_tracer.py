"""LangGraph integration for OrchestraAI SDK.

Patches ``CompiledGraph.invoke`` / ``ainvoke`` / ``stream`` / ``astream``
to automatically create OrchestraAI traces with the LangChain callback
handler injected for full span capture (LLM, tool, retriever, agent actions).

Usage::

    from orchestra_ai import OrchestraAI
    from orchestra_ai.integrations import langgraph_tracer

    oa = OrchestraAI(api_key="...")
    langgraph_tracer.auto_instrument(oa)

    # All LangGraph graph invocations are now traced
"""

from __future__ import annotations

import functools
from typing import TYPE_CHECKING, Any, Optional

from . import langchain_tracer

if TYPE_CHECKING:
    from ..client import OrchestraAI

_client: Optional["OrchestraAI"] = None
_originals: dict[str, Any] = {}


def auto_instrument(client: "OrchestraAI") -> None:
    """Patch LangGraph's CompiledGraph to send traces to OrchestraAI."""
    global _client
    _client = client

    try:
        from langgraph.graph.graph import CompiledGraph
    except ImportError as exc:
        raise ImportError("LangGraph is not installed. Install with: pip install langgraph") from exc

    if _originals:
        return  # Already patched

    for method_name in ("invoke", "ainvoke", "stream", "astream"):
        original = getattr(CompiledGraph, method_name, None)
        if original:
            _originals[method_name] = original
            is_async = method_name.startswith("a")
            is_stream = "stream" in method_name
            setattr(
                CompiledGraph,
                method_name,
                _make_wrapper(original, is_async=is_async, is_stream=is_stream),
            )


def _inject_handler(config: Any, handler: Any) -> dict:
    """Inject the OrchestraAI callback handler into LangGraph config."""
    cfg = dict(config) if config else {}
    callbacks = cfg.get("callbacks") or []
    if not isinstance(callbacks, list):
        callbacks = list(callbacks)
    cfg["callbacks"] = [*callbacks, handler]
    return cfg


def _make_wrapper(original_fn: Any, is_async: bool, is_stream: bool):
    """Create a patched wrapper that injects tracing."""

    if is_async and is_stream:
        @functools.wraps(original_fn)
        async def wrapper(self, input=None, config=None, **kwargs):
            if not _client:
                async for chunk in original_fn(self, input, config, **kwargs):
                    yield chunk
                return

            graph_name = getattr(self, "name", None) or "langgraph"
            handler = langchain_tracer.get_handler(
                _client,
                agent_name=graph_name,
                metadata={"framework": "langgraph", "graph_name": graph_name, "mode": "astream"},
            )
            cfg = _inject_handler(config, handler)
            async for chunk in original_fn(self, input, cfg, **kwargs):
                yield chunk

    elif is_async:
        @functools.wraps(original_fn)
        async def wrapper(self, input=None, config=None, **kwargs):
            if not _client:
                return await original_fn(self, input, config, **kwargs)

            graph_name = getattr(self, "name", None) or "langgraph"
            handler = langchain_tracer.get_handler(
                _client,
                agent_name=graph_name,
                metadata={"framework": "langgraph", "graph_name": graph_name, "mode": "ainvoke"},
            )
            cfg = _inject_handler(config, handler)
            return await original_fn(self, input, cfg, **kwargs)

    elif is_stream:
        @functools.wraps(original_fn)
        def wrapper(self, input=None, config=None, **kwargs):
            if not _client:
                yield from original_fn(self, input, config, **kwargs)
                return

            graph_name = getattr(self, "name", None) or "langgraph"
            handler = langchain_tracer.get_handler(
                _client,
                agent_name=graph_name,
                metadata={"framework": "langgraph", "graph_name": graph_name, "mode": "stream"},
            )
            cfg = _inject_handler(config, handler)
            yield from original_fn(self, input, cfg, **kwargs)

    else:
        @functools.wraps(original_fn)
        def wrapper(self, input=None, config=None, **kwargs):
            if not _client:
                return original_fn(self, input, config, **kwargs)

            graph_name = getattr(self, "name", None) or "langgraph"
            handler = langchain_tracer.get_handler(
                _client,
                agent_name=graph_name,
                metadata={"framework": "langgraph", "graph_name": graph_name, "mode": "invoke"},
            )
            cfg = _inject_handler(config, handler)
            return original_fn(self, input, cfg, **kwargs)

    return wrapper


def remove_instrumentation() -> None:
    """Restore original LangGraph methods."""
    global _client
    try:
        from langgraph.graph.graph import CompiledGraph
        for method_name, original in _originals.items():
            setattr(CompiledGraph, method_name, original)
    except ImportError:
        pass
    _originals.clear()
    _client = None
