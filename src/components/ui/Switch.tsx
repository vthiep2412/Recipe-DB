export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel?: string
  id?: string
  className?: string
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  id,
  className = ''
}: SwitchProps) {
  const handleClick = () => {
    if (disabled) return
    onChange(!checked)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      onChange(!checked)
    }
  }

  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`ui-switch ${checked ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span className="ui-switch-thumb" />
    </button>
  )
}
