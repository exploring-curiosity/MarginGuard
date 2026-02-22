"use client"

import { ReactNode } from "react"
import { DashboardContext, useDashboardFetch } from "@/lib/use-dashboard-data"

export function DashboardProvider({ children }: { children: ReactNode }) {
  const state = useDashboardFetch()
  return (
    <DashboardContext.Provider value={state}>
      {children}
    </DashboardContext.Provider>
  )
}
