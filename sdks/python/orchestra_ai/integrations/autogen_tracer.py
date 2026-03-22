"""Microsoft AutoGen integration for OrchestraAI.

Patches AutoGen's ``ConversableAgent`` to capture multi-agent conversations
as traces with per-reply step spans, LLM calls, tool invocations, and
message counting.

Trace tree example::

    agent_run: sender->recipient
      +-- step: reply:assistant (model: gpt-4o)
      |   +-- tool_call: calculator (input, output)
      +-- step: reply:user_proxy
      +-- step: conversation-summary

Usage::

    from orchestra_ai.integrations import autogen_tracer
    autogen_tracer.auto_instrument(oa)

    # All AutoGen agent interactions are now traced
"""

from __future__ import annotations

import functools
import threading
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from ..client import OrchestraAI

_client: Optional["OrchestraAI"] = None
_original_generate_reply: Any = None
_original_initiate_chat: Any = None
# Thread-local storage for the active trace
_active = threading.local()


def _get_active_trace() -> Any:
    return getattr(_active, "trace", None)


def _extract_model_from_agent(agent: Any) -> Optional[str]:
    """Try to extract the model name from an agent's LLM config."""
    llm_config = getattr(agent, "llm_config", None)
    if not llm_config or not isinstance(llm_config, dict):
        return None
    # Direct model key
    model = llm_config.get("model")
    if model:
        return str(model)
    # config_list pattern
    config_list = llm_config.get("config_list", [])
    if config_list and isinstance(config_list, list) and len(config_list) > 0:
        return str(config_list[0].get("model", ""))
    return None


def _detect_tool_calls_in_reply(reply: Any) -> list[dict[str, Any]]:
    """Extract tool/function call info from a reply message."""
    calls: list[dict[str, Any]] = []
    if not reply or not isinstance(reply, (str, dict)):
        return calls

    if isinstance(reply, dict):
        # OpenAI-style function_call in reply
        fc = reply.get("function_call")
        if fc and isinstance(fc, dict):
            calls.append({
                "name": fc.get("name", "unknown"),
                "arguments": str(fc.get("arguments", ""))[:500],
            })
        # OpenAI-style tool_calls list
        tool_calls = reply.get("tool_calls")
        if tool_calls and isinstance(tool_calls, list):
            for tc in tool_calls:
                fn = tc.get("function", {}) if isinstance(tc, dict) else {}
                calls.append({
                    "name": fn.get("name", "unknown"),
                    "arguments": str(fn.get("arguments", ""))[:500],
                })
    return calls


def auto_instrument(client: "OrchestraAI") -> None:
    """Patch AutoGen to send agent interaction traces to OrchestraAI."""
    global _client, _original_generate_reply, _original_initiate_chat
    _client = client

    try:
        from autogen import ConversableAgent
    except ImportError:
        raise ImportError("AutoGen is not installed. Install with: pip install autogen-agentchat")

    # ------------------------------------------------------------------
    # 1. Patch initiate_chat for top-level conversation tracing
    # ------------------------------------------------------------------
    _original_initiate_chat = ConversableAgent.initiate_chat

    @functools.wraps(_original_initiate_chat)
    def patched_initiate_chat(self: Any, recipient: Any, *args: Any, **kwargs: Any) -> Any:
        if not _client:
            return _original_initiate_chat(self, recipient, *args, **kwargs)

        sender_name = getattr(self, "name", "agent")
        recipient_name = getattr(recipient, "name", "agent")
        conversation_name = f"{sender_name}\u2192{recipient_name}"

        with _client.trace(
            agent_name=conversation_name,
            metadata={
                "framework": "autogen",
                "sender": sender_name,
                "recipient": recipient_name,
                "message": str(kwargs.get("message", ""))[:200],
            },
        ) as trace:
            _active.trace = trace
            _active.message_count = 0
            try:
                result = _original_initiate_chat(self, recipient, *args, **kwargs)

                # Record conversation summary
                if hasattr(result, "summary"):
                    with trace.step(
                        "conversation-summary",
                        metadata={
                            "framework": "autogen",
                            "message_count": getattr(_active, "message_count", 0),
                        },
                    ) as span:
                        span.set_data(output_preview=str(result.summary)[:500])

                return result
            finally:
                _active.trace = None
                _active.message_count = 0

    ConversableAgent.initiate_chat = patched_initiate_chat

    # ------------------------------------------------------------------
    # 2. Patch generate_reply for per-message tracing
    # ------------------------------------------------------------------
    _original_generate_reply = ConversableAgent.generate_reply

    @functools.wraps(_original_generate_reply)
    def patched_generate_reply(self: Any, messages: Any = None, sender: Any = None, **kwargs: Any) -> Any:
        trace = _get_active_trace()
        if not trace or not _client:
            return _original_generate_reply(self, messages, sender, **kwargs)

        agent_name = getattr(self, "name", "agent")
        sender_name = getattr(sender, "name", "unknown") if sender else "unknown"
        model = _extract_model_from_agent(self)

        # Increment message counter
        _active.message_count = getattr(_active, "message_count", 0) + 1
        msg_num = _active.message_count

        step_name = f"reply:{agent_name}"

        prev_span_id = trace._current_span_id
        with trace.step(
            step_name,
            metadata={
                "framework": "autogen",
                "agent": agent_name,
                "sender": sender_name,
                "model": model,
                "message_number": msg_num,
                "input_message_count": len(messages) if messages else 0,
            },
        ) as span:
            trace._current_span_id = span.span_id
            try:
                result = _original_generate_reply(self, messages, sender, **kwargs)

                # Set output preview
                reply_text = str(result)[:500] if result else None
                span.set_data(output_preview=reply_text)

                # If the agent has an LLM config, record model info
                if model:
                    span.set_data(model=model)

                # Detect tool/function calls in the reply and create child spans
                tool_calls = _detect_tool_calls_in_reply(result)
                for tc in tool_calls:
                    with trace.tool_call(
                        tool_name=tc["name"],
                        tool_input={"arguments": tc["arguments"]},
                        metadata={"framework": "autogen", "agent": agent_name},
                    ) as tool_span:
                        pass  # actual execution happens inside AutoGen

                return result
            finally:
                trace._current_span_id = prev_span_id

    ConversableAgent.generate_reply = patched_generate_reply


def remove_instrumentation() -> None:
    """Restore original AutoGen methods."""
    global _client, _original_generate_reply, _original_initiate_chat

    if _original_initiate_chat or _original_generate_reply:
        try:
            from autogen import ConversableAgent
            if _original_initiate_chat:
                ConversableAgent.initiate_chat = _original_initiate_chat
            if _original_generate_reply:
                ConversableAgent.generate_reply = _original_generate_reply
        except ImportError:
            pass

    _client = None
    _original_generate_reply = None
    _original_initiate_chat = None
