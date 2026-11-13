// TODO: Add auto-tagging support via EmbeddingGemma when vector indexing backend is integrated.

import { useState, useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { X, Tag, Trash2, Plus } from 'lucide-preact';
import { Dropdown } from '../ui/Dropdown';

export const STANDARD_TAG_PRESETS = [
  'dessert', 'baking', 'breakfast', 'brunch', 'lunch', 'dinner',
  'appetizer', 'snack', 'side-dish', 'soup', 'salad', 'beverage',
  'quick', 'easy', 'comfort-food', 'one-pot', 'healthy', 'meal-prep',
  'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'low-carb',
  'pasta', 'seafood', 'poultry', 'beef', 'pork', 'rice', 'noodles',
  'holiday', 'summer', 'winter', 'spicy', 'sweet', 'savory'
];

interface TagManagerModalProps {
  isOpen: boolean;
  tags: string[];
  onClose: () => void;
  onSave: (tags: string[]) => void;
}

export function TagManagerModal({
  isOpen,
  tags,
  onClose,
  onSave
}: TagManagerModalProps) {
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [customInput, setCustomInput] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setLocalTags(Array.isArray(tags) ? [...tags] : []);
      setSelectedTag('');
      setCustomInput('');
    }
  }, [isOpen, tags]);

  if (!isOpen) return null;

  // Available options for the dropdown: excluding tags already in localTags
  const unselectedPresets = STANDARD_TAG_PRESETS.filter(t => !localTags.includes(t));
  const dropdownOptions = [
    { value: '', label: '(Choose a tag)' },
    ...unselectedPresets.map(t => ({ value: t, label: t })),
    { value: '__custom__', label: '+ Custom tag...' }
  ];

  const handleAddTag = () => {
    let tagToAdd = '';
    if (selectedTag === '__custom__') {
      tagToAdd = customInput.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-');
    } else if (selectedTag) {
      tagToAdd = selectedTag.trim().toLowerCase();
    }

    if (!tagToAdd) return;

    if (!localTags.includes(tagToAdd)) {
      setLocalTags(prev => [...prev, tagToAdd]);
    }

    setSelectedTag('');
    setCustomInput('');
  };

  const handleDeleteTag = (tagToDelete: string) => {
    setLocalTags(prev => prev.filter(t => t !== tagToDelete));
  };

  const handleApply = () => {
    onSave(localTags);
    onClose();
  };

  const modalElement = (
    <div
      className="studio-modal-overlay"
      onClick={onClose}
      onMouseDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
    >
      <div
        className="studio-modal-card tag-manager-modal-card"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-manager-modal-title"
      >
        {/* Header */}
        <div className="studio-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Tag size={18} color="var(--interactive-accent)" />
            <h2 id="tag-manager-modal-title">Manage Tags ({localTags.length})</h2>
          </div>
          <button
            type="button"
            className="studio-modal-close"
            onClick={onClose}
            aria-label="Close tag manager"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="studio-modal-body tag-manager-modal-body">
          <div className="tag-manager-add-row">
            <div className="tag-manager-dropdown-wrap">
              <Dropdown
                options={dropdownOptions}
                value={selectedTag}
                onChange={val => {
                  setSelectedTag(val);
                  if (val !== '__custom__') {
                    setCustomInput('');
                  }
                }}
                placeholder="(Choose a tag)"
              />
            </div>

            {selectedTag === '__custom__' && (
              <input
                type="text"
                className="tag-manager-custom-input"
                placeholder="custom tag name..."
                value={customInput}
                onInput={e => setCustomInput((e.target as HTMLInputElement).value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                autoFocus
              />
            )}

            <button
              type="button"
              className="studio-btn studio-btn-primary tag-manager-add-btn"
              onClick={handleAddTag}
              disabled={
                !selectedTag ||
                (selectedTag === '__custom__' && !customInput.trim())
              }
            >
              <Plus size={14} />
              <span>Add</span>
            </button>
          </div>

          {/* Active Tags List */}
          <div className="tag-manager-list-section">
            <label className="tag-manager-list-label">Active Recipe Tags</label>
            <div className="tag-manager-list">
              {localTags.length === 0 ? (
                <div className="tag-manager-empty">No tags added yet. Choose a tag above to get started.</div>
              ) : (
                localTags.map(tag => (
                  <div key={tag} className="tag-manager-item">
                    <span className="tag-manager-item-name">#{tag}</span>
                    <button
                      type="button"
                      className="tag-manager-delete-btn"
                      onClick={() => handleDeleteTag(tag)}
                      aria-label={`Delete tag ${tag}`}
                      title={`Delete ${tag}`}
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
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
            onClick={handleApply}
          >
            Save Tags
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalElement, document.body)
    : modalElement;
}
