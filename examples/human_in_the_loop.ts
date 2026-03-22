/**
 * Human-in-the-Loop Agent — traced by OrchestraAI (TypeScript).
 *
 * Shows how to trace an agent that pauses for human approval.
 * The `trace.humanInput()` span captures what was asked, how long
 * the human took, and what they decided.
 *
 * Run:
 *   export ORCHESTRA_API_KEY=oai_...
 *   npx tsx examples/human_in_the_loop.ts
 */

import { OrchestraAI } from '../sdks/typescript/src';

const oa = new OrchestraAI({
  apiKey: process.env.ORCHESTRA_API_KEY!,
  baseUrl: process.env.ORCHESTRA_BASE_URL || 'http://localhost:3001',
});

async function simulateHumanApproval(question: string): Promise<boolean> {
  console.log(`  [HUMAN REVIEW] ${question}`);
  await new Promise((r) => setTimeout(r, 1000));
  return true;
}

async function main() {
  console.log('=== Human-in-the-Loop Agent (TypeScript) ===\n');

  await oa.trace('hitl-agent', async (trace) => {
    // 1. Agent reasons
    console.log('1. Agent planning...');
    const actionSpan = trace.agentAction({
      action: 'plan',
      thought: 'User asked to send email to 500 customers. Need human approval.',
    });
    actionSpan.end();

    // 2. LLM generates action
    console.log('2. LLM call...');
    await trace.llmCall({
      model: 'gpt-4o',
      inputTokens: 200,
      outputTokens: 50,
      inputPreview: 'User: Send promotional email to all customers',
      outputPreview: 'Draft email ready. Requesting approval before sending to 500 recipients.',
    });

    // 3. HUMAN-IN-THE-LOOP — pause for approval
    console.log('3. Requesting human approval...');
    const approvalSpan = trace.humanInput({
      prompt: 'Agent wants to send promotional email to 500 customers. Approve?',
      action: 'approval',
      metadata: { recipients: 500 },
    });

    const approved = await simulateHumanApproval('Send email to 500 customers? [y/n]');
    approvalSpan.setData({ outputPreview: approved ? 'approved' : 'rejected' });
    approvalSpan.end();

    if (approved) {
      // 4. Execute
      console.log('4. Executing approved action...');
      const toolSpan = trace.toolCall({
        toolName: 'send_email',
        toolInput: { template: 'promo_q1', recipients: 500 },
      });
      await new Promise((r) => setTimeout(r, 500));
      toolSpan.setData({ toolOutput: '500 emails sent successfully' });
      toolSpan.end();
      console.log('   500 emails sent.');
    }

    // 5. Summary
    console.log('5. Final summary...');
    await trace.llmCall({
      model: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 30,
      inputPreview: 'Summarize: sent 500 emails with approval',
      outputPreview: 'Promotional email sent to 500 customers after human approval.',
    });
  }, { sessionId: 'hitl-session-001' });

  console.log('\n=== Trace complete ===');
  console.log('Check the dashboard — human_input spans show approval wait time.');
}

main().catch(console.error);
