import { useState, useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { X, Sparkles, AlertTriangle } from 'lucide-preact';
import { toast } from 'sonner';
import { ConfirmModal } from '../ConfirmModal';
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
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isSyntaxModalOpen, setIsSyntaxModalOpen] = useState(false);
  const [isLoadAnywayConfirmOpen, setIsLoadAnywayConfirmOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setText('');
      setIsAiModalOpen(false);
      setIsSyntaxModalOpen(false);
      setIsLoadAnywayConfirmOpen(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (isLoadAnywayConfirmOpen) {
          e.stopPropagation();
          setIsLoadAnywayConfirmOpen(false);
        } else if (isSyntaxModalOpen) {
          e.stopPropagation();
          setIsSyntaxModalOpen(false);
        } else if (isAiModalOpen) {
          e.stopPropagation();
          setIsAiModalOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAiModalOpen, isSyntaxModalOpen, isLoadAnywayConfirmOpen, onClose]);

  if (!isOpen) return null;

  const trimmed = text.trim();
  const format = detectInputFormat(trimmed);
  const isFablang = isFablangDeclared(trimmed);
  const syntaxErrors = isFablang ? validateFablang(trimmed) : [];
  const isEmpty = trimmed.length === 0;

  const handleFixWithAi = () => {
    const prompt = generateAiRepairPrompt(text, syntaxErrors);
    if (!navigator.clipboard?.writeText) {
      return;
    }
    navigator.clipboard.writeText(prompt).catch(() => {});
  };

  const handleAction = () => {
    if (isEmpty) {
      onGoStraight();
      return;
    }

    if (syntaxErrors.length > 0) {
      setIsSyntaxModalOpen(true);
      return;
    }

    if (format === 'plain_text') {
      setIsAiModalOpen(true);
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
            Paste your recipe in Cooklang, F&amp;Blang, or F&amp;Blang JSON format below.
          </p>

          <textarea
            ref={textareaRef}
            className="studio-modal-textarea"
            placeholder="Paste Cooklang, F&Blang, or F&Blang JSON here..."
            value={text}
            onInput={e => setText((e.target as HTMLTextAreaElement).value)}
            rows={10}
          />
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

      {isSyntaxModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="confirm-modal-overlay"
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) {
              setIsSyntaxModalOpen(false);
            }
          }}
          role="presentation"
        >
          <div
            className="confirm-modal-card"
            style={{ maxWidth: '34rem' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="syntax-issues-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <AlertTriangle size={18} style={{ color: 'var(--color-red)' }} />
              <h3 id="syntax-issues-title" className="confirm-modal-title" style={{ margin: 0 }}>
                F&Blang Syntax Issues ({syntaxErrors.length})
              </h3>
            </div>

            <div className="confirm-modal-body" style={{ maxHeight: '16rem', overflowY: 'auto' }}>
              <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                The recipe text contains syntax issues that prevent standard compilation:
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.82rem', lineHeight: 1.5, color: '#fca5a5' }}>
                {syntaxErrors.map((err, idx) => (
                  <li key={idx}>
                    Line {err.line}: {err.message}
                  </li>
                ))}
              </ul>
            </div>

            <div className="confirm-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="confirm-modal-btn btn-cancel"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSyntaxModalOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm-modal-btn"
                style={{
                  backgroundColor: 'var(--background-modifier-hover)',
                  color: 'var(--text-normal)',
                  border: '1px solid var(--background-modifier-border)'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSyntaxModalOpen(false);
                  setIsLoadAnywayConfirmOpen(true);
                }}
              >
                Load Anyway
              </button>
              <button
                type="button"
                className="confirm-modal-btn btn-primary"
                style={{
                  backgroundColor: 'var(--interactive-accent)',
                  color: '#ffffff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSyntaxModalOpen(false);
                  setIsAiModalOpen(true);
                }}
              >
                <Sparkles size={14} />
                <span>Fix With AI</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmModal
        isOpen={isLoadAnywayConfirmOpen}
        title="Load Recipe With Issues"
        message="Invalid syntax elements will be removed or skipped during conversion. Continue to load into Kitchen Studio?"
        confirmLabel="Load Anyway"
        cancelLabel="Cancel"
        confirmVariant="primary"
        onConfirm={() => {
          setIsLoadAnywayConfirmOpen(false);
          onConvert(text);
        }}
        onCancel={() => {
          setIsLoadAnywayConfirmOpen(false);
        }}
      />

      <ConfirmModal
        isOpen={isAiModalOpen}
        title="AI Recipe Conversion"
        message={syntaxErrors.length > 0
          ? 'Are you sure you want to use AI to fix this recipe?'
          : 'Unrecognized recipe syntax. Would you like to use AI to convert this recipe into Kitchen Studio format?'}
        confirmLabel="Yes"
        cancelLabel="No"
        confirmVariant="primary"
        onConfirm={() => {
          setIsAiModalOpen(false);
          if (syntaxErrors.length > 0) {
            handleFixWithAi();
          }
          toast.error('NO AI yet "big sad" :(');
        }}
        onCancel={() => {
          setIsAiModalOpen(false);
        }}
      />
    </div>
  );
}
