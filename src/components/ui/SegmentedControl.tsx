import { ComponentChildren } from 'preact'

export interface SegmentedOption<T extends string = string> {
  value: T
  label?: string
  icon?: ComponentChildren
  ariaLabel?: string
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (val: T) => void
  className?: string
  ariaLabel?: string
  disabled?: boolean
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  className = '',
  ariaLabel,
  disabled = false
}: SegmentedControlProps<T>) {
  const activeIndex = options.findIndex(opt => opt.value === value)
  const count = options.length

  const sliderStyle = activeIndex >= 0 && count > 0 ? {
    width: `calc((100% - ${(count + 1) * 0.25}rem) / ${count})`,
    transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 0.25}rem))`
  } : {}

  const handleKeyDown = (e: KeyboardEvent, currentIndex: number) => {
    if (disabled) return
    let nextIndex = currentIndex

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIndex = (currentIndex + 1) % count
      while (options[nextIndex].disabled && nextIndex !== currentIndex) {
        nextIndex = (nextIndex + 1) % count
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIndex = (currentIndex - 1 + count) % count
      while (options[nextIndex].disabled && nextIndex !== currentIndex) {
        nextIndex = (nextIndex - 1 + count) % count
      }
    }

    if (nextIndex !== currentIndex && !options[nextIndex].disabled) {
      onChange(options[nextIndex].value)
    }
  }

  return (
    <div
      className={`ui-segmented-group ${disabled ? 'is-disabled' : ''} ${className}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {activeIndex >= 0 && (
        <span
          className="ui-segmented-slider"
          style={sliderStyle}
          aria-hidden="true"
        />
      )}
      {options.map((opt, idx) => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={opt.ariaLabel || opt.label}
            disabled={disabled || opt.disabled}
            className={`ui-segmented-btn ${isActive ? 'is-active' : ''}`}
            onClick={e => {
              e.stopPropagation()
              if (disabled || opt.disabled) return
              onChange(opt.value)
            }}
            onKeyDown={e => handleKeyDown(e, idx)}
          >
            {opt.icon && <span className="ui-segmented-btn-icon">{opt.icon}</span>}
            {opt.label && <span className="ui-segmented-btn-label">{opt.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
