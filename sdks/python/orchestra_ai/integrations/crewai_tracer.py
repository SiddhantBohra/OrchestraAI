"""CrewAI integration for OrchestraAI SDK"""

from typing import TYPE_CHECKING, Any, Optional
import functools

if TYPE_CHECKING:
    from ..client import OrchestraAI


_client: Optional["OrchestraAI"] = None


def auto_instrument(client: "OrchestraAI") -> None:
    """
    Automatically instrument CrewAI to send traces to OrchestraAI.
    
    This patches CrewAI to capture:
    - Crew kickoff as agent_run
    - Agent task execution as steps
    - Tool usage
    - LLM calls
    
    Usage:
        from orchestra_ai import OrchestraAI
        from orchestra_ai.integrations import crewai_tracer
        
        oa = OrchestraAI(api_key="...")
        crewai_tracer.auto_instrument(oa)
        
        # Now all CrewAI runs will be traced
        crew = Crew(agents=[...], tasks=[...])
        crew.kickoff()
    
    Args:
        client: The OrchestraAI client instance.
    """
    global _client
    _client = client
    
    try:
        from crewai import Crew
    except ImportError:
        raise ImportError(
            "CrewAI is not installed. Install with: pip install crewai"
        )
    
    # Patch Crew.kickoff
    original_kickoff = Crew.kickoff
    
    @functools.wraps(original_kickoff)
    def patched_kickoff(self: Any, inputs: Any = None) -> Any:
        if not _client:
            return original_kickoff(self, inputs)
        
        crew_name = getattr(self, "name", None) or "crewai-crew"
        
        # Get agent names
        agent_names = []
        if hasattr(self, "agents"):
            for agent in self.agents:
                if hasattr(agent, "role"):
                    agent_names.append(agent.role)
        
        with _client.trace(
            agent_name=crew_name,
            metadata={
                "framework": "crewai",
                "agents": agent_names,
                "task_count": len(getattr(self, "tasks", [])),
            },
        ) as trace:
            result = original_kickoff(self, inputs)
            return result
    
    Crew.kickoff = patched_kickoff
    
    # Patch async kickoff if available
    if hasattr(Crew, "kickoff_async"):
        original_kickoff_async = Crew.kickoff_async
        
        @functools.wraps(original_kickoff_async)
        async def patched_kickoff_async(self: Any, inputs: Any = None) -> Any:
            if not _client:
                return await original_kickoff_async(self, inputs)
            
            crew_name = getattr(self, "name", None) or "crewai-crew"
            
            with _client.trace(
                agent_name=crew_name,
                metadata={"framework": "crewai"},
            ) as trace:
                result = await original_kickoff_async(self, inputs)
                return result
        
        Crew.kickoff_async = patched_kickoff_async


def remove_instrumentation() -> None:
    """Remove CrewAI instrumentation."""
    global _client
    _client = None
