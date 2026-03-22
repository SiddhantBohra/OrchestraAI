"""OrchestraAI Client"""

import os
from typing import Optional, Dict, Any
import httpx

from .tracer import Trace
from .types import AgentKilledException, IngestEvent


class OrchestraAI:
    """
    Main client for OrchestraAI SDK.
    
    Usage:
        oa = OrchestraAI(api_key="your-api-key")
        
        with oa.trace("my-agent") as trace:
            result = trace.llm_call(model="gpt-4o", ...)
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        enabled: bool = True,
    ):
        """
        Initialize the OrchestraAI client.
        
        Args:
            api_key: Your OrchestraAI API key. Defaults to ORCHESTRA_API_KEY env var.
            base_url: API base URL. Defaults to ORCHESTRA_BASE_URL or production URL.
            timeout: HTTP request timeout in seconds.
            enabled: Whether tracing is enabled. Useful for disabling in tests.
        """
        self.api_key = api_key or os.getenv("ORCHESTRA_API_KEY")
        self.base_url = (
            base_url 
            or os.getenv("ORCHESTRA_BASE_URL") 
            or "https://api.orchestra-ai.dev"
        )
        self.timeout = timeout
        self.enabled = enabled
        self._client: Optional[httpx.Client] = None
        self._async_client: Optional[httpx.AsyncClient] = None
        
        if not self.api_key and self.enabled:
            raise ValueError(
                "OrchestraAI API key is required. "
                "Pass api_key parameter or set ORCHESTRA_API_KEY environment variable."
            )
    
    @property
    def client(self) -> httpx.Client:
        """Get or create the sync HTTP client."""
        if self._client is None:
            self._client = httpx.Client(
                base_url=self.base_url,
                timeout=self.timeout,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "orchestra-ai-python/0.1.0",
                },
            )
        return self._client
    
    @property
    def async_client(self) -> httpx.AsyncClient:
        """Get or create the async HTTP client."""
        if self._async_client is None:
            self._async_client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "orchestra-ai-python/0.1.0",
                },
            )
        return self._async_client
    
    def trace(
        self,
        agent_name: str,
        agent_id: Optional[str] = None,
        session_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Trace:
        """
        Start a new trace for an agent run.

        Args:
            agent_name: Name of the agent.
            agent_id: Unique ID for the agent. Auto-generated if not provided.
            session_id: Session/thread ID for multi-turn conversations.
            metadata: Additional metadata to attach to the trace.

        Returns:
            A Trace context manager.
        """
        return Trace(
            client=self,
            agent_name=agent_name,
            agent_id=agent_id,
            session_id=session_id,
            metadata=metadata,
            enabled=self.enabled,
        )
    
    def send_event(self, event: IngestEvent) -> Dict[str, Any]:
        """
        Send a single event to the ingest API.
        
        Args:
            event: The event to send.
        
        Returns:
            API response data.
        """
        if not self.enabled:
            return {"ok": True, "disabled": True}
        
        response = self.client.post(
            "/api/ingest/event",
            json=event.model_dump(exclude_none=True, by_alias=True),
        )
        response.raise_for_status()
        return response.json()
    
    async def send_event_async(self, event: IngestEvent) -> Dict[str, Any]:
        """
        Send a single event to the ingest API asynchronously.
        
        Args:
            event: The event to send.
        
        Returns:
            API response data.
        """
        if not self.enabled:
            return {"ok": True, "disabled": True}
        
        response = await self.async_client.post(
            "/api/ingest/event",
            json=event.model_dump(exclude_none=True, by_alias=True),
        )
        response.raise_for_status()
        return response.json()
    
    def send_events_batch(self, events: list[IngestEvent]) -> Dict[str, Any]:
        """
        Send multiple events to the ingest API.

        Args:
            events: List of events to send.

        Returns:
            API response data.

        Raises:
            AgentKilledException: If the API returns a kill/block action (budget exceeded, runaway, etc.).
        """
        if not self.enabled:
            return {"ok": True, "disabled": True, "count": len(events)}

        response = self.client.post(
            "/api/ingest/batch",
            json={"events": [e.model_dump(exclude_none=True, by_alias=True) for e in events]},
        )

        # Parse kill/block signals from 403 responses
        if response.status_code == 403:
            self._handle_forbidden(response)

        response.raise_for_status()
        return response.json()

    def _handle_forbidden(self, response: "httpx.Response") -> None:
        """Check if a 403 is a kill/block signal and raise AgentKilledException."""
        try:
            body = response.json()
        except Exception:
            response.raise_for_status()
            return

        action = body.get("action") or ""
        message = body.get("message") or body.get("reason") or "Policy violation"
        policy_id = body.get("policyId")

        if action in ("kill", "block"):
            raise AgentKilledException(reason=message, policy_id=policy_id, action=action)

        # Not a kill — raise the normal HTTP error
        response.raise_for_status()
    
    def close(self) -> None:
        """Close the HTTP clients."""
        if self._client:
            self._client.close()
            self._client = None
        if self._async_client:
            # Note: for proper async cleanup, use `await oa.aclose()`
            pass
    
    async def aclose(self) -> None:
        """Close the async HTTP client."""
        if self._async_client:
            await self._async_client.aclose()
            self._async_client = None
        self.close()
    
    def __enter__(self) -> "OrchestraAI":
        return self
    
    def __exit__(self, *args: Any) -> None:
        self.close()
    
    async def __aenter__(self) -> "OrchestraAI":
        return self
    
    async def __aexit__(self, *args: Any) -> None:
        await self.aclose()
