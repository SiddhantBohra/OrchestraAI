"""HuggingFace smolagents integration for OrchestraAI.

Patches smolagents to capture per-step reasoning, tool calls, and
agent lifecycle events.

Trace tree example::

    agent_run: CodeAgent
      +-- step: step-1 (reasoning, actions)
      |   +-- tool: web_search (input, output)
      +-- step: step-2
      |   +-- tool: python_interpreter (input, output)
      +-- step: final-output (task, result, step count)

Usage::

    from orchestra_ai.integrations import smolagents_tracer
    smolagents_tracer.auto_instrument(oa)

    agent = CodeAgent(tools=[...], model=...)
    agent.run("What is the weather?")  # All steps and tools traced
"""

from __future__ import annotations

import functools
import threading
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from ..client import OrchestraAI

_client: Optional["OrchestraAI"] = None
_originals: dict[str, Any] = {}
# Thread-local storage for the active trace so nested patches can find it.
_active = threading.local()


def _get_active_trace() -> Any:
    return getattr(_active, "trace", None)


def _get_tool_names(agent: Any) -> list:
    """Extract tool names from an agent instance."""
    if not hasattr(agent, "tools"):
        return []
    tools = agent.tools
    if isinstance(tools, dict):
        return [getattr(t, "name", str(t)) for t in tools.values()]
    if isinstance(tools, (list, tuple)):
        return [getattr(t, "name", str(t)) for t in tools]
    return []


def _format_tool_args(args: tuple, kwargs: dict) -> dict:
    """Format tool call arguments for tracing."""
    result: dict[str, Any] = {}
    if args:
        if len(args) == 1:
            result["input"] = str(args[0])[:500]
        else:
            result["args"] = [str(a)[:200] for a in args[:5]]
    if kwargs:
        result.update({k: str(v)[:200] for k, v in list(kwargs.items())[:10]})
    return result


def auto_instrument(client: "OrchestraAI") -> None:
    """Patch smolagents to trace agent runs, steps, and tool calls."""
    global _client
    _client = client

    try:
        from smolagents import MultiStepAgent
    except ImportError:
        raise ImportError(
            "smolagents is not installed. Install with: pip install smolagents"
        )

    # ------------------------------------------------------------------
    # 1. Patch Tool.__call__() for tool call tracing
    # ------------------------------------------------------------------
    try:
        from smolagents import Tool as SmolagentsTool

        _originals["Tool.__call__"] = SmolagentsTool.__call__

        @functools.wraps(SmolagentsTool.__call__)
        def patched_tool_call(self: Any, *args: Any, **kwargs: Any) -> Any:
            trace = _get_active_trace()
            if not trace or not _client:
                return _originals["Tool.__call__"](self, *args, **kwargs)

            tool_name = getattr(self, "name", type(self).__name__)
            tool_input = _format_tool_args(args, kwargs)

            with trace.tool_call(
                tool_name=tool_name,
                tool_input=tool_input,
                metadata={"framework": "smolagents"},
            ) as span:
                result = _originals["Tool.__call__"](self, *args, **kwargs)
                span.set_data(
                    tool_output=str(result)[:1000] if result is not None else None,
                    output_preview=str(result)[:500] if result is not None else None,
                )
                return result

        SmolagentsTool.__call__ = patched_tool_call
    except (ImportError, AttributeError):
        pass  # Tool class might not be available

    # ------------------------------------------------------------------
    # 2. Patch MultiStepAgent.step() for per-step tracing
    # ------------------------------------------------------------------
    if hasattr(MultiStepAgent, "step"):
        _originals["MultiStepAgent.step"] = MultiStepAgent.step

        @functools.wraps(MultiStepAgent.step)
        def patched_step(self: Any, *args: Any, **kwargs: Any) -> Any:
            trace = _get_active_trace()
            if not trace or not _client:
                return _originals["MultiStepAgent.step"](self, *args, **kwargs)

            step_num = getattr(_active, "step_count", 0) + 1
            _active.step_count = step_num
            max_steps = getattr(self, "max_steps", None)
            agent_name = getattr(self, "name", None) or type(self).__name__

            step_name = f"step-{step_num}"
            prev_span_id = trace._current_span_id

            with trace.step(
                step_name,
                metadata={
                    "framework": "smolagents",
                    "agent": agent_name,
                    "step_number": step_num,
                    "max_steps": max_steps,
                    "at_max_steps": step_num == max_steps if max_steps else False,
                },
            ) as span:
                # Push this span as parent so tool calls nest under the step
                trace._current_span_id = span.span_id
                try:
                    result = _originals["MultiStepAgent.step"](self, *args, **kwargs)

                    # Extract reasoning / inner monologue from step output
                    if result is not None:
                        # smolagents ActionStep has .thought, .action, .observation
                        thought = getattr(result, "thought", None) or getattr(result, "rationale", None)
                        action = getattr(result, "action", None)
                        observation = getattr(result, "observation", None) or getattr(result, "observations", None)
                        error = getattr(result, "error", None)
                        action_output = getattr(result, "action_output", None) or getattr(result, "output", None)

                        if thought:
                            span.set_data(input_preview=str(thought)[:500])
                        if observation:
                            span.set_data(output_preview=str(observation)[:500])
                        elif action_output:
                            span.set_data(output_preview=str(action_output)[:500])
                        if action:
                            span.metadata["action"] = str(action)[:200]
                        if error:
                            span.set_error(Exception(str(error)[:500]))

                    return result
                finally:
                    trace._current_span_id = prev_span_id

        MultiStepAgent.step = patched_step

    # ------------------------------------------------------------------
    # 3. Patch MultiStepAgent.run() as the root trace
    # ------------------------------------------------------------------
    _originals["MultiStepAgent.run"] = MultiStepAgent.run

    @functools.wraps(MultiStepAgent.run)
    def patched_run(self: Any, task: str, **kwargs: Any) -> Any:
        if not _client:
            return _originals["MultiStepAgent.run"](self, task, **kwargs)

        agent_name = getattr(self, "name", None) or type(self).__name__
        tool_names = _get_tool_names(self)
        max_steps = getattr(self, "max_steps", None)

        with _client.trace(
            agent_name=agent_name,
            metadata={
                "framework": "smolagents",
                "agent_type": type(self).__name__,
                "tools": tool_names[:20],
                "task": task[:200],
                "max_steps": max_steps,
            },
        ) as trace:
            _active.trace = trace
            _active.step_count = 0
            try:
                result = _originals["MultiStepAgent.run"](self, task, **kwargs)

                step_count = getattr(_active, "step_count", 0)

                # Record the final output with step tracking metadata
                with trace.step(
                    "final-output",
                    metadata={
                        "framework": "smolagents",
                        "total_steps": step_count,
                        "max_steps": max_steps,
                        "reached_max_steps": step_count >= max_steps if max_steps else False,
                    },
                ) as span:
                    span.set_data(
                        input_preview=task[:500],
                        output_preview=str(result)[:500] if result else None,
                    )

                return result
            finally:
                _active.trace = None
                _active.step_count = 0

    MultiStepAgent.run = patched_run


def remove_instrumentation() -> None:
    """Restore original smolagents methods."""
    global _client

    try:
        from smolagents import MultiStepAgent
    except ImportError:
        _client = None
        _originals.clear()
        return

    if "MultiStepAgent.run" in _originals:
        MultiStepAgent.run = _originals["MultiStepAgent.run"]
    if "MultiStepAgent.step" in _originals:
        MultiStepAgent.step = _originals["MultiStepAgent.step"]

    try:
        from smolagents import Tool as SmolagentsTool

        if "Tool.__call__" in _originals:
            SmolagentsTool.__call__ = _originals["Tool.__call__"]
    except ImportError:
        pass

    _client = None
    _originals.clear()
