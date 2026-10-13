import { useState, useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { X } from 'lucide-preact';

interface CustomItemModalProps {
  isOpen: boolean;
  itemType: 'ingredient' | 'cookware';
  onClose: () => void;
  onSave: (item: { id: string; name: string }) => void;
}

export function CustomItemModal({
  isOpen,
  itemType,
  onClose,
  onSave
}: CustomItemModalProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    onSave({ id, name: trimmed });
    onClose();
  };

  const modalElement = (
    <div className="studio-modal-overlay" onClick={onClose}>
      <div
        className="studio-modal-card studio-modal-card-sm"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="studio-modal-header">
          <h2>{itemType === 'ingredient' ? 'Add Custom Ingredient' : 'Add Custom Cookware'}</h2>
          <button
            type="button"
            className="studio-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="studio-modal-body">
            <p className="studio-modal-desc">
              This item will be saved for this workspace session.
            </p>
            <div className="studio-form-row">
              <label htmlFor="custom-item-name">Name</label>
              <input
                ref={inputRef}
                id="custom-item-name"
                type="text"
                className="studio-input"
                placeholder={itemType === 'ingredient' ? 'e.g. Pecan nuts' : 'e.g. Cast iron skillet'}
                value={name}
                onInput={e => setName((e.target as HTMLInputElement).value)}
                required
              />
            </div>
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
              type="submit"
              className="studio-btn studio-btn-primary"
              disabled={!name.trim()}
            >
              Add to Workspace
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalElement, document.body)
    : modalElement;
}
