"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useDashboardData } from "@/lib/use-dashboard-data"
import { cn } from "@/lib/utils"
import { ArrowDownRight, ArrowRight, CheckCircle2, Loader2 } from "lucide-react"

const formatCurrency = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

const statusConfig = {
  healthy: { label: "Healthy", variant: "outline" as const, icon: CheckCircle2, className: "border-primary/30 text-primary" },
  "at-risk": { label: "At Risk", variant: "outline" as const, icon: ArrowRight, className: "border-warning/30 text-warning" },
  critical: { label: "Critical", variant: "outline" as const, icon: ArrowDownRight, className: "border-destructive/30 text-destructive" },
}

interface ProjectTableProps {
  onSelectProject?: (projectId: string) => void
}

export function ProjectTable({ onSelectProject }: ProjectTableProps = {}) {
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

  const projects = data.projects

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Project Portfolio</CardTitle>
        <CardDescription className="text-xs">
          All active projects with margin health and key metrics
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6 text-xs">Project</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-right">Revised Value</TableHead>
              <TableHead className="text-xs text-right">Labor CPI</TableHead>
              <TableHead className="text-xs text-right">Labor Overrun</TableHead>
              <TableHead className="text-xs text-right">OT %</TableHead>
              <TableHead className="text-xs">Progress</TableHead>
              <TableHead className="text-xs text-right">Billing Gap</TableHead>
              <TableHead className="text-xs text-right pr-6">Pending COs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => {
              const config = statusConfig[project.status]
              const StatusIcon = config.icon
              return (
                <TableRow key={project.id} className="cursor-pointer" onClick={() => onSelectProject?.(project.id)}>
                  <TableCell className="pl-6">
                    <div>
                      <p className="text-sm font-medium text-foreground">{project.name}</p>
                      <p className="text-xs text-muted-foreground">{project.gcName}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={config.variant} className={cn("gap-1 text-xs", config.className)}>
                      <StatusIcon className="h-3 w-3" />
                      {config.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    {formatCurrency(project.revisedContractValue)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-sm font-mono font-semibold",
                      project.laborCPI < 0.80
                        ? "text-destructive"
                        : project.laborCPI < 0.92
                          ? "text-warning"
                          : "text-primary"
                    )}
                  >
                    {project.laborCPI.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-sm font-mono",
                      project.laborHoursOverrunPct > 50
                        ? "text-destructive"
                        : project.laborHoursOverrunPct > 20
                          ? "text-warning"
                          : "text-muted-foreground"
                    )}
                  >
                    {project.laborHoursOverrunPct > 0 ? "+" : ""}{project.laborHoursOverrunPct.toFixed(0)}%
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-sm font-mono",
                      project.overtimePct > 25
                        ? "text-destructive"
                        : project.overtimePct > 15
                          ? "text-warning"
                          : "text-muted-foreground"
                    )}
                  >
                    {project.overtimePct.toFixed(1)}%
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={project.percentComplete}
                        className="h-1.5 w-16"
                      />
                      <span className="text-xs text-muted-foreground font-mono">
                        {project.percentComplete}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-sm font-mono",
                      project.billingLag < -500000
                        ? "text-destructive"
                        : project.billingLag < -200000
                          ? "text-warning"
                          : "text-primary"
                    )}
                  >
                    {project.billingLag >= 0 ? "+" : ""}{formatCurrency(Math.abs(project.billingLag))}
                    <span className="text-[10px] ml-0.5">{project.billingLag >= 0 ? "over" : "under"}</span>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    {project.changeOrdersPending > 0 ? (
                      <div className="text-right">
                        <span className="text-sm font-mono text-foreground">{project.changeOrdersPending}</span>
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({formatCurrency(project.changeOrdersValue)})
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
