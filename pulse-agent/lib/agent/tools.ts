import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  getDataset,
  sumLaborCost,
  getLatestBillingBySOV,
  computeLaborCost,
  getAggregates,
} from "@/lib/data/loader";
import {
  getLastSnapshot,
  saveSnapshot,
  diffSnapshots,
  type ProjectSnapshot,
} from "@/lib/data/snapshot";
import { sendEmail } from "@/lib/email/send";

// ─── Tool 1: scan_portfolio ───────────────────────────────────────────────────

export const scanPortfolioTool = tool({
  description:
    "Scan all projects in the portfolio and return a high-level margin health summary. " +
    "Use this first to understand which projects need deeper investigation. " +
    "Returns contract value, total actual costs to date, realized margin %, billing status, " +
    "and a risk signal count for each project.",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    const db = getDataset();
    const today = new Date();

    const results = db.contracts.map((contract) => {
      const pid = contract.project_id;

      // ── Labor performance (primary controllable cost signal) ──
      const projectLogs = db.laborLogs.filter((l) => l.project_id === pid);
      const actualLaborCost = sumLaborCost(projectLogs);
      const actualLaborHours = projectLogs.reduce((s, l) => s + l.hours_st + l.hours_ot, 0);
      const totalOTHours = projectLogs.reduce((s, l) => s + l.hours_ot, 0);
      const overtimePct = actualLaborHours > 0 ? (totalOTHours / actualLaborHours) * 100 : 0;

      const budgets = db.sovBudget.filter((b) => b.project_id === pid);
      const budgetedLaborCost = budgets.reduce((s, b) => s + b.estimated_labor_cost, 0);
      const budgetedLaborHours = budgets.reduce((s, b) => s + b.estimated_labor_hours, 0);

      const laborHoursOverrunPct =
        budgetedLaborHours > 0
          ? ((actualLaborHours - budgetedLaborHours) / budgetedLaborHours) * 100
          : 0;
      const laborCostOverrunPct =
        budgetedLaborCost > 0
          ? ((actualLaborCost - budgetedLaborCost) / budgetedLaborCost) * 100
          : 0;

      // ── Cost Performance Index (earned value using billing % × labor budget) ──
      const approvedCOs = db.changeOrders
        .filter((co) => co.project_id === pid && co.status === "Approved")
        .reduce((sum, co) => sum + co.amount, 0);
      const revisedContractValue = contract.original_contract_value + approvedCOs;

      const latestBilling = db.billingHistory
        .filter((b) => b.project_id === pid)
        .sort((a, b) => b.application_number - a.application_number)[0];
      const cumulativeBilled = latestBilling?.cumulative_billed ?? 0;

      const pctComplete =
        revisedContractValue > 0 ? cumulativeBilled / revisedContractValue : 0;
      const earnedLaborBudget = pctComplete * budgetedLaborCost;
      const laborCPI = earnedLaborBudget > 0 ? earnedLaborBudget / actualLaborCost : 1;

      // ── Pending CO exposure ──
      const pendingCOExposure = db.changeOrders
        .filter(
          (co) =>
            co.project_id === pid &&
            (co.status === "Pending" || co.status === "Under Review")
        )
        .reduce((sum, co) => sum + co.amount, 0);

      // ── Billing lag (billed vs actual costs tracked) ──
      const actualMaterialCost = db.materialDeliveries
        .filter((m) => m.project_id === pid)
        .reduce((sum, m) => sum + m.total_cost, 0);
      const trackedFieldCosts = actualLaborCost + actualMaterialCost;
      const billingLag = cumulativeBilled - trackedFieldCosts;

      // ── RFI risk ──
      const highRiskRFIs = db.rfis.filter(
        (r) =>
          r.project_id === pid &&
          r.status !== "Closed" &&
          (r.cost_impact || r.schedule_impact)
      ).length;
      const openRFIs = db.rfis.filter(
        (r) => r.project_id === pid && r.status !== "Closed"
      ).length;

      // ── Schedule ──
      const completionDate = new Date(contract.substantial_completion_date);
      const daysToCompletion = Math.ceil(
        (completionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      const isOverdue = daysToCompletion < 0;

      // ── Risk scoring ──
      const riskLevel =
        laborHoursOverrunPct > 50 || highRiskRFIs > 3 || isOverdue || pendingCOExposure > 500000
          ? "HIGH"
          : laborHoursOverrunPct > 20 || highRiskRFIs > 1 || pendingCOExposure > 200000
          ? "MEDIUM"
          : "LOW";

      return {
        project_id: pid,
        project_name: contract.project_name,
        gc_name: contract.gc_name,
        contract_value: contract.original_contract_value,
        revised_contract_value: revisedContractValue,
        approved_co_value: Math.round(approvedCOs),
        pending_co_exposure: Math.round(pendingCOExposure),
        // Labor signals
        budgeted_labor_hours: Math.round(budgetedLaborHours),
        actual_labor_hours: Math.round(actualLaborHours),
        labor_hours_overrun_pct: Math.round(laborHoursOverrunPct * 10) / 10,
        budgeted_labor_cost: Math.round(budgetedLaborCost),
        actual_labor_cost: Math.round(actualLaborCost),
        labor_cost_overrun_pct: Math.round(laborCostOverrunPct * 10) / 10,
        overtime_pct: Math.round(overtimePct * 10) / 10,
        // Earned value
        pct_complete: Math.round(pctComplete * 1000) / 10,
        labor_cpi: Math.round(laborCPI * 100) / 100,
        labor_cpi_status:
          laborCPI < 0.80
            ? "POOR"
            : laborCPI < 0.92
            ? "BELOW PLAN"
            : laborCPI < 1.08
            ? "ON PLAN"
            : "FAVORABLE",
        // Billing
        cumulative_billed: Math.round(cumulativeBilled),
        tracked_field_costs: Math.round(trackedFieldCosts),
        billing_vs_field_cost_gap: Math.round(billingLag),
        // RFI
        open_rfis: openRFIs,
        high_risk_rfis: highRiskRFIs,
        // Schedule
        scheduled_completion: contract.substantial_completion_date,
        days_to_completion: daysToCompletion,
        is_overdue: isOverdue,
        risk_level: riskLevel,
      };
    });

    return {
      scan_date: today.toISOString().split("T")[0],
      portfolio_summary: {
        total_projects: results.length,
        high_risk_projects: results.filter((r) => r.risk_level === "HIGH").length,
        medium_risk_projects: results.filter((r) => r.risk_level === "MEDIUM").length,
        low_risk_projects: results.filter((r) => r.risk_level === "LOW").length,
        total_contract_value: results.reduce((s, r) => s + r.contract_value, 0),
        total_approved_co_value: results.reduce((s, r) => s + r.approved_co_value, 0),
        total_pending_co_exposure: results.reduce((s, r) => s + r.pending_co_exposure, 0),
        total_open_rfis: results.reduce((s, r) => s + r.open_rfis, 0),
        total_high_risk_rfis: results.reduce((s, r) => s + r.high_risk_rfis, 0),
      },
      projects: results.sort((a, b) => b.labor_hours_overrun_pct - a.labor_hours_overrun_pct),
    };
  },
});

// ─── Tool 2: analyze_project_margin ──────────────────────────────────────────

export const analyzeProjectMarginTool = tool({
  description:
    "Perform a deep-dive margin analysis on a specific project. " +
    "Breaks down actual vs budgeted costs by SOV line, identifies the worst-performing lines, " +
    "calculates labor efficiency, and surfaces the root-cause signals. " +
    "Call this after scan_portfolio identifies a project at risk.",
  inputSchema: zodSchema(
    z.object({
      project_id: z.string().describe("The project ID to analyze (e.g. PRJ-2024-001)"),
    })
  ),
  execute: async ({ project_id }) => {
    const db = getDataset();
    const contract = db.contracts.find((c) => c.project_id === project_id);
    if (!contract) return { error: `Project ${project_id} not found` };

    const sovLines = db.sov.filter((s) => s.project_id === project_id);
    const budgets = db.sovBudget.filter((b) => b.project_id === project_id);

    const lineAnalysis = sovLines.map((line) => {
      const budget = budgets.find((b) => b.sov_line_id === line.sov_line_id);

      const lineLogs = db.laborLogs.filter(
        (l) => l.project_id === project_id && l.sov_line_id === line.sov_line_id
      );
      const actualLaborCost = sumLaborCost(lineLogs);
      const actualLaborHours = lineLogs.reduce(
        (sum, l) => sum + l.hours_st + l.hours_ot,
        0
      );

      const actualMaterialCost = db.materialDeliveries
        .filter(
          (m) => m.project_id === project_id && m.sov_line_id === line.sov_line_id
        )
        .reduce((sum, m) => sum + m.total_cost, 0);

      const actualTotalCost = actualLaborCost + actualMaterialCost;

      const budgetedLaborCost = budget?.estimated_labor_cost ?? 0;
      const budgetedMaterialCost = budget?.estimated_material_cost ?? 0;
      const budgetedTotalCost =
        budgetedLaborCost +
        budgetedMaterialCost +
        (budget?.estimated_equipment_cost ?? 0) +
        (budget?.estimated_sub_cost ?? 0);

      const laborOverrunPct =
        budgetedLaborCost > 0
          ? ((actualLaborCost - budgetedLaborCost) / budgetedLaborCost) * 100
          : 0;

      const laborHoursOverrunPct =
        (budget?.estimated_labor_hours ?? 0) > 0
          ? ((actualLaborHours - (budget?.estimated_labor_hours ?? 0)) /
              (budget?.estimated_labor_hours ?? 0)) *
            100
          : 0;

      const latestBillingItem = db.billingLineItems
        .filter(
          (b) => b.project_id === project_id && b.sov_line_id === line.sov_line_id
        )
        .sort((a, b) => b.application_number - a.application_number)[0];

      return {
        sov_line_id: line.sov_line_id,
        description: line.description,
        scheduled_value: line.scheduled_value,
        budgeted_labor_hours: budget?.estimated_labor_hours ?? 0,
        actual_labor_hours: Math.round(actualLaborHours),
        budgeted_labor_cost: Math.round(budgetedLaborCost),
        actual_labor_cost: Math.round(actualLaborCost),
        budgeted_material_cost: Math.round(budgetedMaterialCost),
        actual_material_cost: Math.round(actualMaterialCost),
        budgeted_total_cost: Math.round(budgetedTotalCost),
        actual_total_cost: Math.round(actualTotalCost),
        labor_cost_overrun_pct: Math.round(laborOverrunPct * 10) / 10,
        labor_hours_overrun_pct: Math.round(laborHoursOverrunPct * 10) / 10,
        pct_billed: latestBillingItem?.pct_complete ?? 0,
        status:
          laborOverrunPct > 25
            ? "CRITICAL"
            : laborOverrunPct > 10
            ? "WARNING"
            : "OK",
        key_assumption: budget?.key_assumptions ?? "N/A",
      };
    });

    lineAnalysis.sort((a, b) => b.labor_cost_overrun_pct - a.labor_cost_overrun_pct);

    const totalActualCost = lineAnalysis.reduce((s, l) => s + l.actual_total_cost, 0);
    const totalBudgetedCost = lineAnalysis.reduce(
      (s, l) => s + l.budgeted_total_cost,
      0
    );

    const approvedCOs = db.changeOrders
      .filter((co) => co.project_id === project_id && co.status === "Approved")
      .reduce((sum, co) => sum + co.amount, 0);
    const revisedContract = contract.original_contract_value + approvedCOs;

    const projectedMarginPct =
      revisedContract > 0
        ? ((revisedContract - totalActualCost) / revisedContract) * 100
        : 0;

    const bidMarginPct =
      revisedContract > 0
        ? ((revisedContract - totalBudgetedCost) / revisedContract) * 100
        : 0;

    return {
      project_id,
      project_name: contract.project_name,
      original_contract_value: contract.original_contract_value,
      approved_co_value: Math.round(approvedCOs),
      revised_contract_value: Math.round(revisedContract),
      total_budgeted_cost: Math.round(totalBudgetedCost),
      total_actual_cost: Math.round(totalActualCost),
      bid_margin_pct: Math.round(bidMarginPct * 10) / 10,
      projected_margin_pct: Math.round(projectedMarginPct * 10) / 10,
      margin_erosion_pts: Math.round((bidMarginPct - projectedMarginPct) * 10) / 10,
      worst_performing_lines: lineAnalysis.filter((l) => l.status !== "OK").slice(0, 5),
      all_lines: lineAnalysis,
    };
  },
});

// ─── Tool 3: get_labor_analysis ───────────────────────────────────────────────

export const getLaborAnalysisTool = tool({
  description:
    "Analyze labor costs and hours for a project, optionally filtered to a specific SOV line. " +
    "Surfaces overtime spikes, role-level cost breakdowns, crew productivity trends, " +
    "and identifies if unplanned overtime is eroding margins.",
  inputSchema: zodSchema(
    z.object({
      project_id: z.string().describe("Project ID"),
      sov_line_id: z
        .string()
        .optional()
        .describe("Optional SOV line ID to narrow the analysis"),
    })
  ),
  execute: async ({ project_id, sov_line_id }) => {
    const db = getDataset();

    let logs = db.laborLogs.filter((l) => l.project_id === project_id);
    if (sov_line_id) logs = logs.filter((l) => l.sov_line_id === sov_line_id);

    if (logs.length === 0) {
      return { error: "No labor logs found for the given parameters" };
    }

    const totalST = logs.reduce((s, l) => s + l.hours_st, 0);
    const totalOT = logs.reduce((s, l) => s + l.hours_ot, 0);
    const totalHours = totalST + totalOT;
    const totalCost = sumLaborCost(logs);
    const overtimePct = totalHours > 0 ? (totalOT / totalHours) * 100 : 0;

    const byRole = new Map<
      string,
      { hours: number; ot_hours: number; cost: number; count: number }
    >();
    for (const log of logs) {
      const existing = byRole.get(log.role) ?? { hours: 0, ot_hours: 0, cost: 0, count: 0 };
      existing.hours += log.hours_st + log.hours_ot;
      existing.ot_hours += log.hours_ot;
      existing.cost += computeLaborCost(log);
      existing.count++;
      byRole.set(log.role, existing);
    }

    let bySOVLine: Record<string, unknown>[] = [];
    if (!sov_line_id) {
      const byLine = new Map<string, { hours: number; ot_hours: number; cost: number }>();
      for (const log of logs) {
        const existing = byLine.get(log.sov_line_id) ?? { hours: 0, ot_hours: 0, cost: 0 };
        existing.hours += log.hours_st + log.hours_ot;
        existing.ot_hours += log.hours_ot;
        existing.cost += computeLaborCost(log);
        byLine.set(log.sov_line_id, existing);
      }

      const budgets = db.sovBudget.filter((b) => b.project_id === project_id);

      bySOVLine = Array.from(byLine.entries())
        .map(([lineId, data]) => {
          const budget = budgets.find((b) => b.sov_line_id === lineId);
          const sovLine = db.sov.find((s) => s.sov_line_id === lineId);
          const hoursOverrunPct =
            (budget?.estimated_labor_hours ?? 0) > 0
              ? ((data.hours - (budget?.estimated_labor_hours ?? 0)) /
                  (budget?.estimated_labor_hours ?? 0)) *
                100
              : 0;
          return {
            sov_line_id: lineId,
            description: sovLine?.description ?? lineId,
            actual_hours: Math.round(data.hours),
            budgeted_hours: budget?.estimated_labor_hours ?? 0,
            hours_overrun_pct: Math.round(hoursOverrunPct * 10) / 10,
            overtime_hours: Math.round(data.ot_hours),
            actual_cost: Math.round(data.cost),
            budgeted_labor_cost: Math.round(budget?.estimated_labor_cost ?? 0),
          };
        })
        .sort((a, b) => b.hours_overrun_pct - a.hours_overrun_pct);
    }

    const sortedLogs = [...logs].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const weeklyOT: Record<string, { ot: number; st: number }> = {};
    for (const log of sortedLogs) {
      const d = new Date(log.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().split("T")[0];
      if (!weeklyOT[key]) weeklyOT[key] = { ot: 0, st: 0 };
      weeklyOT[key].ot += log.hours_ot;
      weeklyOT[key].st += log.hours_st;
    }
    const weeklyTrend = Object.entries(weeklyOT)
      .slice(-8)
      .map(([week, data]) => ({
        week,
        st_hours: Math.round(data.st),
        ot_hours: Math.round(data.ot),
        ot_pct: Math.round((data.ot / (data.st + data.ot || 1)) * 1000) / 10,
      }));

    return {
      project_id,
      sov_line_id: sov_line_id ?? "ALL",
      total_st_hours: Math.round(totalST),
      total_ot_hours: Math.round(totalOT),
      total_hours: Math.round(totalHours),
      total_labor_cost: Math.round(totalCost),
      overtime_pct: Math.round(overtimePct * 10) / 10,
      by_role: Object.fromEntries(
        Array.from(byRole.entries()).map(([role, data]) => [
          role,
          {
            hours: Math.round(data.hours),
            ot_hours: Math.round(data.ot_hours),
            cost: Math.round(data.cost),
            ot_pct: Math.round((data.ot_hours / (data.hours || 1)) * 1000) / 10,
          },
        ])
      ),
      by_sov_line: bySOVLine,
      weekly_overtime_trend: weeklyTrend,
      alert:
        overtimePct > 20
          ? `HIGH OVERTIME ALERT: ${Math.round(overtimePct)}% of hours are overtime — significantly eroding margin`
          : overtimePct > 10
          ? `MODERATE OVERTIME: ${Math.round(overtimePct)}% overtime rate — monitor closely`
          : null,
    };
  },
});

// ─── Tool 4: get_change_order_summary ────────────────────────────────────────

export const getChangeOrderSummaryTool = tool({
  description:
    "Analyze change orders for a specific project or the entire portfolio. " +
    "Surfaces pending/under-review COs that represent unrecovered cost exposure, " +
    "breakdowns by reason category, and identifies COs that may be headed for rejection.",
  inputSchema: zodSchema(
    z.object({
      project_id: z
        .string()
        .optional()
        .describe("Project ID, or omit for portfolio-wide analysis"),
    })
  ),
  execute: async ({ project_id }) => {
    const db = getDataset();

    let cos = db.changeOrders;
    if (project_id) cos = cos.filter((co) => co.project_id === project_id);

    const byStatus = {
      Approved: cos.filter((co) => co.status === "Approved"),
      Pending: cos.filter((co) => co.status === "Pending"),
      "Under Review": cos.filter((co) => co.status === "Under Review"),
      Rejected: cos.filter((co) => co.status === "Rejected"),
    };

    const pendingExposure = [...byStatus.Pending, ...byStatus["Under Review"]].reduce(
      (sum, co) => sum + co.amount,
      0
    );
    const approvedValue = byStatus.Approved.reduce((sum, co) => sum + co.amount, 0);

    const byReason: Record<string, { count: number; total: number }> = {};
    for (const co of cos) {
      if (!byReason[co.reason_category]) {
        byReason[co.reason_category] = { count: 0, total: 0 };
      }
      byReason[co.reason_category].count++;
      byReason[co.reason_category].total += co.amount;
    }

    const highValuePending = [...byStatus.Pending, ...byStatus["Under Review"]]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((co) => ({
        co_number: co.co_number,
        project_id: co.project_id,
        description: co.description,
        amount: co.amount,
        status: co.status,
        date_submitted: co.date_submitted,
        days_pending: Math.ceil(
          (new Date().getTime() - new Date(co.date_submitted).getTime()) /
            (1000 * 60 * 60 * 24)
        ),
        reason_category: co.reason_category,
        related_rfi: co.related_rfi,
        schedule_impact_days: co.schedule_impact_days,
      }));

    let byProject: Record<string, unknown>[] = [];
    if (!project_id) {
      const projectMap = new Map<
        string,
        { pending: number; approved: number; rejected: number; count: number }
      >();
      for (const co of cos) {
        const existing = projectMap.get(co.project_id) ?? {
          pending: 0,
          approved: 0,
          rejected: 0,
          count: 0,
        };
        if (co.status === "Approved") existing.approved += co.amount;
        else if (co.status === "Pending" || co.status === "Under Review")
          existing.pending += co.amount;
        else if (co.status === "Rejected") existing.rejected += co.amount;
        existing.count++;
        projectMap.set(co.project_id, existing);
      }

      byProject = Array.from(projectMap.entries()).map(([pid, data]) => {
        const contract = db.contracts.find((c) => c.project_id === pid);
        return {
          project_id: pid,
          project_name: contract?.project_name ?? pid,
          total_cos: data.count,
          approved_value: Math.round(data.approved),
          pending_exposure: Math.round(data.pending),
          rejected_value: Math.round(data.rejected),
        };
      });
    }

    return {
      scope: project_id ?? "PORTFOLIO",
      total_cos: cos.length,
      approved_count: byStatus.Approved.length,
      approved_value: Math.round(approvedValue),
      pending_count: byStatus.Pending.length + byStatus["Under Review"].length,
      pending_exposure: Math.round(pendingExposure),
      rejected_count: byStatus.Rejected.length,
      by_reason_category: byReason,
      high_value_pending_cos: highValuePending,
      by_project: byProject,
      risk_alert:
        pendingExposure > 500000
          ? `CRITICAL: $${(pendingExposure / 1000).toFixed(0)}K in pending COs — significant unrecovered exposure`
          : pendingExposure > 200000
          ? `WARNING: $${(pendingExposure / 1000).toFixed(0)}K in pending COs — follow up urgently`
          : null,
    };
  },
});

// ─── Tool 5: get_rfi_risk ─────────────────────────────────────────────────────

export const getRFIRiskTool = tool({
  description:
    "Analyze RFIs to surface cost and schedule exposure. " +
    "Identifies open high-priority RFIs, those with cost/schedule impact flags, " +
    "slow response times, and patterns that suggest scope creep or design issues.",
  inputSchema: zodSchema(
    z.object({
      project_id: z
        .string()
        .optional()
        .describe("Project ID, or omit for portfolio-wide analysis"),
    })
  ),
  execute: async ({ project_id }) => {
    const db = getDataset();

    let rfis = db.rfis;
    if (project_id) rfis = rfis.filter((r) => r.project_id === project_id);

    const open = rfis.filter((r) => r.status !== "Closed");
    const withCostImpact = rfis.filter((r) => r.cost_impact);
    const withScheduleImpact = rfis.filter((r) => r.schedule_impact);
    const critical = rfis.filter(
      (r) => r.priority === "Critical" && r.status !== "Closed"
    );
    const high = rfis.filter((r) => r.priority === "High" && r.status !== "Closed");

    const closedWithResponse = rfis.filter(
      (r) => r.status === "Closed" && r.date_responded
    );
    const avgResponseDays =
      closedWithResponse.length > 0
        ? closedWithResponse.reduce((sum, r) => {
            const submitted = new Date(r.date_submitted);
            const responded = new Date(r.date_responded);
            return (
              sum +
              (responded.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24)
            );
          }, 0) / closedWithResponse.length
        : null;

    const today = new Date();
    const overdue = open.filter(
      (r) => r.date_required && new Date(r.date_required) < today
    );

    const highRisk = open
      .filter((r) => r.cost_impact || r.schedule_impact || r.priority === "Critical")
      .sort((a, b) => {
        const priority: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
        return (priority[b.priority] ?? 0) - (priority[a.priority] ?? 0);
      })
      .slice(0, 10)
      .map((r) => ({
        rfi_number: r.rfi_number,
        project_id: r.project_id,
        subject: r.subject,
        priority: r.priority,
        status: r.status,
        cost_impact: r.cost_impact,
        schedule_impact: r.schedule_impact,
        date_submitted: r.date_submitted,
        date_required: r.date_required,
        days_open: Math.ceil(
          (today.getTime() - new Date(r.date_submitted).getTime()) /
            (1000 * 60 * 60 * 24)
        ),
        assigned_to: r.assigned_to,
      }));

    let byProject: Record<string, unknown>[] = [];
    if (!project_id) {
      const projectMap = new Map<
        string,
        { total: number; open: number; cost_impact: number; overdue: number }
      >();
      for (const rfi of rfis) {
        const existing = projectMap.get(rfi.project_id) ?? {
          total: 0,
          open: 0,
          cost_impact: 0,
          overdue: 0,
        };
        existing.total++;
        if (rfi.status !== "Closed") existing.open++;
        if (rfi.cost_impact) existing.cost_impact++;
        if (
          rfi.date_required &&
          new Date(rfi.date_required) < today &&
          rfi.status !== "Closed"
        )
          existing.overdue++;
        projectMap.set(rfi.project_id, existing);
      }

      byProject = Array.from(projectMap.entries()).map(([pid, data]) => {
        const contract = db.contracts.find((c) => c.project_id === pid);
        return { project_id: pid, project_name: contract?.project_name ?? pid, ...data };
      });
    }

    return {
      scope: project_id ?? "PORTFOLIO",
      total_rfis: rfis.length,
      open_rfis: open.length,
      critical_open: critical.length,
      high_priority_open: high.length,
      with_cost_impact: withCostImpact.length,
      with_schedule_impact: withScheduleImpact.length,
      overdue_rfis: overdue.length,
      avg_response_days: avgResponseDays ? Math.round(avgResponseDays * 10) / 10 : null,
      high_risk_rfis: highRisk,
      by_project: byProject,
      risk_alert:
        critical.length > 0
          ? `CRITICAL: ${critical.length} unresolved Critical RFIs with potential cost/schedule impact`
          : overdue.length > 3
          ? `WARNING: ${overdue.length} overdue RFIs — response delays may be hiding exposure`
          : null,
    };
  },
});

// ─── Tool 6: analyze_field_notes ─────────────────────────────────────────────

export const analyzeFieldNotesTool = tool({
  description:
    "Search and analyze unstructured daily field notes for risk signals. " +
    "Detects mentions of verbal approvals, extra work, delays, material shortages, " +
    "rework, waiting time, and other margin-eroding events in the free-text reports.",
  inputSchema: zodSchema(
    z.object({
      project_id: z.string().describe("Project ID to analyze"),
      signal_type: z
        .enum(["verbal_approval", "extra_work", "delay", "material_shortage", "rework", "all_risks"])
        .optional()
        .describe("Type of risk signal to search for, or 'all_risks' for everything"),
    })
  ),
  execute: async ({ project_id, signal_type = "all_risks" }) => {
    const db = getDataset();

    const notes = db.fieldNotes.filter((n) => n.project_id === project_id);
    if (notes.length === 0) return { error: `No field notes found for ${project_id}` };

    const riskPatterns: Record<string, RegExp[]> = {
      verbal_approval: [
        /verbal(ly)? (approved?|authorized?|directed?|told)/i,
        /owner (said|told|approved?|directed?)/i,
        /gc (said|told|approved?|directed?)/i,
        /directed to proceed/i,
        /oral approval/i,
        /verbal direction/i,
      ],
      extra_work: [
        /extra work/i,
        /out of scope/i,
        /added scope/i,
        /not in contract/i,
        /additional work/i,
        /not included/i,
        /beyond original/i,
        /new scope/i,
      ],
      delay: [
        /waiting (for|on)/i,
        /delayed by/i,
        /held up/i,
        /can't proceed/i,
        /cannot proceed/i,
        /blocked/i,
        /schedule impact/i,
        /pushed back/i,
        /no access/i,
      ],
      material_shortage: [
        /short(age)? (of|on)/i,
        /material (delay|shortage|missing|not arrived)/i,
        /waiting on delivery/i,
        /out of stock/i,
        /claim filed/i,
        /back order/i,
      ],
      rework: [
        /rework/i,
        /redo/i,
        /remove and replace/i,
        /incorrect installation/i,
        /not to spec/i,
        /non-conforming/i,
        /tear out/i,
        /demo and reinstall/i,
      ],
    };

    const signalsToCheck =
      signal_type === "all_risks" ? Object.keys(riskPatterns) : [signal_type];

    interface MatchedNote {
      note_id: string;
      date: string;
      author: string;
      note_type: string;
      signal_type: string;
      matched_phrase: string;
      excerpt: string;
    }
    const matchedNotes: MatchedNote[] = [];

    for (const note of notes) {
      const foundSignals: { signal: string; phrase: string }[] = [];

      for (const signal of signalsToCheck) {
        const patterns = riskPatterns[signal];
        for (const pattern of patterns) {
          if (pattern.test(note.content)) {
            const match = note.content.match(pattern);
            foundSignals.push({ signal, phrase: match?.[0] ?? signal });
            break;
          }
        }
      }

      for (const { signal, phrase } of foundSignals) {
        matchedNotes.push({
          note_id: note.note_id,
          date: note.date,
          author: note.author,
          note_type: note.note_type,
          signal_type: signal,
          matched_phrase: phrase,
          excerpt:
            note.content.substring(0, 300) + (note.content.length > 300 ? "..." : ""),
        });
      }
    }

    matchedNotes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const signalCounts: Record<string, number> = {};
    for (const note of matchedNotes) {
      signalCounts[note.signal_type] = (signalCounts[note.signal_type] ?? 0) + 1;
    }

    const verbalApprovalCount = signalCounts["verbal_approval"] ?? 0;
    const extraWorkCount = signalCounts["extra_work"] ?? 0;

    return {
      project_id,
      total_notes_analyzed: notes.length,
      risk_signals_found: matchedNotes.length,
      signal_breakdown: signalCounts,
      matched_notes: matchedNotes.slice(0, 20),
      critical_findings: matchedNotes.filter(
        (n) => n.signal_type === "verbal_approval" || n.signal_type === "extra_work"
      ).length,
      alert:
        verbalApprovalCount > 0
          ? `CRITICAL: ${verbalApprovalCount} field notes reference verbal approvals — potential unwritten scope changes`
          : extraWorkCount > 2
          ? `WARNING: ${extraWorkCount} field notes mention extra work — verify these are captured in change orders`
          : null,
    };
  },
});

// ─── Tool 7: get_billing_lag ──────────────────────────────────────────────────

export const getBillingLagTool = tool({
  description:
    "Analyze billing health for a project or portfolio. " +
    "Compares cumulative billing vs actual costs incurred to detect billing lags " +
    "(work done but not billed = cash flow risk). " +
    "Also surfaces unbilled retention and unapproved pay applications.",
  inputSchema: zodSchema(
    z.object({
      project_id: z
        .string()
        .optional()
        .describe("Project ID, or omit for portfolio-wide view"),
    })
  ),
  execute: async ({ project_id }) => {
    const db = getDataset();

    const contracts = project_id
      ? db.contracts.filter((c) => c.project_id === project_id)
      : db.contracts;

    const results = contracts.map((contract) => {
      const pid = contract.project_id;

      const billingApps = db.billingHistory
        .filter((b) => b.project_id === pid)
        .sort((a, b) => b.application_number - a.application_number);
      const latest = billingApps[0];

      const actualLaborCost = sumLaborCost(
        db.laborLogs.filter((l) => l.project_id === pid)
      );
      const actualMaterialCost = db.materialDeliveries
        .filter((m) => m.project_id === pid)
        .reduce((sum, m) => sum + m.total_cost, 0);
      const totalActualCost = actualLaborCost + actualMaterialCost;

      const cumulativeBilled = latest?.cumulative_billed ?? 0;
      const retentionHeld = latest?.retention_held ?? 0;
      const billingLag = cumulativeBilled - totalActualCost;

      const pendingApps = billingApps.filter(
        (b) => b.status === "Pending" || b.status === "Submitted"
      );

      const latestLineItems = getLatestBillingBySOV(db.billingLineItems, pid);

      const approvedCOs = db.changeOrders
        .filter((co) => co.project_id === pid && co.status === "Approved")
        .reduce((sum, co) => sum + co.amount, 0);
      const revisedContract = contract.original_contract_value + approvedCOs;
      const billedPctOfContract =
        revisedContract > 0 ? (cumulativeBilled / revisedContract) * 100 : 0;

      return {
        project_id: pid,
        project_name: contract.project_name,
        revised_contract_value: Math.round(revisedContract),
        total_actual_cost_incurred: Math.round(totalActualCost),
        cumulative_billed: Math.round(cumulativeBilled),
        billing_lag: Math.round(billingLag),
        retention_held: Math.round(retentionHeld),
        billed_pct_of_contract: Math.round(billedPctOfContract * 10) / 10,
        total_pay_apps: billingApps.length,
        pending_pay_apps: pendingApps.length,
        latest_pay_app: latest
          ? {
              app_number: latest.application_number,
              period_end: latest.period_end,
              status: latest.status,
              net_payment_due: Math.round(latest.net_payment_due),
            }
          : null,
        under_80pct_complete_lines: latestLineItems.filter((b) => b.pct_complete < 80).length,
        status:
          billingLag < -100000
            ? "UNDER-BILLED"
            : billingLag > 100000
            ? "OVER-BILLED"
            : "OK",
        risk:
          billingLag < -500000
            ? `CRITICAL: Under-billed by $${Math.abs(Math.round(billingLag / 1000))}K — work done but revenue not recognized`
            : billingLag < -200000
            ? `WARNING: Under-billed by $${Math.abs(Math.round(billingLag / 1000))}K — accelerate billing cycle`
            : null,
      };
    });

    const totalUnderBilled = results.reduce(
      (sum, r) => sum + (r.billing_lag < 0 ? Math.abs(r.billing_lag) : 0),
      0
    );
    const totalRetentionHeld = results.reduce((sum, r) => sum + r.retention_held, 0);

    return {
      scope: project_id ?? "PORTFOLIO",
      total_under_billed: Math.round(totalUnderBilled),
      total_retention_held: Math.round(totalRetentionHeld),
      projects: results,
    };
  },
});

// ─── Tool 8: forecast_margin_at_completion ────────────────────────────────────

export const forecastMarginTool = tool({
  description:
    "Forecast the margin at completion (EAC) for a specific project using earned value methodology. " +
    "Factors in cost performance to date, remaining budget, pending CO exposure, " +
    "and quantifies how much cost recovery is needed to hit target margin.",
  inputSchema: zodSchema(
    z.object({
      project_id: z.string().describe("Project ID"),
      target_margin_pct: z
        .number()
        .optional()
        .describe("Target margin percentage (default 12%)"),
    })
  ),
  execute: async ({ project_id, target_margin_pct = 12 }) => {
    const db = getDataset();
    const agg = getAggregates();
    const contract = db.contracts.find((c) => c.project_id === project_id);
    if (!contract) return { error: `Project ${project_id} not found` };

    const projAgg = agg.get(project_id);

    // ── Actuals to date ──
    const actualLaborCost = projAgg?.totalLaborCost ?? sumLaborCost(db.laborLogs.filter((l) => l.project_id === project_id));
    const actualLaborHours = projAgg?.totalLaborHours ?? 0;
    const actualMaterialCost = projAgg?.totalMaterialCost ?? 0;

    // ── Budgeted (direct costs from bid) ──
    const budgets = db.sovBudget.filter((b) => b.project_id === project_id);
    const budgetedLaborCost = budgets.reduce((s, b) => s + b.estimated_labor_cost, 0);
    const budgetedLaborHours = budgets.reduce((s, b) => s + b.estimated_labor_hours, 0);
    const budgetedMaterialCost = budgets.reduce((s, b) => s + b.estimated_material_cost, 0);

    // ── COs ──
    const approvedCOs = db.changeOrders
      .filter((co) => co.project_id === project_id && co.status === "Approved")
      .reduce((sum, co) => sum + co.amount, 0);
    const pendingCOs = db.changeOrders
      .filter(
        (co) =>
          co.project_id === project_id &&
          (co.status === "Pending" || co.status === "Under Review")
      )
      .reduce((sum, co) => sum + co.amount, 0);

    const revisedContract = contract.original_contract_value + approvedCOs;

    // ── Progress via billing LINE ITEMS (more accurate than summary billed %) ──
    // earnedValue = Σ (scheduled_value × pct_complete/100) per SOV line
    // earnedLaborValue = Σ (budgeted_labor_cost × pct_complete/100) per SOV line
    const earnedValue = projAgg?.earnedValue ?? 0;
    const earnedLaborValue = projAgg?.earnedLaborValue ?? 0;
    const cumulativeBilled = projAgg?.cumulativeBilled ?? 0;

    const pctComplete = revisedContract > 0 ? earnedValue / revisedContract : 0;

    // ev_vs_billing_gap: positive = over-billing at line level, negative = under-billing
    const evVsBillingGap = earnedValue - cumulativeBilled;

    // ── Labor CPI using earned value from billing lines ──
    const laborCPI = earnedLaborValue > 0 ? earnedLaborValue / actualLaborCost : 1;

    // ── Confidence based on billing data freshness ──
    const latestBillingDate = projAgg?.latestBillingDate;
    const billingAgeDays = latestBillingDate
      ? Math.ceil((new Date().getTime() - new Date(latestBillingDate).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    const confidence = billingAgeDays <= 30 ? "high" : billingAgeDays <= 60 ? "medium" : "low";

    // ── Labor Estimate at Completion ──
    const remainingLaborBudget = budgetedLaborCost - earnedLaborValue;
    const estimatedRemainingLaborCost =
      laborCPI > 0 ? remainingLaborBudget / laborCPI : remainingLaborBudget;
    const laborEAC = actualLaborCost + estimatedRemainingLaborCost;
    const laborOverrun = laborEAC - budgetedLaborCost;
    const laborOverrunPct =
      budgetedLaborCost > 0 ? (laborOverrun / budgetedLaborCost) * 100 : 0;

    // ── Hours forecast ──
    const hoursOverrunPct =
      budgetedLaborHours > 0
        ? ((actualLaborHours - budgetedLaborHours) / budgetedLaborHours) * 100
        : 0;
    const forecastedTotalHours =
      laborCPI > 0 ? budgetedLaborHours / laborCPI : budgetedLaborHours;

    // ── Revenue / margin impact ──
    const unrecoveredLaborOverrun = Math.max(0, laborOverrun);
    const pendingCORecoveryNeeded = unrecoveredLaborOverrun - pendingCOs;
    const marginImpactPct =
      revisedContract > 0 ? (unrecoveredLaborOverrun / revisedContract) * 100 : 0;

    return {
      project_id,
      project_name: contract.project_name,
      analysis_date: new Date().toISOString().split("T")[0],
      confidence,
      ev_method: "billing_line_items",
      contract: {
        original_value: contract.original_contract_value,
        approved_cos: Math.round(approvedCOs),
        revised_value: Math.round(revisedContract),
        pending_co_exposure: Math.round(pendingCOs),
      },
      progress: {
        earned_value: Math.round(earnedValue),
        pct_complete: Math.round(pctComplete * 1000) / 10,
        cumulative_billed: Math.round(cumulativeBilled),
        ev_vs_billing_gap: Math.round(evVsBillingGap),
        ev_vs_billing_note:
          evVsBillingGap < -50000
            ? "Under-billed at line level — work completed but billing not yet captured"
            : evVsBillingGap > 50000
            ? "Over-billed at line level — billing exceeds earned value"
            : "Billing and earned value are aligned",
      },
      labor_performance: {
        budgeted_hours: Math.round(budgetedLaborHours),
        actual_hours_to_date: Math.round(actualLaborHours),
        hours_overrun_pct: Math.round(hoursOverrunPct * 10) / 10,
        budgeted_cost: Math.round(budgetedLaborCost),
        actual_cost_to_date: Math.round(actualLaborCost),
        earned_labor_value: Math.round(earnedLaborValue),
        cpi: Math.round(laborCPI * 100) / 100,
        cpi_interpretation:
          laborCPI < 0.80
            ? "POOR — burning through budget far faster than plan"
            : laborCPI < 0.92
            ? "BELOW PLAN — labor costs exceeding budget"
            : laborCPI < 1.08
            ? "ON PLAN"
            : "FAVORABLE — ahead of budget",
      },
      forecast: {
        labor_estimate_at_completion: Math.round(laborEAC),
        estimated_remaining_labor_cost: Math.round(estimatedRemainingLaborCost),
        forecasted_total_labor_hours: Math.round(forecastedTotalHours),
        labor_overrun_vs_budget: Math.round(laborOverrun),
        labor_overrun_pct: Math.round(laborOverrunPct * 10) / 10,
        material_actual_vs_budget_pct:
          budgetedMaterialCost > 0
            ? Math.round(
                ((actualMaterialCost - budgetedMaterialCost) / budgetedMaterialCost) * 1000
              ) / 10
            : null,
      },
      margin_impact: {
        unrecovered_labor_overrun: Math.round(unrecoveredLaborOverrun),
        pending_co_coverage: Math.round(pendingCOs),
        net_exposure_after_cos: Math.round(Math.max(0, pendingCORecoveryNeeded)),
        estimated_margin_drag_pct: Math.round(marginImpactPct * 10) / 10,
        interpretation:
          marginImpactPct > 5
            ? `CRITICAL: Labor overruns are tracking to drag margin by ~${Math.round(
                marginImpactPct
              )}+ points unless recovered through COs`
            : marginImpactPct > 2
            ? `WARNING: ~${Math.round(marginImpactPct)} margin points at risk from labor overruns`
            : "Labor performance is within acceptable range",
      },
      recovery_options: [
        pendingCOs > 0
          ? `Push to approve $${Math.round(pendingCOs / 1000)}K in pending COs — directly offsets overrun exposure`
          : "No pending COs to recover",
        unrecoveredLaborOverrun > 0
          ? `Identify and submit COs for $${Math.round(
              unrecoveredLaborOverrun / 1000
            )}K in labor overruns driven by owner-directed changes`
          : null,
        hoursOverrunPct > 30
          ? `Crew productivity is ${Math.round(
              hoursOverrunPct
            )}% behind plan — reassess foreman assignments and install sequencing`
          : null,
        "Accelerate billing for completed SOV lines to improve cash collection",
      ].filter(Boolean),
    };
  },
});

// ─── Tool 9: send_alert_email ─────────────────────────────────────────────────

export const sendAlertEmailTool = tool({
  description:
    "Send an email report or alert to the specified recipient. " +
    "Use this to deliver margin alerts, project summaries, or action items via email. " +
    "The content should be formatted in clear business language with specific numbers and next steps.",
  inputSchema: zodSchema(
    z.object({
      to: z.string().email().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      body: z
        .string()
        .describe(
          "Email body in plain text. Should include specific findings, numbers, and recommended actions."
        ),
      priority: z
        .enum(["normal", "high", "urgent"])
        .optional()
        .describe("Email priority level"),
    })
  ),
  execute: async ({ to, subject, body, priority }) => {
    const result = await sendEmail({ to, subject, body, priority: priority ?? "normal" });
    return result;
  },
});

// ─── Tool 10: compare_with_last_scan ─────────────────────────────────────────

export const compareWithLastScanTool = tool({
  description:
    "Compare the current portfolio state against the last saved snapshot to identify " +
    "what has changed since the previous analysis. Returns KPI deltas per project, " +
    "threshold events (e.g. CPI crossed 0.80, OT crossed 20%), and a pre-formed alert " +
    "subject line for email. Always run this first to surface trend changes before deep dive.",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    const db = getDataset();
    const agg = getAggregates();
    const today = new Date();

    // Build current snapshot KPIs per project
    const currentProjects: ProjectSnapshot[] = db.contracts.map((contract) => {
      const pid = contract.project_id;
      const projAgg = agg.get(pid);

      const actualLaborCost = projAgg?.totalLaborCost ?? 0;
      const actualLaborHours = projAgg?.totalLaborHours ?? 0;
      const totalOTHours = projAgg?.totalOTHours ?? 0;
      const otPct = actualLaborHours > 0 ? (totalOTHours / actualLaborHours) * 100 : 0;

      const budgets = db.sovBudget.filter((b) => b.project_id === pid);
      const budgetedLaborHours = budgets.reduce((s, b) => s + b.estimated_labor_hours, 0);
      const budgetedLaborCost = budgets.reduce((s, b) => s + b.estimated_labor_cost, 0);

      const laborHoursOverrunPct =
        budgetedLaborHours > 0
          ? ((actualLaborHours - budgetedLaborHours) / budgetedLaborHours) * 100
          : 0;

      const approvedCOs = db.changeOrders
        .filter((co) => co.project_id === pid && co.status === "Approved")
        .reduce((sum, co) => sum + co.amount, 0);
      const revisedContractValue = contract.original_contract_value + approvedCOs;

      const earnedLaborValue = projAgg?.earnedLaborValue ?? 0;
      const laborCPI = earnedLaborValue > 0 ? earnedLaborValue / actualLaborCost : 1;

      const pendingCOExposure = db.changeOrders
        .filter(
          (co) =>
            co.project_id === pid &&
            (co.status === "Pending" || co.status === "Under Review")
        )
        .reduce((sum, co) => sum + co.amount, 0);

      const actualMaterialCost = projAgg?.totalMaterialCost ?? 0;
      const trackedFieldCosts = actualLaborCost + actualMaterialCost;
      const cumulativeBilled = projAgg?.cumulativeBilled ?? 0;
      const billingLag = cumulativeBilled - trackedFieldCosts;

      const highRiskRFIs = db.rfis.filter(
        (r) => r.project_id === pid && r.status !== "Closed" && (r.cost_impact || r.schedule_impact)
      ).length;

      const riskLevel =
        laborHoursOverrunPct > 50 ||
        highRiskRFIs > 3 ||
        new Date(contract.substantial_completion_date) < today ||
        pendingCOExposure > 500000
          ? "HIGH"
          : laborHoursOverrunPct > 20 || highRiskRFIs > 1 || pendingCOExposure > 200000
          ? "MEDIUM"
          : "LOW";

      return {
        project_id: pid,
        project_name: contract.project_name,
        cpi: Math.round(laborCPI * 100) / 100,
        labor_overrun_pct: Math.round(laborHoursOverrunPct * 10) / 10,
        ot_pct: Math.round(otPct * 10) / 10,
        pending_co_exposure: Math.round(pendingCOExposure),
        billing_lag: Math.round(billingLag),
        high_risk_rfis: highRiskRFIs,
        risk_level: riskLevel,
        budgeted_labor_cost: Math.round(budgetedLaborCost),
      };
    });

    const lastSnapshot = getLastSnapshot();

    // Save current as new snapshot
    saveSnapshot({
      snapshot_id: `snap-${Date.now()}`,
      scan_date: today.toISOString().split("T")[0],
      projects: currentProjects,
    });

    if (!lastSnapshot) {
      return {
        has_prior_scan: false,
        message: "First scan recorded. Run again tomorrow to see trend changes.",
        current_snapshot: {
          scan_date: today.toISOString().split("T")[0],
          projects: currentProjects,
        },
      };
    }

    const daysSinceLast = Math.ceil(
      (today.getTime() - new Date(lastSnapshot.scan_date).getTime()) / (1000 * 60 * 60 * 24)
    );

    const deltas = diffSnapshots(currentProjects, lastSnapshot.projects);

    const projectsWorsened = deltas.filter((d) => d.overall_direction === "worsening").length;
    const projectsImproved = deltas.filter((d) => d.overall_direction === "improving").length;

    // Build alert subject from worst changes
    const allEvents = deltas.flatMap((d) => d.new_events.map((e) => `${d.project_name}: ${e}`));
    const alertSubject =
      allEvents.length > 0
        ? `Pulse Alert: ${allEvents[0]}${allEvents.length > 1 ? ` (+${allEvents.length - 1} more events)` : ""}`
        : `Pulse: Portfolio scan — ${projectsWorsened} project(s) worsening, ${daysSinceLast}d since last scan`;

    return {
      has_prior_scan: true,
      last_scan_date: lastSnapshot.scan_date,
      days_since_last_scan: daysSinceLast,
      projects_worsened: projectsWorsened,
      projects_improved: projectsImproved,
      projects_stable: deltas.length - projectsWorsened - projectsImproved,
      threshold_events: allEvents,
      alert_subject: alertSubject,
      project_deltas: deltas,
    };
  },
});

// ─── Tool 11: build_evidence_pack ────────────────────────────────────────────

export const buildEvidencePackTool = tool({
  description:
    "Build a citeable evidence bundle for a specific project. " +
    "Returns field note quotes with dates and IDs, pending CO details with age, " +
    "high-risk RFI list, and behind-schedule billing lines. " +
    "Use this to back up every major dollar finding with specific sources. " +
    "Returns a confidence level based on how many independent sources align.",
  inputSchema: zodSchema(
    z.object({
      project_id: z.string().describe("Project ID to build evidence for"),
    })
  ),
  execute: async ({ project_id }) => {
    const db = getDataset();
    const agg = getAggregates();
    const contract = db.contracts.find((c) => c.project_id === project_id);
    if (!contract) return { error: `Project ${project_id} not found` };

    const today = new Date();

    // ── Field note risk signals ──
    const notes = db.fieldNotes.filter((n) => n.project_id === project_id);
    const riskPatterns: Record<string, RegExp[]> = {
      verbal_approval: [
        /verbal(ly)? (approved?|authorized?|directed?|told)/i,
        /owner (said|told|approved?|directed?)/i,
        /gc (said|told|approved?|directed?)/i,
        /directed to proceed/i,
        /oral approval/i,
        /verbal direction/i,
      ],
      extra_work: [
        /extra work/i,
        /out of scope/i,
        /added scope/i,
        /not in contract/i,
        /additional work/i,
        /beyond original/i,
        /new scope/i,
      ],
      rework: [/rework/i, /remove and replace/i, /incorrect installation/i, /not to spec/i, /tear out/i],
      delay: [/waiting (for|on)/i, /delayed by/i, /held up/i, /blocked/i, /no access/i],
    };

    const fieldNoteSignals: {
      note_id: string;
      date: string;
      author: string;
      signal_type: string;
      matched_phrase: string;
      excerpt: string;
    }[] = [];

    for (const note of notes) {
      for (const [signal, patterns] of Object.entries(riskPatterns)) {
        for (const pattern of patterns) {
          if (pattern.test(note.content)) {
            const match = note.content.match(pattern);
            fieldNoteSignals.push({
              note_id: note.note_id,
              date: note.date,
              author: note.author,
              signal_type: signal,
              matched_phrase: match?.[0] ?? signal,
              excerpt: note.content.substring(0, 300) + (note.content.length > 300 ? "..." : ""),
            });
            break;
          }
        }
      }
    }

    fieldNoteSignals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // ── Pending COs ──
    const pendingCOs = db.changeOrders
      .filter(
        (co) =>
          co.project_id === project_id &&
          (co.status === "Pending" || co.status === "Under Review")
      )
      .map((co) => ({
        co_number: co.co_number,
        amount: co.amount,
        status: co.status,
        description: co.description,
        reason_category: co.reason_category,
        date_submitted: co.date_submitted,
        age_days: Math.ceil(
          (today.getTime() - new Date(co.date_submitted).getTime()) / (1000 * 60 * 60 * 24)
        ),
        related_rfi: co.related_rfi,
        schedule_impact_days: co.schedule_impact_days,
      }))
      .sort((a, b) => b.amount - a.amount);

    // ── High-risk RFIs ──
    const highRiskRFIs = db.rfis
      .filter(
        (r) =>
          r.project_id === project_id &&
          r.status !== "Closed" &&
          (r.cost_impact || r.schedule_impact || r.priority === "Critical")
      )
      .map((r) => ({
        rfi_number: r.rfi_number,
        subject: r.subject,
        priority: r.priority,
        status: r.status,
        cost_impact: r.cost_impact,
        schedule_impact: r.schedule_impact,
        date_submitted: r.date_submitted,
        days_open: Math.ceil(
          (today.getTime() - new Date(r.date_submitted).getTime()) / (1000 * 60 * 60 * 24)
        ),
        date_required: r.date_required,
        assigned_to: r.assigned_to,
      }))
      .sort((a, b) => {
        const pri: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
        return (pri[b.priority] ?? 0) - (pri[a.priority] ?? 0);
      });

    // ── Behind-schedule billing lines ──
    const projAgg = agg.get(project_id);
    const latestBillingItems = projAgg?.latestBillingItems ?? [];
    const contractStart = new Date(contract.contract_date);
    const contractEnd = new Date(contract.substantial_completion_date);
    const projectTimelinePct =
      contractEnd > contractStart
        ? Math.min(
            1,
            (today.getTime() - contractStart.getTime()) /
              (contractEnd.getTime() - contractStart.getTime())
          )
        : 0;

    const behindScheduleLines = latestBillingItems
      .filter((item) => {
        const linePct = item.pct_complete / 100;
        return linePct < projectTimelinePct * 0.7; // line is behind by >30% of timeline pace
      })
      .map((item) => ({
        sov_line_id: item.sov_line_id,
        description: item.description,
        scheduled_value: item.scheduled_value,
        pct_complete: item.pct_complete,
        expected_pct: Math.round(projectTimelinePct * 70 * 10) / 10,
        balance_to_finish: item.balance_to_finish,
      }))
      .sort((a, b) => b.scheduled_value - a.scheduled_value);

    // ── Confidence scoring ──
    const sourceCount = [
      fieldNoteSignals.length > 0,
      pendingCOs.length > 0,
      highRiskRFIs.length > 0,
      behindScheduleLines.length > 0,
    ].filter(Boolean).length;

    const confidence = sourceCount >= 3 ? "high" : sourceCount === 2 ? "medium" : "low";

    return {
      project_id,
      project_name: contract.project_name,
      evidence_date: today.toISOString().split("T")[0],
      confidence,
      confidence_note: `${sourceCount} of 4 evidence sources have findings`,
      field_note_signals: fieldNoteSignals.slice(0, 10),
      field_note_signal_count: fieldNoteSignals.length,
      signal_breakdown: fieldNoteSignals.reduce<Record<string, number>>((acc, s) => {
        acc[s.signal_type] = (acc[s.signal_type] ?? 0) + 1;
        return acc;
      }, {}),
      pending_cos: pendingCOs,
      pending_co_total: Math.round(pendingCOs.reduce((s, co) => s + co.amount, 0)),
      high_risk_rfis: highRiskRFIs,
      behind_schedule_billing_lines: behindScheduleLines,
    };
  },
});

// ─── Tool 12: detect_co_leakage ──────────────────────────────────────────────

export const detectCOLeakageTool = tool({
  description:
    "Detect scope change work that is happening on-site but has NOT been captured in a " +
    "formal change order — the most common source of unrecovered margin loss. " +
    "Scans field notes and RFIs for verbal approvals, extra work, and rework signals, " +
    "then checks if a matching CO was ever submitted. Unmatched events become CO candidates " +
    "with estimated dollar exposure. Run this after analyze_field_notes flags risk signals.",
  inputSchema: zodSchema(
    z.object({
      project_id: z.string().describe("Project ID to scan for CO leakage"),
    })
  ),
  execute: async ({ project_id }) => {
    const db = getDataset();
    const agg = getAggregates();
    const contract = db.contracts.find((c) => c.project_id === project_id);
    if (!contract) return { error: `Project ${project_id} not found` };

    const today = new Date();
    const projAgg = agg.get(project_id);
    const avgRate = projAgg?.avgHourlyRate ?? 55;

    // ── Step 1: Extract scope change events from field notes ──
    const notes = db.fieldNotes.filter((n) => n.project_id === project_id);
    const scopePatterns: RegExp[] = [
      /verbal(ly)? (approved?|authorized?|directed?|told)/i,
      /owner (said|told|approved?|directed?)/i,
      /gc (said|told|approved?|directed?)/i,
      /directed to proceed/i,
      /oral approval/i,
      /extra work/i,
      /out of scope/i,
      /added scope/i,
      /not in contract/i,
      /additional work/i,
      /beyond original/i,
      /new scope/i,
      /rework/i,
      /remove and replace/i,
      /demo and reinstall/i,
      /tear out/i,
    ];

    interface ScopeEvent {
      source: "field_note" | "rfi";
      source_id: string;
      date: string;
      excerpt: string;
      matched_phrase: string;
    }

    const scopeEvents: ScopeEvent[] = [];

    for (const note of notes) {
      for (const pattern of scopePatterns) {
        if (pattern.test(note.content)) {
          const match = note.content.match(pattern);
          scopeEvents.push({
            source: "field_note",
            source_id: note.note_id,
            date: note.date,
            excerpt: note.content.substring(0, 250) + (note.content.length > 250 ? "..." : ""),
            matched_phrase: match?.[0] ?? "",
          });
          break; // one event per note
        }
      }
    }

    // ── Step 2: Add cost-impact RFIs ──
    const costRFIs = db.rfis.filter(
      (r) => r.project_id === project_id && r.cost_impact
    );
    for (const rfi of costRFIs) {
      scopeEvents.push({
        source: "rfi",
        source_id: rfi.rfi_number,
        date: rfi.date_submitted,
        excerpt: rfi.subject,
        matched_phrase: "cost_impact=true",
      });
    }

    // ── Step 3: For each event, check if a matching CO exists ──
    const hvacKeywords = [
      "ductwork", "duct", "piping", "pipe", "controls", "equipment", "hvac",
      "rooftop", "rtu", "chiller", "vav", "insulation", "extra", "additional",
      "added", "scope", "change", "rework", "demo", "reinstall",
    ];

    function hasKeywordOverlap(text1: string, text2: string): boolean {
      const t1 = text1.toLowerCase();
      const t2 = text2.toLowerCase();
      return hvacKeywords.some((k) => t1.includes(k) && t2.includes(k));
    }

    const projectCOs = db.changeOrders.filter((co) => co.project_id === project_id);

    const coCandidates: {
      source: string;
      source_id: string;
      date: string;
      matched_phrase: string;
      excerpt: string;
      estimated_exposure: number;
      suggested_co_title: string;
      evidence_summary: string;
    }[] = [];

    for (const event of scopeEvents) {
      const eventDate = new Date(event.date);

      const matchingCO = projectCOs.find((co) => {
        const coDate = new Date(co.date_submitted);
        const daysDiff =
          Math.abs((coDate.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 21) return false;
        // Check keyword overlap between event excerpt and CO description
        return hasKeywordOverlap(event.excerpt, co.description);
      });

      if (!matchingCO) {
        // Estimate exposure from labor hours in ±3-day window around event
        const windowStart = new Date(eventDate.getTime() - 3 * 24 * 60 * 60 * 1000);
        const windowEnd = new Date(eventDate.getTime() + 3 * 24 * 60 * 60 * 1000);

        const windowLogs = db.laborLogs.filter((l) => {
          if (l.project_id !== project_id) return false;
          const d = new Date(l.date);
          return d >= windowStart && d <= windowEnd;
        });

        const windowHours = windowLogs.reduce((s, l) => s + l.hours_st + l.hours_ot, 0);
        const estimatedExposure = Math.round(windowHours * avgRate * 1.45);

        const typeLabel =
          event.matched_phrase.toLowerCase().includes("verbal") ||
          event.matched_phrase.toLowerCase().includes("oral") ||
          event.matched_phrase.toLowerCase().includes("directed")
            ? "Owner-Directed Scope Change"
            : event.matched_phrase.toLowerCase().includes("rework") ||
              event.matched_phrase.toLowerCase().includes("remove") ||
              event.matched_phrase.toLowerCase().includes("tear")
            ? "Rework / Non-Conforming Work"
            : "Extra Work — Scope Addition";

        coCandidates.push({
          source: event.source,
          source_id: event.source_id,
          date: event.date,
          matched_phrase: event.matched_phrase,
          excerpt: event.excerpt,
          estimated_exposure: estimatedExposure,
          suggested_co_title: `${typeLabel} — ${event.date}`,
          evidence_summary: `${event.source === "rfi" ? "RFI" : "Field note"} ${event.source_id} dated ${event.date}: "${event.matched_phrase}"`,
        });
      }
    }

    coCandidates.sort((a, b) => b.estimated_exposure - a.estimated_exposure);

    const totalEstimatedExposure = coCandidates.reduce(
      (s, c) => s + c.estimated_exposure,
      0
    );

    return {
      project_id,
      project_name: contract.project_name,
      scope_events_found: scopeEvents.length,
      co_candidates: coCandidates.slice(0, 15),
      total_candidates: coCandidates.length,
      total_estimated_exposure: totalEstimatedExposure,
      matched_to_existing_cos: scopeEvents.length - coCandidates.length,
      alert:
        coCandidates.length > 0
          ? `${coCandidates.length} scope change events have NO matching change order — estimated $${Math.round(totalEstimatedExposure / 1000)}K in unrecovered exposure`
          : "No CO leakage detected — all scope change signals have matching COs",
    };
  },
});

// ─── Tool 13: build_margin_recovery_plan ─────────────────────────────────────

export const buildMarginRecoveryPlanTool = tool({
  description:
    "Build a prioritized, dollar-quantified plan to recover project margin. " +
    "Converts the forecast loss into specific recovery levers ranked by expected dollars " +
    "and speed: CO approvals, missing CO filings, OT reduction, and billing acceleration. " +
    "Always call this for every HIGH-risk project to give the CFO a concrete path forward.",
  inputSchema: zodSchema(
    z.object({
      project_id: z.string().describe("Project ID"),
      target_margin_pct: z
        .number()
        .optional()
        .describe("Target margin % to hit (default 15%)"),
    })
  ),
  execute: async ({ project_id, target_margin_pct = 15 }) => {
    const db = getDataset();
    const agg = getAggregates();
    const contract = db.contracts.find((c) => c.project_id === project_id);
    if (!contract) return { error: `Project ${project_id} not found` };

    const projAgg = agg.get(project_id);
    const today = new Date();

    // ── Actuals ──
    const actualLaborCost = projAgg?.totalLaborCost ?? 0;
    const actualMaterialCost = projAgg?.totalMaterialCost ?? 0;
    const totalOTHours = projAgg?.totalOTHours ?? 0;
    const avgRate = projAgg?.avgHourlyRate ?? 55;

    // ── Budget ──
    const budgets = db.sovBudget.filter((b) => b.project_id === project_id);
    const budgetedLaborCost = budgets.reduce((s, b) => s + b.estimated_labor_cost, 0);
    const budgetedLaborHours = budgets.reduce((s, b) => s + b.estimated_labor_hours, 0);

    // ── COs ──
    const approvedCOs = db.changeOrders
      .filter((co) => co.project_id === project_id && co.status === "Approved")
      .reduce((sum, co) => sum + co.amount, 0);
    const pendingCOs = db.changeOrders.filter(
      (co) =>
        co.project_id === project_id &&
        (co.status === "Pending" || co.status === "Under Review")
    );
    const pendingCOTotal = pendingCOs.reduce((s, co) => s + co.amount, 0);

    const revisedContract = contract.original_contract_value + approvedCOs;

    // ── Progress & EV ──
    const earnedLaborValue = projAgg?.earnedLaborValue ?? 0;
    const laborCPI = earnedLaborValue > 0 ? earnedLaborValue / actualLaborCost : 1;
    const earnedValue = projAgg?.earnedValue ?? 0;
    const pctComplete = revisedContract > 0 ? earnedValue / revisedContract : 0;
    const remainingWork = 1 - pctComplete;

    // ── Current forecast ──
    const laborEAC =
      laborCPI > 0
        ? actualLaborCost + (budgetedLaborCost - earnedLaborValue) / laborCPI
        : budgetedLaborCost;
    const laborOverrun = Math.max(0, laborEAC - budgetedLaborCost);
    const totalBudgetedCost =
      budgets.reduce(
        (s, b) =>
          s +
          b.estimated_labor_cost +
          b.estimated_material_cost +
          b.estimated_equipment_cost +
          b.estimated_sub_cost,
        0
      );
    const forecastTotalCost = totalBudgetedCost + laborOverrun;
    const forecastMarginPct =
      revisedContract > 0 ? ((revisedContract - forecastTotalCost) / revisedContract) * 100 : 0;
    const bidMarginPct =
      revisedContract > 0 ? ((revisedContract - totalBudgetedCost) / revisedContract) * 100 : 0;

    const targetProfit = (target_margin_pct / 100) * revisedContract;
    const forecastProfit = revisedContract - forecastTotalCost;
    const gapDollars = Math.max(0, targetProfit - forecastProfit);
    const gapMarginPts = Math.max(0, target_margin_pct - forecastMarginPct);

    // ── Recovery levers ──
    const levers: {
      rank: number;
      name: string;
      type: string;
      expected_dollars: number;
      timeline: string;
      owner: string;
      action: string;
    }[] = [];

    // Lever 1: Push pending COs to approved (fastest — days)
    if (pendingCOTotal > 0) {
      levers.push({
        rank: 1,
        name: "Approve Pending Change Orders",
        type: "revenue_recovery",
        expected_dollars: Math.round(pendingCOTotal),
        timeline: "1–5 days",
        owner: "PM + GC",
        action: `Follow up on ${pendingCOs.length} pending CO(s) totaling $${Math.round(pendingCOTotal / 1000)}K. Top priority: ${pendingCOs.sort((a, b) => b.amount - a.amount)[0]?.co_number} ($${Math.round((pendingCOs.sort((a, b) => b.amount - a.amount)[0]?.amount ?? 0) / 1000)}K).`,
      });
    }

    // Lever 2: File missing CO candidates from field notes (weeks)
    // Run a simplified version of CO leakage detection
    const scopeKeywordPatterns = [
      /verbal(ly)? (approved?|authorized?|directed?)/i,
      /extra work/i,
      /out of scope/i,
      /added scope/i,
      /directed to proceed/i,
      /rework/i,
    ];
    const notes = db.fieldNotes.filter((n) => n.project_id === project_id);
    let leakageEventCount = 0;
    let leakageEstimate = 0;
    for (const note of notes) {
      for (const pattern of scopeKeywordPatterns) {
        if (pattern.test(note.content)) {
          // Check no CO within 21 days
          const noteDate = new Date(note.date);
          const matched = db.changeOrders.some((co) => {
            if (co.project_id !== project_id) return false;
            const coDate = new Date(co.date_submitted);
            return Math.abs((coDate.getTime() - noteDate.getTime()) / (1000 * 60 * 60 * 24)) <= 21;
          });
          if (!matched) {
            leakageEventCount++;
            leakageEstimate += avgRate * 16 * 1.45; // rough: 2-day scope event at avg rate + burden
          }
          break;
        }
      }
    }
    if (leakageEventCount > 0) {
      levers.push({
        rank: 2,
        name: "File Missing Change Orders (CO Leakage)",
        type: "revenue_recovery",
        expected_dollars: Math.round(leakageEstimate),
        timeline: "1–3 weeks",
        owner: "PM + Estimator",
        action: `${leakageEventCount} field note events lack a matching CO. Run detect_co_leakage for full details. File COs with field note citations and RFI cross-references to support $${Math.round(leakageEstimate / 1000)}K in estimated exposure.`,
      });
    }

    // Lever 3: OT reduction (forward-looking cost savings)
    // Project OT savings over remaining work weeks
    const contractEnd = new Date(contract.substantial_completion_date);
    const weeksRemaining = Math.max(
      0,
      (contractEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7)
    );
    const laborByWeek = projAgg?.laborByWeek ?? [];
    const recentWeeks = laborByWeek.slice(-4);
    const avgWeeklyOTHours =
      recentWeeks.length > 0
        ? recentWeeks.reduce((s, w) => s + w.ot, 0) / recentWeeks.length
        : 0;
    const otSavings = Math.round(avgWeeklyOTHours * 0.5 * avgRate * 1.45 * weeksRemaining);
    // OT costs extra 0.5× base rate; savings if eliminated

    if (otSavings > 5000) {
      levers.push({
        rank: 3,
        name: "Eliminate Overtime — Return to Straight-Time Crew",
        type: "cost_reduction",
        expected_dollars: otSavings,
        timeline: "Immediate (next week)",
        owner: "Superintendent + Foreman",
        action: `Current avg OT is ${Math.round(avgWeeklyOTHours)}h/week. ${Math.round(weeksRemaining)} weeks remaining. Eliminating OT saves ~$${Math.round(otSavings / 1000)}K in premium pay. Requires additional crew members or adjusted sequencing.`,
      });
    }

    // Lever 4: Accelerate billing (cash, clearly labeled)
    const billingLag = (projAgg?.cumulativeBilled ?? 0) - (actualLaborCost + actualMaterialCost);
    if (billingLag < -50000) {
      levers.push({
        rank: 4,
        name: "Accelerate Billing for Completed Work",
        type: "cash_flow",
        expected_dollars: Math.abs(Math.round(billingLag)),
        timeline: "Next pay app cycle (2–4 weeks)",
        owner: "PM + Controller",
        action: `Under-billed by $${Math.abs(Math.round(billingLag / 1000))}K. Pull forward billing for completed SOV lines. This is a cash flow improvement, not margin improvement, but reduces financing cost and pressure.`,
      });
    }

    const totalRecoverable = levers
      .filter((l) => l.type !== "cash_flow")
      .reduce((s, l) => s + l.expected_dollars, 0);
    const isRecoverable = totalRecoverable >= gapDollars * 0.8;

    return {
      project_id,
      project_name: contract.project_name,
      analysis_date: today.toISOString().split("T")[0],
      margin_context: {
        bid_margin_pct: Math.round(bidMarginPct * 10) / 10,
        forecast_margin_pct: Math.round(forecastMarginPct * 10) / 10,
        target_margin_pct,
        erosion_pts: Math.round((bidMarginPct - forecastMarginPct) * 10) / 10,
        gap_to_target_dollars: Math.round(gapDollars),
        gap_to_target_margin_pts: Math.round(gapMarginPts * 10) / 10,
      },
      levers,
      total_recoverable_dollars: Math.round(totalRecoverable),
      is_recoverable: isRecoverable,
      recovery_summary: isRecoverable
        ? `Recovery is possible: $${Math.round(totalRecoverable / 1000)}K in identified levers vs $${Math.round(gapDollars / 1000)}K needed to reach ${target_margin_pct}% margin.`
        : `Gap of $${Math.round(gapDollars / 1000)}K exceeds identified levers ($${Math.round(totalRecoverable / 1000)}K). Full recovery to ${target_margin_pct}% margin is unlikely without significant cost action.`,
    };
  },
});

// ─── Tool 14: build_margin_waterfall ─────────────────────────────────────────

export const buildMarginWaterfallTool = tool({
  description:
    "Generate a margin waterfall breakdown showing how the project went from bid margin " +
    "to current forecast margin — step by step in dollars and margin points. " +
    "Shows: bid profit → labor drag → material drag → approved CO lift → forecast profit. " +
    "Also surfaces pending CO risk and billing lag separately. " +
    "Ideal for CFO briefings: shows exactly where the margin went.",
  inputSchema: zodSchema(
    z.object({
      project_id: z.string().describe("Project ID"),
    })
  ),
  execute: async ({ project_id }) => {
    const db = getDataset();
    const agg = getAggregates();
    const contract = db.contracts.find((c) => c.project_id === project_id);
    if (!contract) return { error: `Project ${project_id} not found` };

    const projAgg = agg.get(project_id);

    // ── Costs ──
    const actualLaborCost = projAgg?.totalLaborCost ?? 0;
    const actualMaterialCost = projAgg?.totalMaterialCost ?? 0;

    const budgets = db.sovBudget.filter((b) => b.project_id === project_id);
    const budgetedLaborCost = budgets.reduce((s, b) => s + b.estimated_labor_cost, 0);
    const budgetedMaterialCost = budgets.reduce((s, b) => s + b.estimated_material_cost, 0);
    const budgetedEquipCost = budgets.reduce((s, b) => s + b.estimated_equipment_cost, 0);
    const budgetedSubCost = budgets.reduce((s, b) => s + b.estimated_sub_cost, 0);
    const totalBudgetedCost =
      budgetedLaborCost + budgetedMaterialCost + budgetedEquipCost + budgetedSubCost;

    // ── COs ──
    const approvedCOAmount = db.changeOrders
      .filter((co) => co.project_id === project_id && co.status === "Approved")
      .reduce((sum, co) => sum + co.amount, 0);
    const pendingCOAmount = db.changeOrders
      .filter(
        (co) =>
          co.project_id === project_id &&
          (co.status === "Pending" || co.status === "Under Review")
      )
      .reduce((sum, co) => sum + co.amount, 0);
    const rejectedCOAmount = db.changeOrders
      .filter((co) => co.project_id === project_id && co.status === "Rejected")
      .reduce((sum, co) => sum + co.amount, 0);

    const revisedContractValue = contract.original_contract_value + approvedCOAmount;

    // ── Waterfall math ──
    const bidGrossProfit = revisedContractValue - totalBudgetedCost;
    const laborDrag = actualLaborCost - budgetedLaborCost; // positive = overrun = bad
    const materialDrag = actualMaterialCost - budgetedMaterialCost;
    const forecastGrossProfit = bidGrossProfit - laborDrag - materialDrag;

    const billingLag = (projAgg?.cumulativeBilled ?? 0) - (actualLaborCost + actualMaterialCost);

    function toMarginPts(dollars: number) {
      return revisedContractValue > 0
        ? Math.round((dollars / revisedContractValue) * 1000) / 10
        : 0;
    }

    const steps = [
      {
        step: 1,
        label: "Bid Gross Profit (at contract value)",
        dollars: Math.round(bidGrossProfit),
        margin_pts: toMarginPts(bidGrossProfit),
        direction: "baseline",
        note: `Revised contract: $${Math.round(revisedContractValue / 1000)}K — Total budget: $${Math.round(totalBudgetedCost / 1000)}K`,
      },
      {
        step: 2,
        label: "Labor Overrun (cost vs budget)",
        dollars: -Math.round(laborDrag),
        margin_pts: -toMarginPts(laborDrag),
        direction: laborDrag > 0 ? "negative" : "positive",
        note:
          laborDrag > 0
            ? `Actual labor $${Math.round(actualLaborCost / 1000)}K vs budget $${Math.round(budgetedLaborCost / 1000)}K — $${Math.round(laborDrag / 1000)}K overrun`
            : `Labor under budget by $${Math.round(Math.abs(laborDrag) / 1000)}K — favorable`,
      },
      {
        step: 3,
        label: "Material Variance (cost vs budget)",
        dollars: -Math.round(materialDrag),
        margin_pts: -toMarginPts(materialDrag),
        direction: materialDrag > 0 ? "negative" : "positive",
        note:
          materialDrag > 0
            ? `Material $${Math.round(actualMaterialCost / 1000)}K vs budget $${Math.round(budgetedMaterialCost / 1000)}K — $${Math.round(materialDrag / 1000)}K over`
            : `Material under budget by $${Math.round(Math.abs(materialDrag) / 1000)}K`,
      },
      {
        step: 4,
        label: "Forecast Gross Profit",
        dollars: Math.round(forecastGrossProfit),
        margin_pts: toMarginPts(forecastGrossProfit),
        direction: "result",
        note: "Based on direct costs to date. Excludes overhead not captured in sov_budget.",
      },
    ];

    const pendingCoRiskPts = toMarginPts(pendingCOAmount);

    return {
      project_id,
      project_name: contract.project_name,
      original_contract_value: contract.original_contract_value,
      approved_co_amount: Math.round(approvedCOAmount),
      revised_contract_value: Math.round(revisedContractValue),
      waterfall_steps: steps,
      bid_margin_pct: toMarginPts(bidGrossProfit),
      forecast_margin_pct: toMarginPts(forecastGrossProfit),
      erosion_pts: toMarginPts(bidGrossProfit) - toMarginPts(forecastGrossProfit),
      separate_risks: {
        pending_co_exposure: Math.round(pendingCOAmount),
        pending_co_as_margin_pts: pendingCoRiskPts,
        pending_co_note: `If pending COs are approved, margin improves by ~${pendingCoRiskPts} pts`,
        rejected_co_amount: Math.round(rejectedCOAmount),
        billing_lag: Math.round(billingLag),
        billing_lag_note:
          billingLag < 0
            ? `Under-billed by $${Math.abs(Math.round(billingLag / 1000))}K — cash flow risk`
            : `Over-billed by $${Math.round(billingLag / 1000)}K — watch for overbilling exposure`,
      },
    };
  },
});

// ─── Tool 15: generate_war_room_packet ───────────────────────────────────────

export const generateWarRoomPacketTool = tool({
  description:
    "Generate a structured weekly war room briefing packet across the entire portfolio. " +
    "Returns: top risks by project, overdue actions (RFIs + aging COs), CO pipeline by age bucket, " +
    "under-billed projects, and portfolio OT trend. " +
    "Designed for weekly operations meetings. Includes a markdown_summary field for direct email use.",
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    const db = getDataset();
    const agg = getAggregates();
    const today = new Date();

    // ── Top risks ──
    const topRisks = db.contracts
      .map((contract) => {
        const pid = contract.project_id;
        const projAgg = agg.get(pid);
        const budgets = db.sovBudget.filter((b) => b.project_id === pid);
        const budgetedLaborHours = budgets.reduce((s, b) => s + b.estimated_labor_hours, 0);
        const actualLaborHours = projAgg?.totalLaborHours ?? 0;
        const overrunPct =
          budgetedLaborHours > 0
            ? ((actualLaborHours - budgetedLaborHours) / budgetedLaborHours) * 100
            : 0;
        const pendingCO = db.changeOrders
          .filter(
            (co) =>
              co.project_id === pid &&
              (co.status === "Pending" || co.status === "Under Review")
          )
          .reduce((s, co) => s + co.amount, 0);
        const highRiskRFIs = db.rfis.filter(
          (r) => r.project_id === pid && r.status !== "Closed" && (r.cost_impact || r.schedule_impact)
        ).length;
        const earnedLaborValue = projAgg?.earnedLaborValue ?? 0;
        const actualLaborCost = projAgg?.totalLaborCost ?? 0;
        const cpi = earnedLaborValue > 0 ? earnedLaborValue / actualLaborCost : 1;

        return {
          project_id: pid,
          project_name: contract.project_name,
          gc_name: contract.gc_name,
          labor_overrun_pct: Math.round(overrunPct * 10) / 10,
          cpi: Math.round(cpi * 100) / 100,
          pending_co_exposure: Math.round(pendingCO),
          high_risk_rfis: highRiskRFIs,
          one_line:
            `CPI ${Math.round(cpi * 100) / 100} | Labor ${Math.round(overrunPct)}% over | ` +
            `$${Math.round(pendingCO / 1000)}K pending COs | ${highRiskRFIs} risky RFIs`,
        };
      })
      .sort((a, b) => b.labor_overrun_pct - a.labor_overrun_pct);

    // ── Overdue actions ──
    const overdueRFIs = db.rfis
      .filter((r) => r.status !== "Closed" && r.date_required && new Date(r.date_required) < today)
      .map((r) => {
        const contract = db.contracts.find((c) => c.project_id === r.project_id);
        return {
          type: "RFI",
          id: r.rfi_number,
          project: contract?.project_name ?? r.project_id,
          description: r.subject,
          days_overdue: Math.ceil(
            (today.getTime() - new Date(r.date_required).getTime()) / (1000 * 60 * 60 * 24)
          ),
          assigned_to: r.assigned_to,
          priority: r.priority,
        };
      })
      .sort((a, b) => b.days_overdue - a.days_overdue)
      .slice(0, 10);

    const agingCOs = db.changeOrders
      .filter(
        (co) =>
          (co.status === "Pending" || co.status === "Under Review") &&
          Math.ceil(
            (today.getTime() - new Date(co.date_submitted).getTime()) / (1000 * 60 * 60 * 24)
          ) > 21
      )
      .map((co) => {
        const contract = db.contracts.find((c) => c.project_id === co.project_id);
        return {
          type: "CO",
          id: co.co_number,
          project: contract?.project_name ?? co.project_id,
          description: co.description,
          amount: co.amount,
          days_pending: Math.ceil(
            (today.getTime() - new Date(co.date_submitted).getTime()) / (1000 * 60 * 60 * 24)
          ),
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // ── CO pipeline by age bucket ──
    const pendingCOsAll = db.changeOrders.filter(
      (co) => co.status === "Pending" || co.status === "Under Review"
    );
    const coPipeline: Record<string, { count: number; total: number; total_k: number }> = {
      "0-7d": { count: 0, total: 0, total_k: 0 },
      "8-21d": { count: 0, total: 0, total_k: 0 },
      "22-45d": { count: 0, total: 0, total_k: 0 },
      "45d+": { count: 0, total: 0, total_k: 0 },
    };
    for (const co of pendingCOsAll) {
      const age = Math.ceil(
        (today.getTime() - new Date(co.date_submitted).getTime()) / (1000 * 60 * 60 * 24)
      );
      const bucket =
        age <= 7 ? "0-7d" : age <= 21 ? "8-21d" : age <= 45 ? "22-45d" : "45d+";
      coPipeline[bucket].count++;
      coPipeline[bucket].total += co.amount;
      coPipeline[bucket].total_k = Math.round(coPipeline[bucket].total / 1000);
    }

    // ── Under-billed projects ──
    const underbillingSummary = db.contracts
      .map((c) => {
        const projAgg = agg.get(c.project_id);
        const fieldCosts =
          (projAgg?.totalLaborCost ?? 0) + (projAgg?.totalMaterialCost ?? 0);
        const billed = projAgg?.cumulativeBilled ?? 0;
        const lag = billed - fieldCosts;
        return { project_name: c.project_name, billing_lag: Math.round(lag), billed: Math.round(billed) };
      })
      .filter((p) => p.billing_lag < -100000)
      .sort((a, b) => a.billing_lag - b.billing_lag);

    // ── Portfolio OT trend ──
    const allWeeks = new Map<string, { ot: number; st: number }>();
    for (const [, projAgg] of agg) {
      for (const week of projAgg.laborByWeek) {
        const existing = allWeeks.get(week.week) ?? { ot: 0, st: 0 };
        existing.ot += week.ot;
        existing.st += week.st;
        allWeeks.set(week.week, existing);
      }
    }
    const portfolioOTTrend = Array.from(allWeeks.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([week, data]) => ({
        week,
        ot_pct: Math.round((data.ot / (data.st + data.ot || 1)) * 1000) / 10,
        ot_hours: Math.round(data.ot),
      }));
    const currentOTPct = portfolioOTTrend[portfolioOTTrend.length - 1]?.ot_pct ?? 0;
    const priorAvgOTPct =
      portfolioOTTrend.length > 1
        ? portfolioOTTrend.slice(0, -1).reduce((s, w) => s + w.ot_pct, 0) /
          (portfolioOTTrend.length - 1)
        : currentOTPct;

    // ── Markdown summary ──
    const weekEnd = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const totalPendingCO = Object.values(coPipeline).reduce((s, b) => s + b.total, 0);
    const markdownSummary = `
# Pulse Weekly War Room — Week Ending ${weekEnd}

## Portfolio Risk
${topRisks
  .map((p, i) => `${i + 1}. **${p.project_name}** — ${p.one_line}`)
  .join("\n")}

## Overdue Actions (${overdueRFIs.length + agingCOs.length} items)
${overdueRFIs
  .slice(0, 5)
  .map((r) => `- [RFI] ${r.id} · ${r.project} · ${r.days_overdue}d overdue · ${r.assigned_to}`)
  .join("\n")}
${agingCOs
  .slice(0, 5)
  .map((co) => `- [CO] ${co.id} · ${co.project} · $${Math.round(co.amount / 1000)}K · ${co.days_pending}d pending`)
  .join("\n")}

## CO Pipeline — $${Math.round(totalPendingCO / 1000)}K Total Pending
| Age | Count | Amount |
|-----|-------|--------|
${Object.entries(coPipeline)
  .map(([bucket, data]) => `| ${bucket} | ${data.count} | $${data.total_k}K |`)
  .join("\n")}

## Under-Billed Projects
${underbillingSummary.map((p) => `- **${p.project_name}**: under-billed by $${Math.abs(Math.round(p.billing_lag / 1000))}K`).join("\n")}

## Portfolio OT — ${currentOTPct}% this week (vs ${Math.round(priorAvgOTPct * 10) / 10}% prior avg)
`.trim();

    return {
      week_ending: weekEnd,
      top_risks: topRisks,
      actions_due: {
        overdue_rfis: overdueRFIs,
        aging_cos: agingCOs,
        total_action_items: overdueRFIs.length + agingCOs.length,
      },
      co_pipeline: coPipeline,
      co_pipeline_total: Math.round(totalPendingCO),
      underbilling_summary: underbillingSummary,
      portfolio_ot_trend: portfolioOTTrend,
      ot_this_week_pct: currentOTPct,
      ot_prior_avg_pct: Math.round(priorAvgOTPct * 10) / 10,
      markdown_summary: markdownSummary,
    };
  },
});

// ─── Tool 16: draft_pm_email ──────────────────────────────────────────────────

export const draftPMEmailTool = tool({
  description:
    "Draft a professional action email for the Project Manager of a specific project. " +
    "Returns { subject, body } ready to pass to send_alert_email. " +
    "The email lists the top 3 critical issues with owner roles, specific dollar amounts, " +
    "and clear next steps. Always call this before sending a PM email.",
  inputSchema: zodSchema(
    z.object({
      project_id: z.string().describe("Project ID to draft PM email for"),
    })
  ),
  execute: async ({ project_id }) => {
    const db = getDataset();
    const agg = getAggregates();
    const contract = db.contracts.find((c) => c.project_id === project_id);
    if (!contract) return { error: `Project ${project_id} not found` };

    const today = new Date();
    const projAgg = agg.get(project_id);

    const actualLaborCost = projAgg?.totalLaborCost ?? 0;
    const budgets = db.sovBudget.filter((b) => b.project_id === project_id);
    const budgetedLaborCost = budgets.reduce((s, b) => s + b.estimated_labor_cost, 0);
    const earnedLaborValue = projAgg?.earnedLaborValue ?? 0;
    const cpi = earnedLaborValue > 0 ? Math.round((earnedLaborValue / actualLaborCost) * 100) / 100 : 1;
    const laborOverrun = Math.max(0, actualLaborCost - budgetedLaborCost);

    const pendingCOs = db.changeOrders
      .filter(
        (co) =>
          co.project_id === project_id &&
          (co.status === "Pending" || co.status === "Under Review")
      )
      .sort((a, b) => b.amount - a.amount);
    const pendingCOTotal = pendingCOs.reduce((s, co) => s + co.amount, 0);

    const openRFIs = db.rfis.filter(
      (r) => r.project_id === project_id && r.status !== "Closed" && r.cost_impact
    ).length;

    const otPct =
      projAgg && projAgg.totalLaborHours > 0
        ? Math.round((projAgg.totalOTHours / projAgg.totalLaborHours) * 1000) / 10
        : 0;

    const billingLag = (projAgg?.cumulativeBilled ?? 0) - (actualLaborCost + (projAgg?.totalMaterialCost ?? 0));

    const topPendingCO = pendingCOs[0];

    const issues: string[] = [];
    if (laborOverrun > 0) {
      issues.push(
        `1. LABOR OVERRUN — $${Math.round(laborOverrun / 1000)}K over budget (CPI: ${cpi})\n` +
          `   Action: Conduct foreman review this week. Identify root cause (scope additions, productivity, rework).\n` +
          `   Owner: Superintendent\n` +
          `   Target: Submit CO documentation for any owner-directed work within 5 business days.`
      );
    }
    if (pendingCOTotal > 0) {
      issues.push(
        `2. PENDING CHANGE ORDERS — $${Math.round(pendingCOTotal / 1000)}K awaiting approval (${pendingCOs.length} COs)\n` +
          (topPendingCO
            ? `   Top priority: ${topPendingCO.co_number} for $${Math.round(topPendingCO.amount / 1000)}K (${Math.ceil((today.getTime() - new Date(topPendingCO.date_submitted).getTime()) / 86400000)}d pending).\n`
            : "") +
          `   Action: Escalate to GC for approval. Attach field note evidence and RFI cross-references.\n` +
          `   Owner: PM + GC Contact`
      );
    }
    if (otPct > 15) {
      issues.push(
        `3. HIGH OVERTIME — ${otPct}% of labor hours are OT\n` +
          `   Action: Identify which SOV lines are driving OT. Evaluate adding crew members to restore straight-time production.\n` +
          `   Owner: Superintendent + Foreman`
      );
    } else if (billingLag < -100000) {
      issues.push(
        `3. BILLING LAG — Under-billed by $${Math.abs(Math.round(billingLag / 1000))}K\n` +
          `   Action: Pull forward billing for all completed SOV lines in next pay application.\n` +
          `   Owner: PM + Controller`
      );
    }
    if (openRFIs > 0) {
      issues.push(
        `${issues.length + 1}. OPEN RFIs WITH COST IMPACT — ${openRFIs} RFI(s) unresolved\n` +
          `   Action: Escalate to architect/engineer for response. Log all schedule/cost impacts.\n` +
          `   Owner: PM`
      );
    }

    const subject = `[Action Required] ${contract.project_name} — Margin Alert: $${Math.round((laborOverrun + pendingCOTotal) / 1000)}K at Risk`;

    const body =
      `Project: ${contract.project_name} (${project_id})\n` +
      `GC: ${contract.gc_name}\n` +
      `Date: ${today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}\n` +
      `\n` +
      `The following issues require your immediate attention:\n` +
      `\n` +
      issues.join("\n\n") +
      `\n\n` +
      `Please respond with a status update by end of week.\n` +
      `\n` +
      `This report was generated by Pulse margin intelligence.`;

    return { subject, body, priority: "high" as const };
  },
});

// ─── Tool 17: draft_gc_email ──────────────────────────────────────────────────

export const draftGCEmailTool = tool({
  description:
    "Draft a professional, evidence-backed email to the General Contractor requesting " +
    "change order approvals for a specific project. " +
    "Returns { subject, body } ready to pass to send_alert_email. " +
    "The email references specific field note dates, RFI numbers, and CO amounts " +
    "in formal business language. Use this before sending any GC CO-push communication.",
  inputSchema: zodSchema(
    z.object({
      project_id: z.string().describe("Project ID"),
    })
  ),
  execute: async ({ project_id }) => {
    const db = getDataset();
    const contract = db.contracts.find((c) => c.project_id === project_id);
    if (!contract) return { error: `Project ${project_id} not found` };

    const today = new Date();

    const pendingCOs = db.changeOrders
      .filter(
        (co) =>
          co.project_id === project_id &&
          (co.status === "Pending" || co.status === "Under Review")
      )
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    if (pendingCOs.length === 0) {
      return {
        subject: `${contract.project_name} — No Pending COs`,
        body: "No pending change orders found for this project.",
        priority: "normal" as const,
      };
    }

    const totalPending = pendingCOs.reduce((s, co) => s + co.amount, 0);

    const coDetails = pendingCOs.map((co) => {
      const ageDays = Math.ceil(
        (today.getTime() - new Date(co.date_submitted).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Find supporting RFI if referenced
      const relatedRFI = co.related_rfi
        ? db.rfis.find((r) => r.rfi_number === co.related_rfi)
        : null;

      // Find field notes near CO submission date as evidence
      const coDate = new Date(co.date_submitted);
      const windowStart = new Date(coDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      const windowEnd = new Date(coDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      const supportingNotes = db.fieldNotes
        .filter((n) => {
          if (n.project_id !== project_id) return false;
          const d = new Date(n.date);
          return d >= windowStart && d <= windowEnd;
        })
        .slice(0, 2);

      return {
        co_number: co.co_number,
        amount: co.amount,
        age_days: ageDays,
        description: co.description,
        reason_category: co.reason_category,
        date_submitted: co.date_submitted,
        related_rfi: relatedRFI?.rfi_number,
        rfi_subject: relatedRFI?.subject,
        field_note_dates: supportingNotes.map((n) => n.date),
        schedule_impact_days: co.schedule_impact_days,
      };
    });

    const subject = `${contract.project_name} — Formal Request for Change Order Approval ($${Math.round(totalPending / 1000)}K Pending)`;

    const coSection = coDetails
      .map(
        (co) =>
          `${co.co_number} — ${co.description}\n` +
          `  Amount: $${co.amount.toLocaleString()} | Submitted: ${co.date_submitted} (${co.age_days}d pending)\n` +
          `  Basis: ${co.reason_category}` +
          (co.related_rfi ? ` | Related RFI: ${co.related_rfi} — "${co.rfi_subject}"` : "") +
          (co.field_note_dates.length > 0
            ? ` | Field documentation on file: ${co.field_note_dates.join(", ")}`
            : "") +
          (co.schedule_impact_days > 0
            ? ` | Schedule impact: ${co.schedule_impact_days} days`
            : "")
      )
      .join("\n\n");

    const body =
      `${contract.gc_name}\n` +
      `Re: ${contract.project_name} — Change Order Approval Request\n` +
      `Date: ${today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}\n` +
      `\n` +
      `Dear ${contract.gc_name} Team,\n` +
      `\n` +
      `We are writing to formally request approval of the following ${pendingCOs.length} change order(s) ` +
      `totaling $${totalPending.toLocaleString()}, which have been pending for an extended period. ` +
      `Each item represents documented site direction and/or design changes that fall outside our original scope of work.\n` +
      `\n` +
      `Pending Change Orders:\n` +
      `${"─".repeat(60)}\n` +
      coSection +
      `\n` +
      `${"─".repeat(60)}\n` +
      `Total Pending: $${totalPending.toLocaleString()}\n` +
      `\n` +
      `We request written approval or response within 10 business days. ` +
      `Supporting documentation (field reports, RFI logs, labor records) is available upon request.\n` +
      `\n` +
      `Please contact us at your earliest convenience to expedite resolution.\n` +
      `\n` +
      `Sincerely,\n` +
      `[HVAC Contractor — PM Team]\n` +
      `\n` +
      `[Generated by Pulse Margin Intelligence]`;

    return { subject, body, priority: "high" as const };
  },
});

// ─── Export all tools ─────────────────────────────────────────────────────────

export const agentTools = {
  scan_portfolio: scanPortfolioTool,
  analyze_project_margin: analyzeProjectMarginTool,
  get_labor_analysis: getLaborAnalysisTool,
  get_change_order_summary: getChangeOrderSummaryTool,
  get_rfi_risk: getRFIRiskTool,
  analyze_field_notes: analyzeFieldNotesTool,
  get_billing_lag: getBillingLagTool,
  forecast_margin_at_completion: forecastMarginTool,
  send_alert_email: sendAlertEmailTool,
  compare_with_last_scan: compareWithLastScanTool,
  build_evidence_pack: buildEvidencePackTool,
  detect_co_leakage: detectCOLeakageTool,
  build_margin_recovery_plan: buildMarginRecoveryPlanTool,
  build_margin_waterfall: buildMarginWaterfallTool,
  generate_war_room_packet: generateWarRoomPacketTool,
  draft_pm_email: draftPMEmailTool,
  draft_gc_email: draftGCEmailTool,
};
