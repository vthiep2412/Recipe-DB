import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import {
  Pencil,
  Plus,
  Trash2,
  Video,
  AlertTriangle,
  Carrot,
  ChefHat,
  Clock,
  Sparkles,
  Info,
  X
} from 'lucide-preact';
import type {
  CanvasStepNode,
  StepMentionToken,
  StepInstructionSegment
} from '../../types/orchestration';
import { formatFraction } from '../../parser/cooklangParser';
import { MediaModal } from './MediaModal';

interface StepNodeProps {
  node: CanvasStepNode;
  stepNumber: number;
  allNodes?: CanvasStepNode[];
  isSelected: boolean;
  isJumpHighlighted?: boolean;
  selectedMentionId?: string;
  hasMasterVideo?: boolean;
  onSelect: () => void;
  onChange: (updated: Partial<CanvasStepNode>) => void;
  onSelectMention: (mention: StepMentionToken) => void;
  onJumpToStep?: (targetStepId: string) => void;
  onToggleYield: () => void;
}

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

function updateTokenContent(span: HTMLElement, mention: StepMentionToken, allNodes?: CanvasStepNode[]) {
  span.innerHTML = '';

  if (mention.type === 'ingredient') {
    const isYield = Boolean(
      mention.data?.yieldId ||
      (mention.data?.ingredientId && mention.data.ingredientId.startsWith('yield-'))
    );

    if (isYield) {
      span.classList.add('is-yield-mention');
    } else {
      span.classList.remove('is-yield-mention');
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'cook-ig-name';
    nameSpan.textContent = mention.displayText || (isYield ? 'Yield' : 'Ingredient');
    span.appendChild(nameSpan);

    if (isYield) {
      let sourceStepText = mention.data?.yieldStepTitle;
      if (!sourceStepText) {
        const targetStepId = mention.data?.yieldId || (mention.data?.ingredientId ? mention.data.ingredientId.replace(/^yield-/, '') : '');
        if (allNodes && targetStepId) {
          const foundIdx = allNodes.findIndex(n => n.id === targetStepId);
          if (foundIdx !== -1) {
            sourceStepText = allNodes[foundIdx].title || `Step ${foundIdx + 1}`;
          }
        }
      }
      if (!sourceStepText && mention.data?.yieldId && !mention.data.yieldId.startsWith('step-17')) {
        sourceStepText = `Step ${mention.data.yieldId.replace(/^step-/, '')}`;
      }

      if (sourceStepText) {
        const fromSpan = document.createElement('span');
        fromSpan.className = 'cook-yield-from';
        fromSpan.textContent = `(From ${sourceStepText})`;
        span.appendChild(fromSpan);
      }
    }

    if (mention.data?.amount !== undefined && mention.data?.amount !== '') {
      const amtSpan = document.createElement('span');
      amtSpan.className = 'cook-amt';
      const unitText = mention.data.unit ? ` ${mention.data.unit}` : '';
      const displayAmt = typeof mention.data.amount === 'number'
        ? formatFraction(mention.data.amount)
        : mention.data.amount;
      amtSpan.textContent = `${displayAmt}${unitText}`;
      span.appendChild(amtSpan);
    }

    if (mention.data?.creatorNote) {
      const noteSpan = document.createElement('span');
      noteSpan.className = 'cook-ig-note';
      noteSpan.textContent = mention.data.creatorNote;
      span.appendChild(noteSpan);
    }
  } else if (mention.type === 'cookware') {
    const nameSpan = document.createElement('span');
    nameSpan.textContent = mention.displayText || 'Cookware';
    span.appendChild(nameSpan);

    if (mention.data?.vesselSize && mention.data.vesselSize !== 'Normal') {
      const amtSpan = document.createElement('span');
      amtSpan.className = 'cook-amt';
      amtSpan.textContent = mention.data.vesselSize;
      span.appendChild(amtSpan);
    }
  } else if (mention.type === 'timer') {
    const timerSpan = document.createElement('span');
    timerSpan.className = 'cook-timer-btn';
    const mins = Math.round((mention.data?.timerSec || 60) / 60);
    timerSpan.textContent = `⏱ ${mention.displayText || `${mins}m`}`;
    span.appendChild(timerSpan);
  }

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'step-inline-token-remove';
  removeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  removeBtn.title = 'Remove token';
  span.appendChild(removeBtn);
}

function createTokenElement(mention: StepMentionToken, isSelected: boolean, allNodes?: CanvasStepNode[]): HTMLSpanElement {
  const span = document.createElement('span');
  span.contentEditable = 'false';
  span.dataset.mentionId = mention.id;
  span.className = `step-inline-token cook-${
    mention.type === 'ingredient' ? 'ig' : mention.type === 'cookware' ? 'cw' : 'timer'
  } ${isSelected ? 'is-active-token' : ''}`;
  span.title = `Click to edit ${mention.type} in inspector`;

  updateTokenContent(span, mention, allNodes);

  return span;
}

function parseEditorDom(
  editorEl: HTMLElement,
  mentionsMap: Map<string, StepMentionToken>
): {
  segments: StepInstructionSegment[];
  mentions: StepMentionToken[];
  instructionText: string;
} {
  const segments: StepInstructionSegment[] = [];
  const mentions: StepMentionToken[] = [];
  let instructionText = '';

  for (let i = 0; i < editorEl.childNodes.length; i++) {
    const child = editorEl.childNodes[i];
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) {
        const lastSeg = segments[segments.length - 1];
        if (lastSeg && lastSeg.type === 'text') {
          lastSeg.text += text;
        } else {
          segments.push({
            type: 'text',
            id: `seg-text-${i}-${Date.now()}`,
            text
          });
        }
        instructionText += text;
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const mentionId = el.dataset.mentionId;
      if (mentionId && mentionsMap.has(mentionId)) {
        const mention = mentionsMap.get(mentionId)!;
        segments.push({
          type: 'mention',
          id: mention.id,
          mention
        });
        mentions.push(mention);
        instructionText += `[${mention.displayText}]`;
      } else if (el.tagName === 'BR') {
        const lastSeg = segments[segments.length - 1];
        if (lastSeg && lastSeg.type === 'text') {
          lastSeg.text += '\n';
        } else {
          segments.push({
            type: 'text',
            id: `seg-text-${i}-${Date.now()}`,
            text: '\n'
          });
        }
        instructionText += '\n';
      } else {
        const text = el.innerText || el.textContent || '';
        if (text) {
          const lastSeg = segments[segments.length - 1];
          if (lastSeg && lastSeg.type === 'text') {
            lastSeg.text += text;
          } else {
            segments.push({
              type: 'text',
              id: `seg-text-${i}-${Date.now()}`,
              text
            });
          }
          instructionText += text;
        }
      }
    }
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', id: `seg-text-init-${Date.now()}`, text: '' });
  }

  return { segments, mentions, instructionText };
}

function populateEditor(
  editorEl: HTMLElement,
  segments: StepInstructionSegment[],
  selectedMentionId?: string,
  allNodes?: CanvasStepNode[]
) {
  editorEl.innerHTML = '';
  if (!segments || segments.length === 0) {
    return;
  }

  for (const seg of segments) {
    if (seg.type === 'text') {
      if (seg.text) {
        editorEl.appendChild(document.createTextNode(seg.text));
      }
    } else if (seg.type === 'mention') {
      const tokenEl = createTokenElement(seg.mention, selectedMentionId === seg.mention.id, allNodes);
      editorEl.appendChild(tokenEl);
    }
  }
}

export function StepNode({
  node,
  stepNumber,
  allNodes,
  isSelected,
  isJumpHighlighted,
  selectedMentionId,
  hasMasterVideo,
  onSelect,
  onChange,
  onSelectMention,
  onJumpToStep,
  onToggleYield
}: StepNodeProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [showOrphanedConfirmModal, setShowOrphanedConfirmModal] = useState(false);
  const [showInlineToolsTooltip, setShowInlineToolsTooltip] = useState(false);
  const [showOrphanedTooltip, setShowOrphanedTooltip] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const mentionsMap = useRef<Map<string, StepMentionToken>>(new Map());
  const lastRenderedNodeId = useRef<string | null>(null);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  // Compute canonical segments list from node state
  const segments: StepInstructionSegment[] = useMemo(() => {
    if (node.segments && node.segments.length > 0) {
      return node.segments;
    }
    if (node.mentions && node.mentions.length > 0) {
      return [
        { type: 'text', id: `seg-text-init-${node.id}`, text: node.instructionText || '' },
        ...node.mentions.map(m => ({ type: 'mention' as const, id: m.id, mention: m })),
        { type: 'text', id: `seg-text-end-${node.id}`, text: '' }
      ];
    }
    return [
      { type: 'text', id: `seg-text-init-${node.id}`, text: node.instructionText || '' }
    ];
  }, [node.segments, node.instructionText, node.mentions, node.id]);

  // Keep mentionsMap updated
  useEffect(() => {
    if (node.mentions) {
      node.mentions.forEach(m => mentionsMap.current.set(m.id, m));
    }
    if (node.segments) {
      node.segments.forEach(s => {
        if (s.type === 'mention') {
          mentionsMap.current.set(s.mention.id, s.mention);
        }
      });
    }
  }, [node.mentions, node.segments]);

  // Initial populate or switch to another step node
  useEffect(() => {
    if (!editorRef.current) return;
    if (lastRenderedNodeId.current !== node.id) {
      lastRenderedNodeId.current = node.id;
      if (node.mentions) {
        node.mentions.forEach(m => mentionsMap.current.set(m.id, m));
      }
      if (node.segments) {
        node.segments.forEach(s => {
          if (s.type === 'mention') {
            mentionsMap.current.set(s.mention.id, s.mention);
          }
        });
      }
      populateEditor(editorRef.current, segments, selectedMentionId, allNodes);
    }
  }, [node.id, segments, selectedMentionId, allNodes]);

  // Update token contents and selection highlight in place when inspector edits occur
  useEffect(() => {
    if (!editorRef.current) return;

    // Highlight active token
    const allTokens = editorRef.current.querySelectorAll<HTMLElement>('.step-inline-token');
    allTokens.forEach(token => {
      const mId = token.dataset.mentionId;
      if (mId === selectedMentionId) {
        token.classList.add('is-active-token');
      } else {
        token.classList.remove('is-active-token');
      }
    });

    // Update token content from inspector edits
    if (node.mentions) {
      node.mentions.forEach(m => {
        mentionsMap.current.set(m.id, m);
        const token = editorRef.current?.querySelector<HTMLElement>(`[data-mention-id="${m.id}"]`);
        if (token) {
          updateTokenContent(token, m, allNodes);
        }
      });
    }
  }, [node.mentions, selectedMentionId, allNodes]);

  const syncDomToState = () => {
    if (!editorRef.current) return;
    const parsed = parseEditorDom(editorRef.current, mentionsMap.current);
    onChange({
      segments: parsed.segments,
      mentions: parsed.mentions,
      instructionText: parsed.instructionText
    });
  };

  const handleEditorInput = () => {
    syncDomToState();
  };

  const handleEditorKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      syncDomToState();
    }
  };

  const handleEditorMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // Remove token button click
    if (target.closest('.step-inline-token-remove')) {
      return;
    }

    // Token card click to inspect
    const tokenSpan = target.closest('.step-inline-token') as HTMLElement;
    if (tokenSpan && tokenSpan.dataset.mentionId) {
      e.preventDefault();
      e.stopPropagation();
      setIsFocused(true);
      const mentionId = tokenSpan.dataset.mentionId;
      let mention = mentionsMap.current.get(mentionId);
      if (!mention && node.mentions) {
        mention = node.mentions.find(m => m.id === mentionId);
      }
      if (!mention && node.segments) {
        const seg = node.segments.find(s => s.type === 'mention' && s.mention.id === mentionId);
        if (seg && seg.type === 'mention') mention = seg.mention;
      }
      if (mention) {
        onSelectMention(mention);
      }
    }
  };

  const handleEditorClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // Remove token button click
    const removeBtn = target.closest('.step-inline-token-remove');
    if (removeBtn) {
      e.stopPropagation();
      const tokenSpan = removeBtn.closest('.step-inline-token') as HTMLElement;
      if (tokenSpan) {
        // Clean up redundant space after token if present
        const nextNode = tokenSpan.nextSibling;
        if (nextNode && nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent?.startsWith(' ')) {
          nextNode.textContent = nextNode.textContent.replace(/^\s+/, '');
          if (!nextNode.textContent) {
            nextNode.remove();
          }
        }
        tokenSpan.remove();
        syncDomToState();
      }
      return;
    }

    // Token card click to inspect
    const tokenSpan = target.closest('.step-inline-token') as HTMLElement;
    if (tokenSpan && tokenSpan.dataset.mentionId) {
      e.stopPropagation();
      setIsFocused(true);
      const mentionId = tokenSpan.dataset.mentionId;
      let mention = mentionsMap.current.get(mentionId);
      if (!mention && node.mentions) {
        mention = node.mentions.find(m => m.id === mentionId);
      }
      if (!mention && node.segments) {
        const seg = node.segments.find(s => s.type === 'mention' && s.mention.id === mentionId);
        if (seg && seg.type === 'mention') mention = seg.mention;
      }
      if (mention) {
        onSelectMention(mention);
      }
      return;
    }

    // Normal prose click
    setIsFocused(true);
    onSelect();
  };

  const handleEditorDblClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const tokenSpan = target.closest('.step-inline-token') as HTMLElement;
    if (tokenSpan && tokenSpan.dataset.mentionId) {
      e.stopPropagation();
      e.preventDefault();
      const mentionId = tokenSpan.dataset.mentionId;
      let mention = mentionsMap.current.get(mentionId);
      if (!mention && node.mentions) {
        mention = node.mentions.find(m => m.id === mentionId);
      }
      if (!mention && node.segments) {
        const seg = node.segments.find(s => s.type === 'mention' && s.mention.id === mentionId);
        if (seg && seg.type === 'mention') mention = seg.mention;
      }
      if (mention && (mention.data?.yieldId || (mention.data?.ingredientId && mention.data.ingredientId.startsWith('yield-')))) {
        const targetStepId = mention.data.yieldId || (mention.data.ingredientId ? mention.data.ingredientId.replace(/^yield-/, '') : '');
        if (targetStepId && onJumpToStep) {
          onJumpToStep(targetStepId);
        }
      }
    }
  };

  const handleAddMentionInline = (type: 'ingredient' | 'cookware' | 'timer') => {
    const mentionId = `m-${Date.now()}`;
    let displayText = 'New Item';
    let defaultData = {};

    if (type === 'ingredient') {
      displayText = 'Ingredient';
      defaultData = { amount: 1, unit: 'g' };
    } else if (type === 'cookware') {
      displayText = 'Cookware';
      defaultData = { vesselSize: 'Normal' };
    } else if (type === 'timer') {
      displayText = '5 mins';
      defaultData = { timerSec: 300 };
    }

    const newMention: StepMentionToken = {
      id: mentionId,
      type,
      displayText,
      data: defaultData
    };

    mentionsMap.current.set(mentionId, newMention);

    const tokenEl = createTokenElement(newMention, true, allNodes);
    const editorEl = editorRef.current;
    if (!editorEl) return;

    editorEl.focus();
    const sel = window.getSelection();
    let inserted = false;

    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editorEl.contains(range.startContainer)) {
        range.deleteContents();
        range.insertNode(tokenEl);
        const space = document.createTextNode(' ');
        tokenEl.after(space);
        range.setStartAfter(space);
        range.setEndAfter(space);
        sel.removeAllRanges();
        sel.addRange(range);
        inserted = true;
      }
    }

    if (!inserted) {
      editorEl.appendChild(tokenEl);
      const space = document.createTextNode(' ');
      editorEl.appendChild(space);
      if (sel) {
        const range = document.createRange();
        range.setStartAfter(space);
        range.setEndAfter(space);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    syncDomToState();
    onSelectMention(newMention);
  };

  return (
    <div
      className={`studio-canvas-node studio-step-node ${isSelected ? 'is-selected' : ''} ${
        isJumpHighlighted ? 'is-jump-highlighted' : ''
      } ${node.isLinkedToPrevious ? 'is-linked-indent' : ''}`}
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
        setIsFocused(true);
      }}
    >
      {/* Input wire connector port at top center */}
      <div
        id={`port-in-${node.id}`}
        data-port-type="in"
        data-node-id={node.id}
        className="studio-node-port studio-node-port-in"
      />

      {/* Step Header with Title and Checkboxes */}
      <div className="step-node-header">
        <div className="step-node-title-wrap">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              className="step-title-input"
              value={node.title}
              onInput={e => onChange({ title: (e.target as HTMLInputElement).value })}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={e => {
                if (e.key === 'Enter') setIsEditingTitle(false);
              }}
            />
          ) : (
            <div
              className="step-title-display"
              onClick={e => {
                e.stopPropagation();
                if (!isSelected) {
                  onSelect();
                  setIsFocused(true);
                } else {
                  setIsEditingTitle(true);
                }
              }}
              title={isSelected ? 'Click to rename step' : 'Click to select step'}
            >
              <span className="step-number-badge">
                {node.isCountedStep ? `${stepNumber}` : 'Note'}
              </span>
              <span className="step-title-text">{node.title || `Step ${stepNumber}`}</span>
              <button
                type="button"
                className="step-title-pencil-btn"
                onClick={e => {
                  e.stopPropagation();
                  onSelect();
                  setIsFocused(true);
                  setIsEditingTitle(true);
                }}
                title="Rename step"
                aria-label="Rename step"
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Checkboxes: Count this step, Link to previous, and Inline tools */}
        <div className="step-node-checkboxes">
          <label className="step-checkbox-label" title="Whether this counts as a numbered step">
            <input
              type="checkbox"
              checked={node.isCountedStep}
              onChange={e =>
                onChange({ isCountedStep: (e.target as HTMLInputElement).checked })
              }
            />
            <span>Count?</span>
          </label>

          <label
            className="step-checkbox-label"
            title="Link and indent directly under the previous step"
          >
            <input
              type="checkbox"
              checked={node.isLinkedToPrevious}
              onChange={e =>
                onChange({ isLinkedToPrevious: (e.target as HTMLInputElement).checked })
              }
            />
            <span>Link to previous?</span>
          </label>

          <div className="step-tools-toggle-wrap">
            <label
              className="step-checkbox-label"
              title="Show inline ingredients and cookware for this step in Recipe Viewer"
            >
              <input
                type="checkbox"
                checked={node.showInlineTools ?? false}
                onChange={e =>
                  onChange({ showInlineTools: (e.target as HTMLInputElement).checked })
                }
              />
              <span>Inline tools</span>
            </label>
            <div
              className="step-info-badge-wrap"
              onMouseEnter={() => setShowInlineToolsTooltip(true)}
              onMouseLeave={() => setShowInlineToolsTooltip(false)}
            >
              <Info size={13} className="step-info-icon" />
              {showInlineToolsTooltip && (
                <div className="step-info-tooltip">
                  Displays a compact bar of ingredients and cookware directly in this step card in Recipe Viewer. Recommended for complex steps or mobile views where the sticky sidebar is hidden.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top Media Zone: Placed directly below header checkboxes and above instruction text */}
      <div className="step-top-media-zone" onClick={e => e.stopPropagation()}>
        {/* Step Image Section */}
        {node.media?.galleryUrls?.[0] ? (
          <div className="step-image-row-populated">
            <div className="step-image-preview-wrap">
              <img src={node.media.galleryUrls[0]} alt={`Step ${stepNumber}`} />
              <button
                type="button"
                className="step-image-delete-btn"
                title="Remove step image"
                onClick={() => {
                  const nextMedia = { ...node.media };
                  delete nextMedia.galleryUrls;
                  onChange({ media: nextMedia });
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div
              className="step-image-add-card"
              onClick={() => setIsMediaModalOpen(true)}
              role="button"
              tabIndex={0}
              title="Add or change picture"
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
            title="Attach image to this step"
          >
            <Plus size={13} />
            <span>Add Image</span>
          </button>
        )}

        {/* Video Clip Section: Master video exists vs missing/orphaned */}
        {hasMasterVideo && !node.media?.videoClip ? (
          <button
            type="button"
            className="step-add-media-trigger-btn step-add-clip-btn"
            onClick={() => {
              onChange({
                media: {
                  ...node.media,
                  videoClip: {
                    startSec: 0,
                    endSec: 30
                  }
                }
              });
            }}
            title="Attach video clip timestamps to this step"
          >
            <Video size={13} />
            <span>+ Video Clip</span>
          </button>
        ) : hasMasterVideo && node.media?.videoClip ? (
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
                value={formatSecToMMSS(node.media?.videoClip?.startSec ?? 0)}
                onChange={e => {
                  const sec = parseMMSSToSec((e.target as HTMLInputElement).value);
                  const currentEnd = node.media?.videoClip?.endSec ?? (sec + 30);
                  onChange({
                    media: {
                      ...node.media,
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
                  const currentEnd = node.media?.videoClip?.endSec ?? (validStart + 30);
                  const validEnd = Math.max(validStart + 1, currentEnd);
                  onChange({
                    media: {
                      ...node.media,
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
                value={formatSecToMMSS(node.media?.videoClip?.endSec ?? 30)}
                onChange={e => {
                  const sec = parseMMSSToSec((e.target as HTMLInputElement).value);
                  const currentStart = node.media?.videoClip?.startSec ?? 0;
                  onChange({
                    media: {
                      ...node.media,
                      videoClip: {
                        startSec: currentStart,
                        endSec: Math.max(currentStart, sec)
                      }
                    }
                  });
                }}
                onBlur={e => {
                  const sec = parseMMSSToSec((e.target as HTMLInputElement).value);
                  const currentStart = Math.max(0, node.media?.videoClip?.startSec ?? 0);
                  const validEnd = Math.max(currentStart + 1, sec);
                  onChange({
                    media: {
                      ...node.media,
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
                const nextMedia = { ...node.media };
                delete nextMedia.videoClip;
                onChange({ media: nextMedia });
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ) : !hasMasterVideo && node.media?.videoClip ? (
          <div
            className="step-video-orphaned-alert"
            onClick={() => setShowOrphanedConfirmModal(true)}
            title="Click to remove orphaned video clip"
          >
            <div className="step-video-orphaned-msg">
              <AlertTriangle size={13} />
              <span>Master video missing: orphaned clip</span>
              <span className="step-video-orphaned-time">
                {formatSecToMMSS(node.media.videoClip.startSec ?? 0)} - {formatSecToMMSS(node.media.videoClip.endSec ?? 0)}
              </span>
            </div>
            <div
              className="step-orphaned-actions-wrap"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={e => e.stopPropagation()}
            >
              <div
                className="step-info-badge-wrap"
                onMouseEnter={() => setShowOrphanedTooltip(true)}
                onMouseLeave={() => setShowOrphanedTooltip(false)}
              >
                <Info size={13} className="step-info-icon" />
                {showOrphanedTooltip && (
                  <div className="step-info-tooltip">
                    This step has clip timestamps saved, but no master video is configured in Recipe Info. Add a master video URL to use this clip, or click trash to remove it.
                  </div>
                )}
              </div>
              <button
                type="button"
                className="step-video-clear-btn"
                title="Remove orphaned clip"
                onClick={() => setShowOrphanedConfirmModal(true)}
              >
                <Trash2 size={13} style={{ color: '#ef4444' }} />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Rich Inline Instruction Flow Editor */}
      <div className="step-node-body">
        <div
          ref={editorRef}
          contentEditable
          className="step-inline-editor"
          data-placeholder="Write step instruction prose here..."
          onInput={handleEditorInput}
          onKeyDown={handleEditorKeyDown}
          onMouseDown={handleEditorMouseDown}
          onClick={handleEditorClick}
          onDblClick={handleEditorDblClick}
          onFocus={() => {
            setIsFocused(true);
            onSelect();
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
        />

        {node.producesYield && (
          <div className="step-yield-banner">
            <span>Creates: <strong>{node.producesYield.name}</strong></span>
            <button
              type="button"
              className="step-inline-token-remove"
              onClick={e => {
                e.stopPropagation();
                onChange({ producesYield: undefined });
              }}
              title="Remove yield"
            >
              <X size={14} />
            </button>
          </div>
        )}

      </div>

      {/* Expandable Bottom Action Bar: visible on focus or selection */}
      {(isSelected || isFocused) && (
        <div className="step-node-actions">
          <button
            type="button"
            className="step-action-btn"
            onMouseDown={e => e.preventDefault()}
            onClick={e => {
              e.stopPropagation();
              handleAddMentionInline('ingredient');
            }}
          >
            <span>+ Ingredient</span>
            <Carrot size={14} className="step-btn-trailing-icon" />
          </button>
          <button
            type="button"
            className="step-action-btn"
            onMouseDown={e => e.preventDefault()}
            onClick={e => {
              e.stopPropagation();
              handleAddMentionInline('cookware');
            }}
          >
            <span>+ Cookware</span>
            <ChefHat size={14} className="step-btn-trailing-icon" />
          </button>
          <button
            type="button"
            className="step-action-btn"
            onMouseDown={e => e.preventDefault()}
            onClick={e => {
              e.stopPropagation();
              handleAddMentionInline('timer');
            }}
          >
            <span>+ Timer</span>
            <Clock size={14} className="step-btn-trailing-icon" />
          </button>
          <button
            type="button"
            className={`step-action-btn ${node.producesYield ? 'is-active' : ''}`}
            onMouseDown={e => e.preventDefault()}
            onClick={e => {
              e.stopPropagation();
              onToggleYield();
            }}
          >
            <span>{node.producesYield ? 'Edit Yield' : '+ Creates Yield'}</span>
            <Sparkles size={14} className="step-btn-trailing-icon" />
          </button>
        </div>
      )}

      {/* Output wire connector port at bottom center */}
      <div
        id={`port-out-${node.id}`}
        data-port-type="out"
        data-node-id={node.id}
        className="studio-node-port studio-node-port-out"
      />

      {/* Modal confirmation for removing orphaned video clip timestamps */}
      {showOrphanedConfirmModal && (
        <div
          className="studio-confirm-modal-overlay"
          onClick={() => setShowOrphanedConfirmModal(false)}
        >
          <div
            className="studio-confirm-modal-box"
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', color: '#f87171' }}>
              <AlertTriangle size={20} />
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Remove Orphaned Video Clip?</h4>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#d1d5db', lineHeight: 1.5, margin: '0 0 1.25rem 0' }}>
              This recipe does not have a master video configured in Recipe Settings. Do you want to remove the saved timestamp range ({formatSecToMMSS(node.media?.videoClip?.startSec ?? 0)} - {formatSecToMMSS(node.media?.videoClip?.endSec ?? 0)}) from this step?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                className="root-time-cancel-btn"
                onClick={() => setShowOrphanedConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '0.35rem',
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                onClick={() => {
                  const nextMedia = { ...node.media };
                  delete nextMedia.videoClip;
                  onChange({ media: nextMedia });
                  setShowOrphanedConfirmModal(false);
                }}
              >
                Remove Timestamp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Modal for Step Photo */}
      {isMediaModalOpen && (
        <MediaModal
          isOpen={true}
          mediaType="picture"
          mode="single"
          title={`Step ${node.isCountedStep ? stepNumber : 'Note'} Picture`}
          currentUrl={node.media?.galleryUrls?.[0] || ''}
          onClose={() => setIsMediaModalOpen(false)}
          onSave={url => {
            const nextMedia = { ...node.media };
            if (url) {
              nextMedia.galleryUrls = [url];
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
