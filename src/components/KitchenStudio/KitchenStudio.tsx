import { useState, useEffect } from 'preact/hooks';
import { authStore } from '../../services/authStore';
import { recipeStorageService } from '../../services/recipeStorageService';
import type { StudioWorkspace } from '../../types/orchestration';
import { parseTextToStudioWorkspace } from '../../parser/orchestrationParser';
import { StudioHub } from './StudioHub';
import { KitchenCanvas } from './KitchenCanvas';
import { WorkspaceStorageService } from '../../services/workspaceStorageService';
import '../../styles/kitchen-studio.css';

interface KitchenStudioProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

function toSlug(text?: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function KitchenStudio({ currentPath, onNavigate }: KitchenStudioProps) {
  const [authState, setAuthState] = useState(authStore.getState());
  const [activeWorkspace, setActiveWorkspace] = useState<StudioWorkspace | null>(null);

  useEffect(() => {
    return authStore.subscribe(setAuthState);
  }, []);

  const isMakingRecipe = currentPath.startsWith('/kitchen-studio/making-recipe/');
  const activeWorkspaceId = isMakingRecipe
    ? currentPath.replace('/kitchen-studio/making-recipe/', '')
    : null;

  useEffect(() => {
    if (!authState.user || !activeWorkspaceId) {
      setActiveWorkspace(null);
      return;
    }

    let isCancelled = false;
    WorkspaceStorageService.loadWorkspaces()
      .then((list) => {
          if (isCancelled) return;
          const targetSlug = toSlug(activeWorkspaceId);
          const found = list.find((w) =>
            w.id === activeWorkspaceId ||
            w.graph?.id === activeWorkspaceId ||
            (targetSlug && toSlug(w.graph?.id) === targetSlug) ||
            (targetSlug && toSlug(w.title) === targetSlug)
          );
          if (found) {
            setActiveWorkspace(found);
            return;
          }

          // If not found in storage, attempt to fetch from cloud before initializing fresh
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
                    ...(ast?.graph || {}),
                    id: cloudData.recipe.slug || cloudData.recipe.id,
                    title: cloudData.recipe.title,
                    description: cloudData.recipe.description,
                    importantNotes: cloudData.details.importantNotes,
                    media: {
                      ...baseWorkspace.graph.media,
                      ...(ast?.graph?.media || {}),
                      pictureUrl: cloudData.recipe.imageUrl || ast?.graph?.media?.pictureUrl,
                    },
                    sections: ast?.sections || baseWorkspace.graph.sections,
                  },
                  sections: ast?.sections || baseWorkspace.sections,
                  canvasNodes: ast?.canvasNodes || baseWorkspace.canvasNodes,
                  customIngredients: (cloudData.details.ingredientsIndex as any[]) || baseWorkspace.customIngredients,
                  customCookware: (cloudData.details.cookwareIndex as any[]) || baseWorkspace.customCookware,
                };

                const cloudSlug = cloudData.recipe.slug ? toSlug(cloudData.recipe.slug) : '';
                const updatedList = [...list];
                const idx = updatedList.findIndex((w) =>
                  w.id === recoveredWorkspace.id ||
                  w.id === activeWorkspaceId ||
                  w.graph?.id === recoveredWorkspace.id ||
                  (cloudSlug && toSlug(w.graph?.id) === cloudSlug) ||
                  (cloudSlug && toSlug(w.title) === cloudSlug)
                );
                if (idx !== -1) {
                  updatedList[idx] = recoveredWorkspace;
                } else {
                  updatedList.unshift(recoveredWorkspace);
                }
                void WorkspaceStorageService.saveWorkspaces(updatedList);
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
  }, [activeWorkspaceId, authState.user]);

  const handleUpdateWorkspace = (updated: StudioWorkspace): boolean => {
    const timestamped: StudioWorkspace = {
      ...updated,
      updatedAt: new Date().toISOString()
    };
    setActiveWorkspace(timestamped);

    if (activeWorkspaceId && timestamped.id !== activeWorkspaceId) {
      window.history.replaceState(null, '', `/kitchen-studio/making-recipe/${timestamped.id}`);
    }

    const findMatchIndex = (list: StudioWorkspace[]) => {
      return list.findIndex((w) =>
        w.id === timestamped.id ||
        (activeWorkspaceId && w.id === activeWorkspaceId) ||
        (timestamped.graph?.id && w.graph?.id === timestamped.graph.id) ||
        (w.graph?.id && w.graph.id === timestamped.id) ||
        (w.id && timestamped.graph?.id === w.id) ||
        (timestamped.title && w.title && toSlug(w.title) === toSlug(timestamped.title) && !/^untitled/i.test(w.title))
      );
    };

    const cached = WorkspaceStorageService.getCachedWorkspaces();
    if (cached) {
      const updatedList = [...cached];
      const idx = findMatchIndex(updatedList);
      if (idx !== -1) {
        updatedList[idx] = timestamped;
      } else {
        updatedList.unshift(timestamped);
      }
      void WorkspaceStorageService.saveWorkspaces(updatedList);
    } else {
      WorkspaceStorageService.loadWorkspaces()
        .then((list) => {
          const updatedList = [...list];
          const idx = findMatchIndex(updatedList);
          if (idx !== -1) {
            updatedList[idx] = timestamped;
          } else {
            updatedList.unshift(timestamped);
          }
          void WorkspaceStorageService.saveWorkspaces(updatedList);
        })
        .catch(() => {});
    }
    return true;
  };

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
