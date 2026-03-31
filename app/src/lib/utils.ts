import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 1) return 'Running...'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const remaining = s % 60
  return remaining > 0 ? `${m}m ${remaining}s` : `${m}m`
}
