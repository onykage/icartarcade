"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const REPORT_EMAIL = "info@thesupergeek.com"

export default function BugReportPage() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")

  const disabled = status === "sending"

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!message.trim()) return
    setStatus("sending")
    try {
      // TODO: Replace with real email/API integration.
      console.info("[BugReport] sending to", REPORT_EMAIL, { email: email.trim(), message: message.trim() })
      await new Promise((resolve) => setTimeout(resolve, 400))
      setStatus("sent")
      setMessage("")
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight">Report a Bug</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Found an issue? Tell us what happened. Reports are currently sent to {REPORT_EMAIL}.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="email"
          placeholder="Your email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={disabled}
        />
        <Textarea
          placeholder="Describe the bug, steps to reproduce, and browser/device (if relevant)..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="min-h-[160px]"
          disabled={disabled}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={disabled || !message.trim()}>
            {status === "sending" ? "Sending..." : status === "sent" ? "Sent" : "Submit Report"}
          </Button>
          {status === "error" && <span className="text-sm text-destructive">Could not send. Please try again.</span>}
          {status === "sent" && <span className="text-sm text-emerald-600">Thanks! Your report was sent.</span>}
        </div>
      </form>
    </div>
  )
}
