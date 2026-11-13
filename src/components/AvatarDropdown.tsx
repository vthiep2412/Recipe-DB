import { useState, useEffect, useRef } from 'preact/hooks';
import {
  User,
  Settings,
  Moon,
  Sun,
  LogOut,
  CircleUser,
  UserRoundCog,
  Monitor,
  UtensilsCrossed,
  Shield,
  Lightbulb,
  LifeBuoy,
  ChefHat,
} from 'lucide-preact';
import { useSettings } from '../services/settingsStore';
import { authStore } from '../services/authStore';
import { toast } from 'sonner';

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

  const hasLocalSession = typeof window !== 'undefined' && Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  const isAuthenticated = !!authState.user || (authState.isAuthLoading && hasLocalSession);
  const prevAuthRef = useRef(isAuthenticated);

  // Animation & transition states
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [isMorphSignup, setIsMorphSignup] = useState(!isAuthenticated);
  const [isLoginSlideIn, setIsLoginSlideIn] = useState(!isAuthenticated);
  const [isGearVisible, setIsGearVisible] = useState(!isAuthenticated);

  const isSigningOutRef = useRef(false);
  const logoutTimer1Ref = useRef<number | null>(null);
  const logoutTimer2Ref = useRef<number | null>(null);

  // Clear initial mount flag after first render so initial state does not animate
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsInitialMount(false);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = authStore.subscribe((state) => {
      if (state.isAuthLoading) return;

      const isAuthNow = !!state.user;
      const wasAuth = prevAuthRef.current;
      setAuthState(state);

      if (!wasAuth && isAuthNow) {
        // User logged in: trigger reverse transition
        prevAuthRef.current = true;
        setIsMorphSignup(false);
        setIsLoginSlideIn(false);
        setIsGearVisible(false);
      } else if (wasAuth && !isAuthNow && !isSigningOutRef.current) {
        // External sign-out (from another tab or settings modal)
        prevAuthRef.current = false;
        setIsMorphSignup(true);
        setIsLoginSlideIn(true);
        setIsGearVisible(true);
      }
    });

    return () => {
      unsubscribe();
      if (closeTimeoutRef.current !== null) clearTimeout(closeTimeoutRef.current);
      if (logoutTimer1Ref.current !== null) clearTimeout(logoutTimer1Ref.current);
      if (logoutTimer2Ref.current !== null) clearTimeout(logoutTimer2Ref.current);
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

  const handleSignOut = () => {
    if (isSigningOutRef.current) return;
    isSigningOutRef.current = true;
    closeMenu();

    // Stage 1: Avatar button morphs into orange [Sign up] pill & settings gear expands
    setIsMorphSignup(true);
    setIsGearVisible(true);

    // Stage 2: Slide out [Log in] button at approved 25% overlap (~130ms)
    logoutTimer1Ref.current = window.setTimeout(() => {
      setIsLoginSlideIn(true);
    }, 130);

    // Stage 3: Complete sign out after full animation settles (~650ms)
    logoutTimer2Ref.current = window.setTimeout(async () => {
      await authStore.signOut();
      toast.success('Signed out successfully.', { duration: 2500 });
      isSigningOutRef.current = false;
      prevAuthRef.current = false;
      if (onNavigate) {
        onNavigate('/');
      } else {
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }, 650);
  };

  const role = authState.role || authState.profile?.role;
  const isScheduled = !!authState.profile?.scheduledDeleteAt;
  const activePath = currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const isAccountPage = activePath === '/account';

  return (
    <div
      className={`auth-nav-cluster avatar-menu-wrapper ${isInitialMount ? 'no-anim' : ''}`}
      ref={menuRef}
    >
      {/* Stage 2: Log in ghost button */}
      <button
        type="button"
        className={`nav-login-btn ${isLoginSlideIn ? 'slide-in' : ''}`}
        onClick={() => handleOpenAuth('login')}
        aria-label="Log in"
      >
        Log in
      </button>

      {/* Stage 1: Avatar morph button (Circle <-> Orange [Sign up] Pill) */}
      <div className="morph-wrapper">
        <button
          type="button"
          className={`nav-avatar-btn nav-morph-btn ${isMorphSignup ? 'is-signup' : ''}`}
          onClick={() => {
            if (isMorphSignup) {
              handleOpenAuth('signup');
            } else {
              toggleMenu();
            }
          }}
          aria-label={isMorphSignup ? 'Sign up' : 'User profile menu'}
        >
          <span className="morph-icon">
            <User size={18} />
          </span>
          <span className="morph-text">Sign up</span>
        </button>
      </div>

      {/* Settings Gear: smooth non-snapping expansion alongside Stage 1 */}
      <button
        type="button"
        className={`nav-gear-btn ${isGearVisible ? 'visible' : ''}`}
        onClick={onOpenSettings}
        aria-label="App settings"
        title="App settings"
      >
        <Settings size={18} />
      </button>

      {isOpen && isAuthenticated && (
        <div className={`avatar-dropdown ${isClosing ? 'anim-exit' : 'anim-enter'}`}>
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

              {/* Standard user: Apply to be a Recipe Maker */}
              {!isScheduled && role === 'user' && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => handleNavigate('/apply-creator')}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ChefHat size={16} />
                    Become a Recipe Maker
                  </span>
                </button>
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
                  updateSettings({ theme: 'system' }, { x: e.clientX, y: e.clientY });
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
                  updateSettings({ theme: 'light' }, { x: e.clientX, y: e.clientY });
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
                  updateSettings({ theme: 'dark' }, { x: e.clientX, y: e.clientY });
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
