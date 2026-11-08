import { useState } from 'preact/hooks';
import { ArrowLeft, ArrowRight, GripHorizontal, Pencil, Info, Plus, Video, Trash2 } from 'lucide-preact';
import type { CanvasSection } from '../../types/orchestration';
import { MediaModal } from './MediaModal';
import { useResolvedMediaUrl } from '../../utils/media';

function formatSecToMMSS(sec: number): string {
  if (isNaN(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function parseMMSSToSec(str: string): number {
  if (!str) return 0;
  const parts = str.trim().split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(parts[1], 10) || 0;
    return Math.max(0, m * 60 + s);
  }
  const val = parseInt(str, 10);
  return isNaN(val) ? 0 : Math.max(0, val);
}

const EMPTY_URLS: string[] = [];

interface SectionNodeProps {
  section: CanvasSection;
  isFirst: boolean;
  isLast: boolean;
  isSelected: boolean;
  canReorder?: boolean;
  accentColor?: string;
  parentName?: string;
  hasMasterVideo?: boolean;
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
  hasMasterVideo = false,
  onSelect,
  onChange,
  onMoveLeft,
  onMoveRight,
  onStartDrag
}: SectionNodeProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const isSubsection = Boolean(section.parentSectionId);
  const sectionThumbnailUrl = useResolvedMediaUrl(section.media?.galleryUrls?.[0], 'step');

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

      {/* Section Body */}
      <div className="section-node-body">
        {/* Top Media Zone for Section */}
        <div className="step-top-media-zone" onClick={e => e.stopPropagation()}>
          {/* Section Image Section */}
          {section.media?.galleryUrls && section.media.galleryUrls.length > 0 ? (
            <div className="step-image-row-populated">
              <div
                className="step-image-preview-wrap is-clickable"
                onClick={() => setIsMediaModalOpen(true)}
                role="button"
                tabIndex={0}
                title="Manage section pictures"
              >
                <img src={sectionThumbnailUrl || ''} alt={section.name || 'Section'} />
                {section.media.galleryUrls.length > 1 && (
                  <div className="studio-media-counter-badge">
                    ×{section.media.galleryUrls.length}
                  </div>
                )}
              </div>
              <div
                className="step-image-add-card"
                onClick={() => setIsMediaModalOpen(true)}
                role="button"
                tabIndex={0}
                title="Add or manage pictures"
              >
                <Plus size={20} />
                <span className="step-image-add-card-label">Add picture</span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="step-add-media-trigger-btn"
              onClick={() => setIsMediaModalOpen(true)}
              title="Attach image to this section"
            >
              <Plus size={13} />
              <span>Add Image</span>
            </button>
          )}

          {/* Video Clip Section */}
          {hasMasterVideo && !section.media?.videoClip ? (
            <button
              type="button"
              className="step-add-media-trigger-btn step-add-clip-btn"
              onClick={() => {
                onChange({
                  media: {
                    ...section.media,
                    videoClip: {
                      startSec: 0,
                      endSec: 30
                    }
                  }
                });
              }}
              title="Attach video clip timestamps to this section"
            >
              <Video size={13} />
              <span>+ Video Clip</span>
            </button>
          ) : hasMasterVideo && section.media?.videoClip ? (
            <div className="step-video-clip-zone">
              <span className="step-video-clip-label">
                <Video size={13} />
                <span>Clip:</span>
              </span>
              <div className="step-video-time-inputs">
                <input
                  type="text"
                  className="step-video-time-field"
                  placeholder="0:00"
                  value={formatSecToMMSS(section.media?.videoClip?.startSec ?? 0)}
                  onChange={e => {
                    const sec = parseMMSSToSec((e.target as HTMLInputElement).value);
                    const currentEnd = section.media?.videoClip?.endSec ?? (sec + 30);
                    onChange({
                      media: {
                        ...section.media,
                        videoClip: {
                          startSec: sec,
                          endSec: Math.max(sec, currentEnd)
                        }
                      }
                    });
                  }}
                  onBlur={e => {
                    const sec = parseMMSSToSec((e.target as HTMLInputElement).value);
                    const validStart = Math.max(0, sec);
                    const currentEnd = section.media?.videoClip?.endSec ?? (validStart + 30);
                    const validEnd = Math.max(validStart + 1, currentEnd);
                    onChange({
                      media: {
                        ...section.media,
                        videoClip: {
                          startSec: validStart,
                          endSec: validEnd
                        }
                      }
                    });
                  }}
                />
                <span style={{ color: '#71717a', fontSize: '0.8rem' }}>to</span>
                <input
                  type="text"
                  className="step-video-time-field"
                  placeholder="0:30"
                  value={formatSecToMMSS(section.media?.videoClip?.endSec ?? 30)}
                  onChange={e => {
                    const sec = parseMMSSToSec((e.target as HTMLInputElement).value);
                    const currentStart = section.media?.videoClip?.startSec ?? 0;
                    onChange({
                      media: {
                        ...section.media,
                        videoClip: {
                          startSec: currentStart,
                          endSec: Math.max(currentStart, sec)
                        }
                      }
                    });
                  }}
                  onBlur={e => {
                    const sec = parseMMSSToSec((e.target as HTMLInputElement).value);
                    const currentStart = Math.max(0, section.media?.videoClip?.startSec ?? 0);
                    const validEnd = Math.max(currentStart + 1, sec);
                    onChange({
                      media: {
                        ...section.media,
                        videoClip: {
                          startSec: currentStart,
                          endSec: validEnd
                        }
                      }
                    });
                  }}
                />
              </div>
              <button
                type="button"
                className="step-video-clear-btn"
                title="Clear video clip"
                onClick={() => {
                  const nextMedia = { ...section.media };
                  delete nextMedia.videoClip;
                  onChange({ media: nextMedia });
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ) : null}
        </div>

        {/* Section Description / Notes */}
        <textarea
          className="section-description-textarea"
          value={section.description || ''}
          placeholder="Section intro, goal, or temperature setting..."
          rows={3}
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

      {/* Media Modal for Section Photo Gallery */}
      {isMediaModalOpen && (
        <MediaModal
          isOpen={true}
          mediaType="picture"
          mode="gallery"
          title={`${section.name || (isSubsection ? 'Subsection' : 'Section')} Images`}
          currentUrls={section.media?.galleryUrls || EMPTY_URLS}
          onClose={() => setIsMediaModalOpen(false)}
          onSaveGallery={urls => {
            const nextMedia = { ...section.media };
            if (urls && urls.length > 0) {
              nextMedia.galleryUrls = urls;
            } else {
              delete nextMedia.galleryUrls;
            }
            onChange({ media: nextMedia });
            setIsMediaModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
