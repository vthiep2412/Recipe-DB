import { useState, useEffect } from 'preact/hooks'

export type ThemeMode = 'system' | 'light' | 'dark'
export type StandardUnit = 'off' | 'us' | 'metric' | 'australia'

export interface AppSettings {
  theme: ThemeMode
  standardUnit: StandardUnit
  convertVolumeUnits: boolean
}

const STORAGE_KEY = 'recipedb_settings'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  standardUnit: 'off',
  convertVolumeUnits: false
}

let currentSettings: AppSettings = loadSettings()
const listeners = new Set<(settings: AppSettings) => void>()

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return
  const resolved = theme === 'system' ? getSystemTheme() : theme
  document.documentElement.setAttribute('data-theme', resolved)
}

function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw)
    return {
      theme: parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : 'system',
      standardUnit: parsed.standardUnit === 'us' || parsed.standardUnit === 'metric' || parsed.standardUnit === 'australia' || parsed.standardUnit === 'off' ? parsed.standardUnit : 'off',
      convertVolumeUnits: typeof parsed.convertVolumeUnits === 'boolean' ? parsed.convertVolumeUnits : false
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore storage quota error
  }
}

export function getSettings(): AppSettings {
  return currentSettings
}

export function updateSettings(partial: Partial<AppSettings>): void {
  currentSettings = { ...currentSettings, ...partial }
  saveSettings(currentSettings)
  applyTheme(currentSettings.theme)
  listeners.forEach(fn => fn(currentSettings))
}

export function subscribeSettings(fn: (settings: AppSettings) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

if (typeof window !== 'undefined') {
  applyTheme(currentSettings.theme)

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleSystemChange = () => {
    if (currentSettings.theme === 'system') {
      applyTheme('system')
    }
  }
  mediaQuery.addEventListener('change', handleSystemChange)

  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const remote = JSON.parse(e.newValue)
        currentSettings = { ...DEFAULT_SETTINGS, ...remote }
        applyTheme(currentSettings.theme)
        listeners.forEach(fn => fn(currentSettings))
      } catch {
        // Ignore parse error
      }
    }
  })
}

export function useSettings(): [AppSettings, (partial: Partial<AppSettings>) => void] {
  const [settings, setSettings] = useState<AppSettings>(currentSettings)

  useEffect(() => {
    return subscribeSettings(next => {
      setSettings(next)
    })
  }, [])

  return [settings, updateSettings]
}
