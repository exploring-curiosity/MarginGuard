/**
 * End-to-end agent test — calls the agent directly via Vercel AI SDK
 * Run: npx tsx --env-file=.env.local scripts/test-agent.ts
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

async function runTest(prompt: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`USER: ${prompt}`);
  console.log("=".repeat(60));

  const { text, steps } = await generateText({
    model: openai("gpt-4o"),
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    tools: agentTools,
    stopWhen: stepCountIs(15),
    onStepFinish: (step) => {
      if (step.toolCalls && step.toolCalls.length > 0) {
        for (const call of step.toolCalls) {
          process.stdout.write(`\n  [Tool] ${call.toolName}\n`);
        }
      }
    },
  });

  console.log(`\nAGENT (${steps.length} steps):\n${text}`);
  return text;
}

async function main() {
  console.log("Starting Pulse agent tests...\n");

  // Test 1: Portfolio scan
  await runTest("How's my portfolio doing? Give me a quick health check.");

  // Test 2: Deep dive on a specific project signal
  await runTest("Which project has the worst labor overrun and what's causing it?");

  // Test 3: Change order pipeline
  await runTest("What's the pending change order exposure across the portfolio?");

  console.log("\n✅ Tests complete.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
