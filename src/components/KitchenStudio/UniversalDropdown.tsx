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
}

export function UniversalDropdown({
  items,
  selectedId,
  placeholder = 'Select item...',
  addNewLabel = '+ Add New',
  onSelect,
  onAddNew
}: UniversalDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedItem = items.find(item => item.id === selectedId);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

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
    <div className="universal-dropdown-container" ref={containerRef}>
      <button
        type="button"
        className="universal-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="universal-dropdown-value">
          {selectedItem ? selectedItem.label : placeholder}
        </span>
        <span className="universal-dropdown-arrow">
          <ChevronDown size={14} />
        </span>
      </button>

      {isOpen && (
        <div className="universal-dropdown-menu">
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
                setIsOpen(false);
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
                        setIsOpen(false);
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
