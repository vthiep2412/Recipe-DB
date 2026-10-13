import { useState, useRef, useEffect } from 'preact/hooks';
import type { RecipeGraph } from '../../types/orchestration';
import {
  parseTimeStringToSeconds,
  formatSecondsToDisplay
} from '../../constants/standardKitchenData';
import { UniversalDropdown, DropdownItem } from './UniversalDropdown';

interface RootNodeProps {
  graph: RecipeGraph;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updated: Partial<RecipeGraph>) => void;
  onOpenMediaModal: (type: 'picture' | 'video') => void;
}

const DEFAULT_TIME_TYPES = [
  'Prep Time',
  'Cook Time',
  'Bake Time',
  'Rest Time',
  'Chill Time',
  'Marinate Time',
  'Simmer Time'
];

export function RootNode({
  graph,
  isSelected,
  onSelect,
  onChange,
  onOpenMediaModal
}: RootNodeProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [newTimeLabel, setNewTimeLabel] = useState('Prep Time');
  const [newTimeValue, setNewTimeValue] = useState('');
  const [customTimeLabels, setCustomTimeLabels] = useState<string[]>([]);
  const [isAddingCustomTime, setIsAddingCustomTime] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);
  const customTimeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingDesc) {
      descTextareaRef.current?.focus();
    }
  }, [isEditingDesc]);

  useEffect(() => {
    if (isAddingCustomTime) {
      customTimeRef.current?.focus();
    }
  }, [isAddingCustomTime]);

  // Calculate total seconds across all times
  const customTimes = graph.times.custom || [];
  const prepSec = graph.times.prepSec || 0;
  const cookSec = graph.times.cookSec || 0;
  const bakeSec = graph.times.bakeSec || 0;
  const restSec = graph.times.restSec || 0;

  const customTotal = customTimes.reduce((sum, item) => sum + item.seconds, 0);
  const totalSeconds = prepSec + cookSec + bakeSec + restSec + customTotal;

  const handleAddTimeEntry = (e: Event) => {
    e.preventDefault();
    const trimmedVal = newTimeValue.trim();
    if (!trimmedVal) return;

    const seconds = parseTimeStringToSeconds(trimmedVal);
    if (seconds <= 0) return;

    const updatedCustom = [...customTimes, { label: newTimeLabel, seconds }];
    onChange({
      times: {
        ...graph.times,
        custom: updatedCustom,
        totalSec: totalSeconds + seconds
      }
    });
    setNewTimeValue('');
  };

  const handleRemoveTimeEntry = (index: number) => {
    const updatedCustom = customTimes.filter((_, i) => i !== index);
    const newCustomTotal = updatedCustom.reduce((sum, item) => sum + item.seconds, 0);
    onChange({
      times: {
        ...graph.times,
        custom: updatedCustom,
        totalSec: prepSec + cookSec + bakeSec + restSec + newCustomTotal
      }
    });
  };

  const timeDropdownItems: DropdownItem[] = [
    ...DEFAULT_TIME_TYPES.map(t => ({
      id: t,
      label: t,
      group: 'Standard Time Types'
    })),
    ...customTimeLabels.map(t => ({
      id: t,
      label: t,
      group: 'Custom Time Types'
    }))
  ];

  const handleCreateCustomTime = (e: Event) => {
    e.preventDefault();
    const trimmed = customTimeInput.trim();
    if (trimmed && !customTimeLabels.includes(trimmed)) {
      setCustomTimeLabels(prev => [...prev, trimmed]);
      setNewTimeLabel(trimmed);
    }
    setCustomTimeInput('');
    setIsAddingCustomTime(false);
  };

  return (
    <div
      className={`studio-canvas-node studio-root-node ${isSelected ? 'is-selected' : ''}`}
      onClick={e => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Top Split Media Area matching user sketch */}
      <div className="root-media-split">
        {/* Left Half: Picture */}
        <div
          className="root-media-half"
          onClick={() => onOpenMediaModal('picture')}
          role="button"
          tabIndex={0}
          aria-label="Add or edit picture"
        >
          {graph.media?.pictureUrl ? (
            <div className="root-media-filled">
              <img src={graph.media.pictureUrl} alt="Recipe picture" />
              <div className="root-media-overlay">Change Picture</div>
            </div>
          ) : (
            <div className="root-media-empty">
              <span className="root-media-plus">+</span>
              <span className="root-media-label">picture here</span>
            </div>
          )}
        </div>

        {/* Right Half: Video */}
        <div
          className="root-media-half"
          onClick={() => onOpenMediaModal('video')}
          role="button"
          tabIndex={0}
          aria-label="Add or edit video"
        >
          {graph.media?.videoUrl ? (
            <div className="root-media-filled">
              <div className="root-video-badge">▶ Video Loaded</div>
              <div className="root-media-overlay">Change Video</div>
            </div>
          ) : (
            <div className="root-media-empty">
              <span className="root-media-plus">+</span>
              <span className="root-media-label">video here</span>
            </div>
          )}
        </div>
      </div>

      {/* Node Content Container */}
      <div className="root-content-body">
        {/* Click to edit Title */}
        <div className="root-title-row">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              className="root-title-input"
              value={graph.title}
              onInput={e => onChange({ title: (e.target as HTMLInputElement).value })}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={e => {
                if (e.key === 'Enter') setIsEditingTitle(false);
              }}
            />
          ) : (
            <h1
              className="root-title-display"
              onClick={() => setIsEditingTitle(true)}
              title="Click to edit title"
            >
              {graph.title || 'Untitled Recipe'}
              <span className="root-edit-hint">✎</span>
            </h1>
          )}
        </div>

        {/* Large Difficulty and Servings Controls */}
        <div className="root-meta-controls">
          <div className="root-meta-group">
            <span className="root-meta-label">Difficulty</span>
            <div className="root-difficulty-pills">
              {(['easy', 'medium', 'hard'] as const).map(diff => (
                <button
                  key={diff}
                  type="button"
                  className={`root-diff-pill ${
                    (graph.difficulty || 'medium') === diff ? 'is-active' : ''
                  }`}
                  onClick={() => onChange({ difficulty: diff })}
                >
                  {diff.charAt(0).toUpperCase() + diff.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="root-meta-group">
            <span className="root-meta-label">Servings</span>
            <div className="root-servings-stepper">
              <button
                type="button"
                className="root-servings-btn"
                onClick={() => {
                  const current = graph.servings || 4;
                  if (current > 1) onChange({ servings: current - 1 });
                }}
              >
                -
              </button>
              <span className="root-servings-val">
                {graph.servings || 4} { (graph.servings || 4) === 1 ? 'serving' : 'servings' }
              </span>
              <button
                type="button"
                className="root-servings-btn"
                onClick={() => {
                  const current = graph.servings || 4;
                  onChange({ servings: current + 1 });
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Time Area: Auto-calculated total from custom times */}
        <div className="root-time-section">
          <div className="root-time-header">
            <span className="root-time-title">Time Breakdown</span>
            <span className="root-time-total">
              Total: <strong>{formatSecondsToDisplay(totalSeconds)}</strong>
            </span>
          </div>

          {customTimes.length > 0 && (
            <div className="root-time-list">
              {customTimes.map((t, idx) => (
                <div key={idx} className="root-time-tag">
                  <span className="root-time-tag-label">{t.label}:</span>
                  <span className="root-time-tag-val">{formatSecondsToDisplay(t.seconds)}</span>
                  <button
                    type="button"
                    className="root-time-tag-remove"
                    onClick={() => handleRemoveTimeEntry(idx)}
                    title="Remove time entry"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Time Form using UniversalDropdown */}
          <form className="root-time-add-form" onSubmit={handleAddTimeEntry}>
            <div className="root-time-dropdown-wrap">
              <UniversalDropdown
                items={timeDropdownItems}
                selectedId={newTimeLabel}
                onSelect={id => setNewTimeLabel(id)}
                onAddNew={() => setIsAddingCustomTime(true)}
                addNewLabel="+ Custom Time Name"
              />
            </div>

            <input
              type="text"
              className="root-time-input"
              placeholder="e.g. 22m30s"
              value={newTimeValue}
              onInput={e => setNewTimeValue((e.target as HTMLInputElement).value)}
            />
            <button type="submit" className="root-time-add-btn">
              + Add
            </button>
          </form>

          {/* Custom Time Inline Form */}
          {isAddingCustomTime && (
            <div className="root-custom-time-inline">
              <input
                ref={customTimeRef}
                type="text"
                className="root-time-input"
                placeholder="Name your time (e.g. Proofing Time)..."
                value={customTimeInput}
                onInput={e => setCustomTimeInput((e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                className="root-time-add-btn"
                onClick={handleCreateCustomTime}
              >
                Save
              </button>
              <button
                type="button"
                className="root-time-cancel-btn"
                onClick={() => setIsAddingCustomTime(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Obsidian-Style Description Editor */}
        <div className="root-description-section">
          <div className="root-section-header">Description (Story / Intro)</div>
          {isEditingDesc ? (
            <textarea
              ref={descTextareaRef}
              className="root-desc-raw-textarea"
              placeholder="Type markdown description here..."
              maxLength={50000}
              value={graph.description || ''}
              onInput={e => onChange({ description: (e.target as HTMLTextAreaElement).value })}
              onBlur={() => setIsEditingDesc(false)}
              rows={4}
            />
          ) : (
            <div
              className="root-desc-rendered-box"
              onClick={() => setIsEditingDesc(true)}
              title="Click to edit markdown"
            >
              {graph.description ? (
                <div className="root-markdown-body">{graph.description}</div>
              ) : (
                <div className="root-desc-placeholder">
                  Click to write story or description in markdown...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tips / Important Notes: Always full visible, max 2000 chars */}
        <div className="root-tips-section">
          <div className="root-section-header">Tips / Important Notes (Always Visible)</div>
          <textarea
            className="root-tips-textarea"
            placeholder="Important advance prep or kitchen notes..."
            maxLength={2000}
            value={graph.tips || ''}
            onInput={e => onChange({ tips: (e.target as HTMLTextAreaElement).value })}
            rows={3}
          />
          <div className="root-char-counter">
            {(graph.tips || '').length} / 2000
          </div>
        </div>
      </div>

      {/* Output wire connector port at bottom center */}
      <div
        id="port-out-root"
        data-port-type="out"
        data-node-id="root"
        className="studio-node-port studio-node-port-out"
      />
    </div>
  );
}
