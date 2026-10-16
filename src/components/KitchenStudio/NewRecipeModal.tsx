import { useState, useEffect, useRef } from 'preact/hooks';
import { X, Sparkles, AlertTriangle } from 'lucide-preact';
import {
  detectInputFormat,
  isFablangDeclared,
  validateFablang,
  generateAiRepairPrompt
} from '../../parser/orchestrationParser';

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
  const isFablang = isFablangDeclared(trimmed);
  const syntaxErrors = isFablang ? validateFablang(trimmed) : [];
  const isEmpty = trimmed.length === 0;

  const handleFixWithAi = () => {
    const prompt = generateAiRepairPrompt(text, syntaxErrors);
    navigator.clipboard.writeText(prompt).catch(() => {});
    setToastMessage('AI not implemented =(, but you can use the prompt =D, Copied');
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleAction = () => {
    if (isEmpty) {
      onGoStraight();
      return;
    }

    if (syntaxErrors.length > 0) {
      setToastMessage('Please resolve the F&Blang syntax errors above or click "Fix With AI"');
      setTimeout(() => setToastMessage(null), 3500);
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

          {syntaxErrors.length > 0 && (
            <div
              className="fablang-error-banner"
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#fca5a5'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                  <AlertTriangle size={15} />
                  <span>F&Blang Syntax Issues Detected ({syntaxErrors.length})</span>
                </div>
                <button
                  type="button"
                  className="studio-btn"
                  style={{
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.75rem',
                    backgroundColor: '#8b5cf6',
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                  onClick={handleFixWithAi}
                  title="Copy structured AI repair prompt with grammar rules and code"
                >
                  <Sparkles size={13} />
                  <span>Fix With AI</span>
                </button>
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', lineHeight: 1.4 }}>
                {syntaxErrors.map((err, idx) => (
                  <li key={idx}>
                    Line {err.line}: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
