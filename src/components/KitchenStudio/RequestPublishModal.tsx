import { useState, useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Check, AlertTriangle, Download, X } from 'lucide-preact';
import type { StudioWorkspace, RecipeGraph } from '../../types/orchestration';
import { slugifyRecipeTitle, recipeStorageService } from '../../services/recipeStorageService';
import { generateFablang } from '../../parser/fablangGenerator';

interface RequestPublishModalProps {
  isOpen: boolean;
  workspace: StudioWorkspace;
  finalGraph: RecipeGraph;
  role?: string;
  onClose: () => void;
  onPublishSuccess: (slug: string, recipeId?: string) => void;
}

export function RequestPublishModal({
  isOpen,
  workspace,
  finalGraph,
  role,
  onClose,
  onPublishSuccess
}: RequestPublishModalProps) {
  const [slugInput, setSlugInput] = useState('');
  const recipeIdInputRef = useRef<HTMLInputElement>(null);
  const [isCheckingCollision, setIsCheckingCollision] = useState(false);
  const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null);
  const [allowDownload, setAllowDownload] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'json' | 'fablang'>('json');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkSeqRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);

  const isAdmin = role === 'admin';
  const isAuthorized = role === 'recipe_creator' || role === 'admin';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspace.id);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Initialize Recipe Id when opening
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);

      // Check if workspace or graph already has an assigned recipe ID/slug
      const candidateId = (workspace.graph?.id || workspace.id || '').trim();
      const isGenericWorkspace = candidateId.startsWith('workspace-');
      const isGenericUntitled = /^untitled(-recipe)?(\s*\d+)?$/i.test(candidateId);
      const hasSpecificId = candidateId && !isUuid && !isGenericWorkspace && !isGenericUntitled;

      if (hasSpecificId) {
        const clean = slugifyRecipeTitle(candidateId);
        setSlugInput(clean);
        checkSlug(clean);
      } else {
        const rawTitle = (workspace.title || workspace.graph?.title || '').trim();
        const isUntitledTitle = !rawTitle || /^untitled(-recipe)?(\s*\d+)?$/i.test(rawTitle);

        if (!isUntitledTitle) {
          const derived = slugifyRecipeTitle(rawTitle);
          setSlugInput(derived);
          checkSlug(derived);
        } else {
          recipeStorageService.getNextAvailableUntitledSlug(workspace.id).then(availableSlug => {
            setSlugInput(availableSlug);
            checkSlug(availableSlug);
          });
        }
      }

      // Automatically focus and select the Recipe Id input field
      setTimeout(() => {
        recipeIdInputRef.current?.focus();
        recipeIdInputRef.current?.select();
      }, 50);
    }
  }, [isOpen, workspace.id, workspace.graph?.id, workspace.title]);

  const checkSlug = async (candidate: string) => {
    if (!candidate) {
      setIsSlugAvailable(false);
      return;
    }
    const currentSeq = ++checkSeqRef.current;
    setIsCheckingCollision(true);
    try {
      const available = await recipeStorageService.checkRecipeSlugAvailable(
        candidate,
        isUuid ? workspace.id : undefined
      );
      if (currentSeq === checkSeqRef.current) {
        setIsSlugAvailable(available);
      }
    } catch {
      if (currentSeq === checkSeqRef.current) {
        setIsSlugAvailable(true);
      }
    } finally {
      if (currentSeq === checkSeqRef.current) {
        setIsCheckingCollision(false);
      }
    }
  };

  const handleSlugChange = (raw: string) => {
    const sanitized = raw.toLowerCase().replace(/[^a-z0-9-_\s]/g, '').replace(/\s+/g, '-');
    setSlugInput(sanitized);
    const cleaned = sanitized.replace(/^-+|-+$/g, '');
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    if (cleaned) {
      setIsCheckingCollision(true);
      debounceTimerRef.current = window.setTimeout(() => {
        checkSlug(cleaned);
      }, 250);
    } else {
      setIsSlugAvailable(false);
      setIsCheckingCollision(false);
    }
  };

  const handleSlugBlur = async () => {
    const cleaned = slugInput.trim().replace(/^-+|-+$/g, '');
    if (!cleaned) {
      const nextUntitled = await recipeStorageService.getNextAvailableUntitledSlug(workspace.id);
      setSlugInput(nextUntitled);
      checkSlug(nextUntitled);
    } else if (cleaned !== slugInput) {
      setSlugInput(cleaned);
      checkSlug(cleaned);
    }
  };

  if (!isOpen) return null;

  const handleExecutePublish = async () => {
    let targetSlug = slugInput.trim().replace(/^-+|-+$/g, '');
    if (!targetSlug) {
      targetSlug = await recipeStorageService.getNextAvailableUntitledSlug(workspace.id);
      setSlugInput(targetSlug);
    }

    if (isSlugAvailable === false) {
      setErrorMessage(`Recipe slug "${targetSlug}" is already taken. Please choose another.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Download offline copy if user selected it
      if (allowDownload) {
        if (downloadFormat === 'fablang') {
          const fablangContent = generateFablang(finalGraph, workspace.canvasNodes, workspace);
          const blob = new Blob([fablangContent], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${targetSlug}.fablang`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          const jsonContent = JSON.stringify({ ...finalGraph, id: targetSlug }, null, 2);
          const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${targetSlug}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }

      // 2. Submit recipe to Supabase Cloud
      const targetStatus = isAdmin ? 'approved' : 'pending';
      const result = await recipeStorageService.submitRecipe(workspace, targetStatus, targetSlug);

      if (result.ok) {
        onPublishSuccess(targetSlug, result.id);
        onClose();
      } else {
        setErrorMessage(result.error || 'Failed to submit recipe to cloud.');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Publish error occurred');
    } finally {
      setIsSubmitting(false);
    }
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
        className="studio-modal-card export-recipe-modal-card"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-modal-title"
      >
        <div className="studio-modal-header">
          <h2 id="publish-modal-title">{isAdmin ? 'Publish Recipe' : 'Request Publish'}</h2>
          <button
            type="button"
            className="studio-modal-close"
            onClick={onClose}
            aria-label="Close publish modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="studio-modal-body">
          {/* Recipe Slug Input with Live RPC Collision Indicator */}
          <div className="export-field-group">
            <div className="export-field-header-row">
              <label className="export-field-label" htmlFor="recipe-slug-input">
                Recipe URL Slug / Identifier
              </label>
              <div className="export-collision-status">
                {isCheckingCollision ? (
                  <span className="collision-checking">Checking...</span>
                ) : isSlugAvailable === false ? (
                  <span className="collision-warning">
                    <AlertTriangle size={13} />
                    <span>Already exists</span>
                  </span>
                ) : isSlugAvailable === true ? (
                  <span className="collision-available">
                    <Check size={13} />
                    <span>Available</span>
                  </span>
                ) : null}
              </div>
            </div>
            <div className="export-slug-input-wrapper">
              <span className="export-slug-prefix">recipes/</span>
              <input
                ref={recipeIdInputRef}
                id="recipe-slug-input"
                type="text"
                className={`export-slug-input ${isSlugAvailable === false ? 'has-collision' : ''}`}
                value={slugInput}
                onInput={e => handleSlugChange((e.target as HTMLInputElement).value)}
                onBlur={handleSlugBlur}
                placeholder="recipe-slug"
              />
            </div>
            <div className="export-reference-meta">
              <span className="export-reference-label">Title:</span>
              <span className="export-reference-value">{workspace.title || 'Untitled Recipe'}</span>
            </div>
          </div>

          {/* Download Data Option with Toggle Switch */}
          <div className="export-download-section">
            <label className="export-download-toggle-row" htmlFor="export-download-toggle">
              <span className="export-download-info">
                <Download size={15} className="export-download-icon" />
                <span className="export-download-title">Download offline copy</span>
              </span>
              <div className="studio-toggle-switch">
                <input
                  id="export-download-toggle"
                  type="checkbox"
                  className="studio-toggle-input"
                  checked={allowDownload}
                  onChange={e => setAllowDownload((e.target as HTMLInputElement).checked)}
                />
                <span className="studio-toggle-track">
                  <span className="studio-toggle-thumb" />
                </span>
              </div>
            </label>

            {allowDownload && (
              <div className="export-format-selector">
                <button
                  type="button"
                  className={`export-format-pill ${downloadFormat === 'json' ? 'is-active' : ''}`}
                  onClick={() => setDownloadFormat('json')}
                >
                  JSON (.json)
                </button>
                <button
                  type="button"
                  className={`export-format-pill ${downloadFormat === 'fablang' ? 'is-active' : ''}`}
                  onClick={() => setDownloadFormat('fablang')}
                >
                  F&Blang (.fablang)
                </button>
              </div>
            )}
          </div>

          {!isAuthorized && (
            <div className="export-error-banner" style={{ background: 'rgba(239, 68, 68, 0.12)', color: 'var(--color-red)' }}>
              <AlertTriangle size={14} />
              <span>You need Recipe Creator privileges to submit recipes for review. Apply in Support.</span>
            </div>
          )}

          {errorMessage && (
            <div className="export-error-banner">
              <AlertTriangle size={14} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <div className="studio-modal-footer">
          <button
            type="button"
            className="studio-btn studio-btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="studio-btn studio-btn-primary"
            onClick={handleExecutePublish}
            disabled={isSubmitting || isSlugAvailable === false || isCheckingCollision || !isAuthorized}
          >
            {isSubmitting
              ? 'Submitting...'
              : isAdmin
              ? 'Publish Recipe'
              : 'Submit for Review'}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalElement, document.body)
    : modalElement;
}

// Backward-compatibility alias
export { RequestPublishModal as ExportRecipeModal };
