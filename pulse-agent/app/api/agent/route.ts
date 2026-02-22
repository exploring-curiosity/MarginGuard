import { streamText, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { agentTools } from "@/lib/agent/tools";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { getGranolaTools } from "@/lib/granola/client";
import { NextRequest } from "next/server";

export const maxDuration = 300; // 5 min timeout for long agent runs

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Cache Granola tools so we only fetch once
let cachedGranolaTools: Record<string, unknown> | null = null;

async function getAllTools() {
  const tools: Record<string, unknown> = { ...agentTools };

  // Merge Granola MCP tools if available
  if (!cachedGranolaTools) {
    cachedGranolaTools = await getGranolaTools();
  }
  if (cachedGranolaTools && Object.keys(cachedGranolaTools).length > 0) {
    Object.assign(tools, cachedGranolaTools);
    console.log("[Agent] Granola tools available:", Object.keys(cachedGranolaTools));
  }

  return tools;
}

export async function POST(req: NextRequest) {
  const { messages, email } = (await req.json()) as {
    messages: ChatMessage[];
    email?: string;
  };

  if (!messages || messages.length === 0) {
    return new Response(JSON.stringify({ error: "No messages provided" }), {
      status: 400,
    });
  }

  let systemPrompt = SYSTEM_PROMPT;

  if (email) {
    systemPrompt += `\n\n## User Contact\nThe user's email address is: ${email}. When sending alerts, use this address unless they specify otherwise.`;
  }

  // Add Granola context if available
  if (cachedGranolaTools && Object.keys(cachedGranolaTools).length > 0) {
    systemPrompt += `\n\n## Meeting Context (Granola)\nYou have access to Granola meeting tools. Use these to reference recent meeting notes, transcripts, and action items when they are relevant to the user's question. Available tools: query_granola_meetings, list_meetings, get_meetings, get_meeting_transcript.`;
  }

  const tools = await getAllTools();

  const result = streamText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    messages,
    tools: tools as typeof agentTools,
    stopWhen: stepCountIs(30),
    onStepFinish: (step) => {
      console.log(`[Agent Step ${step.stepNumber}] finish_reason=${step.finishReason}`);
      if (step.toolCalls && step.toolCalls.length > 0) {
        for (const call of step.toolCalls) {
          console.log(`  → Tool: ${call.toolName}`);
        }
      }
      if (step.text) {
        console.log(`  → Text: ${step.text.substring(0, 80)}...`);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
