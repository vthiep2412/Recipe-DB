import { useState, useEffect, useRef } from 'preact/hooks';
import {
  User,
  Settings,
  Moon,
  Sun,
  LogOut,
  LogIn,
  UserPlus,
  CircleUser,
  UserRoundCog,
  Monitor,
  UtensilsCrossed,
  Shield,
  Lightbulb,
  LifeBuoy,
} from 'lucide-preact';
import { useSettings } from '../services/settingsStore';
import { authStore } from '../services/authStore';

interface Props {
  onOpenSettings: () => void;
  onNavigate?: (path: string) => void;
  currentPath?: string;
}

export function AvatarDropdown({ onOpenSettings, onNavigate, currentPath }: Props) {
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

  const handleOpenAuth = (mode: 'login' | 'signup' = 'login') => {
    closeMenu();
    authStore.openAuthModal(undefined, mode);
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
  const isScheduled = !!authState.profile?.scheduledDeleteAt;
  const activePath = currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const isAccountPage = activePath === '/account';

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
          {/* Unauthenticated: Split Log in and Sign up buttons */}
          {!isAuthenticated ? (
            <>
              <div className="dropdown-auth-split">
                <button
                  type="button"
                  className="dropdown-auth-btn"
                  onClick={() => handleOpenAuth('login')}
                >
                  <LogIn size={16} />
                  <span>Log in</span>
                </button>
                <button
                  type="button"
                  className="dropdown-auth-btn"
                  onClick={() => handleOpenAuth('signup')}
                >
                  <UserPlus size={16} />
                  <span>Sign up</span>
                </button>
              </div>
              <div className="dropdown-divider" />
            </>
          ) : (
            <>
              {/* Authenticated user merged header: avatar + name + settings button */}
              <div className="dropdown-user-header">
                <div className="dropdown-user-info">
                  <div className="dropdown-user-avatar">
                    <CircleUser size={32} />
                  </div>
                  <div className="dropdown-user-details">
                    <span className="dropdown-user-name">
                      {authState.profile?.displayName || authState.user?.email?.split('@')[0] || 'User'}
                    </span>
                    <span className="dropdown-user-handle">
                      @{authState.profile?.username || authState.user?.email?.split('@')[0] || 'user'}
                    </span>
                  </div>
                </div>
                {!isAccountPage && !isScheduled && (
                  <button
                    type="button"
                    className="dropdown-user-settings-btn"
                    onClick={() => handleNavigate('/account')}
                    aria-label="Account settings"
                  >
                    <UserRoundCog size={18} />
                  </button>
                )}
              </div>
              <div className="dropdown-divider" />

              {/* Standard user: Recipe Suggest (disabled, greyed) */}
              {!isScheduled && role === 'user' && (
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
              {!isScheduled && (role === 'recipe_creator' || role === 'admin') && (
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
              {!isScheduled && role === 'admin' && (
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

          {/* Support */}
          <button
            type="button"
            className="dropdown-item"
            onClick={() => handleNavigate('/support')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <LifeBuoy size={16} />
              Support
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
