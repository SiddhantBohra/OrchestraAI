"""
Kill Switch Demo — OrchestraAI stops a runaway agent mid-execution.

This script creates a project with a tiny $0.05 budget, then runs an agent
that makes LLM calls in a loop. When the budget is exhausted, the API
returns a kill signal and the SDK raises AgentKilledException, halting
the agent immediately.

Prerequisites:
    1. API running: npm run dev:api
    2. Docker: docker compose up -d postgres redis

Usage:
    source .venv/bin/activate
    python examples/kill_switch_demo.py
"""

import time
import httpx
from orchestra_ai import OrchestraAI, AgentKilledException

API_URL = "http://localhost:3001"


def setup_project_with_tiny_budget() -> tuple[str, str]:
    """Register user, create project with $0.05 budget + kill switch enabled."""

    # Register (ignore if already exists)
    httpx.post(f"{API_URL}/api/auth/register", json={
        "email": "killswitch-demo@example.com",
        "password": "DemoPass123!",
        "name": "Kill Switch Demo",
    })

    # Login
    auth = httpx.post(f"{API_URL}/api/auth/login", json={
        "email": "killswitch-demo@example.com",
        "password": "DemoPass123!",
    }).json()
    token = auth["accessToken"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create project with a very small budget
    project = httpx.post(f"{API_URL}/api/projects", headers=headers, json={
        "name": "Kill Switch Demo Project",
        "budgetLimit": 0.05,  # Only $0.05 — will be exhausted in ~3 LLM calls
        "killSwitchEnabled": True,
    }).json()

    raw_key = project.get("rawApiKey") or project.get("apiKey")
    project_id = project["id"]

    print(f"  Project: {project['name']} (id={project_id[:12]}...)")
    print(f"  Budget:  ${project['budgetLimit']}")
    print(f"  Kill Switch: enabled")

    # Create default policies (includes runaway detection)
    httpx.post(f"{API_URL}/api/projects/{project_id}/policies/defaults", headers=headers)

    return raw_key, project_id


def run_agent_until_killed(api_key: str):
    """Simulate an agent making LLM calls in a loop until killed."""

    oa = OrchestraAI(api_key=api_key, base_url=API_URL)

    print("\n  Starting agent loop (will be killed when budget exhausted)...\n")

    try:
        with oa.trace("runaway-demo-agent") as trace:
            call_count = 0
            while True:
                call_count += 1

                # Simulate an expensive LLM call (gpt-4o costs ~$0.02 per call at these token counts)
                span = trace.llm_call(
                    model="gpt-4o",
                    input_tokens=1000,
                    output_tokens=500,
                    input_preview=f"Call #{call_count}: Summarize this document...",
                    output_preview="Here is the summary of the document...",
                )
                span.end()

                print(f"    Call #{call_count} — sent (cost ~$0.0125 per call)")
                time.sleep(0.3)  # Brief pause between calls

    except AgentKilledException as e:
        print(f"\n  KILLED after {call_count} calls!")
        print(f"  Reason: {e.reason}")
        print(f"  Action: {e.action}")
        return call_count

    except Exception as e:
        print(f"\n  Stopped: {e}")
        return call_count


def verify_budget(api_key: str, project_id: str):
    """Check the project budget after the agent was killed."""

    # Login again to check budget
    auth = httpx.post(f"{API_URL}/api/auth/login", json={
        "email": "killswitch-demo@example.com",
        "password": "DemoPass123!",
    }).json()
    headers = {"Authorization": f"Bearer {auth['accessToken']}"}

    budget = httpx.get(f"{API_URL}/api/projects/{project_id}/budget", headers=headers).json()
    print(f"\n  Budget remaining: ${budget['remaining']:.4f}")
    print(f"  Allowed: {budget['allowed']}")


if __name__ == "__main__":
    print("=" * 60)
    print("  OrchestraAI Kill Switch Demo")
    print("=" * 60)

    print("\n[1] Setting up project with $0.05 budget...")
    api_key, project_id = setup_project_with_tiny_budget()

    print("\n[2] Running agent in a loop...")
    calls = run_agent_until_killed(api_key)

    print("\n[3] Verifying budget state...")
    verify_budget(api_key, project_id)

    print("\n" + "=" * 60)
    print(f"  Demo complete — agent was killed after {calls} calls")
    print(f"  The kill switch prevented unlimited spending.")
    print("=" * 60)
