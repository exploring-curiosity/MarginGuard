import { NextRequest } from "next/server";

const AGENT_BASE =
  process.env.AGENT_API_URL?.replace(/\/api\/agent$/, "") ||
  "http://localhost:3000";

function backendHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    h["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  return h;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const res = await fetch(`${AGENT_BASE}/api/project/${id}`, {
      headers: backendHeaders(),
      cache: "no-store",
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
