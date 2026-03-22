"""Haystack (deepset) integration for OrchestraAI.

Hooks into Haystack's tracing system to capture pipeline runs,
LLM calls, retriever calls, and component execution.

Usage::

    from orchestra_ai.integrations import haystack_tracer
    haystack_tracer.auto_instrument(oa)

    # All Haystack pipeline runs are now traced
    pipeline.run({"prompt_builder": {"query": "..."}})
"""

from __future__ import annotations

import functools
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from ..client import OrchestraAI

_client: Optional["OrchestraAI"] = None
_original_run: Any = None


def auto_instrument(client: "OrchestraAI") -> None:
    """Patch Haystack Pipeline.run() to trace all pipeline executions."""
    global _client, _original_run
    _client = client

    try:
        from haystack import Pipeline
    except ImportError:
        raise ImportError("Haystack is not installed. Install with: pip install haystack-ai")

    _original_run = Pipeline.run

    @functools.wraps(_original_run)
    def patched_run(self: Any, data: dict, **kwargs: Any) -> Any:
        if not _client:
            return _original_run(self, data, **kwargs)

        # Extract pipeline metadata
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
            # Record each component in the pipeline
            result = _original_run(self, data, **kwargs)

            # Extract component-level results for tracing
            if isinstance(result, dict):
                for component_name, component_output in result.items():
                    span = trace.step(
                        f"component:{component_name}",
                        metadata={"framework": "haystack", "component": component_name},
                    )
                    output_str = str(component_output)[:500] if component_output else None
                    span.set_data(output_preview=output_str)
                    span.end()

            return result

    Pipeline.run = patched_run


def remove_instrumentation() -> None:
    """Restore original Haystack Pipeline.run()."""
    global _client, _original_run

    if _original_run:
        try:
            from haystack import Pipeline
            Pipeline.run = _original_run
        except ImportError:
            pass

    _client = None
    _original_run = None
