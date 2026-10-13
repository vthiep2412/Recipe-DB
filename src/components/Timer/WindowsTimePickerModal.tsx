import { useState, useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { ChevronUp, ChevronDown } from 'lucide-preact';

interface Props {
  initialSeconds: number;
  onSave: (sec: number) => void;
  onClose: () => void;
  title?: string;
}

export function WindowsTimePickerModal({ initialSeconds, onSave, onClose, title }: Props) {
  const safeInit = Math.max(0, Math.floor(initialSeconds));
  const [hours, setHours] = useState<number>(Math.floor(safeInit / 3600) % 24);
  const [minutes, setMinutes] = useState<number>(Math.floor((safeInit % 3600) / 60));
  const [seconds, setSeconds] = useState<number>(safeInit % 60);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hours, minutes, seconds]);

  const handleSave = () => {
    const total = hours * 3600 + minutes * 60 + seconds;
    onSave(Math.max(1, total));
    onClose();
  };

  const stepHours = (delta: number) => {
    setHours(prev => (prev + delta + 24) % 24);
  };

  const stepMinutes = (delta: number) => {
    setMinutes(prev => (prev + delta + 60) % 60);
  };

  const stepSeconds = (delta: number) => {
    setSeconds(prev => (prev + delta + 60) % 60);
  };

  const pad = (n: number) => String(n).padStart(2, '0');

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="timer-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Set Timer'}
      onClick={onClose}
    >
      <div className="windows-picker-card" onClick={e => e.stopPropagation()}>
        <div className="windows-picker-header">
          <h3>{title || 'Edit Timer'}</h3>
        </div>

        <div className="windows-picker-columns">
          {/* Hours Column */}
          <div
            className="windows-picker-col"
            onWheel={e => {
              e.preventDefault();
              stepHours(e.deltaY < 0 ? 1 : -1);
            }}
          >
            <button
              type="button"
              className="windows-picker-chevron"
              onClick={() => stepHours(1)}
              aria-label="Increase hours"
            >
              <ChevronUp size={20} />
            </button>
            <div className="windows-picker-display">{pad(hours)}</div>
            <button
              type="button"
              className="windows-picker-chevron"
              onClick={() => stepHours(-1)}
              aria-label="Decrease hours"
            >
              <ChevronDown size={20} />
            </button>
            <span className="windows-picker-label">hours</span>
          </div>

          <div className="windows-picker-separator">:</div>

          {/* Minutes Column */}
          <div
            className="windows-picker-col"
            onWheel={e => {
              e.preventDefault();
              stepMinutes(e.deltaY < 0 ? 1 : -1);
            }}
          >
            <button
              type="button"
              className="windows-picker-chevron"
              onClick={() => stepMinutes(1)}
              aria-label="Increase minutes"
            >
              <ChevronUp size={20} />
            </button>
            <div className="windows-picker-display">{pad(minutes)}</div>
            <button
              type="button"
              className="windows-picker-chevron"
              onClick={() => stepMinutes(-1)}
              aria-label="Decrease minutes"
            >
              <ChevronDown size={20} />
            </button>
            <span className="windows-picker-label">minutes</span>
          </div>

          <div className="windows-picker-separator">:</div>

          {/* Seconds Column */}
          <div
            className="windows-picker-col"
            onWheel={e => {
              e.preventDefault();
              stepSeconds(e.deltaY < 0 ? 1 : -1);
            }}
          >
            <button
              type="button"
              className="windows-picker-chevron"
              onClick={() => stepSeconds(1)}
              aria-label="Increase seconds"
            >
              <ChevronUp size={20} />
            </button>
            <div className="windows-picker-display">{pad(seconds)}</div>
            <button
              type="button"
              className="windows-picker-chevron"
              onClick={() => stepSeconds(-1)}
              aria-label="Decrease seconds"
            >
              <ChevronDown size={20} />
            </button>
            <span className="windows-picker-label">seconds</span>
          </div>
        </div>

        <div className="windows-picker-actions">
          <button
            type="button"
            className="windows-picker-btn cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="windows-picker-btn save"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
