import type { RecipeGraph, StudioWorkspace } from '../types/orchestration';
import type { RecipeJSON } from '../types/recipe';
import type {
  CloudRecipe,
  CloudRecipeDetails,
  CloudRecipeStatus,
  CloudRecipeStorageAPI
} from '../types/cloud';
import { exportStudioWorkspaceToRecipeGraph } from '../parser/orchestrationParser';
import { generateFablang } from '../parser/fablangGenerator';
import { recipeGraphToRecipeJSON } from '../parser/graphAdapter';
import { getAllRecipes } from '../recipes';
import { supabase } from './supabaseClient';
import { authStore } from './authStore';
import { localMediaStore } from './localMediaStore';
import { uploadAsset } from './cloudinaryUpload';
import { WorkspaceStorageService } from './workspaceStorageService';

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

export function mapRecipeRow(row: any): CloudRecipe {
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

export function mapRecipeDetailsRow(row: any): CloudRecipeDetails {
  return {
    recipeId: row.recipe_id,
    sectionsAst: (row.sections_ast as Record<string, unknown>) || {},
    ingredientsIndex: Array.isArray(row.ingredients_index) ? row.ingredients_index : [],
    cookwareIndex: Array.isArray(row.cookware_index) ? row.cookware_index : [],
    rawFablang: row.raw_fablang ?? '',
    importantNotes: row.important_notes ?? ''
  };
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    try {
      const parts = dataUrl.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const binary = atob(parts[1]);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      return new Blob([array], { type: mime });
    } catch {
      return null;
    }
  }
}

function isExternalCandidateImage(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  if (trimmed.includes('cloudinary.com')) return false;
  if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) return false;
  return true;
}

async function uploadAllMediaInWorkspace(workspace: StudioWorkspace): Promise<StudioWorkspace> {
  const jsonStr = JSON.stringify(workspace);
  const idbRegex = /"idb:([^"]+)"/g;
  const base64Regex = /"(data:image\/[^";]+;base64,[^"]+)"/g;
  const externalImageRegex = /"(https?:\/\/[^"\\]+?\.(?:png|jpe?g|webp|gif|avif|jxl|svg)(?:\?[^"\\]*)?)"/gi;

  const idbMatches = [...jsonStr.matchAll(idbRegex)];
  const base64Matches = [...jsonStr.matchAll(base64Regex)];
  const externalMatches = [...jsonStr.matchAll(externalImageRegex)];

  // Explicit media URLs from workspace graph & steps
  const explicitUrls = new Set<string>();
  if (workspace.graph?.media?.pictureUrl && isExternalCandidateImage(workspace.graph.media.pictureUrl)) {
    explicitUrls.add(workspace.graph.media.pictureUrl);
  }
  if (Array.isArray(workspace.graph?.media?.galleryUrls)) {
    for (const url of workspace.graph.media.galleryUrls) {
      if (isExternalCandidateImage(url)) explicitUrls.add(url);
    }
  }
  if (Array.isArray(workspace.canvasNodes)) {
    for (const node of workspace.canvasNodes) {
      if (Array.isArray(node.media?.galleryUrls)) {
        for (const url of node.media.galleryUrls) {
          if (isExternalCandidateImage(url)) explicitUrls.add(url);
        }
      }
    }
  }

  for (const match of externalMatches) {
    const rawUrl = match[1];
    if (isExternalCandidateImage(rawUrl)) {
      explicitUrls.add(rawUrl);
    }
  }

  if (idbMatches.length === 0 && base64Matches.length === 0 && explicitUrls.size === 0) {
    return workspace;
  }

  const replacementMap = new Map<string, string>();

  // 1. Resolve IDB references
  for (const match of idbMatches) {
    const rawKey = match[1];
    const fullKey = `idb:${rawKey}`;
    if (!replacementMap.has(fullKey)) {
      try {
        const blob = (await localMediaStore.loadBlob(fullKey)) || (await localMediaStore.loadBlob(rawKey));
        if (blob) {
          const uploaded = await uploadAsset(blob, 'image', 'recipes/images');
          replacementMap.set(fullKey, uploaded.secure_url);
        }
      } catch (err) {
        console.warn(`[recipeStorageService] Failed to upload IDB asset to Cloudinary: ${fullKey}`, err);
      }
    }
  }

  // 2. Resolve base64 data URIs
  for (const match of base64Matches) {
    const dataUrl = match[1];
    if (!replacementMap.has(dataUrl)) {
      try {
        const blob = await dataUrlToBlob(dataUrl);
        if (blob) {
          const uploaded = await uploadAsset(blob, 'image', 'recipes/images');
          replacementMap.set(dataUrl, uploaded.secure_url);
        }
      } catch (err) {
        console.warn(`[recipeStorageService] Failed to upload base64 asset to Cloudinary`, err);
      }
    }
  }

  // 3. Resolve external HTTP/HTTPS images
  for (const extUrl of explicitUrls) {
    if (!replacementMap.has(extUrl)) {
      try {
        const uploaded = await uploadAsset(extUrl, 'image', 'recipes/images');
        replacementMap.set(extUrl, uploaded.secure_url);
      } catch (err) {
        console.warn(`[recipeStorageService] Failed to upload external image to Cloudinary: ${extUrl}`, err);
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
      const diskRecipes = await getAllRecipes();
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
      const workspaces = await WorkspaceStorageService.loadWorkspaces();
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
  async checkRecipeSlugAvailable(
    slug: string,
    recipeId?: string
  ): Promise<boolean> {
    const cleanSlug = slugifyRecipeTitle(slug);
    if (!cleanSlug) {
      return false;
    }

    try {
      const isUuid =
        recipeId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipeId);

      const { data, error } = await supabase.rpc('check_recipe_slug_available', {
        p_slug: cleanSlug,
        p_recipe_id: isUuid ? recipeId : null
      });

      if (!error && typeof data === 'boolean') {
        return data;
      }
    } catch {
      // Fallback
    }

    const collision = await this.checkSlugCollision(slug, recipeId);
    return !collision.isTaken;
  }

  async getExistingRecipeInfo(
    identifier?: string
  ): Promise<{ id: string; slug: string; title: string; status: string; owner_id: string } | null> {
    if (!identifier) return null;
    const clean = identifier.trim();
    if (!clean) return null;

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
      let query = supabase.from('recipes').select('id, slug, title, status, owner_id');
      if (isUuid) {
        query = query.eq('id', clean);
      } else {
        query = query.eq('slug', slugifyRecipeTitle(clean));
      }
      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        return data;
      }
    } catch {
      // Fallback
    }
    return null;
  }

  override async checkSlugCollision(
    slug: string,
    currentWorkspaceId?: string
  ): Promise<CollisionCheckResult> {
    const cleanSlug = slugifyRecipeTitle(slug);
    if (!cleanSlug) {
      return { isTaken: false };
    }

    try {
      const isUuid =
        currentWorkspaceId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentWorkspaceId);

      const { data, error } = await supabase.rpc('check_recipe_slug_available', {
        p_slug: cleanSlug,
        p_recipe_id: isUuid ? currentWorkspaceId : null
      });

      if (!error && typeof data === 'boolean') {
        return {
          isTaken: !data,
          source: 'remote'
        };
      }
    } catch {
      // Fallback
    }

    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title')
        .eq('slug', cleanSlug)
        .maybeSingle();

      if (!error && data) {
        if (currentWorkspaceId && data.id === currentWorkspaceId) {
          return { isTaken: false };
        }
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
    targetStatus: 'pending' | 'approved',
    customSlug?: string
  ): Promise<{ ok: boolean; id?: string; slug?: string; error?: string }> {
    const authState = authStore.getState();
    if (!authState.user) {
      return { ok: false, error: 'User must be authenticated to submit recipes' };
    }

    try {
      const cleanWorkspace = await uploadAllMediaInWorkspace(workspace);
      const compiledGraph = exportStudioWorkspaceToRecipeGraph(cleanWorkspace);
      const adaptedRecipe = recipeGraphToRecipeJSON(compiledGraph);
      const rawFablang = generateFablang(compiledGraph, cleanWorkspace.canvasNodes, cleanWorkspace);
      const ingredientsPayload = adaptedRecipe.ingredients || [];
      const cookwarePayload = compiledGraph.vessels || [];

      const heroImage =
        cleanWorkspace.graph?.media?.pictureUrl ||
        cleanWorkspace.graph?.media?.galleryUrls?.[0] ||
        '';

      const tags = (cleanWorkspace.graph as any)?.tags || [];

      const isExistingUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        workspace.id
      );

      let existingRecipe: { id: string; slug: string; owner_id: string } | null = null;
      if (isExistingUuid) {
        const { data } = await supabase
          .from('recipes')
          .select('id, slug, owner_id')
          .eq('id', workspace.id)
          .maybeSingle();
        if (data) existingRecipe = data;
      }

      let finalSlug = customSlug ? slugifyRecipeTitle(customSlug) : '';

      // If not resolved by workspace UUID, also check if target slug or graph.id matches an existing recipe
      if (!existingRecipe) {
        const candidateSlug = finalSlug || slugifyRecipeTitle(cleanWorkspace.graph?.id || cleanWorkspace.title || '');
        if (candidateSlug) {
          const { data } = await supabase
            .from('recipes')
            .select('id, slug, owner_id')
            .eq('slug', candidateSlug)
            .maybeSingle();
          if (data && (authState.profile?.role === 'admin' || data.owner_id === authState.user.id)) {
            existingRecipe = data;
            if (!finalSlug) finalSlug = data.slug;
          }
        }
      }

      if (finalSlug) {
        // If updating an existing recipe and keeping the same slug, no collision check needed
        if (!existingRecipe || finalSlug !== existingRecipe.slug) {
          const isAvail = await this.checkRecipeSlugAvailable(
            finalSlug,
            existingRecipe ? existingRecipe.id : (isExistingUuid ? workspace.id : undefined)
          );
          if (!isAvail) {
            return { ok: false, error: `Recipe slug "${finalSlug}" is already taken by another recipe.` };
          }
        }
      } else {
        let baseSlug = slugifyRecipeTitle(
          cleanWorkspace.title || cleanWorkspace.graph?.title || 'untitled-recipe'
        );
        if (!baseSlug) {
          baseSlug = 'untitled-recipe';
        }

        finalSlug = baseSlug;
        let collision = await this.checkSlugCollision(
          finalSlug,
          existingRecipe ? existingRecipe.id : (isExistingUuid ? workspace.id : undefined)
        );
        let suffix = 1;
        while (collision.isTaken && suffix < 100) {
          finalSlug = `${baseSlug}-${suffix}`;
          collision = await this.checkSlugCollision(
            finalSlug,
            existingRecipe ? existingRecipe.id : (isExistingUuid ? workspace.id : undefined)
          );
          suffix++;
        }
      }

      if (existingRecipe) {
        const updatePayload: Record<string, any> = {
          title: cleanWorkspace.title || cleanWorkspace.graph?.title || 'Untitled Recipe',
          description: cleanWorkspace.graph?.description || '',
          image_url: heroImage,
          tags: Array.isArray(tags) ? tags : [],
          status: targetStatus,
          updated_at: new Date().toISOString()
        };
        if (finalSlug) {
          updatePayload.slug = finalSlug;
        }

        const { error: updateError } = await supabase
          .from('recipes')
          .update(updatePayload)
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
              canvasNodes: cleanWorkspace.canvasNodes || [],
              graph: compiledGraph
            },
            ingredients_index: ingredientsPayload,
            cookware_index: cookwarePayload,
            raw_fablang: rawFablang,
            important_notes: cleanWorkspace.graph?.importantNotes || ''
          });

        if (detailsError) {
          return { ok: false, error: detailsError.message };
        }

        await localMediaStore.clearWorkspace(workspace.id);
        return { ok: true, id: existingRecipe.id, slug: finalSlug || existingRecipe.slug };
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
            canvasNodes: cleanWorkspace.canvasNodes || [],
            graph: compiledGraph
          },
          ingredients_index: ingredientsPayload,
          cookware_index: cookwarePayload,
          raw_fablang: rawFablang,
          important_notes: cleanWorkspace.graph?.importantNotes || ''
        });

      if (detailsError) {
        return { ok: false, error: detailsError.message };
      }

      await localMediaStore.clearWorkspace(workspace.id);

      return { ok: true, id: recipeData.id, slug: finalSlug };
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

  async fetchApprovedRecipes(): Promise<{
    recipe: CloudRecipe;
    details: CloudRecipeDetails;
  }[]> {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*, recipe_details(*)')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (error || !data) {
        return [];
      }

      return data.map((row: any) => {
        const detailsRow = Array.isArray(row.recipe_details)
          ? row.recipe_details[0]
          : row.recipe_details;
        return {
          recipe: mapRecipeRow(row),
          details: mapRecipeDetailsRow(detailsRow || {})
        };
      });
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
