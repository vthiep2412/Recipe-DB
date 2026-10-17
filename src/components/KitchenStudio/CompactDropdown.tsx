import { useState, useRef, useEffect } from 'preact/hooks';

interface OptionItem {
  value: string;
  label: string;
}

interface CompactDropdownProps {
  options: (string | OptionItem)[];
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
}

export function CompactDropdown({
  options,
  value,
  onChange,
  className = '',
  placeholder = 'Select...'
}: CompactDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedOptions: OptionItem[] = options.map(opt =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  const selectedItem = normalizedOptions.find(opt => opt.value === value);
  const displayLabel = selectedItem ? selectedItem.label : value || placeholder;

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

  return (
    <div className={`compact-dropdown-container ${className}`} ref={containerRef}>
      <button
        type="button"
        className={`compact-dropdown-trigger ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="compact-dropdown-label">{displayLabel}</span>
        <svg
          className={`compact-dropdown-arrow ${isOpen ? 'is-rotated' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="compact-dropdown-menu">
          {normalizedOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`compact-dropdown-item ${opt.value === value ? 'is-selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              <span>{opt.label}</span>
              {opt.value === value && (
                <svg
                  className="compact-dropdown-check"
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M10 3L4.5 8.5L2 6"
                    stroke="#ff7a00"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
