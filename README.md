# Pulse AI — HVAC Margin Intelligence Agent

An autonomous AI agent that protects project margin across a portfolio of commercial HVAC construction projects. Built for the CFO of a $50M/year contractor who needs something that **thinks**, not just displays data.

> "How's my portfolio doing?" → The agent scans all projects, investigates root causes, quantifies recovery potential, and emails you a summary — autonomously.

---

## Architecture

```
┌─────────────────────────┐       ┌─────────────────────────┐
│   Frontend (Next.js)    │──────▶│   Backend Agent (Next.js)│
│   v0 + shadcn/ui        │  API  │   Vercel AI SDK v6       │
│   Recharts dashboards   │◀──────│   17 autonomous tools    │
│   Streaming chat panel   │       │   CSV dataset (~18K rows)│
└─────────────────────────┘       └─────────────────────────┘
         │                                    │
         │                          ┌─────────┴──────────┐
         │                          │   Granola.ai MCP    │
         │                          │   Meeting context   │
         │                          └────────────────────┘
         │
         └──── Resend (Email alerts)
```

- **Frontend**: `v0-pulse-hackathon-sync-main/` — Next.js 14, App Router, shadcn/ui, Recharts
- **Backend**: `pulse-agent/` — Next.js API routes, Vercel AI SDK, OpenAI, 17 agent tools

---

## Features

### AI Agent (17 Tools)

| Tool | What It Does |
|------|-------------|
| `scan_portfolio` | Scans all projects, ranks by risk (HIGH/MEDIUM/LOW), computes labor CPI, OT%, billing lag |
| `analyze_project_margin` | Deep-dives a single project — bid vs projected margin, line-item cost overruns |
| `get_labor_analysis` | Role-level labor breakdown, weekly OT trends, crew productivity |
| `get_change_order_summary` | CO pipeline by status, exposure by reason, aging analysis |
| `get_rfi_risk` | RFI risk scoring — open/overdue RFIs with cost exposure flags |
| `analyze_field_notes` | Searches ~1,300 daily field reports for risk signals (rework, delays, verbal approvals) |
| `get_billing_lag` | Compares cumulative billed vs actual field costs — finds under-billed projects |
| `forecast_margin_at_completion` | Earned value forecast — projects margin at completion using CPI trends |
| `compare_with_last_scan` | Diffs current scan against previous snapshot — surfaces KPI changes and new events |
| `build_evidence_pack` | Gathers field notes, pending COs, high-risk RFIs into a cited evidence package |
| `detect_co_leakage` | Finds verbal approvals and scope changes in field notes without matching COs |
| `build_margin_recovery_plan` | Quantifies recovery levers — CO approvals, OT reduction, billing acceleration |
| `build_margin_waterfall` | Step-by-step margin erosion breakdown (bid → labor drag → material drag → forecast) |
| `generate_war_room_packet` | Weekly briefing: top risks, overdue RFIs, aging COs, OT trend, under-billing |
| `draft_pm_email` | Composes a professional action email for the Project Manager with specific dollar amounts |
| `draft_gc_email` | Composes an evidence-backed email to the GC requesting CO approvals |
| `send_alert_email` | Sends formatted HTML email alerts via Resend with priority levels |

### Dashboard (Live Data — No Hardcoded Values)

- **Overview Tab** — Portfolio KPIs (total value, labor overrun, at-risk count, billing status), margin trend chart, labor CPI by project chart, alerts panel
- **Projects Tab** — Sortable project table (revised value, labor CPI, OT%, progress, billing gap, pending COs). Click any row to open a **project deep-dive** with margin waterfall, weekly labor trend, recovery levers, field note signals, and pending COs
- **Reports Tab (War Room)** — Weekly briefing with top risks ranked by severity, CO pipeline summary, portfolio OT trend chart, overdue RFIs, aging change orders, under-billed projects

### Chat Panel (Streaming + Tool Transparency)

- Real-time streaming responses via `streamText()` + `useChat`
- Tool call steps shown with expand/collapse — see what the agent is doing as it works
- Conversational follow-up with full message history
- Quick prompts: "How's my portfolio?", "Which projects need attention?", "Show me the war room briefing"

### Email Alerts

- **Resend integration** with styled HTML templates (Pulse branding, priority badges, timestamps)
- Three priority levels: normal, high, urgent
- Dry-run mode when `RESEND_API_KEY` is not set (logs to console)
- Agent proactively offers to email summaries after analysis

### Granola.ai Integration (MCP)

- Connects to Granola's MCP server at `https://mcp.granola.ai/mcp` via HTTP transport
- Pulls meeting context (transcripts, notes) into agent analysis when `GRANOLA_API_TOKEN` is set
- Tools: `query_granola_meetings`, `list_meetings`, `get_meetings`, `get_meeting_transcript`

### Snapshot Memory

- Persists portfolio scan snapshots to disk (or `/tmp` on Vercel)
- `compare_with_last_scan` diffs current vs previous — surfaces CPI drops, risk escalations, new events
- Retains up to 10 snapshots for trend tracking

---

## Dataset

10 CSV files with ~18,000 records across 8 HVAC construction projects:

| File | Records | Description |
|------|---------|-------------|
| `contracts.csv` | 8 | Base contract info ($1.2M–$14.5M) |
| `sov.csv` | ~80 | Schedule of Values line items |
| `sov_budget.csv` | ~80 | Original bid estimates per line |
| `labor_logs.csv` | ~16,000 | Daily crew time entries |
| `material_deliveries.csv` | ~400 | Material receipts |
| `billing_history.csv` | ~60 | Pay application headers |
| `billing_line_items.csv` | ~500 | Pay app line details |
| `change_orders.csv` | ~50 | COs (approved, pending, rejected) |
| `rfis.csv` | ~100 | Requests for Information |
| `field_notes.csv` | ~1,300 | Unstructured daily field reports |

---

## Tech Stack

- **Frontend**: Next.js 14 (App Router), v0, shadcn/ui, Recharts, Tailwind CSS
- **Backend**: Next.js API Routes, Vercel AI SDK v6 (`streamText`, `tool`, `zodSchema`)
- **LLM**: OpenAI (GPT-4o)
- **Email**: Resend
- **MCP**: Granola.ai via `@ai-sdk/mcp`
- **Data**: CSV files loaded once per process via `papaparse`

---

## Getting Started

### Prerequisites

- Node.js 18+
- OpenAI API key
- (Optional) Resend API key for email alerts
- (Optional) Granola API token for meeting context

### 1. Install dependencies

```bash
cd pulse-agent && npm install
cd ../v0-pulse-hackathon-sync-main && npm install
```

### 2. Configure environment

**`pulse-agent/.env.local`**:
```env
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...          # optional
RESEND_FROM_EMAIL=alerts@...   # optional
GRANOLA_API_TOKEN=...          # optional
```

**`v0-pulse-hackathon-sync-main/.env.local`**:
```env
AGENT_API_URL=http://localhost:3000/api/agent
```

### 3. Run both servers

```bash
# Terminal 1 — Backend (port 3000)
cd pulse-agent && npm run dev

# Terminal 2 — Frontend (port 3001)
cd v0-pulse-hackathon-sync-main && npm run dev -- -p 3001
```

Open [http://localhost:3001](http://localhost:3001)

---

## Deployment (Vercel)

This is a monorepo with two Next.js apps. Deploy as two separate Vercel projects from the same GitHub repo:

1. **Backend** — Root Directory: `pulse-agent`, add `OPENAI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
2. **Frontend** — Root Directory: `v0-pulse-hackathon-sync-main`, add `AGENT_API_URL=https://<backend-url>/api/agent`

---

## Project Structure

```
Pulse_v0/
├── pulse-agent/                    # Backend AI agent
│   ├── app/api/
│   │   ├── agent/route.ts          # Main agent endpoint (streaming)
│   │   ├── dashboard/route.ts      # Portfolio dashboard data
│   │   ├── war-room/route.ts       # War room briefing
│   │   └── project/[id]/route.ts   # Project deep-dive
│   ├── lib/
│   │   ├── agent/
│   │   │   ├── tools.ts            # 17 agent tools
│   │   │   └── system-prompt.ts    # Agent persona & instructions
│   │   ├── data/
│   │   │   ├── loader.ts           # CSV parser & aggregator
│   │   │   └── snapshot.ts         # Scan snapshot persistence
│   │   ├── email/send.ts           # Resend email sender
│   │   └── granola/client.ts       # Granola MCP client
│   └── data/                       # CSV dataset files
│
├── v0-pulse-hackathon-sync-main/   # Frontend dashboard
│   ├── app/
│   │   ├── page.tsx                # Main dashboard page
│   │   └── api/                    # Proxy routes to backend
│   ├── components/dashboard/
│   │   ├── chat-panel.tsx          # Streaming chat with tool steps
│   │   ├── kpi-cards.tsx           # Portfolio KPI cards
│   │   ├── project-table.tsx       # Clickable project table
│   │   ├── margin-chart.tsx        # Portfolio margin trend
│   │   ├── project-margin-chart.tsx# Labor CPI by project
│   │   ├── alerts-panel.tsx        # Risk alerts
│   │   ├── war-room.tsx            # War room briefing
│   │   └── project-detail.tsx      # Project deep-dive panel
│   └── lib/use-dashboard-data.ts   # Data fetching hook & context
│
└── hvac_construction_dataset/      # Raw dataset + README
```
