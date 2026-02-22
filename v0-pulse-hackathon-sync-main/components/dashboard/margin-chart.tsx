"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useDashboardData } from "@/lib/use-dashboard-data"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Loader2 } from "lucide-react"

export function MarginTrendChart() {
  const { data, loading } = useDashboardData()

  if (loading || !data) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Portfolio Margin Trend</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Portfolio Billing vs Costs</CardTitle>
        <CardDescription className="text-xs">
          Cumulative billing margin over time (billed − field costs) / billed
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.marginTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="marginGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.65 0.19 145)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="oklch(0.65 0.19 145)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 260)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "oklch(0.60 0.01 260)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "oklch(0.60 0.01 260)" }}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.16 0.005 260)",
                  border: "1px solid oklch(0.25 0.01 260)",
                  borderRadius: "8px",
                  fontSize: 12,
                  color: "oklch(0.95 0 0)",
                }}
                formatter={(value: number, name: string) => {
                  if (name === "margin") return [`${value}%`, "Margin"]
                  return [`$${(value / 1_000_000).toFixed(1)}M`, name === "billed" ? "Billed" : "Costs"]
                }}
              />
              <Area
                type="monotone"
                dataKey="margin"
                stroke="oklch(0.65 0.19 145)"
                strokeWidth={2}
                fill="url(#marginGradient)"
                name="margin"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 pt-2">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="text-xs text-muted-foreground">Billing Margin %</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
