/**
 * Test T7: Email alert — run standalone to avoid rate limits
 * npx tsx --env-file=.env.local scripts/test-email.ts
 */
import { generateText, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { agentTools } from "../lib/agent/tools";
import { SYSTEM_PROMPT } from "../lib/agent/system-prompt";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const EMAIL = process.env.TEST_EMAIL ?? "test@example.com";

async function main() {
  console.log(`\nRunning email alert test → sending to ${EMAIL}\n`);

  const toolsUsed: string[] = [];

  const { text, steps } = await generateText({
    model: openai("gpt-4o"),
    system: `${SYSTEM_PROMPT}\n\n## User Contact\nUser email: ${EMAIL}`,
    messages: [
      {
        role: "user",
        content: `Send me a summary of the top 2 most at-risk projects to ${EMAIL} with specific actions I should take this week.`,
      },
    ],
    tools: agentTools,
    stopWhen: stepCountIs(15),
    onStepFinish: (step) => {
      if (step.toolCalls?.length) {
        for (const call of step.toolCalls) {
          toolsUsed.push(call.toolName);
          console.log(`  [Tool] ${call.toolName}`);
        }
      }
    },
  });

  console.log(`\nAgent response (${steps.length} steps, ${toolsUsed.length} tool calls):`);
  console.log("Tools used:", toolsUsed.join(" → "));
  console.log("\n" + text);

  const emailSent = toolsUsed.includes("send_alert_email");
  console.log(`\n${emailSent ? "✅" : "⚠️"} Email tool ${emailSent ? "was called" : "was NOT called"}`);
}

main().catch(console.error);
