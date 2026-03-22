"""Haystack (deepset) integration for OrchestraAI.

Hooks into Haystack's pipeline internals to capture component-level execution,
LLM generator calls, retriever calls, and full pipeline runs.

Trace tree example::

    agent_run: haystack-pipeline
      +-- step: component:prompt_builder (input, output)
      +-- llm: component:generator (model: gpt-4o, tokens)
      +-- retriever: component:retriever (query, doc_count)
      +-- step: component:output_adapter (input, output)

Usage::

    from orchestra_ai.integrations import haystack_tracer
    haystack_tracer.auto_instrument(oa)

    pipeline.run({"prompt_builder": {"query": "..."}})
"""

from __future__ import annotations

import functools
import threading
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from ..client import OrchestraAI

_client: Optional["OrchestraAI"] = None
_originals: dict[str, Any] = {}
_active = threading.local()

# Component class name substrings that indicate LLM generators
_LLM_COMPONENT_MARKERS = (
    "ChatGenerator",
    "Generator",
    "HuggingFaceLocal",
    "HuggingFaceTGI",
    "HuggingFaceAPI",
    "AnthropicGenerator",
    "CohereGenerator",
    "AzureOpenAI",
    "OpenAIGenerator",
)

# Component class name substrings that indicate retrievers
_RETRIEVER_MARKERS = (
    "Retriever",
    "BM25",
    "Embedding",
    "SparseEmbedding",
)


def _get_active_trace() -> Any:
    return getattr(_active, "trace", None)


def _is_llm_component(component: Any) -> bool:
    cls_name = type(component).__name__
    return any(m in cls_name for m in _LLM_COMPONENT_MARKERS)


def _is_retriever_component(component: Any) -> bool:
    cls_name = type(component).__name__
    return any(m in cls_name for m in _RETRIEVER_MARKERS)


def _extract_model_from_component(component: Any) -> Optional[str]:
    """Try to extract model name from a Haystack generator component."""
    for attr in ("model", "model_name", "model_id"):
        val = getattr(component, attr, None)
        if val:
            return str(val)
    # Some generators store it in generation_kwargs or init params
    gen_kwargs = getattr(component, "generation_kwargs", None)
    if isinstance(gen_kwargs, dict):
        model = gen_kwargs.get("model")
        if model:
            return str(model)
    return None


def auto_instrument(client: "OrchestraAI") -> None:
    """Patch Haystack Pipeline to trace pipeline and component execution."""
    global _client
    _client = client

    try:
        from haystack import Pipeline
    except ImportError:
        raise ImportError("Haystack is not installed. Install with: pip install haystack-ai")

    # ------------------------------------------------------------------
    # 1. Patch Pipeline._run_component (internal per-component execution)
    # ------------------------------------------------------------------
    if hasattr(Pipeline, "_run_component"):
        _originals["Pipeline._run_component"] = Pipeline._run_component

        @functools.wraps(Pipeline._run_component)
        def patched_run_component(self: Any, name: str, component: Any, inputs: dict, **kwargs: Any) -> Any:
            trace = _get_active_trace()
            if not trace or not _client:
                return _originals["Pipeline._run_component"](self, name, component, inputs, **kwargs)

            cls_name = type(component).__name__
            input_preview = str(inputs)[:500] if inputs else None

            # Decide span type based on component class
            if _is_retriever_component(component):
                # Extract query from inputs
                query = None
                if isinstance(inputs, dict):
                    for key in ("query", "queries", "query_embedding"):
                        if key in inputs:
                            query = str(inputs[key])[:500]
                            break
                    if not query:
                        query = str(list(inputs.values())[0])[:500] if inputs else None

                prev_span_id = trace._current_span_id
                with trace.retriever_call(
                    query=query or "",
                    retriever_name=name,
                    metadata={
                        "framework": "haystack",
                        "component_class": cls_name,
                    },
                ) as span:
                    trace._current_span_id = span.span_id
                    try:
                        result = _originals["Pipeline._run_component"](self, name, component, inputs, **kwargs)
                        # Count retrieved documents
                        doc_count = 0
                        if isinstance(result, dict):
                            for v in result.values():
                                if isinstance(v, list):
                                    doc_count = len(v)
                                    break
                        span.set_data(
                            output_preview=f"{doc_count} documents retrieved",
                        )
                        span.metadata["document_count"] = doc_count
                        return result
                    finally:
                        trace._current_span_id = prev_span_id

            elif _is_llm_component(component):
                model = _extract_model_from_component(component)

                prev_span_id = trace._current_span_id
                with trace.llm_call(
                    model=model,
                    input_preview=input_preview,
                    metadata={
                        "framework": "haystack",
                        "component": name,
                        "component_class": cls_name,
                    },
                ) as span:
                    trace._current_span_id = span.span_id
                    try:
                        result = _originals["Pipeline._run_component"](self, name, component, inputs, **kwargs)
                        # Try to extract token usage from result
                        if isinstance(result, dict):
                            replies = result.get("replies", [])
                            if replies and len(replies) > 0:
                                reply = replies[0]
                                # Haystack ChatMessage may have meta with usage
                                meta = getattr(reply, "meta", {}) or {}
                                usage = meta.get("usage", {})
                                if isinstance(usage, dict):
                                    span.set_data(
                                        input_tokens=usage.get("prompt_tokens"),
                                        output_tokens=usage.get("completion_tokens"),
                                    )
                                output_text = str(reply)[:500]
                                span.set_data(output_preview=output_text)
                        return result
                    finally:
                        trace._current_span_id = prev_span_id

            else:
                # Generic component -> step span
                prev_span_id = trace._current_span_id
                with trace.step(
                    f"component:{name}",
                    metadata={
                        "framework": "haystack",
                        "component": name,
                        "component_class": cls_name,
                    },
                ) as span:
                    trace._current_span_id = span.span_id
                    try:
                        span.set_data(input_preview=input_preview)
                        result = _originals["Pipeline._run_component"](self, name, component, inputs, **kwargs)
                        output_str = str(result)[:500] if result else None
                        span.set_data(output_preview=output_str)
                        return result
                    finally:
                        trace._current_span_id = prev_span_id

        Pipeline._run_component = patched_run_component

    # ------------------------------------------------------------------
    # 2. Patch Pipeline.run as the root trace
    # ------------------------------------------------------------------
    _originals["Pipeline.run"] = Pipeline.run

    @functools.wraps(Pipeline.run)
    def patched_run(self: Any, data: dict, **kwargs: Any) -> Any:
        if not _client:
            return _originals["Pipeline.run"](self, data, **kwargs)

        component_names = list(self.graph.nodes) if hasattr(self, "graph") else []
        pipeline_name = getattr(self, "metadata", {}).get("name", "haystack-pipeline")

        with _client.trace(
            agent_name=pipeline_name,
            metadata={
                "framework": "haystack",
                "components": component_names[:20],
                "component_count": len(component_names),
            },
        ) as trace:
            _active.trace = trace
            try:
                result = _originals["Pipeline.run"](self, data, **kwargs)
                return result
            finally:
                _active.trace = None

    Pipeline.run = patched_run


def remove_instrumentation() -> None:
    """Restore original Haystack Pipeline methods."""
    global _client

    try:
        from haystack import Pipeline
    except ImportError:
        _client = None
        _originals.clear()
        return

    if "Pipeline.run" in _originals:
        Pipeline.run = _originals["Pipeline.run"]
    if "Pipeline._run_component" in _originals:
        Pipeline._run_component = _originals["Pipeline._run_component"]

    _client = None
    _originals.clear()
