import fs from "fs";
import path from "path";
import Papa from "papaparse";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Contract {
  project_id: string;
  project_name: string;
  original_contract_value: number;
  contract_date: string;
  substantial_completion_date: string;
  retention_pct: number;
  payment_terms: string;
  gc_name: string;
  architect: string;
  engineer_of_record: string;
}

export interface SOVLine {
  project_id: string;
  sov_line_id: string;
  line_number: number;
  description: string;
  scheduled_value: number;
  labor_pct: number;
  material_pct: number;
}

export interface SOVBudget {
  project_id: string;
  sov_line_id: string;
  estimated_labor_hours: number;
  estimated_labor_cost: number;
  estimated_material_cost: number;
  estimated_equipment_cost: number;
  estimated_sub_cost: number;
  productivity_factor: number;
  key_assumptions: string;
}

export interface LaborLog {
  project_id: string;
  log_id: string;
  date: string;
  employee_id: string;
  role: string;
  sov_line_id: string;
  hours_st: number;
  hours_ot: number;
  hourly_rate: number;
  burden_multiplier: number;
  work_area: string;
  cost_code: number;
}

export interface MaterialDelivery {
  project_id: string;
  delivery_id: string;
  date: string;
  sov_line_id: string;
  material_category: string;
  item_description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  po_number: string;
  vendor: string;
  received_by: string;
  condition_notes: string;
}

export interface ChangeOrder {
  project_id: string;
  co_number: string;
  date_submitted: string;
  reason_category: string;
  description: string;
  amount: number;
  status: string;
  related_rfi: string;
  affected_sov_lines: string;
  labor_hours_impact: number;
  schedule_impact_days: number;
  submitted_by: string;
  approved_by: string;
}

export interface RFI {
  project_id: string;
  rfi_number: string;
  date_submitted: string;
  subject: string;
  submitted_by: string;
  assigned_to: string;
  priority: string;
  status: string;
  date_required: string;
  date_responded: string;
  response_summary: string;
  cost_impact: boolean;
  schedule_impact: boolean;
}

export interface FieldNote {
  project_id: string;
  note_id: string;
  date: string;
  author: string;
  note_type: string;
  content: string;
  photos_attached: number;
  weather: string;
  temp_high: number;
  temp_low: number;
}

export interface BillingHistory {
  project_id: string;
  application_number: number;
  period_end: string;
  period_total: number;
  cumulative_billed: number;
  retention_held: number;
  net_payment_due: number;
  status: string;
  payment_date: string;
  line_item_count: number;
}

export interface BillingLineItem {
  project_id: string;
  application_number: number;
  sov_line_id: string;
  description: string;
  scheduled_value: number;
  previous_billed: number;
  this_period: number;
  total_billed: number;
  pct_complete: number;
  balance_to_finish: number;
}

export interface Dataset {
  contracts: Contract[];
  sov: SOVLine[];
  sovBudget: SOVBudget[];
  laborLogs: LaborLog[];
  materialDeliveries: MaterialDelivery[];
  changeOrders: ChangeOrder[];
  rfis: RFI[];
  fieldNotes: FieldNote[];
  billingHistory: BillingHistory[];
  billingLineItems: BillingLineItem[];
}

// ─── Loader ───────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");

function parseCSV<T>(filename: string): T[] {
  const filePath = path.join(DATA_DIR, filename);
  const content = fs.readFileSync(filePath, "utf-8");
  const result = Papa.parse<T>(content, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    console.warn(`CSV parse warnings for ${filename}:`, result.errors.slice(0, 3));
  }
  return result.data;
}

// Singleton cache — loaded once per process (Next.js caches module state)
let _dataset: Dataset | null = null;

export function getDataset(): Dataset {
  if (_dataset) return _dataset;

  console.log("Loading HVAC dataset from disk...");

  const contracts = parseCSV<Contract>("contracts.csv");
  const sov = parseCSV<SOVLine>("sov.csv");
  const sovBudget = parseCSV<SOVBudget>("sov_budget.csv");
  const laborLogs = parseCSV<LaborLog>("labor_logs.csv");
  const materialDeliveries = parseCSV<MaterialDelivery>("material_deliveries.csv");
  const changeOrders = parseCSV<ChangeOrder>("change_orders.csv");
  const rfis = parseCSV<RFI>("rfis.csv");
  const fieldNotes = parseCSV<FieldNote>("field_notes.csv");
  const billingHistory = parseCSV<BillingHistory>("billing_history.csv");
  const billingLineItems = parseCSV<BillingLineItem>("billing_line_items.csv");

  _dataset = {
    contracts,
    sov,
    sovBudget,
    laborLogs,
    materialDeliveries,
    changeOrders,
    rfis,
    fieldNotes,
    billingHistory,
    billingLineItems,
  };

  console.log(
    `Dataset loaded: ${contracts.length} contracts, ${laborLogs.length} labor logs, ${fieldNotes.length} field notes`
  );

  return _dataset;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Labor cost formula: (ST + OT * 1.5) * rate * burden */
export function computeLaborCost(log: LaborLog): number {
  return (log.hours_st + log.hours_ot * 1.5) * log.hourly_rate * log.burden_multiplier;
}

/** Sum labor cost for a set of logs */
export function sumLaborCost(logs: LaborLog[]): number {
  return logs.reduce((sum, log) => sum + computeLaborCost(log), 0);
}

/** Get the latest billing line items for a project (most recent pay app per SOV line) */
export function getLatestBillingBySOV(
  billingLineItems: BillingLineItem[],
  projectId: string
): BillingLineItem[] {
  const projectItems = billingLineItems.filter((b) => b.project_id === projectId);

  // Group by sov_line_id, keep the one with the highest application_number
  const latestByLine = new Map<string, BillingLineItem>();
  for (const item of projectItems) {
    const existing = latestByLine.get(item.sov_line_id);
    if (!existing || item.application_number > existing.application_number) {
      latestByLine.set(item.sov_line_id, item);
    }
  }

  return Array.from(latestByLine.values());
}

// ─── Pre-Computed Aggregates ──────────────────────────────────────────────────

export interface WeeklyLaborData {
  week: string;
  st: number;
  ot: number;
  cost: number;
}

export interface ProjectAggregates {
  project_id: string;
  // Labor
  totalLaborCost: number;
  totalLaborHours: number;
  totalOTHours: number;
  totalSTHours: number;
  laborByWeek: WeeklyLaborData[];       // last 12 weeks, sorted ascending
  laborByRole: Record<string, { hours: number; ot: number; cost: number; count: number }>;
  laborBySOVLine: Record<string, { hours: number; ot: number; cost: number }>;
  avgHourlyRate: number;
  // Material
  totalMaterialCost: number;
  materialBySOVLine: Record<string, number>;
  // Billing Earned Value (from latest per-SOV-line billing items; pct_complete is 0–100)
  earnedValue: number;           // Σ (scheduled_value × pct_complete / 100)
  earnedLaborValue: number;      // Σ (estimated_labor_cost × pct_complete / 100)
  cumulativeBilled: number;
  retentionHeld: number;
  latestBillingItems: BillingLineItem[];
  latestBillingDate: string | null;     // most recent period_end in billing history
}

let _aggregates: Map<string, ProjectAggregates> | null = null;

export function getAggregates(): Map<string, ProjectAggregates> {
  if (_aggregates) return _aggregates;

  const db = getDataset();
  _aggregates = new Map();

  for (const contract of db.contracts) {
    const pid = contract.project_id;

    // ── Labor ────────────────────────────────────────────────────────────────
    const logs = db.laborLogs.filter((l) => l.project_id === pid);
    const totalSTHours = logs.reduce((s, l) => s + l.hours_st, 0);
    const totalOTHours = logs.reduce((s, l) => s + l.hours_ot, 0);
    const totalLaborHours = totalSTHours + totalOTHours;
    const totalLaborCost = sumLaborCost(logs);
    const avgHourlyRate =
      logs.length > 0 ? logs.reduce((s, l) => s + l.hourly_rate, 0) / logs.length : 55;

    // By role
    const laborByRole: ProjectAggregates["laborByRole"] = {};
    for (const log of logs) {
      if (!laborByRole[log.role])
        laborByRole[log.role] = { hours: 0, ot: 0, cost: 0, count: 0 };
      laborByRole[log.role].hours += log.hours_st + log.hours_ot;
      laborByRole[log.role].ot += log.hours_ot;
      laborByRole[log.role].cost += computeLaborCost(log);
      laborByRole[log.role].count++;
    }

    // By SOV line
    const laborBySOVLine: ProjectAggregates["laborBySOVLine"] = {};
    for (const log of logs) {
      if (!laborBySOVLine[log.sov_line_id])
        laborBySOVLine[log.sov_line_id] = { hours: 0, ot: 0, cost: 0 };
      laborBySOVLine[log.sov_line_id].hours += log.hours_st + log.hours_ot;
      laborBySOVLine[log.sov_line_id].ot += log.hours_ot;
      laborBySOVLine[log.sov_line_id].cost += computeLaborCost(log);
    }

    // By week (last 12)
    const weekMap = new Map<string, WeeklyLaborData>();
    for (const log of logs) {
      const d = new Date(log.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().split("T")[0];
      if (!weekMap.has(key)) weekMap.set(key, { week: key, st: 0, ot: 0, cost: 0 });
      const w = weekMap.get(key)!;
      w.st += log.hours_st;
      w.ot += log.hours_ot;
      w.cost += computeLaborCost(log);
    }
    const laborByWeek = Array.from(weekMap.values())
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-12);

    // ── Material ─────────────────────────────────────────────────────────────
    const deliveries = db.materialDeliveries.filter((m) => m.project_id === pid);
    const totalMaterialCost = deliveries.reduce((s, m) => s + m.total_cost, 0);
    const materialBySOVLine: Record<string, number> = {};
    for (const d of deliveries) {
      materialBySOVLine[d.sov_line_id] = (materialBySOVLine[d.sov_line_id] ?? 0) + d.total_cost;
    }

    // ── Billing EV ───────────────────────────────────────────────────────────
    const latestBillingItems = getLatestBillingBySOV(db.billingLineItems, pid);
    const sovBudgets = db.sovBudget.filter((b) => b.project_id === pid);

    let earnedValue = 0;
    let earnedLaborValue = 0;
    for (const item of latestBillingItems) {
      const pct = item.pct_complete / 100; // stored as 0–100
      earnedValue += item.scheduled_value * pct;
      const budget = sovBudgets.find((b) => b.sov_line_id === item.sov_line_id);
      if (budget) earnedLaborValue += budget.estimated_labor_cost * pct;
    }

    const latestBillingApp = db.billingHistory
      .filter((b) => b.project_id === pid)
      .sort((a, b) => b.application_number - a.application_number)[0];

    _aggregates.set(pid, {
      project_id: pid,
      totalLaborCost,
      totalLaborHours,
      totalOTHours,
      totalSTHours,
      laborByWeek,
      laborByRole,
      laborBySOVLine,
      avgHourlyRate,
      totalMaterialCost,
      materialBySOVLine,
      earnedValue,
      earnedLaborValue,
      cumulativeBilled: latestBillingApp?.cumulative_billed ?? 0,
      retentionHeld: latestBillingApp?.retention_held ?? 0,
      latestBillingItems,
      latestBillingDate: latestBillingApp?.period_end ?? null,
    });
  }

  return _aggregates;
}
