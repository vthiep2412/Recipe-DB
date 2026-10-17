import { useState, useMemo, useRef, useEffect } from 'preact/hooks';
import { ChevronDown, ChevronUp } from 'lucide-preact';
import type { RecipeGraph, StudioWorkspace } from '../../types/orchestration';
import { recipeGraphToRecipeJSON } from '../../parser/graphAdapter';
import { generateFablang } from '../../parser/fablangGenerator';
import { RecipeDetailView } from '../RecipeDetailView';

interface PreviewDrawerProps {
  graph: RecipeGraph;
  workspace: StudioWorkspace;
}

type PreviewTab = 'viewer' | 'fablang' | 'json';

export function PreviewDrawer({ graph, workspace }: PreviewDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PreviewTab>('viewer');
  const [drawerHeightPx, setDrawerHeightPx] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const clickTimeoutRef = useRef<number | null>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      if (pointerCleanupRef.current) {
        pointerCleanupRef.current();
      }
    };
  }, []);

  // Live recipe conversions
  const adaptedRecipe = useMemo(() => {
    return recipeGraphToRecipeJSON(graph);
  }, [graph]);

  const fablangCode = useMemo(() => {
    return generateFablang(graph, workspace.canvasNodes, workspace);
  }, [graph, workspace]);

  const jsonString = useMemo(() => {
    return JSON.stringify(graph, null, 2);
  }, [graph]);

  // Height resize handling with vertical cursor
  const handleStartResize = (e: PointerEvent) => {
    e.stopPropagation();
    if (e.detail === 2) {
      handleDoubleClickBar(e as unknown as MouseEvent);
      return;
    }

    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch (_) {}

    const startY = e.clientY;
    const canvasEl = document.querySelector('.kitchen-canvas-viewport');
    const maxAvailable = canvasEl ? canvasEl.clientHeight - 55 : (window.innerHeight - 110);
    const startH = drawerHeightPx !== null ? drawerHeightPx : maxAvailable;

    setIsResizing(true);

    const cleanup = () => {
      setIsResizing(false);
      try {
        target.releasePointerCapture(e.pointerId);
      } catch (_) {}
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      pointerCleanupRef.current = null;
    };

    const handlePointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const deltaY = startY - ev.clientY;
      const newH = Math.min(maxAvailable, Math.max(160, startH + deltaY));
      setDrawerHeightPx(newH);
    };

    const handlePointerUp = () => {
      cleanup();
    };

    pointerCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Double click toggles between full canvas and half canvas
  const handleDoubleClickBar = (e: MouseEvent) => {
    e.stopPropagation();
    const canvasEl = document.querySelector('.kitchen-canvas-viewport');
    const maxAvailable = canvasEl ? canvasEl.clientHeight - 55 : (window.innerHeight - 110);

    if (drawerHeightPx === null || drawerHeightPx >= maxAvailable - 20) {
      setDrawerHeightPx(Math.round(maxAvailable * 0.5));
    } else {
      setDrawerHeightPx(null);
    }
  };

  const handleBarClick = () => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      return;
    }
    clickTimeoutRef.current = window.setTimeout(() => {
      clickTimeoutRef.current = null;
      setIsOpen(prev => !prev);
    }, 220);
  };

  const handleBarDoubleClick = (e: MouseEvent) => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    handleDoubleClickBar(e);
  };

  const computedHeightStyle = isOpen
    ? drawerHeightPx !== null
      ? `${drawerHeightPx}px`
      : 'calc(100% - 3.4rem)'
    : '2.6rem';

  return (
    <div
      className={`studio-preview-drawer ${isOpen ? 'is-open' : 'is-collapsed'} ${isResizing ? 'is-resizing' : ''}`}
      style={{ height: computedHeightStyle }}
      onMouseDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
    >
      {/* Top Border Vertical Drag Resizer */}
      {isOpen && (
        <div
          className={`preview-drawer-resizer ${isResizing ? 'is-resizing' : ''}`}
          onPointerDown={handleStartResize}
          onDblClick={handleBarDoubleClick}
          title="Drag up or down to resize height (double click to toggle full height)"
        />
      )}

      {/* Drawer Bar - Full area touch to toggle open and close */}
      <div
        className="preview-drawer-bar"
        onClick={handleBarClick}
        onDblClick={isOpen ? handleBarDoubleClick : undefined}
      >
        <div className="preview-drawer-title">
          <span className="preview-drawer-indicator">
            {isOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </span>
          <span>Preview</span>
        </div>

        {/* Pill Tabs on the right, appears only when open */}
        {isOpen && (
          <div
            className="preview-drawer-pill-tabs"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className={`preview-drawer-pill-tab ${activeTab === 'viewer' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('viewer')}
            >
              Viewer
            </button>
            <button
              type="button"
              className={`preview-drawer-pill-tab ${activeTab === 'fablang' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('fablang')}
            >
              F&amp;Blang
            </button>
            <button
              type="button"
              className={`preview-drawer-pill-tab ${activeTab === 'json' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('json')}
            >
              JSON
            </button>
          </div>
        )}
      </div>

      {/* Drawer Content */}
      {isOpen && (
        <div className="preview-drawer-body">
          {activeTab === 'viewer' && (
            <div className="preview-drawer-viewer-scroll">
              <RecipeDetailView recipe={adaptedRecipe} />
            </div>
          )}

          {activeTab === 'fablang' && (
            <div className="preview-drawer-code-scroll">
              <pre className="preview-drawer-code">{fablangCode}</pre>
            </div>
          )}

          {activeTab === 'json' && (
            <div className="preview-drawer-code-scroll">
              <pre className="preview-drawer-code">{jsonString}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
