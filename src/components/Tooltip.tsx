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
      const bubble = bubbleRef.current;
      const rect = bubble.getBoundingClientRect();
      const margin = 8;

      let minLeft = margin;
      let maxRight = window.innerWidth - margin;

      let el: HTMLElement | null = bubble.parentElement;
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        const overflow = style.overflow + style.overflowX + style.overflowY;
        if (/auto|hidden|scroll/i.test(overflow)) {
          const pRect = el.getBoundingClientRect();
          minLeft = Math.max(minLeft, pRect.left + margin);
          maxRight = Math.min(maxRight, pRect.right - margin);
          break;
        }
        el = el.parentElement;
      }

      const unshiftedLeft = rect.left - shiftX;
      const unshiftedRight = rect.right - shiftX;

      if (unshiftedLeft < minLeft) {
        setShiftX(minLeft - unshiftedLeft);
      } else if (unshiftedRight > maxRight) {
        setShiftX(maxRight - unshiftedRight);
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
