"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { UIMessage } from "ai"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Send,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  Wrench,
  CheckCircle2,
} from "lucide-react"

// ── Extract tool invocations from a UIMessage's parts ──
function getToolParts(message: UIMessage) {
  return message.parts.filter(
    (p) => p.type.startsWith("tool-") || p.type === "dynamic-tool"
  ) as Array<{
    type: string
    toolName?: string
    toolCallId: string
    state: string
    input?: unknown
    output?: unknown
  }>
}

// ── Render tool call steps (replaces the old AgentSteps for real data) ──
function ToolSteps({ parts }: { parts: ReturnType<typeof getToolParts> }) {
  return (
    <div className="flex flex-col gap-0">
      {parts.map((part, index) => {
        const toolName =
          part.toolName ?? part.type.replace(/^tool-/, "")
        const isLast = index === parts.length - 1
        const isDone = part.state === "output-available"
        const isError = part.state === "output-error"

        return (
          <div key={part.toolCallId} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
                {isDone ? (
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                ) : isError ? (
                  <Wrench className="h-3 w-3 text-destructive" />
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                )}
              </div>
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>
            <div className={cn("flex-1 pb-4", isLast && "pb-0")}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-primary">
                  {isDone ? "Result" : isError ? "Error" : "Running"}
                </span>
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {toolName}
                </code>
              </div>
              {isDone && part.output != null && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                  {String(
                    typeof part.output === "string"
                      ? part.output
                      : JSON.stringify(part.output)
                  ).substring(0, 200)}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Render markdown-ish text (bold, numbered lists, sub-bullets) ──
function FormattedText({ text }: { text: string }) {
  return (
    <div className="prose-sm prose-invert max-w-none">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <p key={i} className="mt-2 mb-1 font-semibold text-foreground">
              {line.replace(/\*\*/g, "")}
            </p>
          )
        }
        if (line.match(/^\d+\./)) {
          const replaced = line.replace(/\*\*(.*?)\*\*/g, "|||$1|||")
          return (
            <p key={i} className="mt-1.5 pl-1">
              {replaced.split("|||").map((part, j) =>
                j % 2 === 1 ? (
                  <strong key={j} className="text-foreground font-medium">{part}</strong>
                ) : (
                  <span key={j}>{part}</span>
                )
              )}
            </p>
          )
        }
        if (line.startsWith("   -")) {
          return (
            <p key={i} className="pl-4 text-muted-foreground text-xs">
              {line.trim().replace(/^\- /, "").replace(/\*\*(.*?)\*\*/g, "$1")}
            </p>
          )
        }
        if (line.trim() === "") return <br key={i} />
        return (
          <p key={i}>
            {line.split(/\*\*(.*?)\*\*/).map((part, j) =>
              j % 2 === 1 ? (
                <strong key={j} className="text-foreground font-medium">{part}</strong>
              ) : (
                <span key={j}>{part}</span>
              )
            )}
          </p>
        )
      })}
    </div>
  )
}

// ── Single message bubble ──
function MessageBubble({ message }: { message: UIMessage }) {
  const [showSteps, setShowSteps] = useState(false)
  const isUser = message.role === "user"

  const textParts = message.parts.filter((p) => p.type === "text") as Array<{
    type: "text"
    text: string
  }>
  const toolParts = getToolParts(message)
  const fullText = textParts.map((p) => p.text).join("")

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-secondary" : "bg-primary/10"
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-primary" />
        )}
      </div>
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-2",
          isUser && "items-end"
        )}
      >
        {fullText && (
          <div
            className={cn(
              "rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            )}
          >
            {isUser ? <p>{fullText}</p> : <FormattedText text={fullText} />}
          </div>
        )}

        {toolParts.length > 0 && (
          <button
            onClick={() => setShowSteps(!showSteps)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Sparkles className="h-3 w-3 text-primary" />
            <span>{toolParts.length} agent steps</span>
            {showSteps ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        )}

        {showSteps && toolParts.length > 0 && (
          <div className="w-full rounded-lg border border-border bg-card p-3">
            <ToolSteps parts={toolParts} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ChatPanel ──
export function ChatPanel() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState("")

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    []
  )

  const { messages, sendMessage, status, error } = useChat({
    transport,
  })

  const isStreaming = status === "streaming" || status === "submitted"

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const quickPrompts = [
    "How's my portfolio doing?",
    "Which projects need attention?",
    "Show me billing lag exposure",
    "Email me a summary",
  ]

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt)
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    const text = input.trim()
    setInput("")
    sendMessage({ text })
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">MarginGuard Agent</p>
            <p className="text-xs text-muted-foreground">Autonomous portfolio analysis</p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1 border-primary/30 text-primary text-xs">
          <span className={cn(
            "h-1.5 w-1.5 rounded-full",
            isStreaming ? "bg-chart-2 animate-pulse" : "bg-primary"
          )} />
          {isStreaming ? "Thinking..." : "Active"}
        </Badge>
      </div>

      <ScrollArea className="flex-1 overflow-y-auto">
        <div ref={scrollRef} className="flex flex-col gap-4 p-4">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">MarginGuard AI Agent</p>
                <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">
                  I autonomously analyze your HVAC project portfolio, detect margin erosion, and recommend recovery actions.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleQuickPrompt(prompt)}
                    className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}

          {isStreaming && messages.length > 0 && (() => {
            const lastMsg = messages[messages.length - 1]
            const hasText = lastMsg?.parts?.some((p) => p.type === "text")
            if (lastMsg?.role === "assistant" && !hasText) {
              return (
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-secondary px-3.5 py-2.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Analyzing portfolio...</span>
                  </div>
                </div>
              )
            }
            return null
          })()}

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              Error: {error.message}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <div className="flex flex-wrap gap-1.5 pb-2">
          {quickPrompts.slice(0, 3).map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleQuickPrompt(prompt)}
              className="rounded-md border border-border bg-secondary/50 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {prompt}
            </button>
          ))}
        </div>
        <form
          onSubmit={handleFormSubmit}
          className="flex items-center gap-2"
        >
          <Input
            placeholder="Ask about your portfolio..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-secondary text-sm"
            disabled={isStreaming}
          />
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="sr-only">Send message</span>
          </Button>
        </form>
      </div>
    </div>
  )
}
