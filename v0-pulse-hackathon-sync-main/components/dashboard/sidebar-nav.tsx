"use client"

import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  FolderOpen,
  Bot,
  AlertTriangle,
  FileText,
  Settings,
  TrendingDown,
  Shield,
} from "lucide-react"

interface SidebarNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const navItems = [
  { id: "overview", label: "Portfolio", icon: LayoutDashboard },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "agent", label: "AI Agent", icon: Bot },
  { id: "alerts", label: "Alerts", icon: AlertTriangle },
  { id: "reports", label: "Reports", icon: FileText },
]

export function SidebarNav({ activeTab, onTabChange }: SidebarNavProps) {
  return (
    <aside className="flex h-full w-16 flex-col items-center border-r border-border bg-sidebar py-4 lg:w-56 lg:items-stretch">
      <div className="flex items-center gap-2 px-3 pb-6">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Shield className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="hidden lg:block">
          <p className="text-sm font-semibold text-sidebar-foreground">MarginGuard</p>
          <p className="text-xs text-muted-foreground">AI Agent</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2">
        <p className="mb-2 hidden px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground lg:block">
          Navigation
        </p>
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-sidebar-primary")} />
              <span className="hidden lg:inline">{item.label}</span>
              {item.id === "alerts" && (
                <span className="ml-auto hidden h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground lg:flex">
                  2
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border px-2 pt-4">
        <button className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <TrendingDown className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline">Margin Trends</span>
        </button>
        <button className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <Settings className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline">Settings</span>
        </button>
      </div>
    </aside>
  )
}
