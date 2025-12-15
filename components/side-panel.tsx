"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SettingsPanel } from "@/components/panels/settings-panel"
import { NotificationsPanel } from "@/components/panels/notifications-panel"
import { AccountPanel } from "@/components/panels/account-panel"

interface SidePanelProps {
  isOpen: boolean
  onClose: () => void
  type: "settings" | "notifications" | "account"
}

export function SidePanel({ isOpen, onClose, type }: SidePanelProps) {
  return (
    <>
      {/* Overlay - clicking outside does NOT close panel per requirements */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Side panel */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-in-out sm:w-96 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Panel header with close button */}
          <div className="flex items-center justify-between border-b border-border bg-secondary px-4 py-3">
            <h2 className="font-mono text-lg font-semibold text-secondary-foreground">
              {type === "settings" && "Settings"}
              {type === "notifications" && "Notifications"}
              {type === "account" && "Account"}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-secondary-foreground hover:bg-secondary-foreground/10"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-4">
            {type === "settings" && <SettingsPanel />}
            {type === "notifications" && <NotificationsPanel />}
            {type === "account" && <AccountPanel />}
          </div>
        </div>
      </div>
    </>
  )
}
