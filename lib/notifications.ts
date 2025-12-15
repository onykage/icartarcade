import { isBrowser } from "@/lib/utils"

export type NotificationType = "info" | "success" | "warning" | "system"

export type NotificationItem = {
  id: string
  title: string
  message: string
  type: NotificationType
  createdAt: number
  read: boolean
}

const NOTIFICATION_STORAGE_KEY = "arcadeNotifications"
const MAX_NOTIFICATIONS = 50

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("nes:notifications-changed"))
  }
}

export const loadNotifications = (): NotificationItem[] => {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          typeof item.message === "string" &&
          typeof item.createdAt === "number",
      )
      .slice(0, MAX_NOTIFICATIONS)
  } catch {
    return []
  }
}

const saveNotifications = (items: NotificationItem[]) => {
  if (!isBrowser()) return
  try {
    const trimmed = items.slice(0, MAX_NOTIFICATIONS)
    window.localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(trimmed))
    emitChange()
  } catch {
    //
  }
}

export const pushNotification = (input: {
  title: string
  message: string
  type?: NotificationType
  read?: boolean
}) => {
  const now = Date.now()
  const next: NotificationItem = {
    id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
    title: input.title,
    message: input.message,
    type: input.type ?? "info",
    createdAt: now,
    read: input.read ?? false,
  }
  const existing = loadNotifications()
  saveNotifications([next, ...existing])
  return next
}

export const markAllNotificationsRead = () => {
  const items = loadNotifications().map((item) => ({ ...item, read: true }))
  saveNotifications(items)
}

export const markNotificationRead = (id: string) => {
  const items = loadNotifications().map((item) => (item.id === id ? { ...item, read: true } : item))
  saveNotifications(items)
}
