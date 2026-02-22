import { NextRequest } from "next/server";

const AGENT_BASE =
  process.env.AGENT_API_URL?.replace(/\/api\/agent$/, "") ||
  "http://localhost:3000";

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`${AGENT_BASE}/api/war-room`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Backend returned ${res.status}` }),
        { status: res.status }
      );
    }
    const data = await res.json();
    return Response.json(data);
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to reach backend" }),
      { status: 502 }
    );
  }
}
