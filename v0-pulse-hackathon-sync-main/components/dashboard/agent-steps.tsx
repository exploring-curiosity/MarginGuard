"use client"

import { cn } from "@/lib/utils"
import { Brain, Wrench, Eye, CheckCircle2 } from "lucide-react"

interface AgentStep {
  id: string
  type: "thinking" | "tool-call" | "result" | "observation"
  content: string
  tool?: string
  timestamp: string
  duration?: number
}

interface AgentStepsProps {
  steps: AgentStep[]
}

const stepConfig = {
  thinking: { icon: Brain, label: "Reasoning", color: "text-chart-2" },
  "tool-call": { icon: Wrench, label: "Tool Call", color: "text-primary" },
  observation: { icon: Eye, label: "Observation", color: "text-chart-3" },
  result: { icon: CheckCircle2, label: "Result", color: "text-primary" },
}

export function AgentSteps({ steps }: AgentStepsProps) {
  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, index) => {
        const config = stepConfig[step.type]
        const Icon = config.icon
        const isLast = index === steps.length - 1

        return (
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary",
                )}
              >
                <Icon className={cn("h-3 w-3", config.color)} />
              </div>
              {!isLast && (
                <div className="w-px flex-1 bg-border" />
              )}
            </div>
            <div className={cn("flex-1 pb-4", isLast && "pb-0")}>
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-semibold", config.color)}>
                  {config.label}
                </span>
                {step.tool && (
                  <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {step.tool}
                  </code>
                )}
                {step.duration && (
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                    {step.duration}ms
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {step.content}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
