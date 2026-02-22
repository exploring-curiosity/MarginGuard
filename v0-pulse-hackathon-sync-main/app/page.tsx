"use client"

import { useState } from "react"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import { Header } from "@/components/dashboard/header"
import { KpiCards } from "@/components/dashboard/kpi-cards"
import { MarginTrendChart } from "@/components/dashboard/margin-chart"
import { ProjectMarginChart } from "@/components/dashboard/project-margin-chart"
import { ProjectTable } from "@/components/dashboard/project-table"
import { ChatPanel } from "@/components/dashboard/chat-panel"
import { AlertsPanel } from "@/components/dashboard/alerts-panel"
import { WarRoom } from "@/components/dashboard/war-room"
import { ProjectDetail } from "@/components/dashboard/project-detail"
import { DashboardProvider } from "@/components/dashboard/dashboard-provider"

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("overview")
  const [chatOpen, setChatOpen] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  return (
    <DashboardProvider>
    <div className="flex h-screen overflow-hidden bg-background">
      <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          title="Portfolio Intelligence"
          subtitle="Last scan: Feb 22, 2026 at 10:00 AM"
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto p-6">
            {activeTab === "overview" && (
              <div className="flex flex-col gap-6">
                <KpiCards />

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <MarginTrendChart />
                  <ProjectMarginChart />
                </div>

                <ProjectTable />
              </div>
            )}

            {activeTab === "projects" && (
              <div className="flex flex-col gap-6">
                {selectedProjectId ? (
                  <ProjectDetail
                    projectId={selectedProjectId}
                    onBack={() => setSelectedProjectId(null)}
                  />
                ) : (
                  <ProjectTable onSelectProject={setSelectedProjectId} />
                )}
              </div>
            )}

            {activeTab === "agent" && (
              <div className="mx-auto flex h-full max-w-3xl flex-col">
                <div className="flex-1 overflow-hidden rounded-xl border border-border">
                  <ChatPanel />
                </div>
              </div>
            )}

            {activeTab === "alerts" && (
              <div className="flex flex-col gap-6">
                <AlertsPanel />
              </div>
            )}

            {activeTab === "reports" && (
              <div className="flex flex-col gap-6">
                <WarRoom />
              </div>
            )}
          </main>

          {/* Chat Panel - Right Side (visible on overview/projects/alerts) */}
          {activeTab !== "agent" && chatOpen && (
            <div className="hidden w-[380px] xl:block">
              <ChatPanel />
            </div>
          )}
        </div>
      </div>

      {/* Mobile Chat Toggle */}
      {activeTab !== "agent" && (
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg xl:hidden"
          aria-label="Toggle AI Agent chat"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
            />
          </svg>
        </button>
      )}
    </div>
    </DashboardProvider>
  )
}
