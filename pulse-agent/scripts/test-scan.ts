/** Quick test of the actual scan_portfolio tool logic */
import { scanPortfolioTool, forecastMarginTool, analyzeFieldNotesTool } from "../lib/agent/tools";

async function main() {
  // Test scan_portfolio
  console.log("=== PORTFOLIO SCAN TOOL ===\n");
  const scanResult = await (scanPortfolioTool as any).execute({});
  console.log("Summary:", JSON.stringify(scanResult.portfolio_summary, null, 2));
  console.log("\nProjects (sorted by labor overrun):");
  for (const p of scanResult.projects) {
    const cpiStatus = p.labor_cpi < 0.80 ? "🔴" : p.labor_cpi < 0.92 ? "🟡" : "🟢";
    console.log(`  ${cpiStatus} ${p.project_name}`);
    console.log(`     Labor Hours: ${p.actual_labor_hours.toLocaleString()} actual vs ${p.budgeted_labor_hours.toLocaleString()} budgeted (${p.labor_hours_overrun_pct > 0 ? "+" : ""}${p.labor_hours_overrun_pct}%)`);
    console.log(`     Labor Cost: $${(p.actual_labor_cost/1000).toFixed(0)}K actual vs $${(p.budgeted_labor_cost/1000).toFixed(0)}K budgeted (${p.labor_cost_overrun_pct > 0 ? "+" : ""}${p.labor_cost_overrun_pct}%)`);
    console.log(`     CPI: ${p.labor_cpi} (${p.labor_cpi_status})`);
    console.log(`     Overtime: ${p.overtime_pct}%`);
    console.log(`     Pending COs: $${(p.pending_co_exposure/1000).toFixed(0)}K`);
    console.log(`     High-Risk RFIs: ${p.high_risk_rfis}`);
    console.log(`     Risk: ${p.risk_level}`);
    console.log();
  }

  // Test forecast on worst project (by labor overrun)
  const worstProject = scanResult.projects[0];
  console.log(`\n=== FORECAST: ${worstProject.project_name} ===\n`);
  const forecastResult = await (forecastMarginTool as any).execute({
    project_id: worstProject.project_id,
    target_margin_pct: 12,
  });
  console.log(JSON.stringify(forecastResult, null, 2));

  // Test field notes on same project
  console.log(`\n=== FIELD NOTES: ${worstProject.project_id} ===\n`);
  const notesResult = await (analyzeFieldNotesTool as any).execute({
    project_id: worstProject.project_id,
    signal_type: "all_risks",
  });
  console.log(`Total notes: ${notesResult.total_notes_analyzed}`);
  console.log(`Risk signals found: ${notesResult.risk_signals_found}`);
  console.log("Signal breakdown:", notesResult.signal_breakdown);
  if (notesResult.alert) console.log("ALERT:", notesResult.alert);
  if (notesResult.matched_notes?.length > 0) {
    console.log("\nTop 3 risk signals:");
    for (const note of notesResult.matched_notes.slice(0, 3)) {
      console.log(`  [${note.signal_type}] ${note.date} — "${note.matched_phrase}"`);
      console.log(`    ${note.excerpt.substring(0, 150)}`);
    }
  }
}

main().catch(console.error);
