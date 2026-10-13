import { useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Bell, X, VolumeX, Clock } from 'lucide-preact';
import type { ActiveTimer } from '../../types/timer';

interface Props {
  finishedTimers: ActiveTimer[];
  onStopTimer: (timerId: string) => void;
  onChangeTime: (timer: ActiveTimer) => void;
  onSilenceAll: () => void;
  onDismissAll: () => void;
}

export function TimerAlarmModal({
  finishedTimers,
  onStopTimer,
  onChangeTime,
  onSilenceAll,
  onDismissAll
}: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismissAll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismissAll]);

  if (typeof document === 'undefined' || finishedTimers.length === 0) return null;

  const isRowLayout = finishedTimers.length <= 3;

  return createPortal(
    <div
      className="timer-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Finished Timers Alarm"
    >
      <div className="alarm-modal-card" onClick={e => e.stopPropagation()}>
        <div className="alarm-modal-header">
          <div className="alarm-header-title">
            <span className="alarm-header-icon-wrap">
              <Bell size={22} className="alarm-ringing-bell" />
            </span>
            <h3>Alarm Finished</h3>
            <span className="alarm-count-chip">{finishedTimers.length}</span>
          </div>

          <button
            type="button"
            className="alarm-modal-close-btn"
            onClick={onDismissAll}
            aria-label="Dismiss all finished alerts"
          >
            <X size={20} />
          </button>
        </div>

        <div className={`alarm-cards-container ${isRowLayout ? 'row-layout' : 'grid-layout'}`}>
          {finishedTimers.map(timer => {
            const donenessCue = timer.creatorCue || timer.label || timer.stepTitle || 'Timer finished';
            const contextText = timer.stepTitle && timer.stepTitle !== donenessCue ? timer.stepTitle : timer.label;

            return (
              <div key={timer.id} className="alarm-timer-tile">
                <div className="alarm-tile-cue-wrap">
                  <div className="alarm-tile-cue">{donenessCue}</div>
                  {contextText && contextText !== donenessCue && (
                    <div className="alarm-tile-context">{contextText}</div>
                  )}
                </div>

                <div className="alarm-tile-actions">
                  <button
                    type="button"
                    className="alarm-btn-stop"
                    onClick={() => onStopTimer(timer.id)}
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    className="alarm-btn-change"
                    onClick={() => onChangeTime(timer)}
                  >
                    <Clock size={15} />
                    <span>Change time</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {finishedTimers.length >= 2 && (
          <div className="alarm-modal-footer">
            <button
              type="button"
              className="alarm-btn-silence-all"
              onClick={onSilenceAll}
            >
              <VolumeX size={17} />
              <span>Silence All ({finishedTimers.length})</span>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
