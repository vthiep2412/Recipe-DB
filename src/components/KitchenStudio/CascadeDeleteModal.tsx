import { createPortal } from 'preact/compat';
import { AlertTriangle, X } from 'lucide-preact';

interface CascadeDeleteModalProps {
  isOpen: boolean;
  type: 'section' | 'step';
  title: string;
  itemCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CascadeDeleteModal({
  isOpen,
  type,
  title,
  itemCount = 0,
  onConfirm,
  onCancel
}: CascadeDeleteModalProps) {
  if (!isOpen) return null;

  const heading = type === 'section'
    ? `Delete Section "${title}"?`
    : `Delete Step and Attached Notes?`;

  const description = type === 'section'
    ? `This section contains ${itemCount} step${itemCount === 1 ? '' : 's'}. Deleting this section root will permanently delete all steps inside this column.`
    : `This step has ${itemCount} attached sub-note${itemCount === 1 ? '' : 's'}. Deleting it will permanently remove all connected child notes.`;

  const modalElement = (
    <div className="studio-modal-backdrop" onClick={onCancel}>
      <div
        className="studio-delete-modal-card"
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cascade-delete-heading"
      >
        <header className="delete-modal-header">
          <div className="delete-modal-icon-wrap">
            <AlertTriangle size={20} />
          </div>
          <button
            type="button"
            className="delete-modal-close-btn"
            onClick={onCancel}
            aria-label="Cancel deletion"
          >
            <X size={18} />
          </button>
        </header>

        <div className="delete-modal-content">
          <h3 id="cascade-delete-heading" className="delete-modal-title">{heading}</h3>
          <p className="delete-modal-description">{description}</p>
          <div className="delete-modal-warning-tag">This action cannot be undone.</div>
        </div>

        <footer className="delete-modal-footer">
          <button
            type="button"
            className="delete-modal-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="delete-modal-btn-confirm"
            onClick={onConfirm}
          >
            Delete Permanently
          </button>
        </footer>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalElement, document.body)
    : modalElement;
}
