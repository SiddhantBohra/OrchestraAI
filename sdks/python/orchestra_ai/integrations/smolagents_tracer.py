"""HuggingFace smolagents integration for OrchestraAI.

Patches smolagents at multiple levels for deep tracing:
- Agent.run() — top-level agent execution
- Agent.step() — individual reasoning steps
- Tool.__call__() — tool invocations with input/output

Usage::

    from orchestra_ai.integrations import smolagents_tracer
    smolagents_tracer.auto_instrument(oa)

    agent = CodeAgent(tools=[...], model=...)
    agent.run("What is the weather?")  # All steps and tools traced
"""

from __future__ import annotations

import functools
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from ..client import OrchestraAI

_client: Optional["OrchestraAI"] = None
_original_run: Any = None
_original_step: Any = None
_original_tool_call: Any = None
_active_trace: Any = None  # Thread-local would be better, but simple global works for single-threaded


def auto_instrument(client: "OrchestraAI") -> None:
    """Patch smolagents to trace agent runs, steps, and tool calls."""
    global _client, _original_run, _original_step, _original_tool_call
    _client = client

    try:
        from smolagents import MultiStepAgent
    except ImportError:
        raise ImportError(
            "smolagents is not installed. Install with: pip install smolagents"
        )

    # ── Patch Agent.run() ────────────────────────────────────
    _original_run = MultiStepAgent.run

    @functools.wraps(_original_run)
    def patched_run(self: Any, task: str, **kwargs: Any) -> Any:
        global _active_trace
        if not _client:
            return _original_run(self, task, **kwargs)

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
            _active_trace = trace
            try:
                result = _original_run(self, task, **kwargs)

                # Record final output and step count
                step_count = getattr(self, "step_number", None) or getattr(self, "_step_number", None)
                final_span = trace.step("final-output")
                final_span.set_data(
                    input_preview=task[:500],
                    output_preview=str(result)[:500] if result else None,
                )
                if step_count is not None:
                    final_span.metadata["total_steps"] = step_count
                    if max_steps and step_count >= max_steps:
                        final_span.metadata["reached_max_steps"] = True
                final_span.end()

                return result
            finally:
                _active_trace = None

    MultiStepAgent.run = patched_run

    # ── Patch Agent.step() ───────────────────────────────────
    if hasattr(MultiStepAgent, "step"):
        _original_step = MultiStepAgent.step

        @functools.wraps(_original_step)
        def patched_step(self: Any, *args: Any, **kwargs: Any) -> Any:
            if not _active_trace:
                return _original_step(self, *args, **kwargs)

            step_num = getattr(self, "step_number", None) or getattr(self, "_step_number", "?")
            agent_name = getattr(self, "name", None) or type(self).__name__
            span = _active_trace.step(
                f"step-{step_num}",
                metadata={
                    "framework": "smolagents",
                    "agent": agent_name,
                    "step_number": step_num,
                },
            )

            try:
                result = _original_step(self, *args, **kwargs)

                # Extract step output (ActionStep or similar)
                if result is not None:
                    # smolagents ActionStep has .action, .observation, .thought
                    thought = getattr(result, "thought", None) or getattr(result, "rationale", None)
                    action = getattr(result, "action", None)
                    observation = getattr(result, "observation", None)
                    error = getattr(result, "error", None)

                    if thought:
                        span.set_data(input_preview=str(thought)[:500])
                    if observation:
                        span.set_data(output_preview=str(observation)[:500])
                    if action:
                        span.metadata["action"] = str(action)[:200]
                    if error:
                        span.set_error(Exception(str(error)[:500]))

                span.end()
                return result
            except Exception as e:
                span.set_error(e)
                span.end()
                raise

        MultiStepAgent.step = patched_step

    # ── Patch Tool.__call__() ────────────────────────────────
    try:
        from smolagents import Tool
        _original_tool_call = Tool.__call__

        @functools.wraps(_original_tool_call)
        def patched_tool_call(self: Any, *args: Any, **kwargs: Any) -> Any:
            if not _active_trace:
                return _original_tool_call(self, *args, **kwargs)

            tool_name = getattr(self, "name", type(self).__name__)
            tool_input = _format_tool_args(args, kwargs)

            span = _active_trace.tool_call(
                tool_name=tool_name,
                tool_input=tool_input,
                metadata={"framework": "smolagents"},
            )

            try:
                result = _original_tool_call(self, *args, **kwargs)
                span.set_data(tool_output=str(result)[:500] if result is not None else None)
                span.end()
                return result
            except Exception as e:
                span.set_error(e)
                span.end()
                raise

        Tool.__call__ = patched_tool_call
    except (ImportError, AttributeError):
        pass  # Tool class might not be available


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
    result = {}
    if args:
        if len(args) == 1:
            result["input"] = str(args[0])[:500]
        else:
            result["args"] = [str(a)[:200] for a in args[:5]]
    if kwargs:
        result.update({k: str(v)[:200] for k, v in list(kwargs.items())[:10]})
    return result


def remove_instrumentation() -> None:
    """Restore original smolagents methods."""
    global _client, _original_run, _original_step, _original_tool_call, _active_trace

    if _original_run:
        try:
            from smolagents import MultiStepAgent
            MultiStepAgent.run = _original_run
            if _original_step and hasattr(MultiStepAgent, "step"):
                MultiStepAgent.step = _original_step
        except ImportError:
            pass

    if _original_tool_call:
        try:
            from smolagents import Tool
            Tool.__call__ = _original_tool_call
        except ImportError:
            pass

    _client = None
    _original_run = None
    _original_step = None
    _original_tool_call = None
    _active_trace = None
