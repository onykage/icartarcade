"use client"

import { useEffect, useState } from "react"
import {
  NotificationItem,
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications"

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => loadNotifications())

  useEffect(() => {
    const refresh = () => setNotifications(loadNotifications())
    refresh()
    window.addEventListener("nes:notifications-changed", refresh as EventListener)
    return () => window.removeEventListener("nes:notifications-changed", refresh as EventListener)
  }, [])

  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    markAll: () => markAllNotificationsRead(),
    markRead: (id: string) => markNotificationRead(id),
  }
}
