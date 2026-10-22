import { useState } from 'preact/hooks';
import { ArrowLeft, ArrowRight, GripHorizontal, Pencil, Info } from 'lucide-preact';
import type { CanvasSection } from '../../types/orchestration';

interface SectionNodeProps {
  section: CanvasSection;
  isFirst: boolean;
  isLast: boolean;
  isSelected: boolean;
  canReorder?: boolean;
  accentColor?: string;
  parentName?: string;
  onSelect: () => void;
  onChange: (updated: Partial<CanvasSection>) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onStartDrag: (e: PointerEvent) => void;
  onDelete?: () => void;
}

export function SectionNode({
  section,
  isFirst,
  isLast,
  isSelected,
  canReorder = true,
  accentColor,
  parentName,
  onSelect,
  onChange,
  onMoveLeft,
  onMoveRight,
  onStartDrag
}: SectionNodeProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const isSubsection = Boolean(section.parentSectionId);

  return (
    <div
      className={`section-node-card ${isSelected ? 'is-selected' : ''} ${isSubsection ? 'is-subsection' : ''}`}
      style={isSubsection && accentColor ? { borderLeftColor: accentColor } : undefined}
      onPointerDownCapture={() => {
        if (!isSelected) onSelect();
      }}
      onMouseDownCapture={() => {
        if (!isSelected) onSelect();
      }}
      onFocusCapture={() => {
        if (!isSelected) onSelect();
      }}
      onClick={e => {
        e.stopPropagation();
        if (!isSelected) onSelect();
      }}
    >
      {/* Floating Reorder Controls directly on top of the card */}
      <div className="section-top-reorder-toolbar" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          className={`section-reorder-btn ${isFirst ? 'is-disabled' : ''}`}
          onClick={!isFirst ? onMoveLeft : undefined}
          disabled={isFirst}
          title={!canReorder ? 'Only one section in this group' : isFirst ? 'First section' : 'Move section left'}
          aria-label="Move left"
        >
          <ArrowLeft size={16} />
        </button>

        <div
          className="section-drag-handle"
          onPointerDown={onStartDrag}
          title={canReorder ? 'Drag to slide column position in real time' : 'Drag section column'}
          role="button"
          tabIndex={0}
          aria-label="Drag section"
        >
          <GripHorizontal size={18} />
        </div>

        <button
          type="button"
          className={`section-reorder-btn ${isLast ? 'is-disabled' : ''}`}
          onClick={!isLast ? onMoveRight : undefined}
          disabled={isLast}
          title={!canReorder ? 'Only one section in this group' : isLast ? 'Last section' : 'Move section right'}
          aria-label="Move right"
        >
          <ArrowRight size={16} />
        </button>
      </div>

      {/* Section Header */}
      <div className="section-node-header">
        <div className="section-node-title-wrap">
          {isSubsection && (
            <span
              className="section-badge-subsection"
              style={accentColor ? { borderColor: `${accentColor}88`, color: accentColor, backgroundColor: `${accentColor}18` } : undefined}
            >
              {parentName ? `SUB OF ${parentName.toUpperCase()}` : 'SUBSECTION'}
            </span>
          )}
          {isEditingTitle ? (
            <input
              type="text"
              className="section-title-input"
              value={section.name}
              autoFocus
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={e => {
                if (e.key === 'Enter') setIsEditingTitle(false);
              }}
              onInput={e => onChange({ name: (e.target as HTMLInputElement).value })}
            />
          ) : (
            <div className="section-title-display-group" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <h3
                className="section-node-title"
                onClick={e => {
                  e.stopPropagation();
                  if (!isSelected) {
                    onSelect();
                  } else {
                    setIsEditingTitle(true);
                  }
                }}
                title={isSelected ? 'Click to rename section' : 'Click to select section'}
              >
                {section.name || 'Untitled Section'}
              </h3>
              <button
                type="button"
                className="section-title-pencil-btn"
                onClick={e => {
                  e.stopPropagation();
                  onSelect();
                  setIsEditingTitle(true);
                }}
                title="Rename section"
                aria-label="Rename section"
              >
                <Pencil size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section Description / Notes */}
      <div className="section-node-body">
        <textarea
          className="section-description-textarea"
          value={section.description || ''}
          placeholder="Section intro, goal, or temperature setting..."
          rows={2}
          onInput={e => onChange({ description: (e.target as HTMLTextAreaElement).value })}
        />

        {/* Inline Tools Option */}
        <div className="section-tools-toggle-row">
          <label className="section-tools-checkbox-label">
            <input
              type="checkbox"
              checked={Boolean(section.showInlineTools)}
              onChange={e => onChange({ showInlineTools: (e.target as HTMLInputElement).checked })}
            />
            <span>Show inline ingredients/cookware</span>
          </label>

          <div
            className="section-info-badge-wrap"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <Info size={14} className="section-info-icon" />
            {showTooltip && (
              <div className="section-info-tooltip">
                Displays a compact bar of ingredients and cookware directly in the section card. Recommended for complex steps or mobile views where the sticky sidebar is hidden.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Downward Wire Anchor */}
      <div className="section-output-anchor" />
    </div>
  );
}
