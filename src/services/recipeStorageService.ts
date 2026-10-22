import type { RecipeGraph, StudioWorkspace } from '../types/orchestration';
import type { RecipeJSON } from '../types/recipe';
import { supabase } from './supabaseClient';
import { resolveAndUploadLocalRef } from './cloudinaryUpload';
import { clearWorkspace } from './localMediaStore';
import { authUser } from './authStore';

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
  source?: 'remote' | 'workspace';
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
  submitWorkspaceRecipe(
    workspace: StudioWorkspace,
    status: 'pending' | 'approved'
  ): Promise<{ ok: boolean; id?: string; error?: string }>;
}

export class SupabaseRecipeStorageProvider implements RecipeStorageProvider {
  async checkSlugCollision(slug: string, _currentWorkspaceId?: string): Promise<CollisionCheckResult> {
    const cleanSlug = slugifyRecipeTitle(slug);
    if (!cleanSlug) return { isTaken: false };

    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('title')
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
      // Ignore
    }

    return { isTaken: false };
  }

  async getNextAvailableUntitledSlug(currentWorkspaceId?: string): Promise<string> {
    const base = 'untitled-recipe';
    const firstCheck = await this.checkSlugCollision(base, currentWorkspaceId);
    if (!firstCheck.isTaken) return base;

    let count = 1;
    while (count < 1000) {
      const candidate = `${base}-${count}`;
      const res = await this.checkSlugCollision(candidate, currentWorkspaceId);
      if (!res.isTaken) return candidate;
      count++;
    }
    return `${base}-${Date.now()}`;
  }

  async saveRecipe(
    slug: string,
    data: RecipeGraph | RecipeJSON,
    _options?: { overwrite?: boolean; format?: 'json' | 'fablang' }
  ): Promise<{ ok: boolean; path?: string; error?: string }> {
    const user = authUser.value;
    if (!user) return { ok: false, error: 'User must be authenticated to save recipe' };

    try {
      const cleanSlug = slugifyRecipeTitle(slug);
      const title = (data as any).title || slug;
      const description = (data as any).description || '';
      const image_url = (data as any).media?.pictureUrl || (data as any).image_url || null;

      const { data: recipeRow, error } = await supabase
        .from('recipes')
        .upsert({
          slug: cleanSlug,
          title,
          description,
          image_url,
          author_id: user.id,
          status: 'pending'
        })
        .select('id')
        .single();

      if (error) return { ok: false, error: error.message };

      if (recipeRow) {
        await supabase
          .from('recipe_details')
          .upsert({
            recipe_id: recipeRow.id,
            ingredients: (data as any).inputs || (data as any).ingredients || [],
            instructions: (data as any).components || (data as any).instructions || [],
            equipment: (data as any).vessels || (data as any).equipment || [],
            nutrition: (data as any).nutrition || {},
            meta: data
          });
      }

      return { ok: true, path: `/recipes/${cleanSlug}` };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to save recipe' };
    }
  }

  async submitWorkspaceRecipe(
    workspace: StudioWorkspace,
    status: 'pending' | 'approved'
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    const user = authUser.value;
    if (!user) return { ok: false, error: 'Authentication required' };

    try {
      // 1. Process media refs
      let heroImage = workspace.graph.media?.pictureUrl || '';
      if (heroImage.startsWith('idb:')) {
        heroImage = await resolveAndUploadLocalRef(heroImage);
      }

      const processedNodes = await Promise.all(
        (workspace.canvasNodes || []).map(async (node) => {
          let updatedNode = { ...node };
          if (node.media?.galleryUrls) {
            const updatedGallery = await Promise.all(
              node.media.galleryUrls.map(async (url) => {
                if (url.startsWith('idb:')) {
                  return await resolveAndUploadLocalRef(url);
                }
                return url;
              })
            );
            updatedNode.media = { ...node.media, galleryUrls: updatedGallery };
          }
          return updatedNode;
        })
      );

      const cleanSlug = status === 'approved' ? slugifyRecipeTitle(workspace.title) : undefined;

      // 2. Insert or update recipe in Supabase
      const { data: recipeRow, error: recipeErr } = await supabase
        .from('recipes')
        .upsert({
          slug: cleanSlug,
          title: workspace.title || 'Untitled Recipe',
          description: workspace.graph.description || '',
          image_url: heroImage,
          author_id: user.id,
          status,
          tags: [],
          category: 'General'
        })
        .select('id')
        .single();

      if (recipeErr) return { ok: false, error: recipeErr.message };

      // 3. Upsert recipe details
      const { error: detailsErr } = await supabase
        .from('recipe_details')
        .upsert({
          recipe_id: recipeRow.id,
          ingredients: workspace.graph.inputs || [],
          instructions: processedNodes,
          equipment: workspace.graph.vessels || [],
          meta: workspace
        });

      if (detailsErr) return { ok: false, error: detailsErr.message };

      // 4. Clean up local IndexedDB blobs
      await clearWorkspace(workspace.id);

      return { ok: true, id: recipeRow.id };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to submit recipe' };
    }
  }
}

export const recipeStorageService = new SupabaseRecipeStorageProvider();
