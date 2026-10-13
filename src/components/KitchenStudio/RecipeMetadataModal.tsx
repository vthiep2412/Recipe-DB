import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { X, Plus, Minus, Trash2, Edit3, BookOpen, Play } from 'lucide-preact';
import { marked } from 'marked';
import type { RecipeGraph } from '../../types/orchestration';
import { formatSecondsToDisplay } from '../../constants/standardKitchenData';
import { UniversalDropdown, DropdownItem } from './UniversalDropdown';
import { MediaModal } from './MediaModal';

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

interface ObsidianSourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function tokenizeInlineText(parentEl: HTMLElement, text: string) {
  const tokenRegex = /(\[\[[^\n\]]+\]\]|\*\*\*[^\s*](?:[\s\S]*?[^\s*])?\*\*\*|\*\*[^\s*](?:[\s\S]*?[^\s*])?\*\*|\*[^\s*](?:[^*\n]*?[^\s*])?\*|`[^`\n]+`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parentEl.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
    }
    const tokenStr = match[0];
    if (tokenStr.startsWith('[[') && tokenStr.endsWith(']]')) {
      const inner = tokenStr.slice(2, -2);
      const openSpan = document.createElement('span');
      openSpan.className = 'obsidian-syntax-dim';
      openSpan.textContent = '[[';
      parentEl.appendChild(openSpan);

      const linkSpan = document.createElement('span');
      linkSpan.className = 'obsidian-token-wiki-link';
      linkSpan.textContent = inner;
      parentEl.appendChild(linkSpan);

      const closeSpan = document.createElement('span');
      closeSpan.className = 'obsidian-syntax-dim';
      closeSpan.textContent = ']]';
      parentEl.appendChild(closeSpan);
    } else if (tokenStr.startsWith('***') && tokenStr.endsWith('***')) {
      const inner = tokenStr.slice(3, -3);
      const openSpan = document.createElement('span');
      openSpan.className = 'obsidian-syntax-dim';
      openSpan.textContent = '***';
      parentEl.appendChild(openSpan);

      const biSpan = document.createElement('span');
      biSpan.className = 'obsidian-token-bold-italic';
      biSpan.textContent = inner;
      parentEl.appendChild(biSpan);

      const closeSpan = document.createElement('span');
      closeSpan.className = 'obsidian-syntax-dim';
      closeSpan.textContent = '***';
      parentEl.appendChild(closeSpan);
    } else if (tokenStr.startsWith('**') && tokenStr.endsWith('**')) {
      const inner = tokenStr.slice(2, -2);
      const openSpan = document.createElement('span');
      openSpan.className = 'obsidian-syntax-dim';
      openSpan.textContent = '**';
      parentEl.appendChild(openSpan);

      const boldSpan = document.createElement('span');
      boldSpan.className = 'obsidian-token-bold';
      boldSpan.textContent = inner;
      parentEl.appendChild(boldSpan);

      const closeSpan = document.createElement('span');
      closeSpan.className = 'obsidian-syntax-dim';
      closeSpan.textContent = '**';
      parentEl.appendChild(closeSpan);
    } else if (tokenStr.startsWith('*') && tokenStr.endsWith('*')) {
      const inner = tokenStr.slice(1, -1);
      const openSpan = document.createElement('span');
      openSpan.className = 'obsidian-syntax-dim';
      openSpan.textContent = '*';
      parentEl.appendChild(openSpan);

      const italicSpan = document.createElement('span');
      italicSpan.className = 'obsidian-token-italic';
      italicSpan.textContent = inner;
      parentEl.appendChild(italicSpan);

      const closeSpan = document.createElement('span');
      closeSpan.className = 'obsidian-syntax-dim';
      closeSpan.textContent = '*';
      parentEl.appendChild(closeSpan);
    } else if (tokenStr.startsWith('`') && tokenStr.endsWith('`')) {
      const inner = tokenStr.slice(1, -1);
      const openSpan = document.createElement('span');
      openSpan.className = 'obsidian-syntax-dim';
      openSpan.textContent = '`';
      parentEl.appendChild(openSpan);

      const codeSpan = document.createElement('span');
      codeSpan.className = 'obsidian-token-code';
      codeSpan.textContent = inner;
      parentEl.appendChild(codeSpan);

      const closeSpan = document.createElement('span');
      closeSpan.className = 'obsidian-syntax-dim';
      closeSpan.textContent = '`';
      parentEl.appendChild(closeSpan);
    }
    lastIdx = match.index + tokenStr.length;
  }

  if (lastIdx < text.length) {
    parentEl.appendChild(document.createTextNode(text.slice(lastIdx)));
  }
}

function renderObsidianLine(lineText: string, lineIndex: number): HTMLDivElement {
  const lineDiv = document.createElement('div');
  lineDiv.className = 'obsidian-editor-line';
  lineDiv.dataset.lineIndex = String(lineIndex);

  if (!lineText) {
    lineDiv.classList.add('is-empty');
    lineDiv.appendChild(document.createElement('br'));
    return lineDiv;
  }

  const headingMatch = lineText.match(/^(#{1,6})\s(.*)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    lineDiv.classList.add(`is-h${level}`, 'is-heading');

    const hashSpan = document.createElement('span');
    hashSpan.className = 'obsidian-syntax-dim';
    hashSpan.textContent = `${headingMatch[1]} `;
    lineDiv.appendChild(hashSpan);

    const textSpan = document.createElement('span');
    textSpan.className = 'obsidian-heading-text';
    tokenizeInlineText(textSpan, headingMatch[2]);
    lineDiv.appendChild(textSpan);
    return lineDiv;
  }

  if (/^(\s*---|\s*\*\*\*|\s*___)\s*$/.test(lineText)) {
    lineDiv.classList.add('is-hr');
    const hrSpan = document.createElement('span');
    hrSpan.className = 'obsidian-syntax-dim';
    hrSpan.textContent = lineText;
    lineDiv.appendChild(hrSpan);
    return lineDiv;
  }

  const listMatch = lineText.match(/^(\s*[-*+]\s|\s*\d+\.\s)(.*)$/);
  if (listMatch) {
    lineDiv.classList.add('is-list');
    const bulletSpan = document.createElement('span');
    bulletSpan.className = 'obsidian-syntax-dim';
    bulletSpan.textContent = listMatch[1];
    lineDiv.appendChild(bulletSpan);

    tokenizeInlineText(lineDiv, listMatch[2]);
    return lineDiv;
  }

  const quoteMatch = lineText.match(/^(\s*>\s*)(.*)$/);
  if (quoteMatch) {
    lineDiv.classList.add('is-blockquote');
    const quoteSpan = document.createElement('span');
    quoteSpan.className = 'obsidian-syntax-dim';
    quoteSpan.textContent = quoteMatch[1];
    lineDiv.appendChild(quoteSpan);

    tokenizeInlineText(lineDiv, quoteMatch[2]);
    return lineDiv;
  }

  tokenizeInlineText(lineDiv, lineText);
  return lineDiv;
}

function renderObsidianDocument(container: HTMLElement, docText: string) {
  const lines = docText.split('\n');
  container.innerHTML = '';
  for (let i = 0; i < lines.length; i++) {
    const lineEl = renderObsidianLine(lines[i], i);
    container.appendChild(lineEl);
  }
}

function extractTextFromEditor(container: HTMLElement): string {
  const lines: string[] = [];
  for (let i = 0; i < container.childNodes.length; i++) {
    const node = container.childNodes[i];
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.childNodes.length === 1 && el.childNodes[0].nodeName === 'BR') {
        lines.push('');
      } else {
        lines.push(el.textContent || '');
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent || '';
      if (t) lines.push(t);
    }
  }
  return lines.join('\n');
}

function getCaretLineAndCol(container: HTMLElement): { lineIndex: number; col: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer)) return null;

  let node: Node | null = range.startContainer;
  while (node && node.parentNode !== container) {
    node = node.parentNode;
  }
  if (!node) return null;

  const lineEl = node as HTMLElement;
  const lineIndex = Array.from(container.children).indexOf(lineEl);
  if (lineIndex === -1) return null;

  const preRange = document.createRange();
  preRange.selectNodeContents(lineEl);
  preRange.setEnd(range.startContainer, range.startOffset);
  const col = preRange.toString().length;

  return { lineIndex, col };
}

function setCaretLineAndCol(container: HTMLElement, lineIndex: number, col: number) {
  const sel = window.getSelection();
  if (!sel) return;

  const lines = container.children;
  if (lines.length === 0) return;

  const clampedLineIdx = Math.max(0, Math.min(lines.length - 1, lineIndex));
  const lineEl = lines[clampedLineIdx] as HTMLElement;
  if (!lineEl) return;

  if (lineEl.classList.contains('is-empty') || lineEl.textContent === '') {
    const range = document.createRange();
    range.selectNodeContents(lineEl);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }

  let remaining = col;
  let targetNode: Node = lineEl;
  let targetOffset = 0;
  let found = false;

  const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, null);
  let textNode = walker.nextNode();

  while (textNode) {
    const len = textNode.textContent?.length || 0;
    if (remaining <= len) {
      targetNode = textNode;
      targetOffset = remaining;
      found = true;
      break;
    }
    remaining -= len;
    targetNode = textNode;
    targetOffset = len;
    textNode = walker.nextNode();
  }

  const range = document.createRange();
  if (found) {
    range.setStart(targetNode, targetOffset);
    range.collapse(true);
  } else {
    range.selectNodeContents(lineEl);
    range.collapse(false);
  }

  sel.removeAllRanges();
  sel.addRange(range);
}

function ObsidianSourceEditor({ value, onChange, placeholder }: ObsidianSourceEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastValueRef = useRef(value);

  const syncDocument = (text: string) => {
    if (!editorRef.current) return;
    renderObsidianDocument(editorRef.current, text);
  };

  useEffect(() => {
    if (editorRef.current && value !== lastValueRef.current) {
      lastValueRef.current = value;
      syncDocument(value);
    }
  }, [value]);

  useEffect(() => {
    if (editorRef.current) {
      syncDocument(value);
    }
  }, []);

  const handleInput = () => {
    if (!editorRef.current || isComposingRef.current) return;
    const caret = getCaretLineAndCol(editorRef.current);
    const newText = extractTextFromEditor(editorRef.current);
    lastValueRef.current = newText;
    onChange(newText);
    renderObsidianDocument(editorRef.current, newText);
    if (caret) {
      setCaretLineAndCol(editorRef.current, caret.lineIndex, caret.col);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
      return;
    }

    if (e.key === 'Enter') {
      if (!editorRef.current) return;
      const caret = getCaretLineAndCol(editorRef.current);
      if (!caret) return;

      const lines = editorRef.current.children;
      const currentLineEl = lines[caret.lineIndex] as HTMLElement;
      if (!currentLineEl) return;

      const currentText = currentLineEl.textContent || '';
      const emptyBulletMatch = currentText.match(/^(\s*[-*+]\s*)$/);
      if (emptyBulletMatch && caret.col <= currentText.length) {
        e.preventDefault();
        const docText = extractTextFromEditor(editorRef.current);
        const allLines = docText.split('\n');
        allLines[caret.lineIndex] = '';
        const nextDoc = allLines.join('\n');
        lastValueRef.current = nextDoc;
        onChange(nextDoc);
        renderObsidianDocument(editorRef.current, nextDoc);
        setCaretLineAndCol(editorRef.current, caret.lineIndex, 0);
        return;
      }

      const activeBulletMatch = currentText.match(/^(\s*[-*+]\s+)/);
      if (activeBulletMatch && caret.col >= activeBulletMatch[1].length) {
        e.preventDefault();
        const bulletPrefix = activeBulletMatch[1];
        const docText = extractTextFromEditor(editorRef.current);
        const allLines = docText.split('\n');
        const beforeCaret = currentText.slice(0, caret.col);
        const afterCaret = currentText.slice(caret.col);
        allLines[caret.lineIndex] = beforeCaret;
        allLines.splice(caret.lineIndex + 1, 0, bulletPrefix + afterCaret);
        const nextDoc = allLines.join('\n');
        lastValueRef.current = nextDoc;
        onChange(nextDoc);
        renderObsidianDocument(editorRef.current, nextDoc);
        setCaretLineAndCol(editorRef.current, caret.lineIndex + 1, bulletPrefix.length);
        return;
      }
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text) return;
    document.execCommand('insertText', false, text);
  };

  const handleClick = (e: MouseEvent) => {
    if (e.target === editorRef.current && editorRef.current) {
      const lines = editorRef.current.children;
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1] as HTMLElement;
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(lastLine);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  };

  return (
    <div
      ref={editorRef}
      className="obsidian-source-editor"
      contentEditable
      spellcheck={false}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onClick={handleClick}
      onCompositionStart={() => { isComposingRef.current = true; }}
      onCompositionEnd={() => {
        isComposingRef.current = false;
        handleInput();
      }}
      data-placeholder={placeholder}
    />
  );
}

export function RecipeMetadataModal({
  isOpen,
  graph,
  onClose,
  onSave
}: RecipeMetadataModalProps) {
  if (!isOpen) return null;

  // Title, difficulty, servings
  const [title, setTitle] = useState(graph.title || 'Untitled Recipe');
  const [originUrl, setOriginUrl] = useState(graph.source?.url || '');
  const [authorName, setAuthorName] = useState(graph.author?.name || 'anonymous');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>(graph.difficulty || 'medium');
  const [servings, setServings] = useState(graph.servings || 4);

  // Picture and video media
  const [pictureUrl, setPictureUrl] = useState(graph.media?.pictureUrl || '');
  const [videoUrl, setVideoUrl] = useState(graph.media?.videoUrl || '');
  const [galleryUrls, setGalleryUrls] = useState<string[]>(graph.media?.galleryUrls || []);

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

    if (graph.times?.bakeSec) {
      phases.push({
        id: 'bake',
        label: 'Bake Time',
        hours: Math.floor(graph.times.bakeSec / 3600),
        minutes: Math.floor((graph.times.bakeSec % 3600) / 60),
        isStandard: true
      });
    }

    if (graph.times?.restSec) {
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

  const [selectedPhaseOption, setSelectedPhaseOption] = useState('Bake Time');
  const [customPhaseLabels, setCustomPhaseLabels] = useState<string[]>([]);
  const [isAddingCustomPhaseName, setIsAddingCustomPhaseName] = useState(false);
  const [customPhaseNameInput, setCustomPhaseNameInput] = useState('');

  // Keep media synchronized if graph changes
  useEffect(() => {
    if (graph.media?.pictureUrl !== undefined) {
      setPictureUrl(graph.media.pictureUrl);
    }
    if (graph.media?.videoUrl !== undefined) {
      setVideoUrl(graph.media.videoUrl);
    }
  }, [graph.media?.pictureUrl, graph.media?.videoUrl]);

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

  const handleSaveAndClose = () => {
    let prepSec = 0;
    let cookSec = 0;
    let bakeSec = 0;
    let restSec = 0;
    const customList: { label: string; seconds: number }[] = [];

    for (const phase of timePhases) {
      const durationSec = Math.max(0, phase.hours) * 3600 + Math.max(0, phase.minutes) * 60;
      if (phase.label === 'Prep Time') prepSec = durationSec;
      else if (phase.label === 'Cook Time') cookSec = durationSec;
      else if (phase.label === 'Bake Time') bakeSec = durationSec;
      else if (phase.label === 'Rest Time') restSec = durationSec;
      else if (durationSec > 0) customList.push({ label: phase.label, seconds: durationSec });
    }

    onSave({
      title: title.trim() || 'Untitled Recipe',
      difficulty,
      servings: Math.max(1, servings),
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
        prepSec: prepSec || undefined,
        cookSec: cookSec || undefined,
        bakeSec: bakeSec || undefined,
        restSec: restSec || undefined,
        totalSec: totalSeconds,
        custom: customList
      }
    });
    onClose();
  };

  const renderedMarkdownHtml = useMemo(() => {
    if (!isReadingMode) return '';
    const raw = description || '*No description entered yet. Switch to Source Mode to write.*';
    const processed = raw.replace(/\[\[(.*?)\]\]/g, '<span class="obsidian-reading-link">$1</span>');
    return marked.parse(processed, { async: false }) as string;
  }, [description, isReadingMode]);

  const modalElement = (
    <div className="studio-modal-backdrop" onClick={onClose}>
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
            onClick={onClose}
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
                  {pictureUrl ? (
                    <div className="root-media-filled">
                      <img src={pictureUrl} alt="Recipe picture" />
                      <div className="root-media-overlay">Change Picture</div>
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
                        <span>Video Loaded</span>
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

              {/* Extra images gallery if any */}
              {galleryUrls.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                  {galleryUrls.map((url, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        width: '3.6rem',
                        height: '2.5rem',
                        borderRadius: '0.35rem',
                        overflow: 'hidden',
                        border: '1px solid rgba(255, 255, 255, 0.15)'
                      }}
                    >
                      <img src={url} alt={`Extra ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        style={{
                          position: 'absolute',
                          top: '0.1rem',
                          right: '0.1rem',
                          background: 'rgba(0, 0, 0, 0.75)',
                          border: 'none',
                          color: '#ffffff',
                          borderRadius: '50%',
                          width: '1rem',
                          height: '1rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        onClick={() => setGalleryUrls(prev => prev.filter((_, i) => i !== idx))}
                        title="Remove image"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    style={{
                      width: '3.6rem',
                      height: '2.5rem',
                      borderRadius: '0.35rem',
                      border: '1px dashed rgba(255, 255, 255, 0.2)',
                      background: 'rgba(255, 255, 255, 0.04)',
                      color: '#9ca3af',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                    onClick={() => setActiveMediaModal({ type: 'picture', galleryIndex: galleryUrls.length })}
                    title="Add another image"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
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
                      selectedId={selectedPhaseOption}
                      onSelect={id => {
                        setSelectedPhaseOption(id);
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
          currentUrl={
            activeMediaModal.type === 'video'
              ? videoUrl
              : (activeMediaModal.galleryIndex !== undefined ? galleryUrls[activeMediaModal.galleryIndex] : pictureUrl)
          }
          onClose={() => setActiveMediaModal(null)}
          onSave={url => {
            if (activeMediaModal.type === 'video') {
              setVideoUrl(url);
            } else {
              if (activeMediaModal.galleryIndex !== undefined) {
                setGalleryUrls(prev => {
                  const next = [...prev];
                  if (activeMediaModal.galleryIndex! < next.length) {
                    next[activeMediaModal.galleryIndex!] = url;
                  } else {
                    next.push(url);
                  }
                  return next;
                });
              } else {
                setPictureUrl(url);
              }
            }
            setActiveMediaModal(null);
          }}
        />
      )}
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalElement, document.body)
    : modalElement;
}
