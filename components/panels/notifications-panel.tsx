"use client"

import { Bell, Trophy, Users, Star, Info } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { useNotifications } from "@/hooks/use-notifications"
import { markAllNotificationsRead } from "@/lib/notifications"

export function NotificationsPanel() {
  const { notifications, unreadCount } = useNotifications()

  const getIcon = (type: string) => {
    switch (type) {
      case "high-score":
        return <Trophy className="h-5 w-5 text-primary" />
      case "friend":
        return <Users className="h-5 w-5 text-primary" />
      case "achievement":
        return <Star className="h-5 w-5 text-primary" />
      case "system":
        return <Info className="h-5 w-5 text-primary" />
      default:
        return <Bell className="h-5 w-5 text-primary" />
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
        <Button variant="ghost" size="sm" onClick={() => markAllNotificationsRead()}>
          Mark all read
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="space-y-3">
          {notifications.length ? (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-lg border p-3 transition-colors ${
                  notification.read ? "border-border bg-card" : "border-primary/30 bg-primary/5"
                }`}
              >
                <div className="flex gap-3">
                  <div className="mt-0.5">{getIcon(notification.type)}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-start justify-between">
                      <h4 className="text-sm font-semibold text-foreground">{notification.title}</h4>
                      {!notification.read && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <p className="text-sm text-muted-foreground">{notification.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              No notifications yet.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
