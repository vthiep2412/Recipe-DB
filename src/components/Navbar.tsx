import { useState, useEffect } from 'preact/hooks';
import { Search, Bookmark, Shield } from 'lucide-preact';
import { AvatarDropdown } from './AvatarDropdown';
import { authStore } from '../services/authStore';

interface Props {
  onNavigate: (path: string) => void;
  onOpenSettings: () => void;
}

export function Navbar({ onNavigate, onOpenSettings }: Props) {
  const [authState, setAuthState] = useState(authStore.getState());

  useEffect(() => {
    const unsubscribe = authStore.subscribe((state) => {
      setAuthState(state);
    });
    return () => unsubscribe();
  }, []);

  const role = authState.role || authState.profile?.role;

  return (
    <header className="nav-bar">
      <a
        href="/"
        className="nav-brand"
        onClick={e => {
          e.preventDefault();
          onNavigate('/');
        }}
      >
        recipedb
      </a>

      <div className="nav-right">
        {role === 'admin' && (
          <button
            type="button"
            className="nav-btn"
            aria-label="Admin Panel"
            title="Admin Panel"
            onClick={() => onNavigate('/admin')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--interactive-accent)' }}
          >
            <Shield size={18} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Admin</span>
          </button>
        )}

        <button
          type="button"
          className="nav-btn"
          aria-label="Search"
          onClick={() => onNavigate('/search')}
        >
          <Search size={20} />
        </button>

        <button
          type="button"
          className="nav-btn"
          aria-label="Bookmarks"
          title="Bookmarks"
          onClick={() => onNavigate('/')}
        >
          <Bookmark size={20} />
        </button>

        <AvatarDropdown onOpenSettings={onOpenSettings} onNavigate={onNavigate} />
      </div>
    </header>
  );
}
