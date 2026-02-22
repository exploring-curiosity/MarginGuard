"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
} from "recharts"
import { Loader2, ArrowLeft, AlertTriangle, FileText, TrendingUp, DollarSign } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProjectDetailData {
  project_id: string
  project_name: string
  gc_name: string
  original_contract: number
  revised_contract: number
  approved_cos: number
  waterfall: Array<{
    label: string
    dollars: number
    margin_pts: number
    direction: string
  }>
  bid_margin_pct: number
  forecast_margin_pct: number
  erosion_pts: number
  evidence: {
    field_signals: Array<{
      note_id: string
      date: string
      signal_type: string
      excerpt: string
    }>
    field_signal_count: number
    pending_cos: Array<{
      co_number: string
      amount: number
      description: string
      date_submitted: string
      age_days: number
      reason_category: string
    }>
    pending_co_total: number
    high_risk_rfis: Array<{
      rfi_number: string
      subject: string
      priority: string
      status: string
      cost_impact: boolean
      schedule_impact: boolean
      days_open: number
    }>
  }
  labor_trend: Array<{
    week: string
    st_hours: number
    ot_hours: number
    ot_pct: number
  }>
  recovery_levers: Array<{
    name: string
    type: string
    dollars: number
    timeline: string
  }>
  total_recoverable: number
}

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

const signalColors: Record<string, string> = {
  verbal_approval: "border-destructive/30 text-destructive",
  extra_work: "border-warning/30 text-warning",
  rework: "border-destructive/30 text-destructive",
  delay: "border-chart-3/30 text-chart-3",
}

interface ProjectDetailProps {
  projectId: string
  onBack: () => void
}

export function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const [data, setData] = useState<ProjectDetailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/project/${projectId}`)
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const waterfallData = data.waterfall.map((step) => ({
    ...step,
    fill:
      step.direction === "baseline"
        ? "oklch(0.65 0.18 250)"
        : step.direction === "negative"
          ? "oklch(0.60 0.22 25)"
          : step.direction === "positive"
            ? "oklch(0.65 0.19 145)"
            : "oklch(0.65 0.18 250)",
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">{data.project_name.split(" - ")[0]}</h2>
          <p className="text-sm text-muted-foreground">
            {data.gc_name} · Revised contract {formatCurrency(data.revised_contract)} · {formatCurrency(data.approved_cos)} in COs
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className={cn(
            "text-xs",
            data.erosion_pts > 30 ? "border-destructive/30 text-destructive" : "border-warning/30 text-warning"
          )}>
            {data.erosion_pts.toFixed(1)}pt erosion
          </Badge>
        </div>
      </div>

      {/* Margin Waterfall */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Margin Waterfall
          </CardTitle>
          <CardDescription className="text-xs">
            Bid {data.bid_margin_pct}% → Forecast {data.forecast_margin_pct}% ({data.erosion_pts.toFixed(1)}pt erosion)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfallData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 260)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(0.60 0.01 260)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.60 0.01 260)" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: "oklch(0.16 0.005 260)", border: "1px solid oklch(0.25 0.01 260)", borderRadius: "8px", fontSize: 12, color: "oklch(0.95 0 0)" }}
                  formatter={(value: number) => [formatCurrency(value), "Amount"]}
                />
                <Bar dataKey="dollars" radius={[4, 4, 0, 0]}>
                  {waterfallData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Labor Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Weekly Labor Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.labor_trend} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 260)" vertical={false} />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 9, fill: "oklch(0.60 0.01 260)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => {
                      const d = new Date(v)
                      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.60 0.01 260)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.16 0.005 260)", border: "1px solid oklch(0.25 0.01 260)", borderRadius: "8px", fontSize: 12, color: "oklch(0.95 0 0)" }}
                    formatter={(value: number, name: string) => [
                      `${value}h`,
                      name === "st_hours" ? "Straight Time" : "Overtime",
                    ]}
                  />
                  <Bar dataKey="st_hours" stackId="a" fill="oklch(0.65 0.18 250)" name="st_hours" />
                  <Bar dataKey="ot_hours" stackId="a" fill="oklch(0.70 0.17 55)" radius={[4, 4, 0, 0]} name="ot_hours" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recovery Levers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Recovery Levers
            </CardTitle>
            <CardDescription className="text-xs">
              {formatCurrency(data.total_recoverable)} total recoverable
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recovery_levers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No recovery levers identified</p>
            ) : (
              data.recovery_levers.map((lever, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{lever.name}</p>
                    <p className="text-xs text-muted-foreground">{lever.timeline} · {lever.type.replace("_", " ")}</p>
                  </div>
                  <span className={cn(
                    "text-sm font-mono font-semibold",
                    lever.type === "cash_flow" ? "text-chart-3" : "text-primary"
                  )}>
                    {formatCurrency(lever.dollars)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Evidence Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Field Note Signals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Field Note Signals ({data.evidence.field_signal_count})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
            {data.evidence.field_signals.length === 0 ? (
              <p className="text-xs text-muted-foreground">No risk signals detected</p>
            ) : (
              data.evidence.field_signals.map((sig) => (
                <div key={sig.note_id} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-muted-foreground">{sig.date}</span>
                    <Badge variant="outline" className={cn("text-[10px]", signalColors[sig.signal_type] ?? "")}>
                      {sig.signal_type.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{sig.excerpt}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Pending COs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-chart-3" />
              Pending COs ({formatCurrency(data.evidence.pending_co_total)})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
            {data.evidence.pending_cos.length === 0 ? (
              <p className="text-xs text-muted-foreground">No pending change orders</p>
            ) : (
              data.evidence.pending_cos.map((co) => (
                <div key={co.co_number} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-semibold">{co.co_number}</span>
                    <span className="text-xs font-mono text-primary">{formatCurrency(co.amount)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{co.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{co.reason_category} · {co.age_days}d pending</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* High-Risk RFIs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              High-Risk RFIs ({data.evidence.high_risk_rfis.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
            {data.evidence.high_risk_rfis.length === 0 ? (
              <p className="text-xs text-muted-foreground">No high-risk RFIs</p>
            ) : (
              data.evidence.high_risk_rfis.map((rfi) => (
                <div key={rfi.rfi_number} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-semibold">{rfi.rfi_number}</span>
                    <Badge variant="outline" className={cn(
                      "text-[10px]",
                      rfi.priority === "Critical" ? "border-destructive/30 text-destructive" : "border-warning/30 text-warning"
                    )}>
                      {rfi.priority}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{rfi.days_open}d open</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{rfi.subject}</p>
                  <div className="flex gap-2 mt-1">
                    {rfi.cost_impact && <Badge variant="outline" className="text-[10px] border-destructive/20 text-destructive">Cost Impact</Badge>}
                    {rfi.schedule_impact && <Badge variant="outline" className="text-[10px] border-warning/20 text-warning">Schedule Impact</Badge>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
