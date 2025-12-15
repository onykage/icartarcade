"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { SidePanel } from "@/components/side-panel"
import { GameCarousel } from "@/components/game-carousel"
import { EmulatorScreen } from "@/components/emulator-screen"
import { debugLog } from "@/lib/debug"

export function ArcadeShell() {
  const [activePanel, setActivePanel] = useState<"settings" | "notifications" | "account" | null>(null)
  const [selectedGame, setSelectedGame] = useState<string | null>(null)

  const handlePanelToggle = (panel: "settings" | "notifications" | "account") => {
    setActivePanel(activePanel === panel ? null : panel)
  }

  const handleGameSelect = (gameId: string) => {
    debugLog("ArcadeShell: game selected", gameId)
    setSelectedGame(gameId)
  }

  const handleCloseGame = () => {
    debugLog("ArcadeShell: closing emulator")
    setSelectedGame(null)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header with navigation and user controls */}
      <Header onPanelToggle={handlePanelToggle} activePanel={activePanel} />

      {/* Main content area with slide animation */}
      <main className="relative flex-1 overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{
            transform: selectedGame ? "translateX(-100%)" : "translateX(0)",
          }}
        >
          {/* Game Carousel View */}
          <div className="min-w-full">
            <GameCarousel onGameSelect={handleGameSelect} />
          </div>

          {/* Emulator View */}
          <div className="min-w-full">
            {selectedGame && <EmulatorScreen gameId={selectedGame} onClose={handleCloseGame} />}
          </div>
        </div>
      </main>

      {/* Footer component */}
      <Footer />

      {/* Sliding side panel for settings/notifications/account */}
      <SidePanel isOpen={activePanel !== null} onClose={() => setActivePanel(null)} type={activePanel || "settings"} />
    </div>
  )
}
