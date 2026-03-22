"""Decorator-based tracing for OrchestraAI SDK"""

from functools import wraps
from typing import Any, Callable, Optional, TypeVar, cast

from .types import TraceType

F = TypeVar("F", bound=Callable[..., Any])


def agent_run(
    name: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> Callable[[F], F]:
    """
    Decorator to automatically trace an agent run.
    
    Usage:
        @agent_run("my-agent")
        def run_agent(input: str) -> str:
            # Your agent logic
            return result
    
    Args:
        name: Name of the agent. Defaults to function name.
        metadata: Additional metadata to attach.
    
    Returns:
        Decorated function.
    """
    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Get the OrchestraAI client from kwargs or global
            from . import _global_client
            
            client = kwargs.pop("_orchestra_client", None) or _global_client
            if not client:
                # No client configured, run without tracing
                return func(*args, **kwargs)
            
            agent_name = name or func.__name__
            
            with client.trace(agent_name, metadata=metadata) as trace:
                # Inject trace into kwargs if function accepts it
                kwargs["_trace"] = trace
                try:
                    result = func(*args, **kwargs)
                    return result
                except Exception as e:
                    trace.error(e)
                    raise
        
        return cast(F, wrapper)
    
    return decorator


def tool_call(
    name: Optional[str] = None,
    capture_input: bool = True,
    capture_output: bool = True,
) -> Callable[[F], F]:
    """
    Decorator to automatically trace a tool call.
    
    Usage:
        @tool_call("web_search")
        def search(query: str) -> list[str]:
            # Tool implementation
            return results
    
    Args:
        name: Name of the tool. Defaults to function name.
        capture_input: Whether to capture input arguments.
        capture_output: Whether to capture the output.
    
    Returns:
        Decorated function.
    """
    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            trace = kwargs.pop("_trace", None)
            if not trace:
                # No trace context, run without tracing
                return func(*args, **kwargs)
            
            tool_name = name or func.__name__
            tool_input = None
            if capture_input:
                tool_input = {
                    "args": list(args),
                    "kwargs": {k: v for k, v in kwargs.items() if not k.startswith("_")},
                }
            
            with trace.tool_call(tool_name=tool_name, tool_input=tool_input) as span:
                result = func(*args, **kwargs)
                if capture_output:
                    # Truncate output if too large
                    output_str = str(result)
                    if len(output_str) > 1000:
                        output_str = output_str[:1000] + "..."
                    span.set_data(tool_output=output_str)
                return result
        
        return cast(F, wrapper)
    
    return decorator


def llm_call(
    model: Optional[str] = None,
    capture_preview: bool = True,
) -> Callable[[F], F]:
    """
    Decorator to automatically trace an LLM call.
    
    The decorated function should return a dict with keys:
    - input_tokens: int
    - output_tokens: int
    - latency_ms: int
    - response: str (optional, for output preview)
    
    Usage:
        @llm_call(model="gpt-4o")
        def call_gpt(prompt: str) -> dict:
            response = openai.chat.completions.create(...)
            return {
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens,
                "response": response.choices[0].message.content,
            }
    
    Args:
        model: Name of the model. Can be overridden by return dict.
        capture_preview: Whether to capture input/output previews.
    
    Returns:
        Decorated function.
    """
    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            import time
            
            trace = kwargs.pop("_trace", None)
            if not trace:
                return func(*args, **kwargs)
            
            # Capture input preview
            input_preview = None
            if capture_preview and args:
                input_str = str(args[0]) if args else str(kwargs)
                if len(input_str) > 500:
                    input_str = input_str[:500] + "..."
                input_preview = input_str
            
            start_time = time.time()
            result = func(*args, **kwargs)
            latency_ms = int((time.time() - start_time) * 1000)
            
            # Extract data from result
            model_name = model or result.get("model", "unknown")
            input_tokens = result.get("input_tokens", 0)
            output_tokens = result.get("output_tokens", 0)
            result_latency = result.get("latency_ms", latency_ms)
            
            output_preview = None
            if capture_preview and "response" in result:
                output_str = str(result["response"])
                if len(output_str) > 500:
                    output_str = output_str[:500] + "..."
                output_preview = output_str
            
            trace.record_llm_call(
                model=model_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=result_latency,
                input_preview=input_preview,
                output_preview=output_preview,
            )
            
            return result
        
        return cast(F, wrapper)
    
    return decorator


# Global client for decorator-based tracing
_global_client: Optional["OrchestraAI"] = None


def configure(client: "OrchestraAI") -> None:
    """
    Configure the global OrchestraAI client for decorator-based tracing.
    
    Usage:
        import orchestra_ai
        
        oa = OrchestraAI(api_key="...")
        orchestra_ai.configure(oa)
        
        @agent_run("my-agent")
        def run(): ...
    """
    global _global_client
    _global_client = client


# Type hint import
if False:
    from .client import OrchestraAI
