"""Microsoft AutoGen integration for OrchestraAI.

Patches AutoGen's ``ConversableAgent.generate_reply`` to capture multi-agent
conversations as traces with LLM calls, tool invocations, and message passing.

Usage::

    from orchestra_ai.integrations import autogen_tracer
    autogen_tracer.auto_instrument(oa)

    # All AutoGen agent interactions are now traced
"""

from __future__ import annotations

import functools
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from ..client import OrchestraAI

_client: Optional["OrchestraAI"] = None
_original_generate_reply: Any = None
_original_initiate_chat: Any = None


def auto_instrument(client: "OrchestraAI") -> None:
    """Patch AutoGen to send agent interaction traces to OrchestraAI."""
    global _client, _original_generate_reply, _original_initiate_chat
    _client = client

    try:
        from autogen import ConversableAgent
    except ImportError:
        raise ImportError("AutoGen is not installed. Install with: pip install autogen-agentchat")

    # Patch initiate_chat for top-level conversation tracing
    _original_initiate_chat = ConversableAgent.initiate_chat

    @functools.wraps(_original_initiate_chat)
    def patched_initiate_chat(self: Any, recipient: Any, *args: Any, **kwargs: Any) -> Any:
        if not _client:
            return _original_initiate_chat(self, recipient, *args, **kwargs)

        sender_name = getattr(self, "name", "agent")
        recipient_name = getattr(recipient, "name", "agent")
        conversation_name = f"{sender_name}→{recipient_name}"

        with _client.trace(
            agent_name=conversation_name,
            metadata={
                "framework": "autogen",
                "sender": sender_name,
                "recipient": recipient_name,
                "message": str(kwargs.get("message", ""))[:200],
            },
        ) as trace:
            result = _original_initiate_chat(self, recipient, *args, **kwargs)

            # Record the conversation summary
            if hasattr(result, "summary"):
                step = trace.step("conversation-summary")
                step.set_data(output_preview=str(result.summary)[:500])
                step.end()

            return result

    ConversableAgent.initiate_chat = patched_initiate_chat

    # Patch generate_reply for per-message tracing
    _original_generate_reply = ConversableAgent.generate_reply

    @functools.wraps(_original_generate_reply)
    def patched_generate_reply(self: Any, messages: Any = None, sender: Any = None, **kwargs: Any) -> Any:
        if not _client:
            return _original_generate_reply(self, messages, sender, **kwargs)

        agent_name = getattr(self, "name", "agent")
        sender_name = getattr(sender, "name", "unknown") if sender else "unknown"

        # The reply generation is an LLM call or tool call
        result = _original_generate_reply(self, messages, sender, **kwargs)
        return result

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
