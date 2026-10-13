import { useState, useEffect } from 'preact/hooks';
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
      const fresh = parseTextToStudioWorkspace('', activeWorkspaceId);
      setActiveWorkspace(fresh);
    } else {
      setActiveWorkspace(null);
    }
  }, [activeWorkspaceId]);

  const handleUpdateWorkspace = (updated: StudioWorkspace) => {
    setActiveWorkspace(updated);
    try {
      const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
      const list: StudioWorkspace[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex(w => w.id === updated.id);
      if (idx !== -1) {
        list[idx] = updated;
      } else {
        list.unshift(updated);
      }
      localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Storage fallback
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
      onOpenWorkspace={id => onNavigate(`/kitchen-studio/making-recipe/${id}`)}
    />
  );
}
