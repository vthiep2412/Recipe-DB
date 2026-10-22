import { useState, useEffect, useRef } from 'preact/hooks'
import { User, Settings, Moon, Sun, LogOut, Monitor, Shield, ChefHat, LogIn } from 'lucide-preact'
import { useSettings } from '../services/settingsStore'
import { authUser, authProfile, signOut, openAuthModal } from '../services/authStore'

interface Props {
  onOpenSettings: () => void
}

export function AvatarDropdown({ onOpenSettings }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [settings, updateSettings] = useSettings()
  const menuRef = useRef<HTMLDivElement>(null)

  const user = authUser.value
  const profile = authProfile.value

  const closeMenu = () => {
    if (isOpen && !isClosing) {
      setIsClosing(true)
      setTimeout(() => {
        setIsOpen(false)
        setIsClosing(false)
      }, 140)
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu()
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isClosing])

  const toggleMenu = () => {
    if (isOpen) {
      closeMenu()
    } else {
      setIsOpen(true)
      setIsClosing(false)
    }
  }

  return (
    <div className="avatar-menu-wrapper" ref={menuRef}>
      <button
        type="button"
        className="nav-avatar-btn"
        onClick={toggleMenu}
        aria-label="User profile menu"
      >
        <User size={18} />
      </button>

      {isOpen && (
        <div className={`avatar-dropdown ${isClosing ? 'anim-exit' : 'anim-enter'}`}>
          {user ? (
            <>
              <div className="dropdown-item" style={{ flexDirection: 'column', alignItems: 'flex-start', cursor: 'default' }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {profile?.display_name || user.email}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  @{profile?.username || 'user'} • {profile?.role || 'user'}
                </span>
              </div>

              <div className="dropdown-divider" />

              <a
                href="/account"
                className="dropdown-item"
                onClick={closeMenu}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <User size={16} />
                  Account settings
                </span>
              </a>

              {(profile?.role === 'recipe_creator' || profile?.role === 'admin') && (
                <a
                  href="/kitchen-studio"
                  className="dropdown-item"
                  onClick={closeMenu}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ChefHat size={16} />
                    Kitchen Studio
                  </span>
                </a>
              )}

              {profile?.role === 'admin' && (
                <a
                  href="/admin"
                  className="dropdown-item"
                  onClick={closeMenu}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Shield size={16} />
                    Admin Panel
                  </span>
                </a>
              )}
            </>
          ) : (
            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                closeMenu()
                openAuthModal()
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LogIn size={16} />
                Sign In / Register
              </span>
            </button>
          )}

          <div className="dropdown-divider" />

          <button
            type="button"
            className="dropdown-item"
            onClick={() => {
              closeMenu()
              onOpenSettings()
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings size={16} />
              App settings
            </span>
          </button>

          <div className="dropdown-divider" />

          <div className="dropdown-item dropdown-theme-row">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {settings.theme === 'light' ? <Sun size={16} /> : settings.theme === 'dark' ? <Moon size={16} /> : <Monitor size={16} />}
              Theme
            </span>
            <div
              className="dropdown-theme-toggle"
              data-theme-selected={settings.theme}
              role="radiogroup"
              aria-label="Theme selection"
            >
              <span className="dropdown-theme-slider" aria-hidden="true" />
              <button
                type="button"
                role="radio"
                aria-label="System theme"
                aria-checked={settings.theme === 'system'}
                className={`dropdown-theme-btn ${settings.theme === 'system' ? 'active' : ''}`}
                onClick={e => {
                  e.stopPropagation()
                  updateSettings({ theme: 'system' })
                }}
              >
                <Monitor size={15} style={{ transform: 'translateY(0.0625rem)' }} />
              </button>
              <button
                type="button"
                role="radio"
                aria-label="Light theme"
                aria-checked={settings.theme === 'light'}
                className={`dropdown-theme-btn ${settings.theme === 'light' ? 'active' : ''}`}
                onClick={e => {
                  e.stopPropagation()
                  updateSettings({ theme: 'light' })
                }}
              >
                <Sun size={13} />
              </button>
              <button
                type="button"
                role="radio"
                aria-label="Dark theme"
                aria-checked={settings.theme === 'dark'}
                className={`dropdown-theme-btn ${settings.theme === 'dark' ? 'active' : ''}`}
                onClick={e => {
                  e.stopPropagation()
                  updateSettings({ theme: 'dark' })
                }}
              >
                <Moon size={13} />
              </button>
            </div>
          </div>

          {user && (
            <>
              <div className="dropdown-divider" />
              <button
                type="button"
                className="dropdown-item"
                style={{ color: '#ef4444' }}
                onClick={() => {
                  closeMenu()
                  signOut()
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <LogOut size={16} />
                  Logout
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
