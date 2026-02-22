import { NextRequest } from "next/server";

const AGENT_BASE =
  process.env.AGENT_API_URL?.replace(/\/api\/agent$/, "") ||
  "http://localhost:3000";

export async function GET(_req: NextRequest) {
  const response = await fetch(`${AGENT_BASE}/api/dashboard`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: `Backend returned ${response.status}` }),
      { status: response.status, headers: { "Content-Type": "application/json" } }
    );
  }

  const data = await response.json();
  return Response.json(data);
}
