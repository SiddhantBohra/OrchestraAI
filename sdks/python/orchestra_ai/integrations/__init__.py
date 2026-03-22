"""Framework integrations for OrchestraAI SDK.

Each integration is lazily imported — the framework SDK is only required
when you actually call auto_instrument().
"""

from . import langgraph_tracer
from . import langchain_tracer
from . import openai_agents_tracer
from . import anthropic_tracer
from . import litellm_tracer
from . import instructor_tracer
from . import crewai_tracer
from . import google_adk_tracer
from . import llamaindex_tracer
from . import autogen_tracer
from . import haystack_tracer
from . import smolagents_tracer
from . import dspy_tracer

__all__ = [
    # LLM SDKs
    "openai_agents_tracer",
    "anthropic_tracer",
    "litellm_tracer",
    "instructor_tracer",
    # Agent frameworks
    "langchain_tracer",
    "langgraph_tracer",
    "crewai_tracer",
    "google_adk_tracer",
    "llamaindex_tracer",
    "autogen_tracer",
    "haystack_tracer",
    "smolagents_tracer",
    "dspy_tracer",
]
