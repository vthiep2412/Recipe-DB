import type { RecipeGraph, StudioWorkspace } from '../types/orchestration';
import type { RecipeJSON } from '../types/recipe';
import { getAllRecipes } from '../recipes';

/**
 * Normalizes any recipe title into a URL and filesystem friendly kebab-case slug
 */
export function slugifyRecipeTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface CollisionCheckResult {
  isTaken: boolean;
  source?: 'disk' | 'workspace' | 'remote';
  existingTitle?: string;
}

export interface RecipeStorageProvider {
  checkSlugCollision(slug: string, currentWorkspaceId?: string): Promise<CollisionCheckResult>;
  getNextAvailableUntitledSlug(currentWorkspaceId?: string): Promise<string>;
  saveRecipe(
    slug: string,
    data: RecipeGraph | RecipeJSON,
    options?: { overwrite?: boolean; format?: 'json' | 'fablang' }
  ): Promise<{ ok: boolean; path?: string; error?: string }>;
}

const WORKSPACES_STORAGE_KEY = 'recipedb_studio_workspaces_v1';

/**
 * Local Recipe Storage Provider: checks disk registry and localStorage workspaces
 * Structured for direct extension with Supabase queries
 */
export class LocalRecipeStorageProvider implements RecipeStorageProvider {
  async checkSlugCollision(slug: string, currentWorkspaceId?: string): Promise<CollisionCheckResult> {
    const cleanSlug = slugifyRecipeTitle(slug);
    if (!cleanSlug) {
      return { isTaken: false };
    }

    // 1. Check disk recipes in memory registry
    try {
      const diskRecipes = getAllRecipes();
      const matchOnDisk = diskRecipes.find(r => {
        const idMatch = slugifyRecipeTitle(r.id) === cleanSlug;
        const titleMatch = slugifyRecipeTitle(r.title) === cleanSlug;
        return idMatch || titleMatch;
      });

      if (matchOnDisk) {
        return {
          isTaken: true,
          source: 'disk',
          existingTitle: matchOnDisk.title
        };
      }
    } catch {
      // In case getAllRecipes is called during static builds
    }

    // 2. Check local storage studio workspaces
    try {
      const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
      if (raw) {
        const workspaces: StudioWorkspace[] = JSON.parse(raw);
        const matchWs = workspaces.find(w => {
          if (currentWorkspaceId && w.id === currentWorkspaceId) return false;
          return slugifyRecipeTitle(w.title) === cleanSlug;
        });

        if (matchWs) {
          return {
            isTaken: true,
            source: 'workspace',
            existingTitle: matchWs.title
          };
        }
      }
    } catch {
      // Storage access fallback
    }

    return { isTaken: false };
  }

  async getNextAvailableUntitledSlug(currentWorkspaceId?: string): Promise<string> {
    const base = 'untitled-recipe';
    const firstCheck = await this.checkSlugCollision(base, currentWorkspaceId);
    if (!firstCheck.isTaken) {
      return base;
    }

    let count = 1;
    while (count < 1000) {
      const candidate = `${base}-${count}`;
      const res = await this.checkSlugCollision(candidate, currentWorkspaceId);
      if (!res.isTaken) {
        return candidate;
      }
      count++;
    }
    return `${base}-${Date.now()}`;
  }

  async saveRecipe(
    slug: string,
    data: RecipeGraph | RecipeJSON,
    _options?: { overwrite?: boolean; format?: 'json' | 'fablang' }
  ): Promise<{ ok: boolean; path?: string; error?: string }> {
    const finalData = { ...data, id: slug };
    const jsonString = JSON.stringify(finalData, null, 2);

    try {
      const res = await fetch('/api/save-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonString
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { ok: false, error: errJson?.error || `HTTP error ${res.status}` };
      }

      const resJson = await res.json();
      return { ok: Boolean(resJson.ok), path: resJson.filePath };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to save recipe' };
    }
  }
}

export const recipeStorageService = new LocalRecipeStorageProvider();
