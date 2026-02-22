"use client"

import { useState, useEffect, createContext, useContext } from "react"

// ── Types (matching backend /api/dashboard response) ──

export interface Project {
  id: string
  name: string
  client: string
  gcName: string
  contractValue: number
  revisedContractValue: number
  bidMargin: number
  currentMargin: number
  percentComplete: number
  status: "healthy" | "at-risk" | "critical"
  laborCPI: number
  laborCPIStatus: string
  laborBudget: number
  laborActual: number
  laborHoursOverrunPct: number
  laborCostOverrunPct: number
  overtimePct: number
  materialBudget: number
  materialActual: number
  changeOrdersPending: number
  changeOrdersValue: number
  approvedCOValue: number
  billingLag: number
  cumulativeBilled: number
  trackedFieldCosts: number
  completionDate: string
  lastUpdated: string
  openRFIs: number
  highRiskRFIs: number
  retentionHeld: number
  isOverdue: boolean
  daysToCompletion: number
}

export interface PortfolioStats {
  totalContractValue: number
  totalRevisedValue: number
  totalBillingLag: number
  pendingChangeOrders: number
  pendingCOValue: number
  totalApprovedCOs: number
  criticalProjects: number
  atRiskProjects: number
  healthyProjects: number
  totalRetention: number
  totalOpenRFIs: number
  totalHighRiskRFIs: number
  totalLaborBudget: number
  totalLaborActual: number
}

export interface MarginTrendPoint {
  month: string
  billed: number
  costs: number
  margin: number
}

export interface ProjectMarginPoint {
  name: string
  bid: number
  current: number
  gap: number
  laborOverrun: number
  cpi: number
}

export interface Alert {
  id: string
  severity: "critical" | "warning"
  title: string
  description: string
  project: string
  category: string
}

export interface DashboardData {
  projects: Project[]
  portfolioStats: PortfolioStats
  marginTrend: MarginTrendPoint[]
  projectMarginData: ProjectMarginPoint[]
  alerts: Alert[]
  meta: {
    computedAt: string
    datasetSize: Record<string, number>
  }
}

export interface DashboardState {
  data: DashboardData | null
  loading: boolean
  error: string | null
  refetch: () => void
}

const DashboardContext = createContext<DashboardState>({
  data: null,
  loading: true,
  error: null,
  refetch: () => {},
})

export function useDashboardData(): DashboardState {
  return useContext(DashboardContext)
}

export { DashboardContext }

export function useDashboardFetch(): DashboardState {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/dashboard")
      if (!res.ok) {
        throw new Error(`Failed to load dashboard data: ${res.status}`)
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return { data, loading, error, refetch: fetchData }
}
