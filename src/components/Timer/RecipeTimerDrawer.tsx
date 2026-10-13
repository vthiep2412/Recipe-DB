import { createPortal } from 'preact/compat';
import { useRef, useLayoutEffect } from 'preact/hooks';
import { X, Play, Pause } from 'lucide-preact';
import type { ActiveTimer } from '../../types/timer';

interface Props {
  isOpen: boolean;
  timers: ActiveTimer[];
  animSpeed?: number;
  onClose?: () => void;
  onTogglePause: (timerId: string) => void;
  onDismissTimer: (timerId: string) => void;
  onEditTimer: (timer: ActiveTimer) => void;
}

function TimerCardItem({
  timer,
  animSpeed = 1,
  onClose,
  onTogglePause,
  onDismissTimer,
  onEditTimer,
  formatTime
}: {
  timer: ActiveTimer;
  animSpeed?: number;
  onClose?: () => void;
  onTogglePause: (timerId: string) => void;
  onDismissTimer: (timerId: string) => void;
  onEditTimer: (timer: ActiveTimer) => void;
  formatTime: (sec: number) => string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const arcLength = 245.69;

  useLayoutEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl) return;

    if (!timer.originRect) {
      cardEl.style.opacity = '1';
      return;
    }

    const firstRect = timer.originRect;
    const lastRect = cardEl.getBoundingClientRect();

    const dx = firstRect.left - lastRect.left;
    const dy = firstRect.top - lastRect.top;
    const scaleX = Math.max(0.1, firstRect.width / lastRect.width);
    const scaleY = Math.max(0.1, firstRect.height / lastRect.height);

    cardEl.style.transformOrigin = '0 0';

    const flightDuration = Math.round(900 / (animSpeed || 1));
    const anim = cardEl.animate(
      [
        {
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scaleX}, ${scaleY})`,
          borderRadius: '0.375rem',
          boxShadow: '0 0 0.85rem 0.15rem rgba(245, 158, 11, 0.75)',
          borderColor: '#f59e0b',
          opacity: 1
        },
        {
          offset: 0.25,
          boxShadow: '0 0 0.5rem 0.1rem rgba(245, 158, 11, 0.4), 0 0.5rem 1.5rem rgba(0, 0, 0, 0.4)',
          borderColor: 'rgba(245, 158, 11, 0.6)',
          opacity: 1
        },
        {
          offset: 0.65,
          boxShadow: '0 0 0.2rem 0.05rem rgba(245, 158, 11, 0.15), 0 1rem 2rem rgba(0, 0, 0, 0.5)',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          opacity: 1
        },
        {
          transform: 'translate3d(0, 0, 0) scale(1, 1)',
          borderRadius: '1.25rem',
          boxShadow: '0 1.25rem 2.5rem rgba(0, 0, 0, 0.5), 0 0.25rem 0.75rem rgba(0, 0, 0, 0.3)',
          borderColor: 'var(--background-modifier-border, rgba(255, 255, 255, 0.16))',
          opacity: 1
        }
      ],
      {
        duration: flightDuration,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'both'
      }
    );

    anim.finished.then(() => {
      if (cardRef.current) {
        cardRef.current.style.opacity = '1';
        cardRef.current.style.transform = 'none';
      }
    }).catch(() => {});

    return () => anim.cancel();
  }, []);

  const fraction =
    timer.totalSeconds > 0
      ? Math.max(0, Math.min(1, timer.remainingSeconds / timer.totalSeconds))
      : 0;
  const offset = arcLength * (1 - fraction);

  return (
    <div
      ref={cardRef}
      className="app-timer-jump-card"
      style={timer.originRect ? { opacity: 0 } : undefined}
    >
      <div className="app-timer-card-content">
        <div className="app-timer-horseshoe-wrapper">
          <svg className="app-timer-horseshoe-svg" viewBox="0 -4 200 104">
            <path
              className="app-timer-horseshoe-track"
              d="M 39.86 89.89 A 64 64 0 1 1 160.14 89.89"
            />
            <path
              className="app-timer-horseshoe-indicator"
              d="M 39.86 89.89 A 64 64 0 1 1 160.14 89.89"
              strokeDasharray={arcLength}
              strokeDashoffset={offset}
            />
          </svg>

          <div
            className="app-timer-horseshoe-digits"
            onClick={() => onEditTimer(timer)}
            title="Tap to change time"
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEditTimer(timer);
              }
            }}
          >
            {formatTime(timer.remainingSeconds)}
          </div>

          {timer.creatorCue && (
            <div className="app-timer-horseshoe-note" title={timer.creatorCue}>
              {timer.creatorCue}
            </div>
          )}

          <button
            type="button"
            className={`app-timer-horseshoe-pause-btn ${timer.isPaused ? 'paused' : 'running'}`}
            onClick={() => onTogglePause(timer.id)}
            title={timer.isPaused ? 'Resume' : 'Pause'}
            aria-label={timer.isPaused ? 'Resume' : 'Pause'}
          >
            {timer.isPaused ? (
              <Play size={20} fill="currentColor" />
            ) : (
              <Pause size={20} fill="currentColor" />
            )}
          </button>
        </div>
      </div>

      <button
        type="button"
        className="app-timer-close-btn"
        onClick={() => {
          onDismissTimer(timer.id);
          onClose?.();
        }}
        aria-label="Close timer"
      >
        <X size={18} />
      </button>
    </div>
  );
}

export function RecipeTimerDrawer({
  isOpen,
  timers,
  animSpeed = 1,
  onClose,
  onTogglePause,
  onDismissTimer,
  onEditTimer
}: Props) {
  if (typeof document === 'undefined' || !isOpen || timers.length === 0) return null;

  const formatTime = (totalSec: number) => {
    const safe = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  };

  const content = (
    <div className="app-timer-overlay">
      <div className="app-timer-container">
        {timers.map(timer => (
          <TimerCardItem
            key={timer.id}
            timer={timer}
            animSpeed={animSpeed}
            onClose={() => {
              if (timers.length <= 1) {
                onClose?.();
              }
            }}
            onTogglePause={onTogglePause}
            onDismissTimer={onDismissTimer}
            onEditTimer={onEditTimer}
            formatTime={formatTime}
          />
        ))}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
