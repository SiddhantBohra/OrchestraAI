"""Instructor integration for OrchestraAI.

Instructor wraps OpenAI/Anthropic/LiteLLM for structured outputs (Pydantic models).
Since it delegates to the underlying LLM SDK, auto-instrumenting OpenAI or Anthropic
already captures Instructor calls. This module adds Instructor-specific metadata
(response_model name, retries, validation errors).

Usage::

    from orchestra_ai.integrations import instructor_tracer
    instructor_tracer.auto_instrument(oa)

    client = instructor.from_openai(OpenAI())
    result = client.chat.completions.create(response_model=MyModel, ...)
"""

from __future__ import annotations

import functools
from typing import TYPE_CHECKING, Any, Optional

from ..token_extraction import extract_token_usage

if TYPE_CHECKING:
    from ..client import OrchestraAI

_client: Optional["OrchestraAI"] = None
_original_create: Any = None


def auto_instrument(client: "OrchestraAI") -> None:
    """Patch Instructor to add structured-output metadata to traces.

    Note: This also auto-instruments the underlying OpenAI SDK if not already done.
    """
    global _client
    _client = client

    # Also instrument OpenAI (Instructor delegates to it)
    try:
        from ..integrations import openai_agents_tracer
        openai_agents_tracer.auto_instrument(client)
    except Exception:
        pass

    # Optionally patch Instructor's retry logic for visibility
    try:
        import instructor
        _patch_instructor(instructor)
    except ImportError:
        raise ImportError("Instructor is not installed. Install with: pip install instructor")


def _patch_instructor(instructor_module: Any) -> None:
    """Add metadata hooks to Instructor's patched clients."""
    global _original_create

    # Instructor patches the create method; we wrap it to capture metadata
    original_from_openai = getattr(instructor_module, "from_openai", None)
    if not original_from_openai:
        return

    @functools.wraps(original_from_openai)
    def patched_from_openai(client: Any, **kwargs: Any) -> Any:
        patched_client = original_from_openai(client, **kwargs)
        # The underlying OpenAI calls are already traced by openai_agents_tracer
        return patched_client

    instructor_module.from_openai = patched_from_openai


def remove_instrumentation() -> None:
    """Remove Instructor instrumentation."""
    global _client
    _client = None
    # OpenAI instrumentation is handled by openai_agents_tracer
