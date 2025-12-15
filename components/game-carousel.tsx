"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { NES_GAMES, loadStoredScores } from "@/lib/nes"
import { debugLog } from "@/lib/debug"
import { useAuthUser } from "@/hooks/use-auth"

interface GameCarouselProps {
  onGameSelect: (gameId: string) => void
}

type ScoreSummary = { topScore: number | null; personalBest: number | null }

export function GameCarousel({ onGameSelect }: GameCarouselProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const [scores, setScores] = useState<Record<string, ScoreSummary>>({})
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const authUser = useAuthUser()
  const isAuthed = !!authUser?.userUuid
  const scoreOwnerId = authUser?.userUuid ?? null
  const gamesPerPage = 8
  const totalPages = Math.ceil(NES_GAMES.length / gamesPerPage)

  const currentGames = useMemo(
    () => NES_GAMES.slice(currentPage * gamesPerPage, (currentPage + 1) * gamesPerPage),
    [currentPage, gamesPerPage],
  )
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const isSearching = normalizedQuery.length > 0

  const filteredGames = useMemo(() => {
    if (!normalizedQuery) return NES_GAMES
    return NES_GAMES.filter((game) => {
      const haystack = `${game.title} ${game.description}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery])

  const displayedGames = useMemo(
    () => (isSearching ? filteredGames : currentGames),
    [currentGames, filteredGames, isSearching],
  )

  const suggestions = useMemo(() => filteredGames.slice(0, 6), [filteredGames])
  const showAutocomplete = isSearchFocused && isSearching

  const formatScore = (value: number | null | undefined) => {
    if (value == null) return "—"
    return value.toLocaleString()
  }

  const refreshScores = useCallback(() => {
    const next: Record<string, ScoreSummary> = {}
    NES_GAMES.forEach((game) => {
      if (game.statMode !== "score") {
        next[game.id] = { topScore: null, personalBest: null }
        return
      }
      const entries = loadStoredScores(game.romFile, scoreOwnerId)
      const topScore = entries.length ? Math.max(...entries) : null
      next[game.id] = {
        topScore,
        personalBest: entries.length ? Math.max(...entries) : null,
      }
    })
    // Defer state updates to avoid cross-component render warnings
    setTimeout(() => setScores(next), 0)
  }, [scoreOwnerId])

  useEffect(() => {
    refreshScores()
    debugLog("GameCarousel: initial score hydration complete")

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key.startsWith("nesWidgetScores:")) {
        debugLog("GameCarousel: storage event -> refreshing scores", event.key)
        refreshScores()
      }
    }

    const handleCustomUpdate = () => {
      debugLog("GameCarousel: custom score update event")
      refreshScores()
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener("nes:scores-updated", handleCustomUpdate as EventListener)

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("nes:scores-updated", handleCustomUpdate as EventListener)
    }
  }, [refreshScores, scoreOwnerId])

  const handlePrevious = () => {
    debugLog("GameCarousel: navigating to previous page", { currentPage })
    setCurrentPage((prev) => (prev > 0 ? prev - 1 : totalPages - 1))
  }

  const handleNext = () => {
    debugLog("GameCarousel: navigating to next page", { currentPage })
    setCurrentPage((prev) => (prev < totalPages - 1 ? prev + 1 : 0))
  }

  const handleSuggestionSelect = (gameId: string, title: string) => {
    debugLog("GameCarousel: suggestion selected", { gameId, title })
    setSearchQuery(title)
    setCurrentPage(0)
    setIsSearchFocused(false)
    // Keep grid filtered to the selected title; selection is still required to launch
  }

  return (
    <div className="container mx-auto max-w-[1650px] px-4 py-8">
      <div className="mb-6">
        <div className="relative">
          <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(0)
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 120)}
              placeholder="Search the library…"
              className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>

          {showAutocomplete && (
            <div
              className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border bg-popover shadow-lg"
              onMouseDown={(e) => e.preventDefault()}
            >
              <Command>
                <CommandList className="max-h-64">
                  <CommandEmpty>No matching titles yet.</CommandEmpty>
                  <CommandGroup heading="NES Library">
                    {suggestions.map((game) => (
                      <CommandItem
                        key={game.id}
                        value={game.title}
                        onSelect={() => handleSuggestionSelect(game.id, game.title)}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{game.title}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {game.releaseYear ? `${game.releaseYear} · ` : ""}
                            {game.statMode === "score" ? "Scores tracked" : "Stats coming soon"}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>
          )}
        </div>
      </div>

      <div className="mb-8 flex items-center justify-between">
        <h2 className="font-mono text-2xl font-bold text-foreground">Game Library</h2>
        {isSearching ? (
          <div className="text-sm text-muted-foreground">
            Showing {displayedGames.length} of {NES_GAMES.length} titles
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevious}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage + 1} of {totalPages}
            </span>
            <Button variant="outline" size="icon" onClick={handleNext}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      <TooltipProvider>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4">
          {displayedGames.map((game) => (
            <Tooltip key={game.id}>
              <TooltipTrigger asChild>
                <Card
                  className="group cursor-pointer overflow-hidden p-0 transition-all duration-300 hover:scale-105 hover:shadow-xl"
                  onClick={() => onGameSelect(game.id)}
                >
                  <div className="relative aspect-[3/4]">
                    <Image
                      src={game.boxArt || "/placeholder.svg"}
                      alt={game.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="absolute bottom-0 left-0 right-0 translate-y-full p-3 transition-transform duration-300 group-hover:translate-y-0">
                      <p className="text-balance text-center text-sm font-semibold text-white">{game.title}</p>
                    </div>
                  </div>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1">
                  <p className="font-semibold">{game.title}</p>
                  <p className="text-xs text-muted-foreground">{game.description}</p>
                  {game.statMode === "score" ? (
                    <div className="pt-2 text-xs">
                      <p>Top Score: {formatScore(scores[game.id]?.topScore)}</p>
                      <p>Your Best: {formatScore(scores[game.id]?.personalBest)}</p>
                      {!isAuthed && (
                        <p className="pt-1 text-[11px] text-muted-foreground">
                          Sign in to sync scores to your profile.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="pt-2 text-xs text-muted-foreground">
                      <p>Scores not tracked for this title.</p>
                      <p className="italic">Progress/time tracking coming soon.</p>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  )
}
