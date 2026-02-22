"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useDashboardData } from "@/lib/use-dashboard-data"
import { AlertTriangle, TrendingDown, Clock, FileText, Loader2 } from "lucide-react"

const severityConfig = {
  critical: {
    badge: "border-destructive/30 text-destructive",
    bg: "bg-destructive/5 border-destructive/20",
    dot: "bg-destructive",
  },
  warning: {
    badge: "border-warning/30 text-warning",
    bg: "bg-warning/5 border-warning/20",
    dot: "bg-warning",
  },
}

const categoryIcons: Record<string, typeof AlertTriangle> = {
  billing: TrendingDown,
  schedule: Clock,
  margin: FileText,
  labor: AlertTriangle,
}

export function AlertsPanel() {
  const { data, loading } = useDashboardData()

  if (loading || !data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const alerts = data.alerts

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">Active Alerts</CardTitle>
        <Badge variant="outline" className="text-xs">
          {alerts.length} alerts
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {alerts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No active alerts</p>
        ) : (
          alerts.map((alert) => {
            const config = severityConfig[alert.severity]
            const Icon = categoryIcons[alert.category] || AlertTriangle
            return (
              <div
                key={alert.id}
                className={cn(
                  "flex gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50 cursor-pointer",
                  config.bg
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <Icon className={cn("h-4 w-4", alert.severity === "critical" ? "text-destructive" : "text-warning")} />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{alert.title}</p>
                    <Badge variant="outline" className={cn("shrink-0 text-[10px]", config.badge)}>
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {alert.description}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
