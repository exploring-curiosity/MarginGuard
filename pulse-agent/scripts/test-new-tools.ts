/** Smoke test for all new tools added in the v2 upgrade */
import { getAggregates, getDataset } from "../lib/data/loader";
import { getLastSnapshot } from "../lib/data/snapshot";
import {
  detectCOLeakageTool,
  buildMarginWaterfallTool,
  compareWithLastScanTool,
  buildMarginRecoveryPlanTool,
  buildEvidencePackTool,
  generateWarRoomPacketTool,
  draftPMEmailTool,
  draftGCEmailTool,
} from "../lib/agent/tools";

async function main() {
  const db = getDataset();
  const agg = getAggregates();
  const pid = "PRJ-2024-001";

  console.log("\n=== AGGREGATES CHECK ===");
  const projAgg = agg.get(pid);
  console.log(`Project: ${pid}`);
  console.log(`  totalLaborCost:  $${Math.round((projAgg?.totalLaborCost ?? 0) / 1000)}K`);
  console.log(`  earnedValue:     $${Math.round((projAgg?.earnedValue ?? 0) / 1000)}K`);
  console.log(`  earnedLaborValue:$${Math.round((projAgg?.earnedLaborValue ?? 0) / 1000)}K`);
  console.log(`  cumulativeBilled:$${Math.round((projAgg?.cumulativeBilled ?? 0) / 1000)}K`);
  console.log(`  laborByWeek entries: ${projAgg?.laborByWeek.length}`);

  console.log("\n=== SNAPSHOT (before first compare_with_last_scan) ===");
  const lastSnap = getLastSnapshot();
  console.log(`Last snapshot: ${lastSnap ? lastSnap.scan_date : "none (first run)"}`);

  console.log("\n=== WATERFALL TOOL ===");
  const waterfall = await (buildMarginWaterfallTool as any).execute({ project_id: pid });
  console.log(`bid_margin_pct:      ${waterfall.bid_margin_pct}%`);
  console.log(`forecast_margin_pct: ${waterfall.forecast_margin_pct}%`);
  console.log(`erosion_pts:         ${waterfall.erosion_pts} pts`);
  console.log(`pending_co_risk:     $${Math.round(waterfall.separate_risks.pending_co_exposure / 1000)}K`);

  console.log("\n=== EVIDENCE PACK TOOL ===");
  const evidence = await (buildEvidencePackTool as any).execute({ project_id: pid });
  console.log(`confidence:          ${evidence.confidence}`);
  console.log(`field_note_signals:  ${evidence.field_note_signals.length}`);
  console.log(`pending_cos:         ${evidence.pending_cos.length}`);
  console.log(`high_risk_rfis:      ${evidence.high_risk_rfis.length}`);
  if (evidence.field_note_signals.length > 0) {
    const sample = evidence.field_note_signals[0];
    console.log(`  Sample: [${sample.note_id}] ${sample.date} — "${sample.matched_phrase}"`);
  }

  console.log("\n=== CO LEAKAGE TOOL ===");
  const leakage = await (detectCOLeakageTool as any).execute({ project_id: pid });
  console.log(`scope_events_found:  ${leakage.scope_events_found}`);
  console.log(`co_candidates:       ${leakage.total_candidates}`);
  console.log(`estimated_exposure:  $${Math.round(leakage.total_estimated_exposure / 1000)}K`);
  console.log(`alert: ${leakage.alert}`);

  console.log("\n=== RECOVERY PLAN TOOL ===");
  const recovery = await (buildMarginRecoveryPlanTool as any).execute({ project_id: pid, target_margin_pct: 15 });
  console.log(`forecast_margin_pct: ${recovery.margin_context.forecast_margin_pct}%`);
  console.log(`gap_to_target:       $${Math.round(recovery.margin_context.gap_to_target_dollars / 1000)}K`);
  console.log(`levers:              ${recovery.levers.length}`);
  for (const lever of recovery.levers) {
    console.log(`  ${lever.rank}. ${lever.name}: $${Math.round(lever.expected_dollars / 1000)}K (${lever.timeline})`);
  }
  console.log(`is_recoverable:      ${recovery.is_recoverable}`);

  console.log("\n=== COMPARE WITH LAST SCAN (saves first snapshot) ===");
  const compare1 = await (compareWithLastScanTool as any).execute({});
  console.log(`has_prior_scan:      ${compare1.has_prior_scan}`);
  if (!compare1.has_prior_scan) {
    console.log(`message:             ${compare1.message}`);
  }

  console.log("\n=== COMPARE WITH LAST SCAN (second run — diff against first) ===");
  const compare2 = await (compareWithLastScanTool as any).execute({});
  console.log(`has_prior_scan:      ${compare2.has_prior_scan}`);
  console.log(`days_since_last:     ${compare2.days_since_last_scan}`);
  console.log(`projects_worsened:   ${compare2.projects_worsened}`);
  console.log(`alert_subject:       ${compare2.alert_subject}`);

  console.log("\n=== WAR ROOM PACKET ===");
  const warRoom = await (generateWarRoomPacketTool as any).execute({});
  console.log(`week_ending:         ${warRoom.week_ending}`);
  console.log(`ot_this_week_pct:    ${warRoom.ot_this_week_pct}%`);
  console.log(`co_pipeline_total:   $${Math.round(warRoom.co_pipeline_total / 1000)}K`);
  console.log(`actions_due items:   ${warRoom.actions_due.total_action_items}`);
  console.log(`markdown_summary (first 500 chars):\n${warRoom.markdown_summary.substring(0, 500)}`);

  console.log("\n=== DRAFT PM EMAIL ===");
  const pmEmail = await (draftPMEmailTool as any).execute({ project_id: pid });
  console.log(`subject: ${pmEmail.subject}`);
  console.log(`body (first 400 chars):\n${pmEmail.body.substring(0, 400)}`);

  console.log("\n=== DRAFT GC EMAIL ===");
  const gcEmail = await (draftGCEmailTool as any).execute({ project_id: pid });
  console.log(`subject: ${gcEmail.subject}`);
  console.log(`body (first 400 chars):\n${gcEmail.body.substring(0, 400)}`);

  console.log("\n✅ All new tools executed successfully.");
}

main().catch(console.error);
