import { NextRequest } from "next/server";

export const maxDuration = 300;

const AGENT_URL = process.env.AGENT_API_URL || "http://localhost:3000/api/agent";

// The frontend AI SDK v6 sends UIMessage[] with { role, parts: [{ type: "text", text }] }
// The backend agent expects the classic format: { role, content }
// This proxy transforms between the two formats.

interface UIMessagePart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface IncomingMessage {
  role: string;
  parts?: UIMessagePart[];
  content?: string;
}

function extractContent(msg: IncomingMessage): string {
  // If it already has content (classic format), use it
  if (msg.content) return msg.content;
  // Extract text from parts (UIMessage format)
  if (msg.parts) {
    return msg.parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join("");
  }
  return "";
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Transform UIMessage[] to classic {role, content}[] for the backend
  const messages = (body.messages || []).map((msg: IncomingMessage) => ({
    role: msg.role,
    content: extractContent(msg),
  }));

  const response = await fetch(AGENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, email: body.email }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    return new Response(
      JSON.stringify({ error: `Agent returned ${response.status}: ${errorText}` }),
      { status: response.status, headers: { "Content-Type": "application/json" } }
    );
  }

  // Forward the streaming response from the backend agent
  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "text/plain; charset=utf-8",
    },
  });
}
