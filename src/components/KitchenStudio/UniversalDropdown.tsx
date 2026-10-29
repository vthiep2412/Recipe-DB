import { useState, useRef, useEffect } from 'preact/hooks';
import { ChevronDown } from 'lucide-preact';

export interface DropdownItem {
  id: string;
  label: string;
  group?: string;
  subtitle?: string;
}

interface UniversalDropdownProps {
  items: DropdownItem[];
  selectedId?: string;
  placeholder?: string;
  addNewLabel?: string;
  onSelect: (id: string) => void;
  onAddNew?: () => void;
  placement?: 'bottom' | 'top' | 'auto';
}

export function UniversalDropdown({
  items,
  selectedId,
  placeholder = 'Select item...',
  addNewLabel = '+ Add New',
  onSelect,
  onAddNew,
  placement = 'auto'
}: UniversalDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isDropup, setIsDropup] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  const selectedItem = items.find(item => item.id === selectedId);

  const closeDropdown = () => {
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

  const openDropdown = () => {
    if (closeTimeoutRef.current !== null) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      let scrollParent = containerRef.current.parentElement;
      while (scrollParent && scrollParent !== document.body) {
        const style = window.getComputedStyle(scrollParent);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'hidden') {
          break;
        }
        scrollParent = scrollParent.parentElement;
      }

      const parentBottom = scrollParent ? scrollParent.getBoundingClientRect().bottom : window.innerHeight;
      const parentTop = scrollParent ? scrollParent.getBoundingClientRect().top : 0;
      const spaceBelow = Math.min(window.innerHeight, parentBottom) - rect.bottom;
      const spaceAbove = rect.top - Math.max(0, parentTop);

      const shouldDropup =
        placement === 'top' ||
        (placement !== 'bottom' && spaceBelow < 260 && spaceAbove > spaceBelow);
      setIsDropup(shouldDropup);
    }

    setIsClosing(false);
    setIsOpen(true);
  };

  const toggleDropdown = () => {
    if (isOpen && !isClosing) {
      closeDropdown();
    } else {
      openDropdown();
    }
  };

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen || isClosing) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isClosing]);

  useEffect(() => {
    if (isOpen && !isClosing) {
      inputRef.current?.focus();
    } else if (!isOpen) {
      setSearchTerm('');
    }
  }, [isOpen, isClosing]);

  const filteredItems = items.filter(item =>
    item.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.subtitle && item.subtitle.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Group items by their group property
  const grouped: Record<string, DropdownItem[]> = {};
  for (const item of filteredItems) {
    const groupName = item.group || 'Standard';
    if (!grouped[groupName]) {
      grouped[groupName] = [];
    }
    grouped[groupName].push(item);
  }

  return (
    <div className={`universal-dropdown-container ${isOpen && !isClosing ? 'is-open' : ''}`} ref={containerRef}>
      <button
        type="button"
        className={`universal-dropdown-trigger ${isOpen && !isClosing ? 'is-open' : ''}`}
        onClick={toggleDropdown}
        aria-expanded={isOpen && !isClosing}
      >
        <span className="universal-dropdown-value">
          {selectedItem ? selectedItem.label : placeholder}
        </span>
        <span
          className={`universal-dropdown-arrow ${isOpen && !isClosing ? (isDropup ? 'is-dropup-rotated' : 'is-rotated') : ''}`}
          style={{ transition: 'transform 0.2s cubic-bezier(0.23, 1, 0.32, 1)' }}
        >
          <ChevronDown size={14} />
        </span>
      </button>

      {isOpen && (
        <div
          className={`universal-dropdown-menu ${isDropup ? 'is-dropup' : 'is-dropdown'} ${isClosing ? 'anim-exit' : 'anim-enter'}`}
        >
          <div className="universal-dropdown-search-box">
            <input
              ref={inputRef}
              type="text"
              className="universal-dropdown-search"
              placeholder="Search..."
              value={searchTerm}
              onInput={e => setSearchTerm((e.target as HTMLInputElement).value)}
            />
          </div>

          {onAddNew && (
            <button
              type="button"
              className="universal-dropdown-add-btn"
              onClick={() => {
                closeDropdown();
                onAddNew();
              }}
            >
              {addNewLabel}
            </button>
          )}

          <div className="universal-dropdown-list">
            {Object.keys(grouped).length === 0 ? (
              <div className="universal-dropdown-empty">No matches found</div>
            ) : (
              Object.entries(grouped).map(([groupName, groupItems]) => (
                <div key={groupName} className="universal-dropdown-group">
                  <div className="universal-dropdown-group-header">{groupName}</div>
                  {groupItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={`universal-dropdown-item ${item.id === selectedId ? 'is-selected' : ''}`}
                      onClick={() => {
                        onSelect(item.id);
                        closeDropdown();
                      }}
                    >
                      <span className="universal-dropdown-item-label">{item.label}</span>
                      {item.subtitle && (
                        <span className="universal-dropdown-item-sub">{item.subtitle}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
