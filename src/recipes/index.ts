import { recipeGraphToRecipeJSON, normalizeWorkspace } from '../parser/graphAdapter';
import { exportStudioWorkspaceToRecipeGraph } from '../parser/orchestrationParser';
import type { RecipeJSON } from '../types/recipe';
import type { StudioWorkspace } from '../types/orchestration';
import type { CloudRecipe, CloudRecipeDetails } from '../types/cloud';
import { recipeStorageService } from '../services/recipeStorageService';

const WORKSPACES_STORAGE_KEY = 'recipedb_studio_workspaces_v1';

/**
 * Maps raw cloud recipe rows to the client-facing RecipeJSON format.
 */
export function mapCloudToRecipeJSON(cloud: {
  recipe: CloudRecipe;
  details: CloudRecipeDetails;
}): RecipeJSON {
  const { recipe, details } = cloud;
  const sectionsAst = details.sectionsAst as any;
  const rawSections = sectionsAst?.sections || [];
  const rawCanvasNodes = sectionsAst?.canvasNodes || [];

  const steps = rawCanvasNodes.map((n: any, idx: number) => ({
    index: idx + 1,
    rawText: n.instructionText || n.title || '',
    tokens: (n.segments || []).map((seg: any) => {
      if (seg.type === 'mention') {
        const m = seg.mention;
        return {
          type:
            m.type === 'ingredient'
              ? 'ingredient'
              : m.type === 'cookware'
              ? 'cookware'
              : m.type === 'timer'
              ? 'timer'
              : 'text',
          name: m.displayText || '',
          value: m.displayText || '',
          durationText: m.data?.durationText || '',
        };
      }
      return { type: 'text', value: seg.text || '' };
    }),
    id: n.id,
    title: n.title,
    sectionId: n.sectionId,
    image: n.media?.pictureUrl,
  }));

  const mappedSections =
    rawSections.length > 0 && rawSections[0]?.steps
      ? rawSections
      : rawSections.length > 0
      ? rawSections.map((sec: any) => ({
          id: sec.id,
          name: sec.name || 'Main',
          steps: steps.filter((s: any) => s.sectionId === sec.id),
        }))
      : [
          {
            id: 'sec-main',
            name: 'Instructions',
            steps,
          },
        ];

  return {
    id: recipe.slug || recipe.id,
    title: recipe.title,
    description: recipe.description || '',
    image: recipe.imageUrl,
    gallery: [],
    importantNotes: details.importantNotes || '',
    servings: { base: 4, unitName: 'servings' },
    times: { total: '30m' },
    tags: recipe.tags || [],
    metadata: {},
    ingredients: (details.ingredientsIndex as any[]) || [],
    sections: mappedSections,
    rawCooklang: details.rawFablang || '',
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
    const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (raw) {
      const workspaces: StudioWorkspace[] = JSON.parse(raw);
      const match = workspaces.find(ws => ws.id === id || ws.graph?.id === id);
      if (match) {
        const normalized = normalizeWorkspace(match);
        const compiledGraph = exportStudioWorkspaceToRecipeGraph(normalized);
        const mapped = recipeGraphToRecipeJSON(compiledGraph);
        parsedRecipeCache.set(id, mapped);
        return mapped;
      }
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
