import { NextRequest } from "next/server";
import {
  getDataset,
  sumLaborCost,
  getAggregates,
} from "@/lib/data/loader";

export const maxDuration = 60;

/**
 * GET /api/dashboard
 *
 * Returns all dashboard data computed from the CSV dataset.
 * Mirrors the scan_portfolio + analyze_project_margin tool logic exactly
 * so the dashboard and agent always show consistent numbers.
 *
 * Zero hardcoded values — everything derived from the 10 CSV files.
 */
export async function GET(_req: NextRequest) {
  const db = getDataset();
  const agg = getAggregates();
  const today = new Date();

  // ── Per-project summary (mirrors scan_portfolio tool) ──────────────────
  const projects = db.contracts.map((contract) => {
    const pid = contract.project_id;
    const pa = agg.get(pid)!;

    // Budget from sov_budget (direct field costs — the bid estimate)
    const budgets = db.sovBudget.filter((b) => b.project_id === pid);
    const budgetedLaborCost = budgets.reduce((s, b) => s + b.estimated_labor_cost, 0);
    const budgetedLaborHours = budgets.reduce((s, b) => s + b.estimated_labor_hours, 0);
    const budgetedMaterialCost = budgets.reduce((s, b) => s + b.estimated_material_cost, 0);
    const totalBudgetedCost = budgets.reduce(
      (s, b) => s + b.estimated_labor_cost + b.estimated_material_cost +
        b.estimated_equipment_cost + b.estimated_sub_cost, 0
    );

    // Change orders
    const projectCOs = db.changeOrders.filter((co) => co.project_id === pid);
    const approvedCOValue = projectCOs
      .filter((co) => co.status === "Approved")
      .reduce((s, co) => s + co.amount, 0);
    const pendingCOs = projectCOs.filter(
      (co) => co.status === "Pending" || co.status === "Under Review"
    );
    const pendingCOCount = pendingCOs.length;
    const pendingCOValue = pendingCOs.reduce((s, co) => s + co.amount, 0);

    // Revised contract
    const revisedContract = contract.original_contract_value + approvedCOValue;

    // Percent complete from billing (same as scan_portfolio)
    const latestBilling = db.billingHistory
      .filter((b) => b.project_id === pid)
      .sort((a, b) => b.application_number - a.application_number)[0];
    const cumulativeBilled = latestBilling?.cumulative_billed ?? 0;
    const pctComplete = revisedContract > 0 ? cumulativeBilled / revisedContract : 0;

    // Labor CPI (earned value method — same as scan_portfolio)
    const earnedLaborBudget = pctComplete * budgetedLaborCost;
    const laborCPI = earnedLaborBudget > 0 ? earnedLaborBudget / pa.totalLaborCost : 1;

    // Labor overrun
    const laborHoursOverrunPct = budgetedLaborHours > 0
      ? ((pa.totalLaborHours - budgetedLaborHours) / budgetedLaborHours) * 100 : 0;
    const laborCostOverrunPct = budgetedLaborCost > 0
      ? ((pa.totalLaborCost - budgetedLaborCost) / budgetedLaborCost) * 100 : 0;

    // Bid margin & projected margin (same as analyze_project_margin tool)
    const bidMarginPct = revisedContract > 0
      ? ((revisedContract - totalBudgetedCost) / revisedContract) * 100 : 0;
    const totalActualCost = pa.totalLaborCost + pa.totalMaterialCost;
    const projectedMarginPct = revisedContract > 0
      ? ((revisedContract - totalActualCost) / revisedContract) * 100 : 0;

    // Billing lag (billed vs actual field costs — same as scan_portfolio)
    const trackedFieldCosts = pa.totalLaborCost + pa.totalMaterialCost;
    const billingLag = cumulativeBilled - trackedFieldCosts;

    // OT
    const overtimePct = pa.totalLaborHours > 0
      ? (pa.totalOTHours / pa.totalLaborHours) * 100 : 0;

    // RFIs
    const openRFIs = db.rfis.filter(
      (r) => r.project_id === pid && r.status !== "Closed"
    );
    const highRiskRFIs = openRFIs.filter((r) => r.cost_impact || r.schedule_impact);

    // Schedule
    const completionDate = contract.substantial_completion_date;
    const daysToCompletion = Math.ceil(
      (new Date(completionDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const isOverdue = daysToCompletion < 0;

    // Risk level (same thresholds as scan_portfolio)
    const riskLevel =
      laborHoursOverrunPct > 50 || highRiskRFIs.length > 3 || isOverdue || pendingCOValue > 500000
        ? "HIGH"
        : laborHoursOverrunPct > 20 || highRiskRFIs.length > 1 || pendingCOValue > 200000
        ? "MEDIUM"
        : "LOW";

    const status: "critical" | "at-risk" | "healthy" =
      riskLevel === "HIGH" ? "critical" : riskLevel === "MEDIUM" ? "at-risk" : "healthy";

    return {
      id: pid,
      name: contract.project_name,
      client: contract.project_name.split(" - ")[0],
      gcName: contract.gc_name,
      contractValue: Math.round(contract.original_contract_value),
      revisedContractValue: Math.round(revisedContract),
      bidMargin: Math.round(bidMarginPct * 10) / 10,
      currentMargin: Math.round(projectedMarginPct * 10) / 10,
      percentComplete: Math.round(pctComplete * 1000) / 10,
      status,
      laborCPI: Math.round(laborCPI * 100) / 100,
      laborCPIStatus: laborCPI < 0.80 ? "POOR" : laborCPI < 0.92 ? "BELOW PLAN" : laborCPI < 1.08 ? "ON PLAN" : "FAVORABLE",
      laborBudget: Math.round(budgetedLaborCost),
      laborActual: Math.round(pa.totalLaborCost),
      laborHoursOverrunPct: Math.round(laborHoursOverrunPct * 10) / 10,
      laborCostOverrunPct: Math.round(laborCostOverrunPct * 10) / 10,
      overtimePct: Math.round(overtimePct * 10) / 10,
      materialBudget: Math.round(budgetedMaterialCost),
      materialActual: Math.round(pa.totalMaterialCost),
      changeOrdersPending: pendingCOCount,
      changeOrdersValue: Math.round(pendingCOValue),
      approvedCOValue: Math.round(approvedCOValue),
      billingLag: Math.round(billingLag),
      cumulativeBilled: Math.round(cumulativeBilled),
      trackedFieldCosts: Math.round(trackedFieldCosts),
      completionDate,
      lastUpdated: today.toISOString().split("T")[0],
      openRFIs: openRFIs.length,
      highRiskRFIs: highRiskRFIs.length,
      retentionHeld: Math.round(pa.retentionHeld),
      isOverdue,
      daysToCompletion,
    };
  });

  // Sort by labor overrun (worst first)
  projects.sort((a, b) => b.laborHoursOverrunPct - a.laborHoursOverrunPct);

  // ── Portfolio stats (KPI cards) ──────────────────────────────────────────
  const totalContractValue = projects.reduce((s, p) => s + p.contractValue, 0);
  const totalBillingLag = projects.reduce((s, p) => s + p.billingLag, 0);

  const portfolioStats = {
    totalContractValue,
    totalRevisedValue: projects.reduce((s, p) => s + p.revisedContractValue, 0),
    totalBillingLag,
    pendingChangeOrders: projects.reduce((s, p) => s + p.changeOrdersPending, 0),
    pendingCOValue: projects.reduce((s, p) => s + p.changeOrdersValue, 0),
    totalApprovedCOs: projects.reduce((s, p) => s + p.approvedCOValue, 0),
    criticalProjects: projects.filter((p) => p.status === "critical").length,
    atRiskProjects: projects.filter((p) => p.status === "at-risk").length,
    healthyProjects: projects.filter((p) => p.status === "healthy").length,
    totalRetention: projects.reduce((s, p) => s + p.retentionHeld, 0),
    totalOpenRFIs: projects.reduce((s, p) => s + p.openRFIs, 0),
    totalHighRiskRFIs: projects.reduce((s, p) => s + p.highRiskRFIs, 0),
    totalLaborBudget: projects.reduce((s, p) => s + p.laborBudget, 0),
    totalLaborActual: projects.reduce((s, p) => s + p.laborActual, 0),
  };

  // ── Margin trend (cumulative billing vs costs over time) ─────────────────
  const billingMonths = new Set<string>();
  for (const bill of db.billingHistory) {
    billingMonths.add(bill.period_end.substring(0, 7));
  }
  const months = Array.from(billingMonths).sort();

  const marginTrend: Array<{ month: string; billed: number; costs: number; margin: number }> = [];

  for (const month of months) {
    const cutoff = new Date(month + "-28");
    let totalBilled = 0;
    let totalCosts = 0;

    for (const contract of db.contracts) {
      const pid = contract.project_id;

      const billsUpTo = db.billingHistory.filter(
        (b) => b.project_id === pid && new Date(b.period_end) <= cutoff
      );
      const latestBill = billsUpTo.sort(
        (a, b) => b.application_number - a.application_number
      )[0];
      totalBilled += latestBill?.cumulative_billed ?? 0;

      const laborUpTo = db.laborLogs.filter(
        (l) => l.project_id === pid && new Date(l.date) <= cutoff
      );
      totalCosts += sumLaborCost(laborUpTo);
      const matUpTo = db.materialDeliveries.filter(
        (m) => m.project_id === pid && new Date(m.date) <= cutoff
      );
      totalCosts += matUpTo.reduce((s, m) => s + m.total_cost, 0);
    }

    const margin = totalBilled > 0 ? ((totalBilled - totalCosts) / totalBilled) * 100 : 0;
    const d = new Date(month + "-01");
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    marginTrend.push({
      month: label,
      billed: Math.round(totalBilled),
      costs: Math.round(totalCosts),
      margin: Math.round(margin * 10) / 10,
    });
  }

  // ── Project comparison data (for bar chart) ──────────────────────────────
  const projectMarginData = projects.map((p) => ({
    name: p.name.split(" - ")[0].substring(0, 20),
    bid: p.bidMargin,
    current: p.currentMargin,
    gap: Math.round((p.bidMargin - p.currentMargin) * 10) / 10,
    laborOverrun: p.laborCostOverrunPct,
    cpi: p.laborCPI,
  }));

  // ── Alerts (computed from risk signals) ──────────────────────────────────
  const alerts: Array<{
    id: string;
    severity: "critical" | "warning";
    title: string;
    description: string;
    project: string;
    category: string;
  }> = [];

  for (const p of projects) {
    // Critical: overdue projects
    if (p.isOverdue) {
      alerts.push({
        id: `alert-overdue-${p.id}`,
        severity: "critical",
        title: `${p.name.split(" - ")[0]}: Past completion date`,
        description: `Substantial completion was ${p.completionDate}. ${Math.abs(p.daysToCompletion)} days overdue. CPI ${p.laborCPI}. ${p.highRiskRFIs} high-risk RFIs.`,
        project: p.id,
        category: "schedule",
      });
    }

    // Critical: severe labor overrun
    if (p.laborHoursOverrunPct > 50 && !alerts.some((a) => a.project === p.id)) {
      alerts.push({
        id: `alert-labor-${p.id}`,
        severity: "critical",
        title: `${p.name.split(" - ")[0]}: ${Math.round(p.laborHoursOverrunPct)}% labor overrun`,
        description: `Labor cost $${(p.laborActual / 1_000).toFixed(0)}K vs budget $${(p.laborBudget / 1_000).toFixed(0)}K. CPI ${p.laborCPI}. ${p.openRFIs} open RFIs.`,
        project: p.id,
        category: "labor",
      });
    }

    // Warning: under-billed (negative billing lag = costs exceed billing)
    if (p.billingLag < -200_000 && !alerts.some((a) => a.project === p.id)) {
      alerts.push({
        id: `alert-billing-${p.id}`,
        severity: p.billingLag < -500_000 ? "critical" : "warning",
        title: `${p.name.split(" - ")[0]}: Under-billed by $${Math.abs(Math.round(p.billingLag / 1_000))}K`,
        description: `Field costs $${(p.trackedFieldCosts / 1_000).toFixed(0)}K vs billed $${(p.cumulativeBilled / 1_000).toFixed(0)}K. Cash flow at risk.`,
        project: p.id,
        category: "billing",
      });
    }

    // Warning: pending CO exposure
    if (p.changeOrdersValue > 200_000 && !alerts.some((a) => a.project === p.id)) {
      alerts.push({
        id: `alert-co-${p.id}`,
        severity: p.changeOrdersValue > 500_000 ? "critical" : "warning",
        title: `${p.name.split(" - ")[0]}: $${(p.changeOrdersValue / 1_000).toFixed(0)}K pending COs`,
        description: `${p.changeOrdersPending} change orders awaiting approval. Unrecovered cost exposure.`,
        project: p.id,
        category: "change_orders",
      });
    }

    // Warning: high overtime
    if (p.overtimePct > 15 && !alerts.some((a) => a.project === p.id)) {
      alerts.push({
        id: `alert-ot-${p.id}`,
        severity: p.overtimePct > 25 ? "critical" : "warning",
        title: `${p.name.split(" - ")[0]}: ${p.overtimePct}% overtime rate`,
        description: `High overtime eroding margin. Labor CPI ${p.laborCPI}. ${p.laborHoursOverrunPct}% hours overrun.`,
        project: p.id,
        category: "labor",
      });
    }
  }

  alerts.sort((a, b) => {
    if (a.severity === "critical" && b.severity !== "critical") return -1;
    if (a.severity !== "critical" && b.severity === "critical") return 1;
    return 0;
  });

  return Response.json({
    projects,
    portfolioStats,
    marginTrend,
    projectMarginData,
    alerts,
    meta: {
      computedAt: today.toISOString(),
      datasetSize: {
        contracts: db.contracts.length,
        laborLogs: db.laborLogs.length,
        fieldNotes: db.fieldNotes.length,
        changeOrders: db.changeOrders.length,
        rfis: db.rfis.length,
        billingRecords: db.billingHistory.length,
      },
    },
  });
}
