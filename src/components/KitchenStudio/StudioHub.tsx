import { useState, useEffect } from 'preact/hooks';
import { Plus, Trash2, CookingPot, ArrowRight } from 'lucide-preact';
import type { StudioWorkspace } from '../../types/orchestration';
import { parseTextToStudioWorkspace } from '../../parser/orchestrationParser';
import { NewRecipeModal } from './NewRecipeModal';

const WORKSPACES_STORAGE_KEY = 'recipedb_studio_workspaces_v1';

interface StudioHubProps {
  onOpenWorkspace: (workspaceId: string) => void;
}

export function StudioHub({ onOpenWorkspace }: StudioHubProps) {
  const [workspaces, setWorkspaces] = useState<StudioWorkspace[]>([]);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
      if (raw) {
        setWorkspaces(JSON.parse(raw));
      }
    } catch {
      setWorkspaces([]);
    }
  }, []);

  const saveWorkspaces = (updated: StudioWorkspace[]) => {
    setWorkspaces(updated);
    try {
      localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Storage quota fallback
    }
  };

  const handleCreateNew = (rawText = '') => {
    const newWs = parseTextToStudioWorkspace(rawText);
    if (!rawText.trim()) {
      const existingUntitled = workspaces
        .map(w => w.title || '')
        .filter(t => /^Untitled Recipe(\s+\d+)?$/i.test(t));
      if (existingUntitled.length > 0) {
        newWs.title = `Untitled Recipe ${existingUntitled.length + 1}`;
        newWs.graph.title = newWs.title;
      }
    }
    const updated = [newWs, ...workspaces];
    saveWorkspaces(updated);
    setIsNewModalOpen(false);
    onOpenWorkspace(newWs.id);
  };

  const handleDelete = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    const updated = workspaces.filter(w => w.id !== id);
    saveWorkspaces(updated);
  };

  return (
    <div className="studio-hub-container">
      <header className="studio-hub-header">
        <div>
          <h1 className="studio-hub-title">Kitchen Studio</h1>
          <p className="studio-hub-subtitle">
            Visual recipe graph canvas and Cooklang orchestration workbench
          </p>
        </div>
        <button
          type="button"
          className="studio-btn studio-btn-primary studio-hub-add-btn"
          onClick={() => setIsNewModalOpen(true)}
        >
          <Plus size={16} />
          <span>New Recipe Workspace</span>
        </button>
      </header>

      {workspaces.length === 0 ? (
        <div className="studio-hub-empty-card">
          <div className="studio-hub-empty-icon">
            <CookingPot size={48} />
          </div>
          <h2>No Recipe Workspaces Yet</h2>
          <p>
            Start from scratch or paste your Cooklang or recipe markdown to generate an interactive
            canvas graph.
          </p>
          <button
            type="button"
            className="studio-btn studio-btn-primary"
            onClick={() => setIsNewModalOpen(true)}
          >
            <Plus size={16} />
            <span>Create Your First Recipe</span>
          </button>
        </div>
      ) : (
        <div className="studio-workspaces-grid">
          {workspaces.map(ws => (
            <div
              key={ws.id}
              className="studio-workspace-card"
              onClick={() => onOpenWorkspace(ws.id)}
            >
              <div className="workspace-card-header">
                <h2 className="workspace-card-title">{ws.title || 'Untitled Recipe'}</h2>
                <button
                  type="button"
                  className="workspace-card-delete"
                  onClick={e => handleDelete(ws.id, e)}
                  title="Delete workspace"
                  aria-label="Delete workspace"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="workspace-card-meta">
                <span>{ws.canvasNodes.length} steps</span>
                <span>•</span>
                <span>Updated {new Date(ws.updatedAt).toLocaleDateString()}</span>
              </div>

              <div className="workspace-card-action">
                <span className="workspace-open-link">
                  <span>Open Canvas</span>
                  <ArrowRight size={14} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewRecipeModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onConvert={rawText => handleCreateNew(rawText)}
        onGoStraight={() => handleCreateNew('')}
      />
    </div>
  );
}
