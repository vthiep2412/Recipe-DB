import { Search, Bookmark } from 'lucide-preact';
import { AvatarDropdown } from './AvatarDropdown';

interface Props {
  onNavigate: (path: string) => void;
  onOpenSettings: () => void;
  currentPath?: string;
}

export function Navbar({ onNavigate, onOpenSettings, currentPath }: Props) {

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
        RecipeDB
      </a>

      <div className="nav-right">

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

        <AvatarDropdown
          onOpenSettings={onOpenSettings}
          onNavigate={onNavigate}
          currentPath={currentPath}
        />
      </div>
    </header>
  );
}
