import { useState, useEffect, useRef } from 'preact/hooks'
import { X, Monitor, Sun, Moon } from 'lucide-preact'
import { useSettings, StandardUnit, ThemeMode } from '../services/settingsStore'
import { Dropdown, Switch, SegmentedControl, SegmentedOption } from './ui'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function AppSettingsModal({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'appearance' | 'recipeView'>('appearance')
  const [settings, updateSettings] = useSettings()
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [isAnimating, setIsAnimating] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      const frame = requestAnimationFrame(() => {
        setIsAnimating(true)
      })
      return () => cancelAnimationFrame(frame)
    } else if (shouldRender) {
      setIsAnimating(false)
      const timer = setTimeout(() => {
        setShouldRender(false)
      }, 220)
      return () => clearTimeout(timer)
    }
  }, [isOpen, shouldRender])

  useEffect(() => {
    if (!shouldRender) return

    previousActiveElement.current = document.activeElement as HTMLElement | null

    const modalEl = modalRef.current
    if (modalEl) {
      const focusables = modalEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length > 0) {
        focusables[0].focus()
      } else {
        modalEl.focus()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key === 'Tab' && modalEl) {
        const focusables = Array.from(
          modalEl.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        )

        if (focusables.length === 0) {
          e.preventDefault()
          return
        }

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first || !modalEl.contains(document.activeElement)) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last || !modalEl.contains(document.activeElement)) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus()
      }
    }
  }, [isOpen, onClose])

  const themeOptions: SegmentedOption<ThemeMode>[] = [
    {
      value: 'system',
      label: 'System',
      icon: <Monitor size={19} style={{ transform: 'translateY(0.0625rem)' }} />
    },
    {
      value: 'light',
      label: 'Light',
      icon: <Sun size={16} />
    },
    {
      value: 'dark',
      label: 'Dark',
      icon: <Moon size={16} />
    }
  ]

  if (!shouldRender) return null

  return (
    <div
      className={`modal-overlay ${isAnimating ? 'is-open' : ''}`}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`modal-card ${isAnimating ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="app-settings-title" className="modal-title">App Settings</h2>
          <button type="button" className="nav-btn" onClick={onClose} aria-label="Close settings">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-sidebar" data-active-tab={activeTab}>
            <span className="modal-sidebar-slider" aria-hidden="true" />
            <button
              type="button"
              className={`modal-tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
              onClick={() => setActiveTab('appearance')}
            >
              Appearance
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${activeTab === 'recipeView' ? 'active' : ''}`}
              onClick={() => setActiveTab('recipeView')}
            >
              Recipe View
            </button>
          </div>

          <div className="modal-content-panel">
            {activeTab === 'appearance' ? (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-info">
                    <span className="settings-label">Theme</span>
                    <span className="settings-desc">Choose between light, dark, or system color scheme</span>
                  </div>
                  <div style={{ width: '20.5rem', maxWidth: '100%', flexShrink: 0 }}>
                    <SegmentedControl
                      options={themeOptions}
                      value={settings.theme}
                      onChange={theme => updateSettings({ theme })}
                      ariaLabel="Theme selection"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-info">
                    <span className="settings-label">Standard Unit</span>
                    <span className="settings-desc">Automatically convert recipe ingredient measurements</span>
                  </div>
                  <Dropdown
                    value={settings.standardUnit}
                    onChange={val => updateSettings({ standardUnit: val as StandardUnit })}
                    ariaLabel="Standard Unit"
                    options={[
                      { value: 'off', label: 'Follow Recipe' },
                      { value: 'us', label: 'US Customary' },
                      { value: 'metric', label: 'Metric' },
                      { value: 'australia', label: 'Australian Metric' }
                    ]}
                  />
                </div>

                <div className={`settings-collapsible ${settings.standardUnit !== 'off' ? 'is-expanded' : ''}`}>
                  <div className="settings-collapsible-inner">
                    <div className="settings-row">
                      <div className="settings-info">
                        <span className="settings-label">Convert Cup/tsp/tbsp (Supported ingredients)</span>
                        <span className="settings-desc">Convert cup and spoon measurements to weight for recognized baking and cooking ingredients</span>
                      </div>
                      <Switch
                        checked={settings.convertVolumeUnits}
                        onChange={convertVolumeUnits => updateSettings({ convertVolumeUnits })}
                        ariaLabel="Convert Cup, tsp, tbsp"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
