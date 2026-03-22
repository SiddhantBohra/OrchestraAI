"""HuggingFace smolagents integration for OrchestraAI.

Patches smolagents' ``Agent.run()`` to capture agent runs, tool calls,
and LLM interactions.

Usage::

    from orchestra_ai.integrations import smolagents_tracer
    smolagents_tracer.auto_instrument(oa)

    agent = CodeAgent(tools=[...], model=...)
    agent.run("What is the weather?")  # Automatically traced
"""

from __future__ import annotations

import functools
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from ..client import OrchestraAI

_client: Optional["OrchestraAI"] = None
_original_run: Any = None


def auto_instrument(client: "OrchestraAI") -> None:
    """Patch smolagents Agent.run() to trace all agent executions."""
    global _client, _original_run
    _client = client

    try:
        from smolagents import MultiStepAgent
    except ImportError:
        raise ImportError(
            "smolagents is not installed. Install with: pip install smolagents"
        )

    _original_run = MultiStepAgent.run

    @functools.wraps(_original_run)
    def patched_run(self: Any, task: str, **kwargs: Any) -> Any:
        if not _client:
            return _original_run(self, task, **kwargs)

        agent_name = getattr(self, "name", None) or type(self).__name__
        tool_names = []
        if hasattr(self, "tools"):
            tool_names = [
                getattr(t, "name", str(t)) for t in self.tools.values()
            ] if isinstance(self.tools, dict) else [
                getattr(t, "name", str(t)) for t in self.tools
            ]

        with _client.trace(
            agent_name=agent_name,
            metadata={
                "framework": "smolagents",
                "agent_type": type(self).__name__,
                "tools": tool_names[:20],
                "task": task[:200],
            },
        ) as trace:
            result = _original_run(self, task, **kwargs)

            # Record the final output
            step = trace.step("final-output")
            step.set_data(
                input_preview=task[:500],
                output_preview=str(result)[:500] if result else None,
            )
            step.end()

            return result

    MultiStepAgent.run = patched_run


def remove_instrumentation() -> None:
    """Restore original smolagents methods."""
    global _client, _original_run

    if _original_run:
        try:
            from smolagents import MultiStepAgent
            MultiStepAgent.run = _original_run
        except ImportError:
            pass

    _client = None
    _original_run = None
