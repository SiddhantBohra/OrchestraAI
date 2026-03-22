"""DSPy (Stanford) integration for OrchestraAI.

Uses DSPy's first-party ``BaseCallback`` system to capture module calls,
LLM predictions (with tokens/cost), and tool invocations.

Usage::

    from orchestra_ai.integrations import dspy_tracer
    dspy_tracer.auto_instrument(oa)

    # All DSPy module calls are now traced
    result = my_module(question="What is AI?")
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, Optional

from ..types import TraceType

if TYPE_CHECKING:
    from ..client import OrchestraAI
    from ..tracer import Trace, Span

_client: Optional["OrchestraAI"] = None


class OrchestraDSPyCallback:
    """DSPy BaseCallback that forwards events to OrchestraAI.

    Captures:
    - Module start/end (as agent_run traces)
    - LM calls (as llm_call spans with token usage)
    - Tool calls (as tool_call spans)
    - Adapter formatting (as step spans)
    """

    def __init__(self, client: "OrchestraAI") -> None:
        self._client = client
        self._traces: Dict[str, "Trace"] = {}  # keyed by call_id
        self._spans: Dict[str, "Span"] = {}

    def on_module_start(
        self, call_id: str, instance: Any, inputs: Dict[str, Any]
    ) -> None:
        """Start a trace when a DSPy module is invoked."""
        module_name = type(instance).__name__
        # Build input preview from module inputs
        input_preview = ", ".join(
            f"{k}={str(v)[:100]}" for k, v in inputs.items()
        )[:500] if inputs else None

        trace = self._client.trace(
            agent_name=f"dspy:{module_name}",
            metadata={
                "framework": "dspy",
                "module": module_name,
                "inputs": {k: str(v)[:200] for k, v in inputs.items()},
            },
        )
        trace.__enter__()
        if input_preview:
            trace.set_input(input_preview)
        self._traces[call_id] = trace

    def on_module_end(
        self,
        call_id: str,
        outputs: Any,
        exception: Optional[Exception] = None,
    ) -> None:
        """End the trace when the module completes."""
        trace = self._traces.pop(call_id, None)
        if not trace:
            return

        if exception:
            trace.error(exception)

        # Record output summary
        if outputs and not exception:
            output_str = str(outputs)[:500] if outputs else None
            step = trace.step("output")
            step.set_data(output_preview=output_str)
            step.end()

        trace.__exit__(
            type(exception) if exception else None,
            exception,
            None,
        )

    def on_lm_start(
        self, call_id: str, instance: Any, inputs: Dict[str, Any]
    ) -> None:
        """Start an LLM call span."""
        trace = self._find_trace(call_id)
        if not trace:
            return

        model = getattr(instance, "model", None) or "dspy-lm"
        messages = inputs.get("messages") or inputs.get("prompt")
        input_preview = None
        if messages:
            if isinstance(messages, list) and len(messages) > 0:
                last = messages[-1]
                input_preview = str(last.get("content", last) if isinstance(last, dict) else last)[:500]
            else:
                input_preview = str(messages)[:500]

        span = trace.llm_call(
            model=model,
            input_preview=input_preview,
            metadata={"framework": "dspy", "call_id": call_id},
        )
        self._spans[f"lm_{call_id}"] = span

    def on_lm_end(
        self,
        call_id: str,
        outputs: Any,
        exception: Optional[Exception] = None,
    ) -> None:
        """End the LLM call span with token usage."""
        span = self._spans.pop(f"lm_{call_id}", None)
        if not span:
            return

        if exception:
            span.set_error(exception)
            span.end()
            return

        # Extract token usage from DSPy's output
        if isinstance(outputs, dict):
            usage = outputs.get("usage", {})
            span.set_data(
                input_tokens=usage.get("prompt_tokens") or usage.get("input_tokens"),
                output_tokens=usage.get("completion_tokens") or usage.get("output_tokens"),
                model=outputs.get("model"),
                cost=outputs.get("cost"),
            )

            # Output preview
            output_texts = outputs.get("outputs")
            if output_texts and isinstance(output_texts, list):
                span.set_data(output_preview=str(output_texts[0])[:500])

        span.end()

    def on_tool_start(
        self, call_id: str, instance: Any, inputs: Dict[str, Any]
    ) -> None:
        """Start a tool call span."""
        trace = self._find_trace(call_id)
        if not trace:
            return

        tool_name = getattr(instance, "name", None) or type(instance).__name__
        span = trace.tool_call(
            tool_name=tool_name,
            tool_input=inputs if inputs else None,
            metadata={"framework": "dspy", "call_id": call_id},
        )
        self._spans[f"tool_{call_id}"] = span

    def on_tool_end(
        self,
        call_id: str,
        outputs: Any,
        exception: Optional[Exception] = None,
    ) -> None:
        """End the tool call span."""
        span = self._spans.pop(f"tool_{call_id}", None)
        if not span:
            return

        if exception:
            span.set_error(exception)
        elif outputs:
            span.set_data(tool_output=str(outputs)[:500])

        span.end()

    def on_adapter_format_start(self, call_id: str, instance: Any, inputs: Any) -> None:
        pass  # Skip — too noisy for most users

    def on_adapter_format_end(self, call_id: str, outputs: Any, exception: Any = None) -> None:
        pass

    def on_adapter_parse_start(self, call_id: str, instance: Any, inputs: Any) -> None:
        pass

    def on_adapter_parse_end(self, call_id: str, outputs: Any, exception: Any = None) -> None:
        pass

    def _find_trace(self, call_id: str) -> Optional["Trace"]:
        """Find the nearest parent trace for a given call_id."""
        if call_id in self._traces:
            return self._traces[call_id]
        # DSPy call_ids may be nested; find the most recent trace
        if self._traces:
            return list(self._traces.values())[-1]
        return None


def auto_instrument(client: "OrchestraAI") -> None:
    """Register OrchestraAI callback with DSPy.

    Args:
        client: OrchestraAI client instance.
    """
    global _client
    _client = client

    try:
        import dspy
    except ImportError:
        raise ImportError("DSPy is not installed. Install with: pip install dspy")

    callback = OrchestraDSPyCallback(client)
    dspy.configure(callbacks=[callback])


def remove_instrumentation() -> None:
    """Remove DSPy callback."""
    global _client
    try:
        import dspy
        dspy.configure(callbacks=[])
    except ImportError:
        pass
    _client = None


__all__ = ["auto_instrument", "remove_instrumentation", "OrchestraDSPyCallback"]
