"use client"

import { User, Mail, Calendar, Trophy } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAuthUser } from "@/hooks/use-auth"
import { clearGoogleToken } from "@/lib/auth"

export function AccountPanel() {
  const authUser = useAuthUser()
  const isAuthed = !!authUser
  const displayName = authUser?.displayName || "Guest"
  const email = authUser?.email || "Not signed in"

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="flex flex-col items-center gap-4 text-center">
        <Avatar className="h-24 w-24 border-4 border-primary">
          <AvatarImage src={"/placeholder.svg"} alt={displayName} />
          <AvatarFallback className="bg-primary text-2xl font-bold text-primary-foreground">
            {displayName.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h3 className="text-lg font-bold text-foreground">{displayName}</h3>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
        {!isAuthed && (
          <p className="text-xs text-muted-foreground">
            Sign in with Google locally to sync scores and saves.
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{isAuthed ? "—" : "0"}</p>
          <p className="text-xs text-muted-foreground">
            {isAuthed ? "Synced games tracked per user" : "Guest mode"}
          </p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{isAuthed ? "—" : "0"}</p>
          <p className="text-xs text-muted-foreground">Scores sync after login</p>
        </Card>
      </div>

      {/* Account info */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Account Information</h4>

        <div className="flex items-center gap-3 text-sm">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Username:</span>
          <span className="font-medium text-foreground">{displayName}</span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Email:</span>
          <span className="font-medium text-foreground">{email}</span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Member since:</span>
          <span className="font-medium text-foreground">{isAuthed ? "Local session" : "Guest"}</span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Total playtime:</span>
          <span className="font-medium text-foreground">
            {isAuthed ? "Tracked per user after login" : "Not tracked in guest mode"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-4">
        {!isAuthed && (
          <Button
            variant="outline"
            className="w-full bg-transparent"
            onClick={() => console.log("[v0] Launch local Google login flow]")}
          >
            Sign in with Google
          </Button>
        )}
        {isAuthed && (
          <Button
            variant="outline"
            className="w-full bg-transparent"
            onClick={() => clearGoogleToken()}
          >
            Sign out (clear local token)
          </Button>
        )}
      </div>
    </div>
  )
}
