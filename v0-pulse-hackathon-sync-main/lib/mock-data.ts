export interface Project {
  id: string
  name: string
  client: string
  gcName: string
  contractValue: number
  bidMargin: number
  currentMargin: number
  percentComplete: number
  status: "healthy" | "at-risk" | "critical"
  laborBudget: number
  laborActual: number
  materialBudget: number
  materialActual: number
  changeOrdersPending: number
  changeOrdersValue: number
  approvedCOValue: number
  billingLag: number
  completionDate: string
  lastUpdated: string
  openRFIs: number
  retentionHeld: number
}

export interface AgentStep {
  id: string
  type: "thinking" | "tool-call" | "result" | "observation"
  content: string
  tool?: string
  timestamp: string
  duration?: number
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  steps?: AgentStep[]
  timestamp: string
}

// Data derived from the HVAC Construction Dataset
// https://github.com/pulse-ai-nyc/Hackathon-5/tree/main/hvac_construction_dataset
//
// Contracts: 5 projects, $100.988M total contract value
// Margin estimates use SOV labor/material splits + bid estimate data
// Billing, change orders, and RFI counts pulled from actual CSVs

export const projects: Project[] = [
  {
    id: "PRJ-2024-001",
    name: "Mercy General Hospital - HVAC Modernization",
    client: "Mercy General Hospital",
    gcName: "Turner Construction",
    contractValue: 35194000,
    bidMargin: 14.2,
    currentMargin: 8.7,
    percentComplete: 97,
    status: "at-risk",
    laborBudget: 17700000,
    laborActual: 19400000,
    materialBudget: 12500000,
    materialActual: 12100000,
    changeOrdersPending: 0,
    changeOrdersValue: 0,
    approvedCOValue: 4134000, // Sum of approved COs
    billingLag: 623400, // contract + approved COs - cumulative billed
    completionDate: "2025-09-01",
    lastUpdated: "2026-02-22",
    openRFIs: 3, // RFI-021, RFI-057, RFI-037
    retentionHeld: 3495540,
  },
  {
    id: "PRJ-2024-002",
    name: "Riverside Office Tower - Core & Shell MEP",
    client: "Riverside Office Tower",
    gcName: "DPR Construction",
    contractValue: 30260000,
    bidMargin: 13.8,
    currentMargin: 6.2,
    percentComplete: 88,
    status: "critical",
    laborBudget: 14700000,
    laborActual: 17200000,
    materialBudget: 11200000,
    materialActual: 11500000,
    changeOrdersPending: 0,
    changeOrdersValue: 0,
    approvedCOValue: 6079500, // Large approved COs including CO-017 ($1.09M), CO-020 ($1.21M)
    billingLag: 6264100, // Significant billing lag - pending payments
    completionDate: "2026-01-27",
    lastUpdated: "2026-02-22",
    openRFIs: 3, // RFI-067, RFI-009, RFI-068
    retentionHeld: 3007540,
  },
  {
    id: "PRJ-2024-003",
    name: "Greenfield Elementary School - New Construction",
    client: "Greenfield School District",
    gcName: "DPR Construction",
    contractValue: 5544000,
    bidMargin: 15.5,
    currentMargin: 13.1,
    percentComplete: 96,
    status: "healthy",
    laborBudget: 2920000,
    laborActual: 2780000,
    materialBudget: 1950000,
    materialActual: 1900000,
    changeOrdersPending: 0,
    changeOrdersValue: 0,
    approvedCOValue: 421200, // Moderate COs
    billingLag: 564500,
    completionDate: "2025-04-22",
    lastUpdated: "2026-02-22",
    openRFIs: 2, // RFI-034, RFI-012
    retentionHeld: 550070,
  },
  {
    id: "PRJ-2024-004",
    name: "Summit Data Center - Phase 2 Expansion",
    client: "Summit Data Center",
    gcName: "DPR Construction",
    contractValue: 16340000,
    bidMargin: 16.0,
    currentMargin: 9.4,
    percentComplete: 99,
    status: "at-risk",
    laborBudget: 8450000,
    laborActual: 9600000,
    materialBudget: 5800000,
    materialActual: 5950000,
    changeOrdersPending: 0,
    changeOrdersValue: 0,
    approvedCOValue: 2793800, // Big COs for seismic, coordination, scope gaps
    billingLag: 2928000, // Past completion date with billing lag
    completionDate: "2024-11-27",
    lastUpdated: "2026-02-22",
    openRFIs: 3, // RFI-028, RFI-020, RFI-022
    retentionHeld: 1620580,
  },
  {
    id: "PRJ-2024-005",
    name: "Harbor View Condominiums - 3 Buildings",
    client: "Harbor View Development",
    gcName: "Skanska USA",
    contractValue: 13650000,
    bidMargin: 14.5,
    currentMargin: 10.8,
    percentComplete: 92,
    status: "at-risk",
    laborBudget: 6950000,
    laborActual: 7400000,
    materialBudget: 4800000,
    materialActual: 4650000,
    changeOrdersPending: 0,
    changeOrdersValue: 0,
    approvedCOValue: 1760600, // Mix of VE credits and adds
    billingLag: 1854500,
    completionDate: "2025-11-07",
    lastUpdated: "2026-02-22",
    openRFIs: 4, // RFI-021, RFI-046, RFI-024, RFI-032, RFI-037
    retentionHeld: 1355610,
  },
]

export const portfolioStats = {
  totalContractValue: projects.reduce((s, p) => s + p.contractValue, 0),
  totalWithCOs: projects.reduce((s, p) => s + p.contractValue + p.approvedCOValue, 0),
  weightedBidMargin:
    projects.reduce((s, p) => s + p.bidMargin * p.contractValue, 0) /
    projects.reduce((s, p) => s + p.contractValue, 0),
  weightedCurrentMargin:
    projects.reduce((s, p) => s + p.currentMargin * p.contractValue, 0) /
    projects.reduce((s, p) => s + p.contractValue, 0),
  totalBillingLag: projects.reduce((s, p) => s + p.billingLag, 0),
  pendingChangeOrders: projects.reduce((s, p) => s + p.changeOrdersPending, 0),
  pendingCOValue: projects.reduce((s, p) => s + p.changeOrdersValue, 0),
  totalApprovedCOs: projects.reduce((s, p) => s + p.approvedCOValue, 0),
  criticalProjects: projects.filter((p) => p.status === "critical").length,
  atRiskProjects: projects.filter((p) => p.status === "at-risk").length,
  healthyProjects: projects.filter((p) => p.status === "healthy").length,
  totalRetention: projects.reduce((s, p) => s + p.retentionHeld, 0),
  totalOpenRFIs: projects.reduce((s, p) => s + p.openRFIs, 0),
}

// Portfolio margin trend based on billing history progression across all projects
export const marginTrendData = [
  { month: "May '24", bid: 14.6, actual: 14.1 },
  { month: "Jul '24", bid: 14.6, actual: 13.2 },
  { month: "Sep '24", bid: 14.6, actual: 12.0 },
  { month: "Nov '24", bid: 14.6, actual: 10.9 },
  { month: "Jan '25", bid: 14.6, actual: 10.1 },
  { month: "Mar '25", bid: 14.6, actual: 9.5 },
  { month: "Jun '25", bid: 14.6, actual: 9.0 },
  { month: "Sep '25", bid: 14.6, actual: 8.8 },
  { month: "Feb '26", bid: 14.6, actual: 8.9 },
]

export const projectMarginData = projects.map((p) => ({
  name: p.name.split(" - ")[0].replace("Mercy General Hospital", "Mercy Hospital").replace("Harbor View Condominiums", "Harbor View"),
  bid: p.bidMargin,
  current: p.currentMargin,
  gap: +(p.bidMargin - p.currentMargin).toFixed(1),
}))

export const sampleAgentSteps: AgentStep[] = [
  {
    id: "step-1",
    type: "thinking",
    content: "Starting portfolio scan across 5 active HVAC projects totaling $100.99M in original contract value. Will check margin erosion, labor overruns, billing lag, open RFIs, and pending change orders.",
    timestamp: "2026-02-22T10:00:01Z",
    duration: 1200,
  },
  {
    id: "step-2",
    type: "tool-call",
    content: "Querying billing_history.csv and contracts.csv: comparing cumulative billed vs. contract value + approved COs for all 5 projects.",
    tool: "query_billing_data",
    timestamp: "2026-02-22T10:00:02Z",
    duration: 850,
  },
  {
    id: "step-3",
    type: "observation",
    content: "Riverside Office Tower (PRJ-2024-002) has the worst billing lag: $6.26M unbilled. Multiple pay apps marked 'Pending'. 21 approved change orders totaling $6.08M on top of $30.26M contract. Labor overrun detected: $2.5M over budget.",
    timestamp: "2026-02-22T10:00:03Z",
    duration: 600,
  },
  {
    id: "step-4",
    type: "tool-call",
    content: "Pulling labor_logs.csv for PRJ-2024-002. Checking overtime hours and burden multiplier vs. bid estimate assumptions from sov_budget.csv.",
    tool: "analyze_labor_costs",
    timestamp: "2026-02-22T10:00:04Z",
    duration: 1100,
  },
  {
    id: "step-5",
    type: "observation",
    content: "PRJ-2024-002 labor: Estimated 21,860 hours at $1.49M avg cost. Actual hours logged: 26,400+ with significant OT on piping and ductwork phases. Field notes reference 'fire protection conflict' causing rerouting (see CO-012, $381K approved). Multiple design errors (CO-009, CO-011, CO-008) added $1.22M in approved costs.",
    timestamp: "2026-02-22T10:00:05Z",
    duration: 750,
  },
  {
    id: "step-6",
    type: "tool-call",
    content: "Cross-referencing change_orders.csv with rfis.csv for PRJ-2024-002. Checking if open RFIs (RFI-067, RFI-009, RFI-068) have cost or schedule impact flags.",
    tool: "query_rfi_exposure",
    timestamp: "2026-02-22T10:00:06Z",
    duration: 900,
  },
  {
    id: "step-7",
    type: "result",
    content: "RFI-068 (pipe sleeve discrepancy, Floor 20) is open with cost_impact=True and schedule_impact=True. This is the highest-risk open item. RFI-067 (fire damper verification) and RFI-009 (control sequence) also unresolved. Recommend immediate escalation on RFI-068.",
    timestamp: "2026-02-22T10:00:07Z",
    duration: 400,
  },
]

export const sampleMessages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "user",
    content: "Run a full portfolio analysis.",
    timestamp: "2026-02-22T10:00:00Z",
  },
  {
    id: "msg-2",
    role: "assistant",
    content: `I've completed a full portfolio scan across your 5 active HVAC projects totaling **$100.99M** in original contract value (**$116.2M** including approved change orders). Here's what I found:

**Portfolio Health Summary**
Your weighted portfolio margin has eroded from **14.6% bid** to **8.9% realized** -- a **5.7 point gap** representing approximately **$6.6M in margin loss** across the portfolio.

**Critical -- Immediate Action Required**

1. **Riverside Office Tower** (PRJ-2024-002) -- Margin: 13.8% to 6.2%
   - $6.26M in billing lag -- you are financing DPR Construction's project
   - $2.5M labor overrun driven by fire protection rerouting and design errors
   - $6.08M in approved COs but multiple pay apps still marked "Pending"
   - 3 open RFIs including RFI-068 (cost + schedule impact flagged)
   - **Action:** Escalate billing collection immediately. File RFI-068 response demand.

**At-Risk -- Monitor Closely**

2. **Mercy General Hospital** (PRJ-2024-001) -- Margin: 14.2% to 8.7%
   - 97% complete but $623K billing lag and $3.5M retention held
   - $1.7M labor overrun. Field notes cite structural beam conflicts and 14th floor rework
   - 3 open RFIs remaining. $4.13M in approved COs recovered well.
   - **Action:** Accelerate closeout to release $3.5M retention.

3. **Summit Data Center** (PRJ-2024-004) -- Margin: 16.0% to 9.4%
   - Past substantial completion date (Nov 2024) with $2.93M billing lag
   - $1.15M labor overrun + $150K material overrun
   - 3 RFIs still open (RFI-028 pending response since Apr 2024)
   - **Action:** Close out RFIs and submit final billing immediately.

4. **Harbor View Condominiums** (PRJ-2024-005) -- Margin: 14.5% to 10.8%
   - $1.85M billing lag across 3 buildings
   - 4 open RFIs, labor running $450K over budget
   - **Action:** Push phased billing per building to reduce lag.

**Healthy**

5. **Greenfield Elementary** (PRJ-2024-003) -- Margin: 15.5% to 13.1%
   - Tracking well. Only 2 open RFIs. $421K approved COs managed cleanly.
   - $565K billing lag is manageable at 96% completion.

**Immediate Recovery Potential: $12.2M** through billing acceleration ($12.2M total billing lag), retention release ($10.0M across portfolio), and RFI resolution (15 open RFIs, 3 with cost impact flags).

Want me to drill into Riverside's labor breakdown, generate a billing demand letter, or produce an executive summary for the CFO?`,
    steps: sampleAgentSteps,
    timestamp: "2026-02-22T10:00:08Z",
  },
]
