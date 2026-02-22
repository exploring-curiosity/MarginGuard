"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts"
import { Loader2, AlertTriangle, Clock, FileText, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface WarRoomData {
  week_ending: string
  top_risks: Array<{
    project_id: string
    project_name: string
    gc_name: string
    labor_overrun_pct: number
    cpi: number
    pending_co_exposure: number
    high_risk_rfis: number
    is_overdue: boolean
    one_line: string
  }>
  overdue_rfis: Array<{
    type: string
    id: string
    project: string
    description: string
    days_overdue: number
    assigned_to: string
    priority: string
  }>
  aging_cos: Array<{
    type: string
    id: string
    project: string
    description: string
    amount: number
    days_pending: number
  }>
  total_action_items: number
  co_pipeline: Record<string, { count: number; total: number }>
  co_pipeline_total: number
  underbilling_summary: Array<{
    project_name: string
    billing_lag: number
    billed: number
    field_costs: number
  }>
  portfolio_ot_trend: Array<{
    week: string
    ot_pct: number
    ot_hours: number
    st_hours: number
  }>
}

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

export function WarRoom() {
  const [data, setData] = useState<WarRoomData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/war-room")
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const coPipelineData = Object.entries(data.co_pipeline).map(([bucket, d]) => ({
    bucket,
    count: d.count,
    total: d.total,
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Weekly War Room Briefing</h2>
          <p className="text-sm text-muted-foreground">Week ending {data.week_ending}</p>
        </div>
        <Badge variant="outline" className="gap-1 text-xs">
          <AlertTriangle className="h-3 w-3" />
          {data.total_action_items} action items
        </Badge>
      </div>

      {/* Top Risks */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Portfolio Risk Ranking
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6 text-xs">Project</TableHead>
                <TableHead className="text-xs text-right">CPI</TableHead>
                <TableHead className="text-xs text-right">Labor Overrun</TableHead>
                <TableHead className="text-xs text-right">Pending COs</TableHead>
                <TableHead className="text-xs text-right">Risky RFIs</TableHead>
                <TableHead className="text-xs text-right pr-6">Schedule</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.top_risks.map((risk) => (
                <TableRow key={risk.project_id}>
                  <TableCell className="pl-6">
                    <div>
                      <p className="text-sm font-medium">{risk.project_name.split(" - ")[0]}</p>
                      <p className="text-xs text-muted-foreground">{risk.gc_name}</p>
                    </div>
                  </TableCell>
                  <TableCell className={cn(
                    "text-right text-sm font-mono font-semibold",
                    risk.cpi < 0.80 ? "text-destructive" : risk.cpi < 0.92 ? "text-warning" : "text-primary"
                  )}>
                    {risk.cpi.toFixed(2)}
                  </TableCell>
                  <TableCell className={cn(
                    "text-right text-sm font-mono",
                    risk.labor_overrun_pct > 50 ? "text-destructive" : risk.labor_overrun_pct > 20 ? "text-warning" : "text-muted-foreground"
                  )}>
                    +{risk.labor_overrun_pct.toFixed(0)}%
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    {formatCurrency(risk.pending_co_exposure)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    {risk.high_risk_rfis}
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    {risk.is_overdue ? (
                      <Badge variant="outline" className="border-destructive/30 text-destructive text-xs">Overdue</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">On track</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* CO Pipeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-chart-3" />
              CO Pipeline — {formatCurrency(data.co_pipeline_total)} Pending
            </CardTitle>
            <CardDescription className="text-xs">Change orders by age bucket</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={coPipelineData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 260)" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "oklch(0.60 0.01 260)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.60 0.01 260)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.16 0.005 260)", border: "1px solid oklch(0.25 0.01 260)", borderRadius: "8px", fontSize: 12, color: "oklch(0.95 0 0)" }}
                    formatter={(value: number) => [formatCurrency(value), "Amount"]}
                  />
                  <Bar dataKey="total" fill="oklch(0.65 0.18 250)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* OT Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-warning" />
              Portfolio Overtime Trend
            </CardTitle>
            <CardDescription className="text-xs">Weekly OT % across all projects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.portfolio_ot_trend} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 260)" vertical={false} />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 10, fill: "oklch(0.60 0.01 260)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => {
                      const d = new Date(v)
                      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.60 0.01 260)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.16 0.005 260)", border: "1px solid oklch(0.25 0.01 260)", borderRadius: "8px", fontSize: 12, color: "oklch(0.95 0 0)" }}
                    formatter={(value: number) => [`${value}%`, "OT Rate"]}
                  />
                  <Line type="monotone" dataKey="ot_pct" stroke="oklch(0.70 0.17 55)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Overdue RFIs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-warning" />
              Overdue RFIs ({data.overdue_rfis.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.overdue_rfis.length === 0 ? (
              <p className="text-xs text-muted-foreground">No overdue RFIs</p>
            ) : (
              data.overdue_rfis.slice(0, 5).map((rfi) => (
                <div key={rfi.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-foreground">{rfi.id}</span>
                      <Badge variant="outline" className={cn(
                        "text-[10px]",
                        rfi.priority === "Critical" ? "border-destructive/30 text-destructive" : "border-warning/30 text-warning"
                      )}>
                        {rfi.priority}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground truncate">{rfi.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{rfi.project.split(" - ")[0]} · {rfi.assigned_to}</p>
                  </div>
                  <Badge variant="outline" className="border-destructive/30 text-destructive text-[10px] shrink-0">
                    {rfi.days_overdue}d overdue
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Aging COs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-chart-3" />
              Aging Change Orders ({data.aging_cos.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.aging_cos.length === 0 ? (
              <p className="text-xs text-muted-foreground">No aging COs</p>
            ) : (
              data.aging_cos.slice(0, 5).map((co) => (
                <div key={co.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-foreground">{co.id}</span>
                      <span className="text-xs font-mono text-primary">{formatCurrency(co.amount)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground truncate">{co.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{co.project.split(" - ")[0]}</p>
                  </div>
                  <Badge variant="outline" className="border-warning/30 text-warning text-[10px] shrink-0">
                    {co.days_pending}d pending
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Under-billed Projects */}
      {data.underbilling_summary.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Under-Billed Projects
            </CardTitle>
            <CardDescription className="text-xs">
              Projects where field costs exceed cumulative billing — cash flow risk
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.underbilling_summary.map((p) => (
              <div key={p.project_name} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{p.project_name.split(" - ")[0]}</p>
                  <p className="text-xs text-muted-foreground">
                    Billed {formatCurrency(p.billed)} · Costs {formatCurrency(p.field_costs)}
                  </p>
                </div>
                <span className="text-sm font-mono font-semibold text-destructive">
                  -{formatCurrency(Math.abs(p.billing_lag))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
