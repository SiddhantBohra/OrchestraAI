"""CrewAI integration for OrchestraAI SDK.

Patches CrewAI to capture deep traces including crew runs, task execution,
agent task delegation, and tool calls.

Trace tree example::

    agent_run: crew-name
      +-- step: task:Research Topic (agent: Researcher)
      |   +-- tool: web_search (input, output)
      |   +-- llm: gpt-4o (tokens)
      +-- step: task:Write Article (agent: Writer)
          +-- llm: gpt-4o (tokens)

Usage::

    from orchestra_ai.integrations import crewai_tracer
    crewai_tracer.auto_instrument(oa)

    crew = Crew(agents=[...], tasks=[...])
    crew.kickoff()
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


def auto_instrument(client: "OrchestraAI") -> None:
    """
    Automatically instrument CrewAI to send traces to OrchestraAI.

    This patches CrewAI to capture:
    - Crew kickoff as agent_run
    - Agent.execute_task() as step spans
    - Task.execute_sync() as step spans
    - BaseTool._run() as tool_call spans

    Args:
        client: The OrchestraAI client instance.
    """
    global _client
    _client = client

    try:
        from crewai import Agent, Crew, Task
    except ImportError:
        raise ImportError(
            "CrewAI is not installed. Install with: pip install crewai"
        )

    # ------------------------------------------------------------------
    # 1. Patch BaseTool._run to capture tool calls
    # ------------------------------------------------------------------
    try:
        from crewai.tools import BaseTool as CrewBaseTool
    except ImportError:
        CrewBaseTool = None

    if CrewBaseTool is not None and hasattr(CrewBaseTool, "_run"):
        _originals["BaseTool._run"] = CrewBaseTool._run

        @functools.wraps(CrewBaseTool._run)
        def patched_tool_run(self: Any, *args: Any, **kwargs: Any) -> Any:
            trace = _get_active_trace()
            if not trace or not _client:
                return _originals["BaseTool._run"](self, *args, **kwargs)

            tool_name = getattr(self, "name", type(self).__name__)
            tool_input_str = str(args[0])[:500] if args else str(kwargs)[:500]

            with trace.tool_call(
                tool_name=tool_name,
                tool_input={"input": tool_input_str},
                metadata={"framework": "crewai"},
            ) as span:
                result = _originals["BaseTool._run"](self, *args, **kwargs)
                span.set_data(
                    tool_output=str(result)[:1000] if result else None,
                    output_preview=str(result)[:500] if result else None,
                )
                return result

        CrewBaseTool._run = patched_tool_run

    # ------------------------------------------------------------------
    # 2. Patch Agent.execute_task to capture per-agent task execution
    # ------------------------------------------------------------------
    if hasattr(Agent, "execute_task"):
        _originals["Agent.execute_task"] = Agent.execute_task

        @functools.wraps(Agent.execute_task)
        def patched_agent_execute_task(self: Any, task: Any, *args: Any, **kwargs: Any) -> Any:
            trace = _get_active_trace()
            if not trace or not _client:
                return _originals["Agent.execute_task"](self, task, *args, **kwargs)

            role = getattr(self, "role", "unknown-agent")
            goal = getattr(self, "goal", None)
            task_desc = getattr(task, "description", str(task))[:200]
            step_name = f"task:{task_desc[:80]} (agent: {role})"

            prev_span_id = trace._current_span_id
            with trace.step(
                step_name,
                metadata={
                    "framework": "crewai",
                    "agent_role": role,
                    "agent_goal": str(goal)[:300] if goal else None,
                    "task_description": task_desc,
                },
            ) as span:
                # Push this span as the current parent so tool/llm calls nest under it
                trace._current_span_id = span.span_id
                try:
                    result = _originals["Agent.execute_task"](self, task, *args, **kwargs)
                    span.set_data(output_preview=str(result)[:500] if result else None)
                    return result
                finally:
                    trace._current_span_id = prev_span_id

        Agent.execute_task = patched_agent_execute_task

    # ------------------------------------------------------------------
    # 3. Patch Task.execute_sync to capture task lifecycle
    # ------------------------------------------------------------------
    if hasattr(Task, "execute_sync"):
        _originals["Task.execute_sync"] = Task.execute_sync

        @functools.wraps(Task.execute_sync)
        def patched_task_execute_sync(self: Any, *args: Any, **kwargs: Any) -> Any:
            trace = _get_active_trace()
            if not trace or not _client:
                return _originals["Task.execute_sync"](self, *args, **kwargs)

            task_desc = getattr(self, "description", "unnamed-task")[:200]
            expected_output = getattr(self, "expected_output", None)

            prev_span_id = trace._current_span_id
            with trace.step(
                f"task-exec:{task_desc[:80]}",
                metadata={
                    "framework": "crewai",
                    "task_description": task_desc,
                    "expected_output": str(expected_output)[:300] if expected_output else None,
                },
            ) as span:
                trace._current_span_id = span.span_id
                try:
                    result = _originals["Task.execute_sync"](self, *args, **kwargs)
                    result_str = str(getattr(result, "raw", result))[:500] if result else None
                    span.set_data(output_preview=result_str)
                    return result
                finally:
                    trace._current_span_id = prev_span_id

        Task.execute_sync = patched_task_execute_sync

    # ------------------------------------------------------------------
    # 4. Patch Crew.kickoff as the root trace
    # ------------------------------------------------------------------
    _originals["Crew.kickoff"] = Crew.kickoff

    @functools.wraps(Crew.kickoff)
    def patched_kickoff(self: Any, inputs: Any = None) -> Any:
        if not _client:
            return _originals["Crew.kickoff"](self, inputs)

        crew_name = getattr(self, "name", None) or "crewai-crew"

        agent_names = []
        if hasattr(self, "agents"):
            for agent in self.agents:
                if hasattr(agent, "role"):
                    agent_names.append(agent.role)

        task_descriptions = []
        if hasattr(self, "tasks"):
            for t in self.tasks:
                task_descriptions.append(str(getattr(t, "description", ""))[:100])

        # Build input preview from inputs dict and task descriptions
        input_parts = []
        if inputs:
            input_parts.append(str(inputs)[:300])
        if task_descriptions:
            input_parts.append("Tasks: " + "; ".join(task_descriptions[:5]))
        input_preview = " | ".join(input_parts)[:500] if input_parts else None

        with _client.trace(
            agent_name=crew_name,
            metadata={
                "framework": "crewai",
                "agents": agent_names,
                "task_count": len(getattr(self, "tasks", [])),
                "tasks": task_descriptions[:20],
            },
        ) as trace:
            if input_preview:
                trace.set_input(input_preview)
            _active.trace = trace
            try:
                result = _originals["Crew.kickoff"](self, inputs)
                return result
            finally:
                _active.trace = None

    Crew.kickoff = patched_kickoff

    # Patch async kickoff if available
    if hasattr(Crew, "kickoff_async"):
        _originals["Crew.kickoff_async"] = Crew.kickoff_async

        @functools.wraps(Crew.kickoff_async)
        async def patched_kickoff_async(self: Any, inputs: Any = None) -> Any:
            if not _client:
                return await _originals["Crew.kickoff_async"](self, inputs)

            crew_name = getattr(self, "name", None) or "crewai-crew"

            agent_names = []
            if hasattr(self, "agents"):
                for agent in self.agents:
                    if hasattr(agent, "role"):
                        agent_names.append(agent.role)

            # Build input preview for async kickoff
            async_task_descriptions = []
            if hasattr(self, "tasks"):
                for t in self.tasks:
                    async_task_descriptions.append(str(getattr(t, "description", ""))[:100])
            async_input_parts = []
            if inputs:
                async_input_parts.append(str(inputs)[:300])
            if async_task_descriptions:
                async_input_parts.append("Tasks: " + "; ".join(async_task_descriptions[:5]))
            async_input_preview = " | ".join(async_input_parts)[:500] if async_input_parts else None

            with _client.trace(
                agent_name=crew_name,
                metadata={
                    "framework": "crewai",
                    "agents": agent_names,
                    "task_count": len(getattr(self, "tasks", [])),
                },
            ) as trace:
                if async_input_preview:
                    trace.set_input(async_input_preview)
                _active.trace = trace
                try:
                    result = await _originals["Crew.kickoff_async"](self, inputs)
                    return result
                finally:
                    _active.trace = None

        Crew.kickoff_async = patched_kickoff_async


def remove_instrumentation() -> None:
    """Remove CrewAI instrumentation and restore original methods."""
    global _client

    try:
        from crewai import Agent, Crew, Task
    except ImportError:
        _client = None
        _originals.clear()
        return

    if "Crew.kickoff" in _originals:
        Crew.kickoff = _originals["Crew.kickoff"]
    if "Crew.kickoff_async" in _originals and hasattr(Crew, "kickoff_async"):
        Crew.kickoff_async = _originals["Crew.kickoff_async"]
    if "Agent.execute_task" in _originals:
        Agent.execute_task = _originals["Agent.execute_task"]
    if "Task.execute_sync" in _originals:
        Task.execute_sync = _originals["Task.execute_sync"]

    try:
        from crewai.tools import BaseTool as CrewBaseTool

        if "BaseTool._run" in _originals:
            CrewBaseTool._run = _originals["BaseTool._run"]
    except ImportError:
        pass

    _client = None
    _originals.clear()
