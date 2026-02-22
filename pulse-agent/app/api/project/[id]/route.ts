import { NextRequest } from "next/server";
import { getDataset, getAggregates } from "@/lib/data/loader";

export const maxDuration = 60;

/**
 * GET /api/project/:id
 *
 * Returns deep-dive data for a single project:
 *   - margin waterfall (bid → labor drag → material drag → forecast)
 *   - evidence signals (field notes, pending COs, high-risk RFIs)
 *   - recovery levers
 *   - labor breakdown by week
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: project_id } = await params;
  const db = getDataset();
  const agg = getAggregates();
  const today = new Date();

  const contract = db.contracts.find((c) => c.project_id === project_id);
  if (!contract) {
    return Response.json({ error: `Project ${project_id} not found` }, { status: 404 });
  }

  const projAgg = agg.get(project_id);
  const budgets = db.sovBudget.filter((b) => b.project_id === project_id);

  // ── Costs ──
  const actualLaborCost = projAgg?.totalLaborCost ?? 0;
  const actualMaterialCost = projAgg?.totalMaterialCost ?? 0;
  const budgetedLaborCost = budgets.reduce((s, b) => s + b.estimated_labor_cost, 0);
  const budgetedMaterialCost = budgets.reduce((s, b) => s + b.estimated_material_cost, 0);
  const budgetedEquipCost = budgets.reduce((s, b) => s + b.estimated_equipment_cost, 0);
  const budgetedSubCost = budgets.reduce((s, b) => s + b.estimated_sub_cost, 0);
  const totalBudgetedCost = budgetedLaborCost + budgetedMaterialCost + budgetedEquipCost + budgetedSubCost;

  // ── COs ──
  const approvedCOAmount = db.changeOrders
    .filter((co) => co.project_id === project_id && co.status === "Approved")
    .reduce((sum, co) => sum + co.amount, 0);
  const pendingCOs = db.changeOrders.filter(
    (co) => co.project_id === project_id && (co.status === "Pending" || co.status === "Under Review")
  );
  const pendingCOTotal = pendingCOs.reduce((s, co) => s + co.amount, 0);

  const revisedContract = contract.original_contract_value + approvedCOAmount;

  // ── Margin Waterfall ──
  const bidGrossProfit = revisedContract - totalBudgetedCost;
  const laborDrag = actualLaborCost - budgetedLaborCost;
  const materialDrag = actualMaterialCost - budgetedMaterialCost;
  const forecastGrossProfit = bidGrossProfit - laborDrag - materialDrag;

  function toMarginPts(dollars: number) {
    return revisedContract > 0 ? Math.round((dollars / revisedContract) * 1000) / 10 : 0;
  }

  const waterfall = [
    { label: "Bid Profit", dollars: Math.round(bidGrossProfit), margin_pts: toMarginPts(bidGrossProfit), direction: "baseline" },
    { label: "Labor Drag", dollars: -Math.round(laborDrag), margin_pts: -toMarginPts(laborDrag), direction: laborDrag > 0 ? "negative" : "positive" },
    { label: "Material Drag", dollars: -Math.round(materialDrag), margin_pts: -toMarginPts(materialDrag), direction: materialDrag > 0 ? "negative" : "positive" },
    { label: "Forecast Profit", dollars: Math.round(forecastGrossProfit), margin_pts: toMarginPts(forecastGrossProfit), direction: "result" },
  ];

  // ── Evidence Signals ──
  const riskPatterns: Record<string, RegExp[]> = {
    verbal_approval: [/verbal(ly)? (approved?|authorized?|directed?|told)/i, /directed to proceed/i],
    extra_work: [/extra work/i, /out of scope/i, /added scope/i, /not in contract/i],
    rework: [/rework/i, /remove and replace/i, /incorrect installation/i, /tear out/i],
    delay: [/waiting (for|on)/i, /delayed by/i, /held up/i, /blocked/i, /no access/i],
  };

  const notes = db.fieldNotes.filter((n) => n.project_id === project_id);
  const fieldSignals: Array<{ note_id: string; date: string; signal_type: string; excerpt: string }> = [];
  for (const note of notes) {
    for (const [signal, patterns] of Object.entries(riskPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(note.content)) {
          fieldSignals.push({
            note_id: note.note_id,
            date: note.date,
            signal_type: signal,
            excerpt: note.content.substring(0, 200) + (note.content.length > 200 ? "..." : ""),
          });
          break;
        }
      }
    }
  }
  fieldSignals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const pendingCODetails = pendingCOs.map((co) => ({
    co_number: co.co_number,
    amount: co.amount,
    description: co.description,
    date_submitted: co.date_submitted,
    age_days: Math.ceil((today.getTime() - new Date(co.date_submitted).getTime()) / (1000 * 60 * 60 * 24)),
    reason_category: co.reason_category,
  })).sort((a, b) => b.amount - a.amount);

  const highRiskRFIs = db.rfis
    .filter((r) => r.project_id === project_id && r.status !== "Closed" && (r.cost_impact || r.schedule_impact || r.priority === "Critical"))
    .map((r) => ({
      rfi_number: r.rfi_number,
      subject: r.subject,
      priority: r.priority,
      status: r.status,
      cost_impact: r.cost_impact,
      schedule_impact: r.schedule_impact,
      days_open: Math.ceil((today.getTime() - new Date(r.date_submitted).getTime()) / (1000 * 60 * 60 * 24)),
    }));

  // ── Labor by Week ──
  const laborByWeek = projAgg?.laborByWeek ?? [];
  const recentLabor = laborByWeek.slice(-12).map((w) => ({
    week: w.week,
    st_hours: Math.round(w.st),
    ot_hours: Math.round(w.ot),
    ot_pct: Math.round((w.ot / (w.st + w.ot || 1)) * 1000) / 10,
  }));

  // ── Recovery Levers (simplified) ──
  const levers: Array<{ name: string; type: string; dollars: number; timeline: string }> = [];

  if (pendingCOTotal > 0) {
    levers.push({
      name: "Approve Pending COs",
      type: "revenue",
      dollars: Math.round(pendingCOTotal),
      timeline: "1-5 days",
    });
  }

  const avgRate = projAgg?.avgHourlyRate ?? 55;
  const contractEnd = new Date(contract.substantial_completion_date);
  const weeksRemaining = Math.max(0, (contractEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7));
  const recentWeeks = laborByWeek.slice(-4);
  const avgWeeklyOT = recentWeeks.length > 0 ? recentWeeks.reduce((s, w) => s + w.ot, 0) / recentWeeks.length : 0;
  const otSavings = Math.round(avgWeeklyOT * 0.5 * avgRate * 1.45 * weeksRemaining);
  if (otSavings > 5000) {
    levers.push({
      name: "Eliminate Overtime",
      type: "cost_reduction",
      dollars: otSavings,
      timeline: "Immediate",
    });
  }

  const billingLag = (projAgg?.cumulativeBilled ?? 0) - (actualLaborCost + actualMaterialCost);
  if (billingLag < -50000) {
    levers.push({
      name: "Accelerate Billing",
      type: "cash_flow",
      dollars: Math.abs(Math.round(billingLag)),
      timeline: "2-4 weeks",
    });
  }

  return Response.json({
    project_id,
    project_name: contract.project_name,
    gc_name: contract.gc_name,
    original_contract: contract.original_contract_value,
    revised_contract: Math.round(revisedContract),
    approved_cos: Math.round(approvedCOAmount),
    waterfall,
    bid_margin_pct: toMarginPts(bidGrossProfit),
    forecast_margin_pct: toMarginPts(forecastGrossProfit),
    erosion_pts: toMarginPts(bidGrossProfit) - toMarginPts(forecastGrossProfit),
    evidence: {
      field_signals: fieldSignals.slice(0, 10),
      field_signal_count: fieldSignals.length,
      pending_cos: pendingCODetails,
      pending_co_total: Math.round(pendingCOTotal),
      high_risk_rfis: highRiskRFIs,
    },
    labor_trend: recentLabor,
    recovery_levers: levers,
    total_recoverable: levers.filter((l) => l.type !== "cash_flow").reduce((s, l) => s + l.dollars, 0),
  });
}
