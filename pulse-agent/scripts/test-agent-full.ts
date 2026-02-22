/**
 * Full end-to-end test of all agent capabilities
 * Run: npx tsx --env-file=.env.local scripts/test-agent-full.ts
 */

import { generateText, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { agentTools } from "../lib/agent/tools";
import { SYSTEM_PROMPT } from "../lib/agent/system-prompt";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Error: OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

const openai = createOpenAI({ apiKey });

let testsPassed = 0;
let testsFailed = 0;

async function runTest(label: string, prompt: string, assertions?: (text: string, steps: number) => void) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`PROMPT: "${prompt}"`);
  console.log("─".repeat(60));

  const toolsUsed: string[] = [];

  try {
    const { text, steps } = await generateText({
      model: openai("gpt-4o"),
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      tools: agentTools,
      stopWhen: stepCountIs(15),
      onStepFinish: (step) => {
        if (step.toolCalls?.length) {
          for (const call of step.toolCalls) {
            toolsUsed.push(call.toolName);
            process.stdout.write(`  [Tool] ${call.toolName}\n`);
          }
        }
      },
    });

    console.log(`\nRESPONSE (${steps.length} steps, tools: ${toolsUsed.join(", ")}):`);
    console.log(text);

    if (assertions) {
      assertions(text, steps.length);
    }

    console.log(`\n✅ PASSED`);
    testsPassed++;
  } catch (err) {
    console.error(`\n❌ FAILED: ${err}`);
    testsFailed++;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("PULSE AGENT — FULL END-TO-END TEST SUITE");
  console.log("=".repeat(60));

  // T1: Portfolio overview
  await runTest(
    "T1: Portfolio health scan",
    "How's my portfolio doing?",
    (text, steps) => {
      if (steps < 2) throw new Error(`Expected ≥2 steps, got ${steps}`);
      if (!text.toLowerCase().includes("labor")) throw new Error("Response should mention labor");
    }
  );

  // T2: Worst project deep dive
  await runTest(
    "T2: Worst labor overrun investigation",
    "Which project has the worst labor overrun? Investigate the root cause and tell me which SOV lines are the problem.",
    (text, steps) => {
      if (steps < 3) throw new Error(`Expected ≥3 steps (portfolio + deep dive), got ${steps}`);
    }
  );

  // T3: Field notes signal scan
  await runTest(
    "T3: Field note risk signals",
    "Search the field notes on Greenfield Elementary for any verbal approvals or extra work that wasn't captured in change orders.",
    (text) => {
      if (!text.toLowerCase().includes("verbal") && !text.toLowerCase().includes("field")) {
        throw new Error("Response should discuss field note findings");
      }
    }
  );

  // T4: RFI risk portfolio-wide
  await runTest(
    "T4: RFI risk assessment",
    "What RFIs across the portfolio have cost or schedule impact? Which should I be most worried about?",
    (text) => {
      if (!text.toLowerCase().includes("rfi")) throw new Error("Response should mention RFIs");
    }
  );

  // T5: Billing lag
  await runTest(
    "T5: Billing lag analysis",
    "Are we billing promptly? Which projects have the biggest gap between work done and amounts billed?",
    (text) => {
      if (!text.toLowerCase().includes("bill")) throw new Error("Response should discuss billing");
    }
  );

  // T6: Forecast on specific project
  await runTest(
    "T6: Margin forecast",
    "Forecast the margin at completion for Harbor View Condominiums. What are my recovery options?",
    (text, steps) => {
      if (steps < 2) throw new Error("Should call at least forecast tool");
    }
  );

  // T7: Multi-turn conversation (uses prior context)
  const emailAddress = "test@example.com";
  await runTest(
    "T7: Email alert",
    `Send me a summary of the top 2 most at-risk projects to ${emailAddress} with specific actions I should take this week.`,
    (text) => {
      if (!text.toLowerCase().includes("email") && !text.toLowerCase().includes("sent")) {
        throw new Error("Response should confirm email was sent/attempted");
      }
    }
  );

  // T8: Change order cross-project view
  await runTest(
    "T8: Change order analysis",
    "Break down the change orders across the portfolio by reason category. Which project has the most unresolved exposure?",
    (text) => {
      if (!text.toLowerCase().includes("change order") && !text.toLowerCase().includes("co")) {
        throw new Error("Response should discuss change orders");
      }
    }
  );

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(`TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
  console.log("=".repeat(60));

  if (testsFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
