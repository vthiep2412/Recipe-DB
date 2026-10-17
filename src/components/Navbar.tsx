import { Search, Bookmark } from 'lucide-preact';
import { AvatarDropdown } from './AvatarDropdown';

interface Props {
  onNavigate: (path: string) => void;
  onOpenSettings: () => void;
}

export function Navbar({ onNavigate, onOpenSettings }: Props) {
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
