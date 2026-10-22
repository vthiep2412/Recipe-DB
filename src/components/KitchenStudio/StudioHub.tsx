import { useState, useEffect } from 'preact/hooks';
import { Plus, Trash2, CookingPot, ArrowRight, Eye, Edit3, Send } from 'lucide-preact';
import type { StudioWorkspace } from '../../types/orchestration';
import type { CloudRecipe } from '../../types/cloud';
import { parseTextToStudioWorkspace } from '../../parser/orchestrationParser';
import { NewRecipeModal } from './NewRecipeModal';
import { authStore } from '../../services/authStore';
import { recipeStorageService } from '../../services/recipeStorageService';

const WORKSPACES_STORAGE_KEY = 'recipedb_studio_workspaces_v1';

interface StudioHubProps {
  onOpenWorkspace: (workspaceId: string) => void;
  onNavigate?: (path: string) => void;
}

export function StudioHub({ onOpenWorkspace, onNavigate }: StudioHubProps) {
  const [workspaces, setWorkspaces] = useState<StudioWorkspace[]>([]);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'sent'>('editor');
  const [sentRecipes, setSentRecipes] = useState<CloudRecipe[]>([]);
  const [sentLoading, setSentLoading] = useState(false);

  const authState = authStore.getState();
  const role = authState.role || authState.profile?.role;
  const isCreator = role === 'recipe_creator';

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

  useEffect(() => {
    if (activeTab === 'sent' && authState.user) {
      setSentLoading(true);
      recipeStorageService
        .listUserRecipes(authState.user.id)
        .then((list) => {
          setSentRecipes(list || []);
        })
        .catch(() => {
          setSentRecipes([]);
        })
        .finally(() => {
          setSentLoading(false);
        });
    }
  }, [activeTab, authState.user]);

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
        .map((w) => w.title || '')
        .filter((t) => /^Untitled Recipe(\s+\d+)?$/i.test(t));
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
    const updated = workspaces.filter((w) => w.id !== id);
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

        {activeTab === 'editor' && (
          <button
            type="button"
            className="studio-btn studio-btn-primary studio-hub-add-btn"
            onClick={() => setIsNewModalOpen(true)}
          >
            <Plus size={16} />
            <span>New Recipe Workspace</span>
          </button>
        )}
      </header>

      {/* Tabs for Creator Role */}
      {isCreator && (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            borderBottom: '1px solid var(--background-modifier-border)',
            marginBottom: '1.5rem',
          }}
        >
          <button
            type="button"
            className={`filter-pill ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor')}
            style={{ borderRadius: 'var(--radius-s) var(--radius-s) 0 0' }}
          >
            Editor Workspaces
          </button>
          <button
            type="button"
            className={`filter-pill ${activeTab === 'sent' ? 'active' : ''}`}
            onClick={() => setActiveTab('sent')}
            style={{ borderRadius: 'var(--radius-s) var(--radius-s) 0 0' }}
          >
            <Send size={14} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: '-0.1rem' }} />
            Sent Recipes
          </button>
        </div>
      )}

      {/* Tab 1: Editor Workspaces */}
      {activeTab === 'editor' && (
        <>
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
              {workspaces.map((ws) => (
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
                      onClick={(e) => handleDelete(ws.id, e)}
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
        </>
      )}

      {/* Tab 2: Sent Recipes (Creator Only) */}
      {activeTab === 'sent' && (
        <div>
          {sentLoading ? (
            <div className="admin-empty-state">Loading your submissions...</div>
          ) : sentRecipes.length === 0 ? (
            <div className="studio-hub-empty-card">
              <div className="studio-hub-empty-icon">
                <Send size={48} />
              </div>
              <h2>No Sent Recipes Yet</h2>
              <p>
                Once you finish editing a recipe in your canvas, use "Submit for Review" to send it to moderators.
              </p>
              <button
                type="button"
                className="studio-btn studio-btn-primary"
                onClick={() => setActiveTab('editor')}
              >
                <span>Back to Workspaces</span>
              </button>
            </div>
          ) : (
            <table className="data-table" style={{ background: 'var(--background-secondary)', borderRadius: 'var(--radius-m)', overflow: 'hidden' }}>
              <thead>
                <tr>
                  <th>Recipe</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sentRecipes.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                        {r.slug || r.id}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          r.status === 'approved'
                            ? 'badge-approved'
                            : r.status === 'rejected'
                            ? 'badge-rejected'
                            : 'badge-pending'
                        }`}
                      >
                        {r.status === 'approved'
                          ? 'Approved'
                          : r.status === 'rejected'
                          ? 'Revision Needed'
                          : 'Pending Review'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="row-action-btn accent"
                          onClick={() => {
                            if (onNavigate) {
                              onNavigate(`/recipes/${r.slug || r.id}`);
                            }
                          }}
                        >
                          <Eye size={13} /> View
                        </button>
                        <button
                          type="button"
                          className="row-action-btn"
                          onClick={() => onOpenWorkspace(r.id)}
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <NewRecipeModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onConvert={(rawText) => handleCreateNew(rawText)}
        onGoStraight={() => handleCreateNew('')}
      />
    </div>
  );
}
