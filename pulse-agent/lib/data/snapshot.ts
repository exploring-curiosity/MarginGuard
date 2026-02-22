import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectSnapshot {
  project_id: string;
  project_name: string;
  cpi: number;
  labor_overrun_pct: number;
  ot_pct: number;
  pending_co_exposure: number;
  billing_lag: number;
  high_risk_rfis: number;
  risk_level: string;
}

export interface ScanSnapshot {
  snapshot_id: string;
  scan_date: string;
  projects: ProjectSnapshot[];
}

export interface KPIChange {
  field: string;
  previous: number | string;
  current: number | string;
  delta?: number;
  direction: "improved" | "worsened" | "unchanged";
}

export interface KPIDelta {
  project_id: string;
  project_name: string;
  changes: KPIChange[];
  new_events: string[];
  risk_change?: string;
  overall_direction: "improving" | "worsening" | "stable";
}

// ─── Storage ──────────────────────────────────────────────────────────────────

// On Vercel, the filesystem is read-only except /tmp
const SNAPSHOT_FILE = process.env.VERCEL
  ? path.join("/tmp", ".pulse-snapshots.json")
  : path.join(process.cwd(), "data", ".pulse-snapshots.json");
const MAX_SNAPSHOTS = 10;

function loadSnapshotFile(): { snapshots: ScanSnapshot[] } {
  if (!fs.existsSync(SNAPSHOT_FILE)) return { snapshots: [] };
  try {
    const content = fs.readFileSync(SNAPSHOT_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { snapshots: [] };
  }
}

export function getLastSnapshot(): ScanSnapshot | null {
  const { snapshots } = loadSnapshotFile();
  if (snapshots.length === 0) return null;
  return snapshots[snapshots.length - 1];
}

export function saveSnapshot(snapshot: ScanSnapshot): void {
  const data = loadSnapshotFile();
  data.snapshots.push(snapshot);
  if (data.snapshots.length > MAX_SNAPSHOTS) {
    data.snapshots = data.snapshots.slice(-MAX_SNAPSHOTS);
  }
  try {
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not write snapshot file:", err);
  }
}

// ─── Diff Engine ──────────────────────────────────────────────────────────────

export function diffSnapshots(
  current: ProjectSnapshot[],
  last: ProjectSnapshot[]
): KPIDelta[] {
  const lastMap = new Map(last.map((p) => [p.project_id, p]));
  const deltas: KPIDelta[] = [];

  for (const curr of current) {
    const prev = lastMap.get(curr.project_id);

    if (!prev) {
      deltas.push({
        project_id: curr.project_id,
        project_name: curr.project_name,
        changes: [],
        new_events: ["First scan recorded — no prior data to compare"],
        overall_direction: "stable",
      });
      continue;
    }

    const changes: KPIChange[] = [];
    const events: string[] = [];
    let worseCount = 0;
    let betterCount = 0;

    // CPI
    const cpiDelta = curr.cpi - prev.cpi;
    if (Math.abs(cpiDelta) > 0.01) {
      const dir = cpiDelta > 0 ? "improved" : "worsened";
      if (dir === "worsened") worseCount++;
      else betterCount++;
      changes.push({
        field: "CPI",
        previous: prev.cpi,
        current: curr.cpi,
        delta: Math.round(cpiDelta * 100) / 100,
        direction: dir,
      });
      if (curr.cpi < 0.80 && prev.cpi >= 0.80)
        events.push("CPI dropped below 0.80 — labor performance is now POOR");
      else if (curr.cpi < 0.92 && prev.cpi >= 0.92)
        events.push("CPI dropped below 0.92 — now BELOW PLAN");
    }

    // Labor overrun %
    const laborDelta = curr.labor_overrun_pct - prev.labor_overrun_pct;
    if (Math.abs(laborDelta) > 1) {
      const dir = laborDelta > 0 ? "worsened" : "improved";
      if (dir === "worsened") worseCount++;
      else betterCount++;
      changes.push({
        field: "Labor Overrun %",
        previous: prev.labor_overrun_pct,
        current: curr.labor_overrun_pct,
        delta: Math.round(laborDelta * 10) / 10,
        direction: dir,
      });
      if (curr.labor_overrun_pct > 50 && prev.labor_overrun_pct <= 50)
        events.push("Labor overrun crossed 50% — HIGH risk threshold breached");
    }

    // OT %
    const otDelta = curr.ot_pct - prev.ot_pct;
    if (Math.abs(otDelta) > 1) {
      const dir = otDelta > 0 ? "worsened" : "improved";
      if (dir === "worsened") worseCount++;
      else betterCount++;
      changes.push({
        field: "Overtime %",
        previous: prev.ot_pct,
        current: curr.ot_pct,
        delta: Math.round(otDelta * 10) / 10,
        direction: dir,
      });
      if (curr.ot_pct > 20 && prev.ot_pct <= 20)
        events.push("Overtime crossed 20% — HIGH overtime alert, margin being eroded");
    }

    // Pending CO exposure
    const coDelta = curr.pending_co_exposure - prev.pending_co_exposure;
    if (Math.abs(coDelta) > 10000) {
      const dir = coDelta > 0 ? "worsened" : "improved";
      if (dir === "worsened") worseCount++;
      else betterCount++;
      changes.push({
        field: "Pending CO Exposure ($)",
        previous: prev.pending_co_exposure,
        current: curr.pending_co_exposure,
        delta: Math.round(coDelta),
        direction: dir,
      });
      if (curr.pending_co_exposure > 500000 && prev.pending_co_exposure <= 500000)
        events.push("Pending CO exposure crossed $500K — CRITICAL unrecovered exposure");
    }

    // Billing lag (more negative = worse)
    const lagDelta = curr.billing_lag - prev.billing_lag;
    if (Math.abs(lagDelta) > 10000) {
      const dir = lagDelta < 0 ? "worsened" : "improved";
      if (dir === "worsened") worseCount++;
      else betterCount++;
      changes.push({
        field: "Billing Lag ($)",
        previous: prev.billing_lag,
        current: curr.billing_lag,
        delta: Math.round(lagDelta),
        direction: dir,
      });
      if (curr.billing_lag < -200000 && prev.billing_lag >= -200000)
        events.push("Under-billed by >$200K — accelerate billing cycle immediately");
    }

    // High risk RFIs
    const rfiDelta = curr.high_risk_rfis - prev.high_risk_rfis;
    if (rfiDelta !== 0) {
      const dir = rfiDelta > 0 ? "worsened" : "improved";
      if (dir === "worsened") worseCount++;
      else betterCount++;
      changes.push({
        field: "High-Risk RFIs",
        previous: prev.high_risk_rfis,
        current: curr.high_risk_rfis,
        delta: rfiDelta,
        direction: dir,
      });
    }

    // Risk level change
    let riskChange: string | undefined;
    if (curr.risk_level !== prev.risk_level) {
      const dir =
        curr.risk_level === "HIGH"
          ? "worsened"
          : curr.risk_level === "LOW"
          ? "improved"
          : "worsened";
      if (dir === "worsened") worseCount++;
      else betterCount++;
      changes.push({
        field: "Risk Level",
        previous: prev.risk_level,
        current: curr.risk_level,
        direction: dir,
      });
      events.push(`Risk level escalated: ${prev.risk_level} → ${curr.risk_level}`);
      riskChange = `${prev.risk_level} → ${curr.risk_level}`;
    }

    const overallDirection: KPIDelta["overall_direction"] =
      worseCount > betterCount
        ? "worsening"
        : betterCount > worseCount
        ? "improving"
        : "stable";

    deltas.push({
      project_id: curr.project_id,
      project_name: curr.project_name,
      changes,
      new_events: events,
      risk_change: riskChange,
      overall_direction: overallDirection,
    });
  }

  return deltas;
}
