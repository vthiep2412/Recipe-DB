import { useState, useEffect, useRef } from 'preact/hooks';
import {
  User,
  Settings,
  Moon,
  Sun,
  LogOut,
  LogIn,
  Monitor,
  UtensilsCrossed,
  Shield,
  Lightbulb,
} from 'lucide-preact';
import { useSettings } from '../services/settingsStore';
import { authStore } from '../services/authStore';

interface Props {
  onOpenSettings: () => void;
  onNavigate?: (path: string) => void;
}

export function AvatarDropdown({ onOpenSettings, onNavigate }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [settings, updateSettings] = useSettings();
  const [authState, setAuthState] = useState(authStore.getState());
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = authStore.subscribe((state) => {
      setAuthState(state);
    });
    return () => {
      unsubscribe();
      if (closeTimeoutRef.current !== null) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const closeMenu = () => {
    if (isOpen && !isClosing) {
      setIsClosing(true);
      if (closeTimeoutRef.current !== null) {
        clearTimeout(closeTimeoutRef.current);
      }
      closeTimeoutRef.current = window.setTimeout(() => {
        setIsOpen(false);
        setIsClosing(false);
        closeTimeoutRef.current = null;
      }, 140);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isClosing]);

  const toggleMenu = () => {
    if (isOpen) {
      closeMenu();
    } else {
      setIsOpen(true);
      setIsClosing(false);
    }
  };

  const handleNavigate = (path: string) => {
    closeMenu();
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const handleOpenAuth = () => {
    closeMenu();
    authStore.openAuthModal();
  };

  const handleSignOut = async () => {
    closeMenu();
    await authStore.signOut();
    if (onNavigate) {
      onNavigate('/');
    } else {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const role = authState.role || authState.profile?.role;
  const isAuthenticated = !!authState.user;

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
          {/* Unauthenticated: Log in button */}
          {!isAuthenticated ? (
            <button
              type="button"
              className="dropdown-item"
              onClick={handleOpenAuth}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LogIn size={16} />
                Log in
              </span>
            </button>
          ) : (
            <>
              {/* Authenticated user banner / name */}
              <div
                style={{
                  padding: '0.4rem 0.75rem 0.2rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-faint)',
                  borderBottom: '1px solid var(--background-modifier-border)',
                  marginBottom: '0.35rem',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-normal)' }}>
                  {authState.profile?.displayName || 'User'}
                </div>
                <div>@{authState.profile?.username || 'user'}</div>
              </div>

              {/* Account Settings (All authenticated roles) */}
              <button
                type="button"
                className="dropdown-item"
                onClick={() => handleNavigate('/account')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <User size={16} />
                  Account settings
                </span>
              </button>

              {/* Standard user: Recipe Suggest (disabled, greyed) */}
              {role === 'user' && (
                <div
                  className="dropdown-item disabled"
                  style={{ opacity: 0.5, cursor: 'not-allowed' }}
                  title="Recipe suggestions coming soon"
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Lightbulb size={16} />
                    Recipe Suggest
                  </span>
                </div>
              )}

              {/* Creator & Admin: Kitchen Studio */}
              {(role === 'recipe_creator' || role === 'admin') && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => handleNavigate('/kitchen-studio')}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UtensilsCrossed size={16} />
                    Kitchen Studio
                  </span>
                </button>
              )}

              {/* Admin: Admin Panel */}
              {role === 'admin' && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => handleNavigate('/admin')}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Shield size={16} />
                    Admin Panel
                  </span>
                </button>
              )}
            </>
          )}

          {/* App Settings */}
          <button
            type="button"
            className="dropdown-item"
            onClick={() => {
              closeMenu();
              onOpenSettings();
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings size={16} />
              App settings
            </span>
          </button>

          <div className="dropdown-divider" />

          {/* Theme selector */}
          <div className="dropdown-item dropdown-theme-row">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {settings.theme === 'light' ? (
                <Sun size={16} />
              ) : settings.theme === 'dark' ? (
                <Moon size={16} />
              ) : (
                <Monitor size={16} />
              )}
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
                onClick={(e) => {
                  e.stopPropagation();
                  updateSettings({ theme: 'system' });
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
                onClick={(e) => {
                  e.stopPropagation();
                  updateSettings({ theme: 'light' });
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
                onClick={(e) => {
                  e.stopPropagation();
                  updateSettings({ theme: 'dark' });
                }}
              >
                <Moon size={13} />
              </button>
            </div>
          </div>

          {/* Sign Out (Authenticated only) */}
          {isAuthenticated && (
            <>
              <div className="dropdown-divider" />
              <button
                type="button"
                className="dropdown-item"
                style={{ color: '#ef4444' }}
                onClick={handleSignOut}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <LogOut size={16} />
                  Sign out
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
