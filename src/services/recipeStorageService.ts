import type { RecipeGraph, StudioWorkspace } from '../types/orchestration';
import type { RecipeJSON } from '../types/recipe';
import type {
  CloudRecipe,
  CloudRecipeDetails,
  CloudRecipeStatus,
  CloudRecipeStorageAPI
} from '../types/cloud';
import { getAllRecipes } from '../recipes';
import { supabase } from './supabaseClient';
import { authStore } from './authStore';
import { localMediaStore } from './localMediaStore';
import { uploadAsset } from './cloudinaryUpload';

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

function mapRecipeRow(row: any): CloudRecipe {
  return {
    id: row.id,
    slug: row.slug ?? null,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description ?? '',
    imageUrl: row.image_url ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: (row.status as CloudRecipeStatus) || 'pending',
    saveCount: Number(row.save_count || 0),
    comments: Array.isArray(row.comments) ? row.comments : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRecipeDetailsRow(row: any): CloudRecipeDetails {
  return {
    recipeId: row.recipe_id,
    sectionsAst: (row.sections_ast as Record<string, unknown>) || {},
    ingredientsIndex: Array.isArray(row.ingredients_index) ? row.ingredients_index : [],
    cookwareIndex: Array.isArray(row.cookware_index) ? row.cookware_index : [],
    rawFablang: row.raw_fablang ?? '',
    importantNotes: row.important_notes ?? ''
  };
}

async function uploadAllLocalRefsInWorkspace(workspace: StudioWorkspace): Promise<StudioWorkspace> {
  const jsonStr = JSON.stringify(workspace);
  const idbRegex = /"idb:([^"]+)"/g;
  const matches = [...jsonStr.matchAll(idbRegex)];
  if (matches.length === 0) {
    return workspace;
  }

  const replacementMap = new Map<string, string>();
  for (const match of matches) {
    const rawKey = match[1];
    const fullKey = `idb:${rawKey}`;
    if (!replacementMap.has(fullKey)) {
      try {
        const blob = (await localMediaStore.loadBlob(fullKey)) || (await localMediaStore.loadBlob(rawKey));
        if (blob) {
          const uploaded = await uploadAsset(blob, 'image', 'recipes/images');
          replacementMap.set(fullKey, uploaded.secure_url);
        }
      } catch {
        // Fallback for offline or unreachable asset
      }
    }
  }

  if (replacementMap.size === 0) {
    return workspace;
  }

  let updatedJson = jsonStr;
  for (const [key, secureUrl] of replacementMap.entries()) {
    updatedJson = updatedJson.split(`"${key}"`).join(`"${secureUrl}"`);
  }

  return JSON.parse(updatedJson) as StudioWorkspace;
}

export class LocalRecipeStorageProvider implements RecipeStorageProvider {
  async checkSlugCollision(slug: string, currentWorkspaceId?: string): Promise<CollisionCheckResult> {
    const cleanSlug = slugifyRecipeTitle(slug);
    if (!cleanSlug) {
      return { isTaken: false };
    }

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
      // Disk lookup fallback
    }

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

export class SupabaseRecipeStorageProvider
  extends LocalRecipeStorageProvider
  implements CloudRecipeStorageAPI
{
  override async checkSlugCollision(
    slug: string,
    currentWorkspaceId?: string
  ): Promise<CollisionCheckResult> {
    const localResult = await super.checkSlugCollision(slug, currentWorkspaceId);
    if (localResult.isTaken) {
      return localResult;
    }

    const cleanSlug = slugifyRecipeTitle(slug);
    if (!cleanSlug) {
      return { isTaken: false };
    }

    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title')
        .eq('slug', cleanSlug)
        .maybeSingle();

      if (!error && data) {
        return {
          isTaken: true,
          source: 'remote',
          existingTitle: data.title
        };
      }
    } catch {
      // Remote check fallback
    }

    return { isTaken: false };
  }

  async submitRecipe(
    workspace: StudioWorkspace,
    targetStatus: 'pending' | 'approved'
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    const authState = authStore.getState();
    if (!authState.user) {
      return { ok: false, error: 'User must be authenticated to submit recipes' };
    }

    try {
      const cleanWorkspace = await uploadAllLocalRefsInWorkspace(workspace);

      const heroImage =
        cleanWorkspace.graph?.media?.pictureUrl ||
        cleanWorkspace.graph?.media?.galleryUrls?.[0] ||
        '';

      const tags = (cleanWorkspace.graph as any)?.tags || [];

      const isExistingUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        workspace.id
      );

      if (isExistingUuid) {
        const { data: existingRecipe } = await supabase
          .from('recipes')
          .select('id, slug')
          .eq('id', workspace.id)
          .maybeSingle();

        if (existingRecipe) {
          const { error: updateError } = await supabase
            .from('recipes')
            .update({
              title: cleanWorkspace.title || cleanWorkspace.graph?.title || 'Untitled Recipe',
              description: cleanWorkspace.graph?.description || '',
              image_url: heroImage,
              tags: Array.isArray(tags) ? tags : [],
              status: targetStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingRecipe.id);

          if (updateError) {
            return { ok: false, error: updateError.message };
          }

          const { error: detailsError } = await supabase
            .from('recipe_details')
            .upsert({
              recipe_id: existingRecipe.id,
              sections_ast: {
                sections: cleanWorkspace.sections || [],
                canvasNodes: cleanWorkspace.canvasNodes || []
              },
              ingredients_index: cleanWorkspace.customIngredients || [],
              cookware_index: cleanWorkspace.customCookware || [],
              raw_fablang: (cleanWorkspace.graph as any)?.rawFablang || '',
              important_notes: cleanWorkspace.graph?.importantNotes || ''
            });

          if (detailsError) {
            return { ok: false, error: detailsError.message };
          }

          await localMediaStore.clearWorkspace(workspace.id);
          return { ok: true, id: existingRecipe.id };
        }
      }

      let baseSlug = slugifyRecipeTitle(
        cleanWorkspace.title || cleanWorkspace.graph?.title || 'untitled-recipe'
      );
      if (!baseSlug) {
        baseSlug = 'untitled-recipe';
      }

      let finalSlug = baseSlug;
      let collision = await this.checkSlugCollision(finalSlug);
      let suffix = 1;
      while (collision.isTaken && suffix < 100) {
        finalSlug = `${baseSlug}-${suffix}`;
        collision = await this.checkSlugCollision(finalSlug);
        suffix++;
      }

      const { data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          slug: finalSlug,
          owner_id: authState.user.id,
          title: cleanWorkspace.title || cleanWorkspace.graph?.title || 'Untitled Recipe',
          description: cleanWorkspace.graph?.description || '',
          image_url: heroImage,
          tags: Array.isArray(tags) ? tags : [],
          status: targetStatus,
          save_count: 0,
          comments: []
        })
        .select('id')
        .single();

      if (recipeError || !recipeData) {
        return { ok: false, error: recipeError?.message || 'Failed to insert recipe record' };
      }

      const { error: detailsError } = await supabase
        .from('recipe_details')
        .insert({
          recipe_id: recipeData.id,
          sections_ast: {
            sections: cleanWorkspace.sections || [],
            canvasNodes: cleanWorkspace.canvasNodes || []
          },
          ingredients_index: cleanWorkspace.customIngredients || [],
          cookware_index: cleanWorkspace.customCookware || [],
          raw_fablang: (cleanWorkspace.graph as any)?.rawFablang || '',
          important_notes: cleanWorkspace.graph?.importantNotes || ''
        });

      if (detailsError) {
        return { ok: false, error: detailsError.message };
      }

      await localMediaStore.clearWorkspace(workspace.id);

      return { ok: true, id: recipeData.id };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to submit recipe' };
    }
  }

  async listUserRecipes(ownerId: string): Promise<CloudRecipe[]> {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

      if (error || !data) {
        return [];
      }

      return data.map(mapRecipeRow);
    } catch {
      return [];
    }
  }

  async fetchRecipeBySlugOrId(identifier: string): Promise<{
    recipe: CloudRecipe;
    details: CloudRecipeDetails;
  } | null> {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        identifier
      );

      let recipeQuery = supabase.from('recipes').select('*');
      if (isUuid) {
        recipeQuery = recipeQuery.eq('id', identifier);
      } else {
        recipeQuery = recipeQuery.eq('slug', identifier);
      }

      const { data: recipeData, error: recipeError } = await recipeQuery.maybeSingle();
      if (recipeError || !recipeData) {
        return null;
      }

      const { data: detailsData, error: detailsError } = await supabase
        .from('recipe_details')
        .select('*')
        .eq('recipe_id', recipeData.id)
        .maybeSingle();

      if (detailsError || !detailsData) {
        return null;
      }

      return {
        recipe: mapRecipeRow(recipeData),
        details: mapRecipeDetailsRow(detailsData)
      };
    } catch {
      return null;
    }
  }
}

export const recipeStorageService = new SupabaseRecipeStorageProvider();
