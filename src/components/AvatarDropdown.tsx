import { useState, useEffect, useRef } from 'preact/hooks';
import { User, Settings, Moon, Sun, LogOut } from 'lucide-preact';

interface Props {
  onOpenSettings: () => void;
}

export function AvatarDropdown({ onOpenSettings }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const closeMenu = () => {
    if (isOpen && !isClosing) {
      setIsClosing(true);
      setTimeout(() => {
        setIsOpen(false);
        setIsClosing(false);
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

  const toggleTheme = (e: Event) => {
    e.stopPropagation();
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleMenu = () => {
    if (isOpen) {
      closeMenu();
    } else {
      setIsOpen(true);
      setIsClosing(false);
    }
  };

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
          <div className="dropdown-item disabled">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={16} />
              Account settings
            </span>
          </div>

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

          <button type="button" className="dropdown-item" onClick={toggleTheme}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              Theme
            </span>
            <div className="mode-pill-toggle">
              <span className={theme === 'dark' ? 'active' : ''}>Dark</span>
              <span className={theme === 'light' ? 'active' : ''}>Light</span>
            </div>
          </button>

          <div className="dropdown-divider" />

          <div
            className="dropdown-item disabled"
            style={{ color: '#ef4444' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <LogOut size={16} />
              Logout
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
