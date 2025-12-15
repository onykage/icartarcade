"use client"

import Image from "next/image"
import Link from "next/link"
import { Bell, Settings, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useEffect, useRef, useState } from "react"
import { useAuthUser } from "@/hooks/use-auth"
import { persistGoogleToken, clearGoogleToken } from "@/lib/auth"

declare global {
  interface Window {
    google?: any
  }
}

interface HeaderProps {
  onPanelToggle: (panel: "settings" | "notifications" | "account") => void
  activePanel: "settings" | "notifications" | "account" | null
}

export function Header({ onPanelToggle, activePanel }: HeaderProps) {
  const authUser = useAuthUser()
  const userName = authUser?.displayName || "Guest"
  const userEmail = authUser?.email || "Not signed in"
  const [tokenInput, setTokenInput] = useState("")
  const [gsiReady, setGsiReady] = useState(false)
  const gsiInitializedRef = useRef(false)

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""

  // Load Google Identity script
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.google?.accounts?.id) {
      setGsiReady(true)
      return
    }
    const script = document.createElement("script")
    script.src = "https://accounts.google.com/gsi/client"
    script.async = true
    script.defer = true
    script.onload = () => setGsiReady(true)
    document.head.appendChild(script)
  }, [])

  const handleGoogleLogin = () => {
    if (!clientId || typeof window === "undefined" || !window.google?.accounts?.id) return
    if (!gsiInitializedRef.current) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          if (response?.credential) {
            persistGoogleToken(response.credential)
          }
        },
        ux_mode: "popup",
        use_fedcm_for_prompt: false,
      })
      gsiInitializedRef.current = true
    }
    window.google.accounts.id.prompt()
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-secondary shadow-lg">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="iCart Arcade" width={48} height={48} className="h-12 w-auto" />
          <h1 className="font-mono text-xl font-bold text-secondary-foreground">iCart Arcade</h1>
        </div>

        {/* Navigation links */}
        <nav className="hidden md:flex items-center gap-6">
          {/* BACKEND HOOK: Implement routing for Ladder page */}
          <Link
            href="/ladder"
            className="font-mono text-sm font-medium text-secondary-foreground hover:text-accent transition-colors"
          >
            Ladder
          </Link>
          {/* BACKEND HOOK: Implement routing for Multiplayer page */}
          <Link
            href="/multiplayer"
            className="font-mono text-sm font-medium text-secondary-foreground hover:text-accent transition-colors"
          >
            Multiplayer
          </Link>
          {/* BACKEND HOOK: Implement routing for About page */}
          <Link
            href="/about"
            className="font-mono text-sm font-medium text-secondary-foreground hover:text-accent transition-colors"
          >
            About
          </Link>
        </nav>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {/* Notifications button */}
          <Button
            variant={activePanel === "notifications" ? "default" : "ghost"}
            size="icon"
            onClick={() => onPanelToggle("notifications")}
            className="relative"
          >
            <Bell className="h-5 w-5" />
            {/* BACKEND HOOK: Show notification badge when unread notifications exist */}
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />
          </Button>

          {/* Settings button */}
          <Button
            variant={activePanel === "settings" ? "default" : "ghost"}
            size="icon"
            onClick={() => onPanelToggle("settings")}
          >
            <Settings className="h-5 w-5" />
          </Button>

          {/* User menu dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 space-y-2">
              <div className="px-2 py-1.5 text-sm">
                <div className="font-semibold text-foreground">{userName}</div>
                <div className="text-xs text-muted-foreground truncate">{userEmail}</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onPanelToggle("account")}>Account</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPanelToggle("settings")}>Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPanelToggle("notifications")}>Notifications</DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1 space-y-2">
                <div className="text-[11px] font-semibold text-muted-foreground">Paste Google ID token</div>
                <Input
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="eyJhbGciOi..."
                  className="h-8"
                  spellCheck={false}
                />
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    if (!tokenInput.trim()) return
                    persistGoogleToken(tokenInput.trim())
                    setTokenInput("")
                  }}
                >
                  Save token locally
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    clearGoogleToken()
                    setTokenInput("")
                  }}
                >
                  Sign out (clear token)
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Use a Google ID token for local testing. Clears on sign out.
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleGoogleLogin}
                  disabled={!gsiReady || !clientId}
                  variant="secondary"
                >
                  Sign in with Google (popup)
                </Button>
                {!clientId && (
                  <p className="text-[11px] text-destructive">
                    Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID in env.
                  </p>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
