import { useState, useEffect } from 'preact/hooks'
import { userDataSyncService } from './userDataSyncService'

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
let cachedHwAccel: boolean | null = null

function isHardwareAccelerated(): boolean {
  if (cachedHwAccel !== null) return cachedHwAccel
  if (typeof window === 'undefined' || typeof document === 'undefined') return true
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) {
      cachedHwAccel = false
      return false
    }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    if (debugInfo) {
      const renderer = (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '').toLowerCase()
      if (/swiftshader|llvmpipe|software|basic render|software rasterizer/.test(renderer)) {
        cachedHwAccel = false
        return false
      }
    }
    cachedHwAccel = true
    return true
  } catch {
    cachedHwAccel = false
    return false
  }
}

function getThemeTransitionDuration(): number {
  if (typeof window === 'undefined') return 650
  try {
    const saved = localStorage.getItem('timer_anim_speed')
    if (saved) {
      const speed = parseFloat(saved)
      if (speed > 0 && speed < 1) {
        return Math.round(650 / speed)
      }
    }
  } catch {
    // Ignore localStorage access restrictions
  }
  return 650
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveEffectiveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return theme === 'system' ? getSystemTheme() : theme
}

export function applyTheme(theme: ThemeMode, coordinates?: { x: number; y: number }): void {
  if (typeof document === 'undefined') return
  const targetEffective = resolveEffectiveTheme(theme)
  const currentEffective = document.documentElement.getAttribute('data-theme') || getSystemTheme()

  const setDomTheme = () => {
    document.documentElement.setAttribute('data-theme', targetEffective)
    document.documentElement.style.colorScheme = targetEffective

    // Update dropdown theme toggle attribute synchronously
    const toggle = document.querySelector('.dropdown-theme-toggle') as HTMLElement | null
    if (toggle) toggle.setAttribute('data-theme-selected', theme)

    // Tell Dark Reader extension that page is already natively in dark mode
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="darkreader-lock"]')
    if (targetEffective === 'dark') {
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'darkreader-lock'
        document.head.appendChild(meta)
      }
    } else {
      if (meta) {
        meta.remove()
      }
    }
  }

  // If effective theme did not change, apply without transition
  if (currentEffective === targetEffective) {
    setDomTheme()
    return
  }

  // Check if View Transitions API and coordinates are available, reduced-motion is not requested, and hardware acceleration is active
  const isReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!coordinates || typeof document.startViewTransition !== 'function' || isReducedMotion || !isHardwareAccelerated()) {
    setDomTheme()
    return
  }

  const { x, y } = coordinates
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  )

  const transition = document.startViewTransition(() => {
    setDomTheme()
  })

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`
        ]
      },
      {
        duration: getThemeTransitionDuration(),
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)'
      }
    )
  }).catch(() => {
    // Graceful fallback if animation is interrupted
  })
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

export function updateSettings(partial: Partial<AppSettings>, coordinates?: { x: number; y: number }): void {
  currentSettings = { ...currentSettings, ...partial }
  saveSettings(currentSettings)
  applyTheme(currentSettings.theme, coordinates)
  userDataSyncService.updateSettingsData(currentSettings as unknown as Record<string, unknown>)
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

export function useSettings(): [AppSettings, typeof updateSettings] {
  const [settings, setSettings] = useState<AppSettings>(currentSettings)

  useEffect(() => {
    return subscribeSettings(next => {
      setSettings(next)
    })
  }, [])

  return [settings, updateSettings]
}
