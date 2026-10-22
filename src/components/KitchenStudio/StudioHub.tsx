import { useState, useEffect } from 'preact/hooks';
import { Plus, Trash2, CookingPot, ArrowRight, Clock, CheckCircle, XCircle } from 'lucide-preact';
import type { StudioWorkspace } from '../../types/orchestration';
import { parseTextToStudioWorkspace } from '../../parser/orchestrationParser';
import { NewRecipeModal } from './NewRecipeModal';
import { supabase } from '../../services/supabaseClient';
import { authUser } from '../../services/authStore';

const WORKSPACES_STORAGE_KEY = 'recipedb_studio_workspaces_v1';

interface StudioHubProps {
  onOpenWorkspace: (workspaceId: string) => void;
}

interface SentRecipe {
  id: string;
  slug: string | null;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export function StudioHub({ onOpenWorkspace }: StudioHubProps) {
  const [activeTab, setActiveTab] = useState<'editor' | 'sent'>('editor');
  const [workspaces, setWorkspaces] = useState<StudioWorkspace[]>([]);
  const [sentRecipes, setSentRecipes] = useState<SentRecipe[]>([]);
  const [loadingSent, setLoadingSent] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  const user = authUser.value;

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
    if (activeTab === 'sent' && user) {
      fetchSentRecipes();
    }
  }, [activeTab, user]);

  const fetchSentRecipes = async () => {
    if (!user) return;
    setLoadingSent(true);
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, slug, title, status, created_at')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setSentRecipes(data as SentRecipe[]);
      }
    } catch (err) {
      console.error('Error fetching sent recipes:', err);
    } finally {
      setLoadingSent(false);
    }
  };

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

  const renderStatusBadge = (status: 'pending' | 'approved' | 'rejected') => {
    switch (status) {
      case 'approved':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#33a058', fontSize: '0.8125rem', fontWeight: 600 }}>
            <CheckCircle size={14} /> Approved
          </span>
        );
      case 'rejected':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#ef4444', fontSize: '0.8125rem', fontWeight: 600 }}>
            <XCircle size={14} /> Rejected
          </span>
        );
      case 'pending':
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#ff7a00', fontSize: '0.8125rem', fontWeight: 600 }}>
            <Clock size={14} /> Pending Review
          </span>
        );
    }
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
        <button
          type="button"
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'editor' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'editor' ? 'var(--text)' : 'var(--text-muted)',
            padding: '0.75rem 1rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
          onClick={() => setActiveTab('editor')}
        >
          Editor Workspaces
        </button>
        <button
          type="button"
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'sent' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'sent' ? 'var(--text)' : 'var(--text-muted)',
            padding: '0.75rem 1rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
          onClick={() => setActiveTab('sent')}
        >
          Sent Recipes
        </button>
      </div>

      {activeTab === 'editor' ? (
        workspaces.length === 0 ? (
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
        )
      ) : (
        /* Sent Recipes Tab */
        loadingSent ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading submissions...</div>
        ) : sentRecipes.length === 0 ? (
          <div className="studio-hub-empty-card">
            <h2>No Sent Recipes Found</h2>
            <p>You haven't submitted any recipes to the cloud yet.</p>
          </div>
        ) : (
          <div className="studio-workspaces-grid">
            {sentRecipes.map(recipe => (
              <div key={recipe.id} className="studio-workspace-card" style={{ cursor: 'default' }}>
                <div className="workspace-card-header">
                  <h2 className="workspace-card-title">{recipe.title}</h2>
                  {renderStatusBadge(recipe.status)}
                </div>

                <div className="workspace-card-meta">
                  <span>Submitted {new Date(recipe.created_at).toLocaleDateString()}</span>
                </div>

                {recipe.slug && recipe.status === 'approved' && (
                  <div className="workspace-card-action" style={{ marginTop: '0.5rem' }}>
                    <a href={`/recipes/${recipe.slug}`} className="workspace-open-link">
                      <span>View Recipe</span>
                      <ArrowRight size={14} />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
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
