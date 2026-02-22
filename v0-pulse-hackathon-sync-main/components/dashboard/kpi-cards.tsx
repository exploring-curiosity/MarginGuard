"use client"

import { Card, CardContent } from "@/components/ui/card"
import { useDashboardData } from "@/lib/use-dashboard-data"
import {
  DollarSign,
  TrendingDown,
  AlertTriangle,
  Clock,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

const formatCurrency = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

export function KpiCards() {
  const { data, loading } = useDashboardData()

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="gap-0 py-4">
            <CardContent className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const s = data.portfolioStats
  const laborOverrunPct = s.totalLaborBudget > 0
    ? Math.round(((s.totalLaborActual - s.totalLaborBudget) / s.totalLaborBudget) * 100)
    : 0
  const kpis = [
    {
      label: "Portfolio Value",
      value: formatCurrency(s.totalRevisedValue),
      subtext: `${s.criticalProjects + s.atRiskProjects + s.healthyProjects} active projects · ${formatCurrency(s.totalApprovedCOs)} in COs`,
      icon: DollarSign,
      trend: null as string | null,
      color: "text-foreground",
    },
    {
      label: "Labor Overrun",
      value: `${laborOverrunPct}%`,
      subtext: `${formatCurrency(s.totalLaborActual)} actual vs ${formatCurrency(s.totalLaborBudget)} budget`,
      icon: TrendingDown,
      trend: "critical" as string | null,
      color: "text-destructive",
    },
    {
      label: "At-Risk Projects",
      value: `${s.criticalProjects + s.atRiskProjects}`,
      subtext: `${s.criticalProjects} critical, ${s.atRiskProjects} at-risk · ${s.totalHighRiskRFIs} risky RFIs`,
      icon: AlertTriangle,
      trend: s.criticalProjects > 0 ? "critical" as string | null : "warning" as string | null,
      color: s.criticalProjects > 0 ? "text-destructive" : "text-warning",
    },
    {
      label: "Billing Status",
      value: formatCurrency(Math.abs(s.totalBillingLag)),
      subtext: `${s.totalBillingLag >= 0 ? "Over-billed" : "Under-billed"} · ${s.pendingChangeOrders} pending COs`,
      icon: Clock,
      trend: s.totalBillingLag < -200000 ? "critical" as string | null : "warning" as string | null,
      color: s.totalBillingLag < -200000 ? "text-destructive" : "text-chart-3",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon
        return (
          <Card key={kpi.label} className="gap-0 py-4">
            <CardContent className="flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {kpi.label}
                </p>
                <p className={cn("text-2xl font-bold tracking-tight", kpi.color)}>
                  {kpi.value}
                </p>
                <p className="text-xs text-muted-foreground">{kpi.subtext}</p>
              </div>
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  kpi.trend === "critical"
                    ? "bg-destructive/10"
                    : kpi.trend === "warning"
                      ? "bg-warning/10"
                      : "bg-secondary"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    kpi.trend === "critical"
                      ? "text-destructive"
                      : kpi.trend === "warning"
                        ? "text-warning"
                        : "text-muted-foreground"
                  )}
                />
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
