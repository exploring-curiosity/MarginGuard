import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";

const GRANOLA_MCP_URL = process.env.GRANOLA_MCP_URL ?? "https://mcp.granola.ai/mcp";
const GRANOLA_API_TOKEN = process.env.GRANOLA_API_TOKEN ?? "";

let granolaClient: MCPClient | null = null;

/**
 * Get or create a Granola MCP client.
 * Granola.ai provides meeting notes, transcripts, and context via MCP.
 * Tools: query_granola_meetings, list_meetings, get_meetings, get_meeting_transcript
 *
 * Returns null if GRANOLA_API_TOKEN is not configured.
 */
export async function getGranolaClient(): Promise<MCPClient | null> {
  if (!GRANOLA_API_TOKEN) {
    console.log("[Granola] No GRANOLA_API_TOKEN set — Granola integration disabled");
    return null;
  }

  if (granolaClient) return granolaClient;

  try {
    granolaClient = await createMCPClient({
      transport: {
        type: "http",
        url: GRANOLA_MCP_URL,
        headers: {
          Authorization: `Bearer ${GRANOLA_API_TOKEN}`,
        },
      },
    });
    console.log("[Granola] MCP client connected successfully");
    return granolaClient;
  } catch (error) {
    console.error("[Granola] Failed to connect MCP client:", error);
    return null;
  }
}

/**
 * Get Granola tools to merge into the agent's tool set.
 * Returns an empty object if Granola is not configured.
 */
export async function getGranolaTools(): Promise<Record<string, unknown>> {
  const client = await getGranolaClient();
  if (!client) return {};

  try {
    const tools = await client.tools();
    console.log("[Granola] Loaded tools:", Object.keys(tools));
    return tools as Record<string, unknown>;
  } catch (error) {
    console.error("[Granola] Failed to load tools:", error);
    return {};
  }
}
