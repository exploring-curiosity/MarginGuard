import { NextRequest } from "next/server";
import {
  getDataset,
  sumLaborCost,
  getAggregates,
} from "@/lib/data/loader";

export const maxDuration = 60;

/**
 * GET /api/war-room
 *
 * Returns a structured weekly war room briefing packet.
 * Mirrors the generate_war_room_packet tool output.
 */
export async function GET(_req: NextRequest) {
  const db = getDataset();
  const agg = getAggregates();
  const today = new Date();

  // ── Top risks per project ──
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
        (r) =>
          r.project_id === pid &&
          r.status !== "Closed" &&
          (r.cost_impact || r.schedule_impact)
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
        completion_date: contract.substantial_completion_date,
        is_overdue: new Date(contract.substantial_completion_date) < today,
        one_line:
          `CPI ${Math.round(cpi * 100) / 100} | Labor ${Math.round(overrunPct)}% over | ` +
          `$${Math.round(pendingCO / 1000)}K pending COs | ${highRiskRFIs} risky RFIs`,
      };
    })
    .sort((a, b) => b.labor_overrun_pct - a.labor_overrun_pct);

  // ── Overdue RFIs ──
  const overdueRFIs = db.rfis
    .filter(
      (r) =>
        r.status !== "Closed" &&
        r.date_required &&
        new Date(r.date_required) < today
    )
    .map((r) => {
      const contract = db.contracts.find((c) => c.project_id === r.project_id);
      return {
        type: "RFI" as const,
        id: r.rfi_number,
        project: contract?.project_name ?? r.project_id,
        description: r.subject,
        days_overdue: Math.ceil(
          (today.getTime() - new Date(r.date_required).getTime()) /
            (1000 * 60 * 60 * 24)
        ),
        assigned_to: r.assigned_to,
        priority: r.priority,
      };
    })
    .sort((a, b) => b.days_overdue - a.days_overdue)
    .slice(0, 10);

  // ── Aging COs ──
  const agingCOs = db.changeOrders
    .filter((co) => {
      if (co.status !== "Pending" && co.status !== "Under Review") return false;
      const age = Math.ceil(
        (today.getTime() - new Date(co.date_submitted).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      return age > 21;
    })
    .map((co) => {
      const contract = db.contracts.find((c) => c.project_id === co.project_id);
      return {
        type: "CO" as const,
        id: co.co_number,
        project: contract?.project_name ?? co.project_id,
        description: co.description,
        amount: co.amount,
        days_pending: Math.ceil(
          (today.getTime() - new Date(co.date_submitted).getTime()) /
            (1000 * 60 * 60 * 24)
        ),
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // ── CO pipeline by age bucket ──
  const pendingCOsAll = db.changeOrders.filter(
    (co) => co.status === "Pending" || co.status === "Under Review"
  );
  const coPipeline: Record<
    string,
    { count: number; total: number }
  > = {
    "0-7d": { count: 0, total: 0 },
    "8-21d": { count: 0, total: 0 },
    "22-45d": { count: 0, total: 0 },
    "45d+": { count: 0, total: 0 },
  };
  for (const co of pendingCOsAll) {
    const age = Math.ceil(
      (today.getTime() - new Date(co.date_submitted).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    const bucket =
      age <= 7 ? "0-7d" : age <= 21 ? "8-21d" : age <= 45 ? "22-45d" : "45d+";
    coPipeline[bucket].count++;
    coPipeline[bucket].total += co.amount;
  }

  // ── Under-billed projects ──
  const underbillingSummary = db.contracts
    .map((c) => {
      const projAgg = agg.get(c.project_id);
      const fieldCosts =
        (projAgg?.totalLaborCost ?? 0) + (projAgg?.totalMaterialCost ?? 0);
      const billed = projAgg?.cumulativeBilled ?? 0;
      const lag = billed - fieldCosts;
      return {
        project_name: c.project_name,
        billing_lag: Math.round(lag),
        billed: Math.round(billed),
        field_costs: Math.round(fieldCosts),
      };
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
    .slice(-12)
    .map(([week, data]) => ({
      week,
      ot_pct: Math.round((data.ot / (data.st + data.ot || 1)) * 1000) / 10,
      ot_hours: Math.round(data.ot),
      st_hours: Math.round(data.st),
    }));

  const totalPendingCO = Object.values(coPipeline).reduce(
    (s, b) => s + b.total,
    0
  );

  return Response.json({
    week_ending: today.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    top_risks: topRisks,
    overdue_rfis: overdueRFIs,
    aging_cos: agingCOs,
    total_action_items: overdueRFIs.length + agingCOs.length,
    co_pipeline: coPipeline,
    co_pipeline_total: Math.round(totalPendingCO),
    underbilling_summary: underbillingSummary,
    portfolio_ot_trend: portfolioOTTrend,
    meta: {
      computedAt: today.toISOString(),
    },
  });
}
