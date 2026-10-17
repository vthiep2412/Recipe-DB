import { useState, useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Check, AlertTriangle, Download, X } from 'lucide-preact';
import type { StudioWorkspace, RecipeGraph } from '../../types/orchestration';
import { slugifyRecipeTitle, recipeStorageService, CollisionCheckResult } from '../../services/recipeStorageService';
import { generateFablang } from '../../parser/fablangGenerator';

interface ExportRecipeModalProps {
  isOpen: boolean;
  workspace: StudioWorkspace;
  finalGraph: RecipeGraph;
  onClose: () => void;
  onExportSuccess: (slug: string, filePath?: string) => void;
}

export function ExportRecipeModal({
  isOpen,
  workspace,
  finalGraph,
  onClose,
  onExportSuccess
}: ExportRecipeModalProps) {
  const [slugInput, setSlugInput] = useState('');
  const recipeIdInputRef = useRef<HTMLInputElement>(null);
  const [isCheckingCollision, setIsCheckingCollision] = useState(false);
  const [collisionResult, setCollisionResult] = useState<CollisionCheckResult>({ isTaken: false });
  const [allowDownload, setAllowDownload] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'json' | 'fablang'>('json');
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize Recipe Id when opening
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);

      // Check if workspace or graph already has an assigned recipe ID
      const candidateId = (workspace.graph?.id || workspace.id || '').trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId);
      const isGenericWorkspace = candidateId.startsWith('workspace-');
      const isGenericUntitled = /^untitled(-recipe)?(\s*\d+)?$/i.test(candidateId);
      const hasSpecificId = candidateId && !isUuid && !isGenericWorkspace && !isGenericUntitled;

      if (hasSpecificId) {
        setSlugInput(candidateId);
        checkSlug(candidateId);
      } else {
        const rawTitle = (workspace.title || '').trim();
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
    setIsCheckingCollision(true);
    try {
      const res = await recipeStorageService.checkSlugCollision(candidate, workspace.id);
      setCollisionResult(res);
    } catch {
      setCollisionResult({ isTaken: false });
    } finally {
      setIsCheckingCollision(false);
    }
  };

  const handleSlugChange = (raw: string) => {
    // Preserve active typing without overwriting with untitled or stripping trailing hyphens
    const sanitized = raw.toLowerCase().replace(/[^a-z0-9-_\s]/g, '').replace(/\s+/g, '-');
    setSlugInput(sanitized);
    const cleaned = sanitized.replace(/^-+|-+$/g, '');
    if (cleaned) {
      checkSlug(cleaned);
    } else {
      setCollisionResult({ isTaken: false });
    }
  };

  const handleSlugBlur = async () => {
    const cleaned = slugInput.trim().replace(/^-+|-+$/g, '');
    if (!cleaned) {
      // Assign next numbered untitled slug if left blank
      const nextUntitled = await recipeStorageService.getNextAvailableUntitledSlug(workspace.id);
      setSlugInput(nextUntitled);
      checkSlug(nextUntitled);
    } else if (cleaned !== slugInput) {
      setSlugInput(cleaned);
      checkSlug(cleaned);
    }
  };

  if (!isOpen) return null;

  const handleExecuteExport = async () => {
    let targetSlug = slugInput.trim().replace(/^-+|-+$/g, '');
    if (!targetSlug) {
      targetSlug = await recipeStorageService.getNextAvailableUntitledSlug(workspace.id);
      setSlugInput(targetSlug);
    }

    if (collisionResult.isTaken) {
      setErrorMessage(`Recipe Id "${targetSlug}" already exists. Overwrite is not allowed.`);
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);

    try {
      // 1. Download file locally if user checked the download checkbox
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

      // 2. Save recipe to src/recipes/ via Vite endpoint
      const result = await recipeStorageService.saveRecipe(targetSlug, finalGraph);

      if (result.ok) {
        onExportSuccess(targetSlug, result.path);
        onClose();
      } else {
        setErrorMessage(result.error || 'Failed to save recipe to src/recipes');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Export error occurred');
    } finally {
      setIsExporting(false);
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
        aria-labelledby="export-modal-title"
      >
        <div className="studio-modal-header">
          <h2 id="export-modal-title">Export Recipe</h2>
          <button
            type="button"
            className="studio-modal-close"
            onClick={onClose}
            aria-label="Close export modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="studio-modal-body">
          {/* Recipe Id Input with Live Collision Indicator */}
          <div className="export-field-group">
            <div className="export-field-header-row">
              <label className="export-field-label" htmlFor="recipe-slug-input">
                Recipe Id
              </label>
              <div className="export-collision-status">
                {isCheckingCollision ? (
                  <span className="collision-checking">Checking...</span>
                ) : collisionResult.isTaken ? (
                  <span className="collision-warning">
                    <AlertTriangle size={13} />
                    <span>Already exists</span>
                  </span>
                ) : (
                  <span className="collision-available">
                    <Check size={13} />
                    <span>Available</span>
                  </span>
                )}
              </div>
            </div>
            <div className="export-slug-input-wrapper">
              <span className="export-slug-prefix">src/recipes/</span>
              <input
                ref={recipeIdInputRef}
                id="recipe-slug-input"
                type="text"
                className={`export-slug-input ${collisionResult.isTaken ? 'has-collision' : ''}`}
                value={slugInput}
                onInput={e => handleSlugChange((e.target as HTMLInputElement).value)}
                onBlur={handleSlugBlur}
                placeholder="recipe-id"
              />
              <span className="export-slug-ext">.json</span>
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
                <span className="export-download-title">Download recipe copy</span>
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
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="studio-btn studio-btn-primary"
            onClick={handleExecuteExport}
            disabled={isExporting || collisionResult.isTaken || isCheckingCollision}
          >
            {isExporting ? 'Exporting...' : 'Export & Save'}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalElement, document.body)
    : modalElement;
}
