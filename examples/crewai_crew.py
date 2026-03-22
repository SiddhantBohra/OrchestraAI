"""
CrewAI Multi-Agent Crew — traced by OrchestraAI.

Auto-instruments CrewAI's `Crew.kickoff()` to capture the full crew run
as an OrchestraAI agent trace, including agent names and task metadata.

Prerequisites:
    pip install -e sdks/python
    pip install crewai crewai-tools

Run:
    export ORCHESTRA_API_KEY=oai_...
    export OPENAI_API_KEY=sk-...
    python examples/crewai_crew.py
"""

import os
from orchestra_ai import OrchestraAI
from orchestra_ai.integrations import crewai_tracer

from crewai import Agent, Task, Crew

# ── Setup ──────────────────────────────────────────────────────
oa = OrchestraAI(
    api_key=os.environ["ORCHESTRA_API_KEY"],
    base_url=os.getenv("ORCHESTRA_BASE_URL", "http://localhost:3001"),
)

# Auto-instrument CrewAI — patches Crew.kickoff()
crewai_tracer.auto_instrument(oa)

# ── Define Agents ──────────────────────────────────────────────
researcher = Agent(
    role="Research Analyst",
    goal="Find comprehensive information about AI agent observability",
    backstory="You are a senior research analyst specializing in AI infrastructure.",
    verbose=True,
)

writer = Agent(
    role="Technical Writer",
    goal="Write clear, concise technical summaries",
    backstory="You are a technical writer who turns complex research into readable docs.",
    verbose=True,
)

# ── Define Tasks ───────────────────────────────────────────────
research_task = Task(
    description="Research the current state of AI agent observability platforms. "
    "Cover: what they monitor, how they integrate, key features.",
    expected_output="A structured research report with key findings.",
    agent=researcher,
)

writing_task = Task(
    description="Based on the research, write a 200-word summary of "
    "what makes a good AI agent observability platform.",
    expected_output="A concise 200-word summary.",
    agent=writer,
)

# ── Run Crew (auto-traced!) ────────────────────────────────────
print("=== CrewAI Crew with OrchestraAI Tracing ===\n")

crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    verbose=True,
)

result = crew.kickoff()
print(f"\n--- Result ---\n{result}")

print("\nCheck traces at http://localhost:3000/dashboard/traces")
oa.close()
