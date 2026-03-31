import { useState, useCallback } from 'react'

export function useLocalToggle(key: string, defaultValue = false): [boolean, () => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(`toggle:${key}`)
      return stored !== null ? stored === 'true' : defaultValue
    } catch {
      return defaultValue
    }
  })

  const toggle = useCallback(() => {
    setValue(prev => {
      const next = !prev
      try { localStorage.setItem(`toggle:${key}`, String(next)) } catch { /* ignore */ }
      return next
    })
  }, [key])

  return [value, toggle]
}
