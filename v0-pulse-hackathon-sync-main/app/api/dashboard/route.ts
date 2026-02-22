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

export async function GET(_req: NextRequest) {
  try {
    const response = await fetch(`${AGENT_BASE}/api/dashboard`, {
      method: "GET",
      headers: backendHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`Dashboard proxy: backend returned ${response.status}`, text.slice(0, 200));
      return new Response(
        JSON.stringify({ error: `Backend returned ${response.status}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error("Dashboard proxy error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to reach backend" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
