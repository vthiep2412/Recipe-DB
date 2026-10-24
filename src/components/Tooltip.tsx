import { ComponentChildren } from 'preact';
import { useState, useId, useRef, useLayoutEffect } from 'preact/hooks';

export interface TooltipProps {
  content: string | ComponentChildren;
  children: ComponentChildren;
  position?: 'top' | 'bottom';
  className?: string;
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
  disabled = false,
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shiftX, setShiftX] = useState(0);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (isOpen && bubbleRef.current) {
      const rect = bubbleRef.current.getBoundingClientRect();
      const margin = 8;
      if (rect.left < margin) {
        setShiftX(margin - rect.left);
      } else if (rect.right > window.innerWidth - margin) {
        setShiftX(window.innerWidth - margin - rect.right);
      } else {
        setShiftX(0);
      }
    } else {
      setShiftX(0);
    }
  }, [isOpen]);

  if (disabled || !content) {
    return <>{children}</>;
  }

  return (
    <span
      className={`tooltip-wrapper ${className}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocusCapture={() => setIsOpen(true)}
      onBlurCapture={() => setIsOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setIsOpen(false);
      }}
      aria-describedby={isOpen ? id : undefined}
    >
      {children}
      {isOpen && (
        <span
          id={id}
          ref={bubbleRef}
          role="tooltip"
          className={`tooltip-bubble tooltip-${position}`}
          style={shiftX !== 0 ? ({ '--tooltip-shift-x': `${shiftX}px` } as any) : undefined}
        >
          {content}
        </span>
      )}
    </span>
  );
}
