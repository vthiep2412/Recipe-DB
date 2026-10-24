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
  placement?: 'bottom' | 'top' | 'auto'
}

export function Dropdown({
  options,
  value,
  onChange,
  className = '',
  placeholder = 'Select...',
  disabled = false,
  ariaLabel,
  placement = 'auto'
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [isDropup, setIsDropup] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeTimeoutRef = useRef<number | null>(null)

  const normalizedOptions: DropdownOption[] = options.map(opt =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  )

  const selectedItem = normalizedOptions.find(opt => opt.value === value)
  const displayLabel = selectedItem ? selectedItem.label : value || placeholder

  const closeDropdown = () => {
    if (isOpen && !isClosing) {
      setIsClosing(true)
      if (closeTimeoutRef.current !== null) {
        clearTimeout(closeTimeoutRef.current)
      }
      closeTimeoutRef.current = window.setTimeout(() => {
        setIsOpen(false)
        setIsClosing(false)
        closeTimeoutRef.current = null
      }, 140)
    }
  }

  const openDropdown = () => {
    if (disabled) return
    if (closeTimeoutRef.current !== null) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const shouldDropup =
        placement === 'top' ||
        (placement !== 'bottom' && spaceBelow < 220 && spaceAbove > spaceBelow)
      setIsDropup(shouldDropup)
    }

    setIsClosing(false)
    setIsOpen(true)
  }

  const toggleDropdown = () => {
    if (disabled) return
    if (isOpen && !isClosing) {
      closeDropdown()
    } else {
      openDropdown()
    }
  }

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isOpen || isClosing) return

    const selectedIdx = normalizedOptions.findIndex(opt => opt.value === value)
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0)

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDropdown()
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
            closeDropdown()
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
  }, [isOpen, isClosing, value, normalizedOptions])

  useEffect(() => {
    if (isOpen && !isClosing && menuRef.current && highlightedIndex >= 0) {
      const items = menuRef.current.querySelectorAll<HTMLElement>('.ui-dropdown-item')
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen, isClosing])

  return (
    <div
      className={`ui-dropdown-container ${className} ${disabled ? 'is-disabled' : ''}`}
      ref={containerRef}
    >
      <button
        type="button"
        className={`ui-dropdown-trigger ${isOpen && !isClosing ? 'is-open' : ''}`}
        onClick={toggleDropdown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen && !isClosing}
        aria-label={ariaLabel || displayLabel}
      >
        <span className="ui-dropdown-label">{displayLabel}</span>
        <ChevronDown
          size={16}
          className={`ui-dropdown-arrow ${isOpen && !isClosing ? (isDropup ? 'is-dropup-rotated' : 'is-rotated') : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`ui-dropdown-menu ${isDropup ? 'is-dropup' : 'is-dropdown'} ${isClosing ? 'anim-exit' : 'anim-enter'}`}
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
                  closeDropdown()
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
