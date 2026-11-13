import { recipeGraphToRecipeJSON, normalizeWorkspace } from '../parser/graphAdapter';
import { exportStudioWorkspaceToRecipeGraph } from '../parser/orchestrationParser';
import type { RecipeJSON } from '../types/recipe';
import type { RecipeGraph, StudioWorkspace } from '../types/orchestration';
import type { CloudRecipe, CloudRecipeDetails } from '../types/cloud';
import { recipeStorageService } from '../services/recipeStorageService';
import { WorkspaceStorageService } from '../services/workspaceStorageService';

/**
 * Maps raw cloud recipe rows to the client-facing RecipeJSON format.
 */
export function mapCloudToRecipeJSON(cloud: {
  recipe: CloudRecipe;
  details: CloudRecipeDetails;
}): RecipeJSON {
  const { recipe, details } = cloud;
  const sectionsAst = (details?.sectionsAst as any) || {};

  let compiledGraph: RecipeGraph;

  if (sectionsAst.graph && Array.isArray(sectionsAst.graph.components)) {
    compiledGraph = sectionsAst.graph as RecipeGraph;
  } else {
    const rawSections = Array.isArray(sectionsAst?.sections) ? sectionsAst.sections : [];
    const rawCanvasNodes = Array.isArray(sectionsAst?.canvasNodes) ? sectionsAst.canvasNodes : [];
    const fallbackWs: StudioWorkspace = {
      id: recipe.slug || recipe.id,
      title: recipe.title,
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
      graph: {
        schemaVersion: 2,
        id: recipe.slug || recipe.id,
        title: recipe.title,
        servings: 4,
        description: recipe.description || '',
        importantNotes: details.importantNotes || '',
        media: {
          pictureUrl: recipe.imageUrl,
        },
        times: {},
        inputs: Array.isArray(details.ingredientsIndex) ? (details.ingredientsIndex as any) : [],
        vessels: Array.isArray(details.cookwareIndex) ? (details.cookwareIndex as any) : [],
        components: [],
        sections: rawSections,
        tags: Array.isArray(recipe.tags) && recipe.tags.length > 0 ? recipe.tags : undefined
      },
      sections: rawSections,
      canvasNodes: rawCanvasNodes,
      customIngredients: [],
      customCookware: [],
    };
    compiledGraph = exportStudioWorkspaceToRecipeGraph(fallbackWs);
  }

  const baseJson = recipeGraphToRecipeJSON(compiledGraph);

  return {
    ...baseJson,
    id: recipe.slug || recipe.id,
    title: recipe.title || baseJson.title,
    description: recipe.description || baseJson.description,
    image: recipe.imageUrl || baseJson.image,
    tags: Array.isArray(recipe.tags) && recipe.tags.length > 0 ? recipe.tags : baseJson.tags,
    rawCooklang: details.rawFablang || baseJson.rawCooklang || '',
    importantNotes: details.importantNotes || baseJson.importantNotes || '',
  };
}

let cachedAllRecipes: RecipeJSON[] | null = null;
const parsedRecipeCache = new Map<string, RecipeJSON>();

/**
 * Pure cloud-native recipe loader:
 * Queries all approved recipes from Supabase with in-memory caching.
 */
export async function getAllRecipes(forceRefresh = false): Promise<RecipeJSON[]> {
  if (cachedAllRecipes && !forceRefresh) {
    return cachedAllRecipes;
  }

  try {
    const cloudRecipes = await recipeStorageService.fetchApprovedRecipes();
    const mapped = cloudRecipes.map(mapCloudToRecipeJSON);

    for (const r of mapped) {
      parsedRecipeCache.set(r.id, r);
    }

    cachedAllRecipes = mapped;
    return mapped;
  } catch {
    return cachedAllRecipes || [];
  }
}

/**
 * Fetch a recipe by its slug or UUID identifier.
 * Checks memory cache -> cloud database -> local Kitchen Studio storage.
 */
export async function getRecipeById(id: string): Promise<RecipeJSON | null> {
  const existing = parsedRecipeCache.get(id);
  if (existing) return existing;

  try {
    const cloudData = await recipeStorageService.fetchRecipeBySlugOrId(id);
    if (cloudData) {
      const mapped = mapCloudToRecipeJSON(cloudData);
      parsedRecipeCache.set(mapped.id, mapped);
      if (cloudData.recipe.slug) {
        parsedRecipeCache.set(cloudData.recipe.slug, mapped);
      }
      parsedRecipeCache.set(cloudData.recipe.id, mapped);
      return mapped;
    }
  } catch {
    // Fall back to studio workspace
  }

  // Check Kitchen Studio local storage
  try {
    const workspaces = await WorkspaceStorageService.loadWorkspaces();
    const match = workspaces.find(ws => ws.id === id || ws.graph?.id === id);
    if (match) {
      const normalized = normalizeWorkspace(match);
      const compiledGraph = exportStudioWorkspaceToRecipeGraph(normalized);
      const mapped = recipeGraphToRecipeJSON(compiledGraph);
      parsedRecipeCache.set(id, mapped);
      return mapped;
    }
  } catch {
    // Storage fallback
  }

  return null;
}

/**
 * Clear in-memory recipe cache to force fresh fetch.
 */
export function invalidateRecipeCache(): void {
  cachedAllRecipes = null;
  parsedRecipeCache.clear();
}
