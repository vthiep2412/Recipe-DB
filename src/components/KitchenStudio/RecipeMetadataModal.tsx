import { useState, useEffect, useMemo } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { X, Plus, Minus, Trash2, Edit3, BookOpen, Play, Tag } from 'lucide-preact';
import { toast } from 'sonner';
import { marked } from 'marked';
import type { RecipeGraph } from '../../types/orchestration';
import { formatSecondsToDisplay } from '../../constants/standardKitchenData';
import { UniversalDropdown, DropdownItem } from './UniversalDropdown';
import { ConfirmModal } from '../ConfirmModal';
import { MediaModal } from './MediaModal';
import { ObsidianSourceEditor, escapeHtmlAttr } from './ObsidianSourceEditor';
import { TagManagerModal } from './TagManagerModal';
import { getYouTubeEmbedUrl } from '../../utils/media';

interface RecipeMetadataModalProps {
  isOpen: boolean;
  graph: RecipeGraph;
  onClose: () => void;
  onSave: (updatedGraph: Partial<RecipeGraph>) => void;
  onOpenMediaModal?: (type: 'picture' | 'video') => void;
}

interface TimePhase {
  id: string;
  label: string;
  hours: number;
  minutes: number;
  isStandard?: boolean;
}

const AVAILABLE_PHASE_OPTIONS = [
  'Prep Time',
  'Cook Time',
  'Bake Time',
  'Rest Time',
  'Chill Time',
  'Marinate Time',
  'Simmer Time',
  'Proofing Time',
  'Fermentation Time',
  'Freeze Time'
];

export function RecipeMetadataModal({
  isOpen,
  graph,
  onClose,
  onSave
}: RecipeMetadataModalProps) {
  // Title, difficulty, servings
  const [title, setTitle] = useState(graph.title || 'Untitled Recipe');
  const [originUrl, setOriginUrl] = useState(graph.source?.url || '');
  const [authorName, setAuthorName] = useState(graph.author?.name || 'anonymous');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>(graph.difficulty || 'medium');
  const [servings, setServings] = useState(graph.servings || 4);
  const [tags, setTags] = useState<string[]>(() => Array.isArray(graph.tags) ? [...graph.tags] : []);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);

  // Picture and video media
  const [pictureUrl, setPictureUrl] = useState(graph.media?.pictureUrl || '');
  const [videoUrl, setVideoUrl] = useState(graph.media?.videoUrl || '');
  const [galleryUrls, setGalleryUrls] = useState<string[]>(graph.media?.galleryUrls || []);

  const allImages = useMemo(() => {
    return [pictureUrl, ...galleryUrls].filter(Boolean);
  }, [pictureUrl, galleryUrls]);

  // Active media modal state
  const [activeMediaModal, setActiveMediaModal] = useState<{
    type: 'picture' | 'video';
    galleryIndex?: number;
  } | null>(null);

  // Obsidian style markdown editor state
  const [description, setDescription] = useState(graph.description || '');
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [importantNotes, setImportantNotes] = useState(graph.importantNotes || graph.tips || '');

  // Exact time phases
  const [timePhases, setTimePhases] = useState<TimePhase[]>(() => {
    const phases: TimePhase[] = [];

    const prepSec = graph.times?.prepSec || 0;
    phases.push({
      id: 'prep',
      label: 'Prep Time',
      hours: Math.floor(prepSec / 3600),
      minutes: Math.floor((prepSec % 3600) / 60),
      isStandard: true
    });

    const cookSec = graph.times?.cookSec || 0;
    phases.push({
      id: 'cook',
      label: 'Cook Time',
      hours: Math.floor(cookSec / 3600),
      minutes: Math.floor((cookSec % 3600) / 60),
      isStandard: true
    });

    if (graph.times?.bakeSec !== undefined && graph.times?.bakeSec !== null) {
      phases.push({
        id: 'bake',
        label: 'Bake Time',
        hours: Math.floor(graph.times.bakeSec / 3600),
        minutes: Math.floor((graph.times.bakeSec % 3600) / 60),
        isStandard: true
      });
    }

    if (graph.times?.restSec !== undefined && graph.times?.restSec !== null) {
      phases.push({
        id: 'rest',
        label: 'Rest Time',
        hours: Math.floor(graph.times.restSec / 3600),
        minutes: Math.floor((graph.times.restSec % 3600) / 60),
        isStandard: true
      });
    }

    if (graph.times?.custom && graph.times.custom.length > 0) {
      for (const item of graph.times.custom) {
        if (!phases.some(p => p.label === item.label)) {
          phases.push({
            id: `phase-${Date.now()}-${Math.random()}`,
            label: item.label,
            hours: Math.floor(item.seconds / 3600),
            minutes: Math.floor((item.seconds % 3600) / 60),
            isStandard: false
          });
        }
      }
    }

    return phases;
  });

  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [customPhaseLabels, setCustomPhaseLabels] = useState<string[]>([]);
  const [isAddingCustomPhaseName, setIsAddingCustomPhaseName] = useState(false);
  const [customPhaseNameInput, setCustomPhaseNameInput] = useState('');

  // Keep media and tags synchronized if graph changes
  useEffect(() => {
    if (graph.media?.pictureUrl !== undefined) {
      setPictureUrl(graph.media.pictureUrl);
    }
    if (graph.media?.videoUrl !== undefined) {
      setVideoUrl(graph.media.videoUrl);
    }
    if (graph.tags !== undefined) {
      setTags(Array.isArray(graph.tags) ? [...graph.tags] : []);
    }
  }, [graph.media?.pictureUrl, graph.media?.videoUrl, graph.tags]);

  // Calculate total seconds across all phases
  const totalSeconds = timePhases.reduce(
    (sum, p) => sum + (Math.max(0, p.hours) * 3600 + Math.max(0, p.minutes) * 60),
    0
  );

  const handleUpdatePhaseHours = (id: string, hours: number) => {
    setTimePhases(prev => prev.map(p => (p.id === id ? { ...p, hours: Math.max(0, hours) } : p)));
  };

  const handleUpdatePhaseMinutes = (id: string, minutes: number) => {
    setTimePhases(prev => prev.map(p => (p.id === id ? { ...p, minutes: Math.max(0, Math.min(59, minutes)) } : p)));
  };

  const handleRemovePhase = (id: string) => {
    setTimePhases(prev => prev.filter(p => p.id !== id));
  };

  const handleAddPhase = (phaseName: string) => {
    if (timePhases.some(p => p.label.toLowerCase() === phaseName.toLowerCase())) return;
    setTimePhases(prev => [
      ...prev,
      {
        id: `phase-${Date.now()}`,
        label: phaseName,
        hours: 0,
        minutes: 0,
        isStandard: false
      }
    ]);
  };

  const handleCreateCustomPhaseName = (e: Event) => {
    e.preventDefault();
    const trimmed = customPhaseNameInput.trim();
    if (!trimmed) return;
    if (!customPhaseLabels.includes(trimmed)) {
      setCustomPhaseLabels(prev => [...prev, trimmed]);
    }
    handleAddPhase(trimmed);
    setCustomPhaseNameInput('');
    setIsAddingCustomPhaseName(false);
  };

  const phaseDropdownItems: DropdownItem[] = [
    ...AVAILABLE_PHASE_OPTIONS.filter(opt => !timePhases.some(p => p.label === opt)).map(t => ({
      id: t,
      label: t,
      group: 'Standard Phases'
    })),
    ...customPhaseLabels.filter(opt => !timePhases.some(p => p.label === opt)).map(t => ({
      id: t,
      label: t,
      group: 'Custom Phases'
    }))
  ];

  const initialPhasesSignature = useMemo(() => {
    return JSON.stringify({
      prep: graph.times?.prepSec,
      cook: graph.times?.cookSec,
      bake: graph.times?.bakeSec,
      rest: graph.times?.restSec,
      custom: graph.times?.custom || []
    });
  }, [graph.times]);

  const currentPhasesSignature = useMemo(() => {
    let prepSec: number | undefined = undefined;
    let cookSec: number | undefined = undefined;
    let bakeSec: number | undefined = undefined;
    let restSec: number | undefined = undefined;
    const custom: { label: string; seconds: number }[] = [];

    for (const phase of timePhases) {
      const sec = Math.max(0, phase.hours) * 3600 + Math.max(0, phase.minutes) * 60;
      if (phase.label === 'Prep Time') prepSec = sec;
      else if (phase.label === 'Cook Time') cookSec = sec;
      else if (phase.label === 'Bake Time') bakeSec = sec;
      else if (phase.label === 'Rest Time') restSec = sec;
      else custom.push({ label: phase.label, seconds: sec });
    }
    return JSON.stringify({ prep: prepSec, cook: cookSec, bake: bakeSec, rest: restSec, custom });
  }, [timePhases]);

  const isDirty = useMemo(() => {
    return (
      title !== (graph.title || 'Untitled Recipe') ||
      originUrl !== (graph.source?.url || '') ||
      authorName !== (graph.author?.name || 'anonymous') ||
      difficulty !== (graph.difficulty || 'medium') ||
      servings !== (graph.servings || 4) ||
      pictureUrl !== (graph.media?.pictureUrl || '') ||
      videoUrl !== (graph.media?.videoUrl || '') ||
      JSON.stringify(galleryUrls) !== JSON.stringify(graph.media?.galleryUrls || []) ||
      description !== (graph.description || '') ||
      importantNotes !== (graph.importantNotes || graph.tips || '') ||
      initialPhasesSignature !== currentPhasesSignature
    );
  }, [
    title,
    originUrl,
    authorName,
    difficulty,
    servings,
    pictureUrl,
    videoUrl,
    galleryUrls,
    description,
    importantNotes,
    initialPhasesSignature,
    currentPhasesSignature,
    graph
  ]);

  const handleAttemptClose = () => {
    if (isDirty) {
      setIsExitConfirmOpen(true);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !activeMediaModal && !isExitConfirmOpen) {
        e.preventDefault();
        handleAttemptClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDirty, activeMediaModal, isExitConfirmOpen]);

  const handleSaveAndClose = () => {
    let prepSec: number | undefined = undefined;
    let cookSec: number | undefined = undefined;
    let bakeSec: number | undefined = undefined;
    let restSec: number | undefined = undefined;
    const customList: { label: string; seconds: number }[] = [];

    for (const phase of timePhases) {
      const durationSec = Math.max(0, phase.hours) * 3600 + Math.max(0, phase.minutes) * 60;
      if (phase.label === 'Prep Time') prepSec = durationSec;
      else if (phase.label === 'Cook Time') cookSec = durationSec;
      else if (phase.label === 'Bake Time') bakeSec = durationSec;
      else if (phase.label === 'Rest Time') restSec = durationSec;
      else customList.push({ label: phase.label, seconds: durationSec });
    }

    onSave({
      title: title.trim() || 'Untitled Recipe',
      difficulty,
      servings: Math.max(1, servings),
      tags,
      description,
      tips: importantNotes.trim(),
      importantNotes: importantNotes.trim(),
      author: {
        name: authorName.trim() || 'anonymous'
      },
      source: originUrl.trim() ? { url: originUrl.trim() } : undefined,
      media: {
        pictureUrl: pictureUrl.trim() || undefined,
        galleryUrls: galleryUrls.filter(Boolean),
        videoUrl: videoUrl.trim() || undefined
      },
      times: {
        prepSec: prepSec ?? 0,
        cookSec: cookSec ?? 0,
        bakeSec,
        restSec,
        totalSec: totalSeconds,
        custom: customList
      }
    });
    toast.success('Recipe settings saved');
    onClose();
  };

  const renderedMarkdownHtml = useMemo(() => {
    if (!isReadingMode) return '';
    const raw = description || '*No description entered yet. Switch to Source Mode to write.*';
    const escaped = raw.replace(/</g, '&lt;');
    const processed = escaped.replace(/\[\[(.*?)\]\]/g, (_, linkText) => {
      return `<span class="obsidian-reading-link">${escapeHtmlAttr(linkText)}</span>`;
    });
    const renderer = new marked.Renderer();
    renderer.link = ({ href, title, text }) => {
      const isSafe = /^https?:\/\/|^mailto:/i.test(href.trim());
      const safeHref = isSafe ? escapeHtmlAttr(href.trim()) : '#';
      const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : '';
      return `<a href="${safeHref}"${titleAttr} rel="noopener noreferrer" target="_blank">${escapeHtmlAttr(text)}</a>`;
    };
    return marked.parse(processed, { renderer, async: false }) as string;
  }, [description, isReadingMode]);

  if (!isOpen) return null;

  const modalElement = (
    <>
      <div className="studio-modal-backdrop" onClick={handleAttemptClose}>
        <div
          className="studio-metadata-modal-card"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipe-metadata-title"
        >
          {/* Header */}
          <header className="metadata-modal-header">
            <div className="metadata-modal-header-left">
              <h2 id="recipe-metadata-title" className="metadata-modal-heading">Recipe Settings</h2>
              <span className="metadata-modal-subheading">Configure master recipe details, timing, and story</span>
            </div>
            <button
              type="button"
              className="metadata-modal-close-btn"
              onClick={handleAttemptClose}
              aria-label="Close settings"
            >
              <X size={20} />
            </button>
          </header>

        {/* Modal Body matching MS Paint Sketch: Left structured boxes and Right huge description */}
        <div className="metadata-modal-body">
          {/* LEFT COLUMN: Box 1 (Picture/Media), Box 2 (Title), Box 3 (Timing/Difficulty), Box 4 (Notes) */}
          <div className="metadata-col-left">
            {/* Box 1: Picture and Media Stuff */}
            <div className="metadata-field-group">
              <label className="metadata-field-label">Picture and Media</label>

              {/* Split media header from user sketch */}
              <div className="root-media-split" style={{ height: '8.5rem', borderRadius: '0.6rem', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                {/* Left Half: Picture */}
                <div
                  className="root-media-half"
                  onClick={() => setActiveMediaModal({ type: 'picture' })}
                  role="button"
                  tabIndex={0}
                  aria-label="Add or edit picture"
                >
                  {allImages.length > 0 ? (
                    <div className="root-media-filled">
                      <img src={allImages[0]} alt="Recipe picture" />
                      {allImages.length > 1 && (
                        <div className="studio-media-counter-badge">
                          ×{allImages.length}
                        </div>
                      )}
                      <div className="root-media-overlay">Manage Images</div>
                    </div>
                  ) : (
                    <div className="root-media-empty">
                      <Plus size={20} />
                      <span className="root-media-label">Add picture</span>
                    </div>
                  )}
                </div>

                {/* Right Half: Video */}
                <div
                  className="root-media-half"
                  onClick={() => setActiveMediaModal({ type: 'video' })}
                  role="button"
                  tabIndex={0}
                  aria-label="Add or edit video"
                >
                  {videoUrl ? (
                    <div className="root-media-filled">
                      <div className="root-video-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Play size={12} fill="currentColor" />
                        <span>{getYouTubeEmbedUrl(videoUrl) ? 'YouTube Video' : 'Video Loaded'}</span>
                      </div>
                      <div className="root-media-overlay">Change Video</div>
                    </div>
                  ) : (
                    <div className="root-media-empty">
                      <Plus size={20} />
                      <span className="root-media-label">Add video</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Box 2: Recipe Title */}
            <div className="metadata-field-group">
              <label className="metadata-field-label">Recipe Title</label>
              <input
                type="text"
                className="metadata-text-input"
                value={title}
                onInput={e => setTitle((e.target as HTMLInputElement).value)}
                placeholder="e.g. Thick And Chewy S'mores Cookies"
              />
            </div>

            {/* Origin URL and Author Name side by side to save space */}
            <div className="metadata-grid-2">
              <div className="metadata-field-group">
                <label className="metadata-field-label">Origin URL</label>
                <input
                  type="url"
                  className="metadata-text-input"
                  value={originUrl}
                  onInput={e => setOriginUrl((e.target as HTMLInputElement).value)}
                  placeholder="https://example.com/recipe"
                />
              </div>

              <div className="metadata-field-group">
                <label className="metadata-field-label">Author Name</label>
                <input
                  type="text"
                  className="metadata-text-input"
                  value={authorName}
                  onInput={e => setAuthorName((e.target as HTMLInputElement).value)}
                  placeholder="anonymous"
                />
              </div>
            </div>

            {/* Box 3: Timing and Difficulty */}
            <div className="metadata-field-group">
              <label className="metadata-field-label">Difficulty and Servings</label>
              <div className="metadata-grid-2">
                <div className="root-difficulty-pills">
                  {(['easy', 'medium', 'hard'] as const).map(diff => (
                    <button
                      key={diff}
                      type="button"
                      className={`root-diff-pill ${difficulty === diff ? 'is-active' : ''}`}
                      onClick={() => setDifficulty(diff)}
                    >
                      {diff.charAt(0).toUpperCase() + diff.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="root-servings-stepper">
                  <button
                    type="button"
                    className="root-servings-btn"
                    onClick={() => setServings(Math.max(1, servings - 1))}
                    aria-label="Decrease servings"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="root-servings-val">
                    {servings} {servings === 1 ? 'serving' : 'servings'}
                  </span>
                  <button
                    type="button"
                    className="root-servings-btn"
                    onClick={() => setServings(servings + 1)}
                    aria-label="Increase servings"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Tags Section */}
            <div className="metadata-field-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <label className="metadata-field-label" style={{ margin: 0 }}>Recipe Tags ({tags.length})</label>
                <button
                  type="button"
                  className="metadata-tag-manage-btn"
                  onClick={() => setIsTagModalOpen(true)}
                >
                  <Tag size={13} />
                  <span>Manage Tags</span>
                </button>
              </div>

              {tags.length > 0 ? (
                <div className="metadata-tags-preview">
                  {tags.map(t => (
                    <span key={t} className="metadata-tag-chip">
                      #{t}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="metadata-tags-empty-hint">
                  No tags added yet. Click &quot;Manage Tags&quot; to assign categories.
                </div>
              )}
            </div>

            {/* Timing and Phases */}
            <div className="metadata-field-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="metadata-field-label">Timing and Phases</label>
                <span style={{ fontSize: '0.8rem', color: '#ff9d42' }}>
                  Total: <strong>{formatSecondsToDisplay(totalSeconds)}</strong>
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.2rem' }}>
                {timePhases.map(phase => (
                  <div key={phase.id} className="metadata-time-card">
                    <span className="metadata-time-label">{phase.label}</span>
                    <div className="metadata-time-durations">
                      <div className="metadata-time-unit-box">
                        <input
                          type="number"
                          min="0"
                          className="metadata-time-num-input"
                          value={phase.hours}
                          onInput={e => handleUpdatePhaseHours(phase.id, parseInt((e.target as HTMLInputElement).value || '0', 10))}
                        />
                        <span>hr</span>
                      </div>
                      <div className="metadata-time-unit-box">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          className="metadata-time-num-input"
                          value={phase.minutes}
                          onInput={e => handleUpdatePhaseMinutes(phase.id, parseInt((e.target as HTMLInputElement).value || '0', 10))}
                        />
                        <span>min</span>
                      </div>
                      {!phase.isStandard && (
                        <button
                          type="button"
                          className="metadata-time-remove-btn"
                          onClick={() => handleRemovePhase(phase.id)}
                          title="Remove phase"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Custom or Standard Phase */}
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem' }}>
                {phaseDropdownItems.length > 0 && (
                  <div style={{ flex: 1 }}>
                    <UniversalDropdown
                      items={phaseDropdownItems}
                      placeholder="+ New Time"
                      onSelect={id => {
                        handleAddPhase(id);
                      }}
                      onAddNew={() => setIsAddingCustomPhaseName(true)}
                      addNewLabel="+ Custom Phase Name"
                    />
                  </div>
                )}
              </div>

              {isAddingCustomPhaseName && (
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem' }}>
                  <input
                    type="text"
                    className="metadata-text-input"
                    style={{ flex: 1, padding: '0.35rem 0.6rem', fontSize: '0.82rem' }}
                    placeholder="e.g. Cold Fermentation..."
                    value={customPhaseNameInput}
                    autoFocus
                    onInput={e => setCustomPhaseNameInput((e.target as HTMLInputElement).value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateCustomPhaseName(e);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="metadata-btn-save"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
                    onClick={handleCreateCustomPhaseName}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className="metadata-btn-cancel"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
                    onClick={() => setIsAddingCustomPhaseName(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Box 4: Important Notes (No Markdown) */}
            <div className="metadata-field-group">
              <label className="metadata-field-label">Important Notes (No Markdown)</label>
              <textarea
                className="metadata-textarea"
                rows={3}
                maxLength={2000}
                value={importantNotes}
                onInput={e => setImportantNotes((e.target as HTMLTextAreaElement).value)}
                placeholder="Advance prep, pan size requirements, or allergy warnings..."
              />
              <div className="metadata-field-hint" style={{ textAlign: 'right' }}>
                {importantNotes.length} / 2000
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: The Huge Description Workspace (Obsidian Source View Style) */}
          <div className="metadata-col-right">
            <div className="metadata-markdown-header">
              <span className="metadata-field-label">Description</span>
              <div className="metadata-segmented-toggle">
                <button
                  type="button"
                  className={`metadata-segment-btn ${!isReadingMode ? 'is-active' : ''}`}
                  onClick={() => setIsReadingMode(false)}
                  title="Source Mode (Markdown)"
                >
                  <Edit3 size={13} />
                  <span>Source</span>
                </button>
                <button
                  type="button"
                  className={`metadata-segment-btn ${isReadingMode ? 'is-active' : ''}`}
                  onClick={() => setIsReadingMode(true)}
                  title="Reading View (Rendered Preview)"
                >
                  <BookOpen size={13} />
                  <span>Reading</span>
                </button>
              </div>
            </div>

            <div className="metadata-editor-wrapper">
              {!isReadingMode ? (
                <ObsidianSourceEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Write description in Markdown..."
                />
              ) : (
                <div
                  className="metadata-markdown-preview"
                  dangerouslySetInnerHTML={{ __html: renderedMarkdownHtml }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <footer className="metadata-modal-footer">
          <button
            type="button"
            className="metadata-btn-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="metadata-btn-save"
            onClick={handleSaveAndClose}
          >
            Save Changes
          </button>
        </footer>
      </div>

      {/* Unified Media Modal for Drag & Drop Upload or URL */}
      {activeMediaModal && (
        <MediaModal
          isOpen={true}
          mediaType={activeMediaModal.type}
          mode={activeMediaModal.type === 'picture' ? 'gallery' : 'single'}
          currentUrl={activeMediaModal.type === 'video' ? videoUrl : (allImages[0] || '')}
          currentUrls={activeMediaModal.type === 'picture' ? allImages : undefined}
          onClose={() => setActiveMediaModal(null)}
          onSave={url => {
            if (activeMediaModal.type === 'video') {
              setVideoUrl(url);
            } else {
              setPictureUrl(url);
            }
            setActiveMediaModal(null);
          }}
          onSaveGallery={urls => {
            if (activeMediaModal.type === 'picture') {
              setPictureUrl(urls[0] || '');
              setGalleryUrls(urls.slice(1));
            }
            setActiveMediaModal(null);
          }}
        />
      )}
    </div>

    <TagManagerModal
      isOpen={isTagModalOpen}
      tags={tags}
      onClose={() => setIsTagModalOpen(false)}
      onSave={updatedTags => setTags(updatedTags)}
    />

    <ConfirmModal
      isOpen={isExitConfirmOpen}
      title="Unsaved Changes"
      message="You have unsaved changes. Do you want to save them before closing?"
      confirmLabel="Save"
      discardLabel="Don't Save"
      cancelLabel="Cancel"
      onConfirm={() => {
        setIsExitConfirmOpen(false);
        handleSaveAndClose();
      }}
      onDiscard={() => {
        setIsExitConfirmOpen(false);
        onClose();
      }}
      onCancel={() => {
        setIsExitConfirmOpen(false);
      }}
    />
  </>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalElement, document.body)
    : modalElement;
}
