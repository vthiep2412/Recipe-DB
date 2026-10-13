import { useState, useEffect, useRef } from 'preact/hooks';
import { X } from 'lucide-preact';
import { detectInputFormat } from '../../parser/orchestrationParser';

interface NewRecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConvert: (rawText: string) => void;
  onGoStraight: () => void;
}

export function NewRecipeModal({
  isOpen,
  onClose,
  onConvert,
  onGoStraight
}: NewRecipeModalProps) {
  const [text, setText] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setText('');
      setToastMessage(null);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const trimmed = text.trim();
  const format = detectInputFormat(trimmed);
  const isEmpty = trimmed.length === 0;

  const handleAction = () => {
    if (isEmpty) {
      onGoStraight();
      return;
    }

    if (format === 'plain_text') {
      setToastMessage('NO AI yet "big sad" :(');
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    onConvert(text);
  };

  return (
    <div className="studio-modal-overlay" onClick={onClose}>
      <div
        className="studio-modal-card"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-recipe-title"
      >
        <div className="studio-modal-header">
          <h2 id="new-recipe-title">Create New Recipe Workspace</h2>
          <button
            type="button"
            className="studio-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="studio-modal-body">
          <p className="studio-modal-desc">
            Paste your recipe in standard Cooklang or RecipeDB markdown format below.
          </p>

          <textarea
            ref={textareaRef}
            className="studio-modal-textarea"
            placeholder="Paste Cooklang or recipe markdown here..."
            value={text}
            onInput={e => setText((e.target as HTMLTextAreaElement).value)}
            rows={10}
          />

          {toastMessage && (
            <div className="studio-toast-banner" role="alert">
              {toastMessage}
            </div>
          )}
        </div>

        <div className="studio-modal-footer">
          <button
            type="button"
            className="studio-btn studio-btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="studio-btn studio-btn-primary"
            onClick={handleAction}
          >
            {isEmpty ? 'Go straight to make a Recipe!' : 'Convert to Studio'}
          </button>
        </div>
      </div>
    </div>
  );
}
