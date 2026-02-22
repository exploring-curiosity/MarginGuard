"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useDashboardData } from "@/lib/use-dashboard-data"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { Loader2 } from "lucide-react"

export function ProjectMarginChart() {
  const { data, loading } = useDashboardData()

  if (loading || !data) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Margin Gap by Project</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const projectMarginData = data.projectMarginData

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Labor CPI by Project</CardTitle>
        <CardDescription className="text-xs">
          Cost Performance Index — below 0.92 = over budget
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={projectMarginData}
              layout="vertical"
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 260)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "oklch(0.60 0.01 260)" }}
                axisLine={false}
                tickLine={false}
                domain={[0, 1.2]}
                tickFormatter={(v) => v.toFixed(1)}
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 10, fill: "oklch(0.60 0.01 260)" }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.16 0.005 260)",
                  border: "1px solid oklch(0.25 0.01 260)",
                  borderRadius: "8px",
                  fontSize: 12,
                  color: "oklch(0.95 0 0)",
                }}
                formatter={(value: number, name: string) => [
                  name === "cpi" ? value.toFixed(2) : `${value}%`,
                  name === "cpi" ? "Labor CPI" : "Labor Overrun",
                ]}
              />
              <Bar dataKey="cpi" radius={[0, 3, 3, 0]} barSize={12} name="cpi">
                {projectMarginData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.cpi < 0.80
                        ? "oklch(0.60 0.22 25)"
                        : entry.cpi < 0.92
                          ? "oklch(0.70 0.17 55)"
                          : "oklch(0.65 0.19 145)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
