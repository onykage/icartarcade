import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isBrowser() {
  return typeof window !== 'undefined'
}

export function withBasePath(path: string) {
  if (!path.startsWith('/')) return `/${path}`
  return path
}

export function isDevMode() {
  const flag = process.env.NEXT_PUBLIC_DEV_MODE
  return flag === 'true' || flag === '1'
}
