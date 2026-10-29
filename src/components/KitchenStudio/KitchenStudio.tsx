import { useState, useEffect } from 'preact/hooks';
import { authStore } from '../../services/authStore';
import { recipeStorageService } from '../../services/recipeStorageService';
import type { StudioWorkspace } from '../../types/orchestration';
import { parseTextToStudioWorkspace } from '../../parser/orchestrationParser';
import { StudioHub } from './StudioHub';
import { KitchenCanvas } from './KitchenCanvas';
import '../../styles/kitchen-studio.css';

const WORKSPACES_STORAGE_KEY = 'recipedb_studio_workspaces_v1';

interface KitchenStudioProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function KitchenStudio({ currentPath, onNavigate }: KitchenStudioProps) {
  const authState = authStore.getState();
  if (authState.isAuthLoading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <p style={{ color: 'var(--text-muted)' }}>Checking authorization...</p>
      </div>
    );
  }
  if (!authState.user) {
    return null;
  }
  const [activeWorkspace, setActiveWorkspace] = useState<StudioWorkspace | null>(null);

  const isMakingRecipe = currentPath.startsWith('/kitchen-studio/making-recipe/');
  const activeWorkspaceId = isMakingRecipe
    ? currentPath.replace('/kitchen-studio/making-recipe/', '')
    : null;

  useEffect(() => {
    if (activeWorkspaceId) {
      try {
        const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
        if (raw) {
          const list: StudioWorkspace[] = JSON.parse(raw);
          const found = list.find(w => w.id === activeWorkspaceId);
          if (found) {
            setActiveWorkspace(found);
            return;
          }
        }
      } catch {
        // Fallback
      }

      // If not found in storage, initialize fresh workspace
      // If not found in storage, attempt to fetch from cloud before initializing fresh
      let isCancelled = false;
      recipeStorageService
        .fetchRecipeBySlugOrId(activeWorkspaceId)
        .then((cloudData) => {
          if (isCancelled) return;
          if (cloudData) {
            const ast = cloudData.details.sectionsAst as any;
            const baseWorkspace = parseTextToStudioWorkspace('', cloudData.recipe.id);
            const recoveredWorkspace: StudioWorkspace = {
              ...baseWorkspace,
              id: cloudData.recipe.id,
              title: cloudData.recipe.title,
              createdAt: cloudData.recipe.createdAt,
              updatedAt: cloudData.recipe.updatedAt,
              graph: {
                ...baseWorkspace.graph,
                id: cloudData.recipe.slug || cloudData.recipe.id,
                title: cloudData.recipe.title,
                description: cloudData.recipe.description,
                importantNotes: cloudData.details.importantNotes,
                media: {
                  ...baseWorkspace.graph.media,
                  pictureUrl: cloudData.recipe.imageUrl,
                },
                sections: ast?.sections || baseWorkspace.graph.sections,
              },
              sections: ast?.sections || baseWorkspace.sections,
              canvasNodes: ast?.canvasNodes || baseWorkspace.canvasNodes,
              customIngredients: (cloudData.details.ingredientsIndex as any[]) || baseWorkspace.customIngredients,
              customCookware: (cloudData.details.cookwareIndex as any[]) || baseWorkspace.customCookware,
            };
            try {
              const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
              const list: StudioWorkspace[] = raw ? JSON.parse(raw) : [];
              const idx = list.findIndex((w) => w.id === recoveredWorkspace.id);
              if (idx !== -1) {
                list[idx] = recoveredWorkspace;
              } else {
                list.unshift(recoveredWorkspace);
              }
              localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(list));
            } catch {
              // Storage write fallback
            }
            setActiveWorkspace(recoveredWorkspace);
            return;
          }

          const fresh = parseTextToStudioWorkspace('', activeWorkspaceId);
          setActiveWorkspace(fresh);
        })
        .catch(() => {
          if (!isCancelled) {
            const fresh = parseTextToStudioWorkspace('', activeWorkspaceId);
            setActiveWorkspace(fresh);
          }
        });

      return () => {
        isCancelled = true;
      };

    } else {
      setActiveWorkspace(null);
    }
  }, [activeWorkspaceId]);

  const handleUpdateWorkspace = (updated: StudioWorkspace): boolean => {
    const timestamped: StudioWorkspace = {
      ...updated,
      updatedAt: new Date().toISOString()
    };
    setActiveWorkspace(timestamped);
    try {
      const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
      const list: StudioWorkspace[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex(w => w.id === timestamped.id);
      if (idx !== -1) {
        list[idx] = timestamped;
      } else {
        list.unshift(timestamped);
      }
      localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  };

  if (isMakingRecipe && activeWorkspace) {
    return (
      <KitchenCanvas
        workspace={activeWorkspace}
        onUpdateWorkspace={handleUpdateWorkspace}
        onBackToHub={() => onNavigate('/kitchen-studio')}
      />
    );
  }

  return (
    <StudioHub
      onNavigate={onNavigate}
      onOpenWorkspace={id => onNavigate(`/kitchen-studio/making-recipe/${id}`)}
    />
  );
}
