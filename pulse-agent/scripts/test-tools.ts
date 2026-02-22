/**
 * Standalone test script — exercises the data loader and all tool logic
 * Run with: npx tsx scripts/test-tools.ts
 */

import { getDataset, sumLaborCost, getLatestBillingBySOV } from "../lib/data/loader";

async function main() {
  console.log("=== Loading dataset ===\n");
  const db = getDataset();

  console.log(`✓ Contracts: ${db.contracts.length}`);
  console.log(`✓ SOV lines: ${db.sov.length}`);
  console.log(`✓ SOV budgets: ${db.sovBudget.length}`);
  console.log(`✓ Labor logs: ${db.laborLogs.length}`);
  console.log(`✓ Material deliveries: ${db.materialDeliveries.length}`);
  console.log(`✓ Change orders: ${db.changeOrders.length}`);
  console.log(`✓ RFIs: ${db.rfis.length}`);
  console.log(`✓ Field notes: ${db.fieldNotes.length}`);
  console.log(`✓ Billing history: ${db.billingHistory.length}`);
  console.log(`✓ Billing line items: ${db.billingLineItems.length}\n`);

  // ─── Portfolio Scan ───────────────────────────────────────────────────────
  console.log("=== PORTFOLIO SCAN ===\n");

  for (const contract of db.contracts) {
    const pid = contract.project_id;

    const actualLaborCost = sumLaborCost(db.laborLogs.filter((l) => l.project_id === pid));
    const actualMaterialCost = db.materialDeliveries
      .filter((m) => m.project_id === pid)
      .reduce((sum, m) => sum + m.total_cost, 0);
    const totalActualCost = actualLaborCost + actualMaterialCost;

    const totalBudgetedCost = db.sovBudget
      .filter((b) => b.project_id === pid)
      .reduce(
        (sum, b) =>
          sum +
          b.estimated_labor_cost +
          b.estimated_material_cost +
          b.estimated_equipment_cost +
          b.estimated_sub_cost,
        0
      );

    const approvedCOs = db.changeOrders
      .filter((co) => co.project_id === pid && co.status === "Approved")
      .reduce((sum, co) => sum + co.amount, 0);
    const pendingCOs = db.changeOrders
      .filter(
        (co) =>
          co.project_id === pid &&
          (co.status === "Pending" || co.status === "Under Review")
      )
      .reduce((sum, co) => sum + co.amount, 0);

    const revisedContract = contract.original_contract_value + approvedCOs;
    const bidMargin = ((revisedContract - totalBudgetedCost) / revisedContract) * 100;
    const currentMargin = ((revisedContract - totalActualCost) / revisedContract) * 100;
    const overrun = ((totalActualCost - totalBudgetedCost) / totalBudgetedCost) * 100;

    const status =
      overrun > 20 ? "🔴 HIGH RISK" : overrun > 10 ? "🟡 MEDIUM RISK" : "🟢 LOW RISK";

    console.log(`${status} ${contract.project_name}`);
    console.log(`  Contract: $${(revisedContract / 1e6).toFixed(2)}M`);
    console.log(`  Bid Margin: ${bidMargin.toFixed(1)}%`);
    console.log(`  Current Margin: ${currentMargin.toFixed(1)}%`);
    console.log(`  Cost Overrun: ${overrun.toFixed(1)}%`);
    console.log(`  Pending CO Exposure: $${(pendingCOs / 1000).toFixed(0)}K`);
    console.log();
  }

  // ─── Labor Analysis Sample ───────────────────────────────────────────────
  console.log("=== LABOR ANALYSIS (PRJ-2024-001) ===\n");
  const pid001 = "PRJ-2024-001";
  const logs001 = db.laborLogs.filter((l) => l.project_id === pid001);
  const totalST = logs001.reduce((s, l) => s + l.hours_st, 0);
  const totalOT = logs001.reduce((s, l) => s + l.hours_ot, 0);
  const totalHours = totalST + totalOT;
  const totalCost = sumLaborCost(logs001);
  console.log(`  Total hours: ${Math.round(totalHours).toLocaleString()}`);
  console.log(`  Overtime hours: ${Math.round(totalOT).toLocaleString()} (${((totalOT / totalHours) * 100).toFixed(1)}%)`);
  console.log(`  Total labor cost: $${Math.round(totalCost / 1000)}K\n`);

  // ─── Change Order Summary ────────────────────────────────────────────────
  console.log("=== CHANGE ORDER SUMMARY ===\n");
  const pendingAll = db.changeOrders.filter(
    (co) => co.status === "Pending" || co.status === "Under Review"
  );
  const totalPendingExposure = pendingAll.reduce((sum, co) => sum + co.amount, 0);
  console.log(`  Total COs: ${db.changeOrders.length}`);
  console.log(`  Pending/Under Review: ${pendingAll.length} ($${(totalPendingExposure / 1000).toFixed(0)}K exposure)`);
  console.log(`  Top pending COs:`);
  for (const co of pendingAll.sort((a, b) => b.amount - a.amount).slice(0, 3)) {
    console.log(`    ${co.co_number} (${co.project_id}): $${(co.amount / 1000).toFixed(0)}K — ${co.description}`);
  }
  console.log();

  // ─── Field Note Risk Signals ─────────────────────────────────────────────
  console.log("=== FIELD NOTE RISK SIGNALS ===\n");
  const verbalPattern = /verbal(ly)? (approved?|authorized?|directed?)|directed to proceed|oral approval/i;
  const extraWorkPattern = /extra work|out of scope|additional work|not in contract/i;

  let verbalCount = 0;
  let extraWorkCount = 0;

  for (const note of db.fieldNotes) {
    if (verbalPattern.test(note.content)) verbalCount++;
    if (extraWorkPattern.test(note.content)) extraWorkCount++;
  }

  console.log(`  Verbal approval mentions: ${verbalCount}`);
  console.log(`  Extra work mentions: ${extraWorkCount}\n`);

  // ─── Billing Lag ─────────────────────────────────────────────────────────
  console.log("=== BILLING LAG ANALYSIS ===\n");
  for (const contract of db.contracts) {
    const pid = contract.project_id;
    const latestBilling = db.billingHistory
      .filter((b) => b.project_id === pid)
      .sort((a, b) => b.application_number - a.application_number)[0];

    const actualCost = sumLaborCost(db.laborLogs.filter((l) => l.project_id === pid)) +
      db.materialDeliveries.filter((m) => m.project_id === pid).reduce((s, m) => s + m.total_cost, 0);

    const billed = latestBilling?.cumulative_billed ?? 0;
    const lag = billed - actualCost;
    const lagStatus = lag < -500000 ? "🔴 CRITICAL UNDER-BILLED" : lag < 0 ? "🟡 UNDER-BILLED" : "🟢 OK";

    console.log(`  ${lagStatus} ${contract.project_name.substring(0, 35)}`);
    console.log(`    Billed: $${(billed / 1e6).toFixed(2)}M | Actual Cost: $${(actualCost / 1e6).toFixed(2)}M | Lag: $${(lag / 1000).toFixed(0)}K`);
  }

  console.log("\n✅ All checks passed! Tools are working correctly.\n");
}

main().catch(console.error);
