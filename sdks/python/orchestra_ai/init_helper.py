"""One-line initialization for OrchestraAI.

Usage::

    import orchestraai
    orchestraai.init(api_key="oai_...")  # That's it. Everything is traced.

    # Or with env var:
    #   ORCHESTRA_API_KEY=oai_... python my_agent.py
    import orchestraai
    orchestraai.init()
"""

from __future__ import annotations

import os
from typing import Optional

from .client import OrchestraAI

_global_client: Optional[OrchestraAI] = None


def init(
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    agent_name: Optional[str] = None,
    auto_instrument: bool = True,
    frameworks: Optional[list[str]] = None,
) -> OrchestraAI:
    """Initialize OrchestraAI with one line. Auto-patches all detected frameworks.

    Args:
        api_key: API key. Falls back to ``ORCHESTRA_API_KEY`` env var.
        base_url: API URL. Falls back to ``ORCHESTRA_BASE_URL`` env var.
        agent_name: Default agent name for auto-instrumented traces.
        auto_instrument: If True (default), patches all detected frameworks.
        frameworks: Explicit list of frameworks to patch. If None, auto-detects.
            Options: ``"langchain"``, ``"langgraph"``, ``"openai"``,
            ``"llamaindex"``, ``"crewai"``

    Returns:
        The configured OrchestraAI client.

    Example::

        import orchestraai
        oa = orchestraai.init(api_key="oai_...")

        # Everything is now traced automatically.
        # Or use the client for manual tracing:
        with oa.trace("my-agent") as trace:
            trace.llm_call(response=openai_response)
    """
    global _global_client

    client = OrchestraAI(
        api_key=api_key,
        base_url=base_url,
    )
    _global_client = client

    if auto_instrument:
        _auto_patch(client, agent_name=agent_name, frameworks=frameworks)

    return client


def get_client() -> Optional[OrchestraAI]:
    """Get the global OrchestraAI client (set by ``init()``)."""
    return _global_client


def _auto_patch(
    client: OrchestraAI,
    agent_name: Optional[str] = None,
    frameworks: Optional[list[str]] = None,
) -> None:
    """Detect and patch installed frameworks."""
    name = agent_name or "auto-agent"
    targets = frameworks or ["openai", "langchain", "langgraph", "llamaindex", "crewai"]
    patched = []

    for fw in targets:
        try:
            if fw == "openai":
                import openai  # noqa: F401
                from .integrations.openai_agents_tracer import auto_instrument
                auto_instrument(client)
                patched.append("openai")

            elif fw == "langchain":
                import langchain  # noqa: F401
                # LangChain handler is injected per-call, not globally patched.
                # But we can set it as a default callback.
                _set_langchain_default_handler(client, name)
                patched.append("langchain")

            elif fw == "langgraph":
                import langgraph  # noqa: F401
                from .integrations.langgraph_tracer import auto_instrument
                auto_instrument(client)
                patched.append("langgraph")

            elif fw == "llamaindex":
                try:
                    import llama_index  # noqa: F401
                    from .integrations.llamaindex_tracer import auto_instrument
                    auto_instrument(client, agent_name=name)
                    patched.append("llamaindex")
                except ImportError:
                    try:
                        import workflows  # noqa: F401
                        from .integrations.llamaindex_tracer import auto_instrument
                        auto_instrument(client, agent_name=name)
                        patched.append("llamaindex-workflows")
                    except ImportError:
                        pass

            elif fw == "crewai":
                import crewai  # noqa: F401
                from .integrations.crewai_tracer import auto_instrument
                auto_instrument(client)
                patched.append("crewai")

        except ImportError:
            pass  # Framework not installed, skip
        except Exception as e:
            print(f"[OrchestraAI] Warning: failed to patch {fw}: {e}")

    if patched:
        print(f"[OrchestraAI] Initialized. Auto-instrumented: {', '.join(patched)}")
    else:
        print("[OrchestraAI] Initialized. No frameworks auto-detected — use manual tracing.")


def _set_langchain_default_handler(client: OrchestraAI, agent_name: str) -> None:
    """Try to set OrchestraAI as a default LangChain callback."""
    try:
        # LangChain v0.2+ has a global callback manager
        from langchain_core.callbacks import CallbackManager
        from .integrations.langchain_tracer import get_handler

        handler = get_handler(client, agent_name=agent_name)

        # Try to add to default callbacks
        try:
            import langchain_core.globals as lc_globals
            if hasattr(lc_globals, '_default_config'):
                existing = lc_globals._default_config.get("callbacks", []) or []
                lc_globals._default_config["callbacks"] = [*existing, handler]
            else:
                # Fallback: store handler for manual injection
                pass
        except Exception:
            pass
    except ImportError:
        pass
