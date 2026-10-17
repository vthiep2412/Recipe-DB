import { useState, useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { X, FolderTree } from 'lucide-preact';
import type { CanvasSection } from '../../types/orchestration';
import { CompactDropdown } from './CompactDropdown';

interface ReparentSectionModalProps {
  isOpen: boolean;
  section: CanvasSection | null;
  sections: CanvasSection[];
  onClose: () => void;
  onReparent: (sectionId: string, newParentSectionId?: string) => void;
}

export function ReparentSectionModal({
  isOpen,
  section,
  sections,
  onClose,
  onReparent
}: ReparentSectionModalProps) {
  const [selectedParentId, setSelectedParentId] = useState<string>('');

  // Root sections excluding active section
  const rootSections = sections.filter(s => !s.parentSectionId && s.id !== section?.id);

  // Check if active section currently has child subsections
  const hasSubsections = Boolean(section && sections.some(s => s.parentSectionId === section.id));

  const dropdownOptions = [
    { value: '', label: 'None (Independent Root Section)' },
    ...rootSections.map(root => ({
      value: root.id,
      label: root.name
    }))
  ];

  useEffect(() => {
    if (isOpen && section) {
      setSelectedParentId(section.parentSectionId || '');
    }
  }, [isOpen, section]);

  if (!isOpen || !section) return null;

  const handleApply = () => {
    onReparent(section.id, selectedParentId || undefined);
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
        className="studio-modal-card reparent-modal-card"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reparent-modal-title"
      >
        <div className="studio-modal-header">
          <div className="reparent-header-icon-wrap" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderTree size={18} />
            <h2 id="reparent-modal-title">Change Parent for {section.name}</h2>
          </div>
          <button
            type="button"
            className="studio-modal-close"
            onClick={onClose}
            aria-label="Close hierarchy modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="studio-modal-body" style={{ overflow: 'visible' }}>
          <div className="reparent-dropdown-group">
            <label className="reparent-dropdown-label">Parent Section</label>
            {hasSubsections ? (
              <div style={{ fontSize: '0.8rem', color: '#ff9d42', padding: '0.35rem 0' }}>
                Cannot nest under another section because this section already contains subsections
              </div>
            ) : (
              <CompactDropdown
                options={dropdownOptions}
                value={selectedParentId}
                onChange={val => setSelectedParentId(val)}
                placeholder="Select parent section..."
              />
            )}
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
            type="button"
            className="studio-btn studio-btn-primary"
            onClick={handleApply}
          >
            Apply Hierarchy
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalElement, document.body)
    : modalElement;
}

