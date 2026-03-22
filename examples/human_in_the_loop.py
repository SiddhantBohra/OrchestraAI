"""
Human-in-the-Loop Agent — traced by OrchestraAI.

Shows how to trace an agent that pauses for human approval before executing
sensitive actions. The `trace.human_input()` span captures:
- What the agent asked the human
- How long the human took to respond
- Whether the action was approved or rejected

Works with: LangGraph interrupt_before, CrewAI human_input=True, custom agents.

Prerequisites:
    pip install -e sdks/python

Run:
    export ORCHESTRA_API_KEY=oai_...
    python examples/human_in_the_loop.py
"""

import os
import time
from orchestra_ai import OrchestraAI

oa = OrchestraAI(
    api_key=os.environ["ORCHESTRA_API_KEY"],
    base_url=os.getenv("ORCHESTRA_BASE_URL", "http://localhost:3001"),
)

print("=== Human-in-the-Loop Agent with OrchestraAI Tracing ===\n")


def simulate_human_approval(question: str) -> bool:
    """Simulate a human reviewing and approving/rejecting an action."""
    print(f"  [HUMAN REVIEW] {question}")
    time.sleep(1)  # Simulate human think time
    return True  # Auto-approve for demo


with oa.trace("hitl-agent", session_id="hitl-session-001") as trace:

    # Step 1: Agent reasons about what to do
    print("1. Agent planning...")
    with trace.agent_action(
        "plan",
        thought="User asked to delete old backups. I need human approval first.",
    ):
        pass

    # Step 2: LLM generates the action plan
    print("2. LLM call to generate action...")
    with trace.llm_call(
        model="gpt-4o",
        input_tokens=200,
        output_tokens=50,
        input_preview="User: Delete all backups older than 30 days",
        output_preview="I'll delete 47 backup files from /data/backups/. Requesting approval.",
    ):
        pass

    # Step 3: HUMAN-IN-THE-LOOP — agent pauses for approval
    print("3. Requesting human approval...")
    with trace.human_input(
        prompt="Agent wants to delete 47 backup files from /data/backups/. Approve?",
        action="approval",
        metadata={"files_count": 47, "path": "/data/backups/"},
    ) as approval_span:
        approved = simulate_human_approval("Delete 47 backup files? [y/n]")
        approval_span.set_data(
            output_preview="approved" if approved else "rejected",
        )

    if approved:
        # Step 4: Execute the approved action
        print("4. Executing approved action...")
        with trace.tool_call(
            "delete_files",
            tool_input={"path": "/data/backups/", "older_than_days": 30},
        ) as tool_span:
            time.sleep(0.5)  # Simulate deletion
            tool_span.set_data(tool_output="Deleted 47 files (2.3 GB freed)")
        print("   Deleted 47 files.")
    else:
        print("4. Action rejected by human. Skipping.")
        trace.error(Exception("Action rejected by human"))

    # Step 5: Second HITL — feedback request
    print("5. Requesting human feedback...")
    with trace.human_input(
        prompt="Operation complete. Any additional instructions?",
        action="feedback",
    ) as feedback_span:
        time.sleep(0.5)
        feedback_span.set_data(output_preview="Looks good, no further action needed.")

    # Step 6: Final LLM summary
    print("6. Generating summary...")
    with trace.llm_call(
        model="gpt-4o",
        input_tokens=150,
        output_tokens=30,
        input_preview="Summarize: deleted 47 backups, human approved",
        output_preview="Successfully cleaned up 47 old backup files with human approval.",
    ):
        pass

print("\n=== Trace complete ===")
print("Check http://localhost:3000/dashboard/traces — you'll see:")
print("  agent_run → agent_action → llm_call → human_input (approval)")
print("           → tool_call → human_input (feedback) → llm_call")
oa.close()
