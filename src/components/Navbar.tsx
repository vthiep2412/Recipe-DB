import { Search, Bookmark, Shield, ChefHat } from 'lucide-preact';
import { AvatarDropdown } from './AvatarDropdown';
import { authProfile } from '../services/authStore';

interface Props {
  onNavigate: (path: string) => void;
  onOpenSettings: () => void;
}

export function Navbar({ onNavigate, onOpenSettings }: Props) {
  const profile = authProfile.value;

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
        {profile?.role === 'admin' && (
          <a
            href="/admin"
            className="nav-btn"
            title="Admin Panel"
            onClick={e => {
              e.preventDefault();
              onNavigate('/admin');
            }}
          >
            <Shield size={20} />
          </a>
        )}

        {(profile?.role === 'recipe_creator' || profile?.role === 'admin') && (
          <a
            href="/kitchen-studio"
            className="nav-btn"
            title="Kitchen Studio"
            onClick={e => {
              e.preventDefault();
              onNavigate('/kitchen-studio');
            }}
          >
            <ChefHat size={20} />
          </a>
        )}

        <button
          className="nav-btn"
          aria-label="Search"
          onClick={() => onNavigate('/search')}
        >
          <Search size={20} />
        </button>

        <button
          className="nav-btn"
          aria-label="Bookmarks"
          onClick={() => alert('Bookmarks feature coming soon with database')}
        >
          <Bookmark size={20} />
        </button>

        <AvatarDropdown onOpenSettings={onOpenSettings} />
      </div>
    </header>
  );
}
