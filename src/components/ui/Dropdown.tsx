import { useState, useRef, useEffect } from 'preact/hooks'
import { ChevronDown, Check } from 'lucide-preact'

export interface DropdownOption {
  value: string
  label: string
  disabled?: boolean
}

export interface DropdownProps {
  options: (string | DropdownOption)[]
  value: string
  onChange: (val: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
}

export function Dropdown({
  options,
  value,
  onChange,
  className = '',
  placeholder = 'Select...',
  disabled = false,
  ariaLabel
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const normalizedOptions: DropdownOption[] = options.map(opt =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  )

  const selectedItem = normalizedOptions.find(opt => opt.value === value)
  const displayLabel = selectedItem ? selectedItem.label : value || placeholder

  useEffect(() => {
    if (!isOpen) return

    const selectedIdx = normalizedOptions.findIndex(opt => opt.value === value)
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0)

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex(prev => {
          let next = prev + 1
          while (next < normalizedOptions.length && normalizedOptions[next].disabled) {
            next++
          }
          return next < normalizedOptions.length ? next : prev
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex(prev => {
          let next = prev - 1
          while (next >= 0 && normalizedOptions[next].disabled) {
            next--
          }
          return next >= 0 ? next : prev
        })
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setHighlightedIndex(current => {
          const target = normalizedOptions[current]
          if (target && !target.disabled) {
            onChange(target.value)
            setIsOpen(false)
          }
          return current
        })
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, value, normalizedOptions])

  useEffect(() => {
    if (isOpen && menuRef.current && highlightedIndex >= 0) {
      const items = menuRef.current.querySelectorAll<HTMLElement>('.ui-dropdown-item')
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  const toggleDropdown = () => {
    if (disabled) return
    setIsOpen(!isOpen)
  }

  return (
    <div
      className={`ui-dropdown-container ${className} ${disabled ? 'is-disabled' : ''}`}
      ref={containerRef}
    >
      <button
        type="button"
        className={`ui-dropdown-trigger ${isOpen ? 'is-open' : ''}`}
        onClick={toggleDropdown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || displayLabel}
      >
        <span className="ui-dropdown-label">{displayLabel}</span>
        <ChevronDown
          size={16}
          className={`ui-dropdown-arrow ${isOpen ? 'is-rotated' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className="ui-dropdown-menu"
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel || displayLabel}
        >
          {normalizedOptions.map((opt, idx) => {
            const isSelected = opt.value === value
            const isHighlighted = idx === highlightedIndex

            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                className={`ui-dropdown-item ${isSelected ? 'is-selected' : ''} ${isHighlighted ? 'is-highlighted' : ''}`}
                onClick={() => {
                  if (opt.disabled) return
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                <span className="ui-dropdown-item-label">{opt.label}</span>
                {isSelected && (
                  <Check size={14} className="ui-dropdown-check" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
