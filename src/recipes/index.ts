import { parseCooklang } from '../parser/cooklangParser';
import { recipeGraphToRecipeJSON, normalizeWorkspace } from '../parser/graphAdapter';
import { exportStudioWorkspaceToRecipeGraph } from '../parser/orchestrationParser';
import type { RecipeJSON } from '../types/recipe';
import type { RecipeGraph, StudioWorkspace } from '../types/orchestration';
import chewySmoresRaw from './chewy-smores-cookies.md?raw';

const WORKSPACES_STORAGE_KEY = 'recipedb_studio_workspaces_v1';

export interface RecipeEntry {
  id: string;
  slug: string;
  rawText?: string;
  getParsed: () => RecipeJSON;
}

const registry: Record<string, RecipeEntry> = {
  'chewy-smores-cookies': {
    id: 'chewy-smores-cookies',
    slug: 'chewy-smores-cookies',
    rawText: chewySmoresRaw,
    getParsed: () => parseCooklang(chewySmoresRaw, 'chewy-smores-cookies')
  }
};

// Auto register any json recipe files placed in src/recipes/
const jsonModules = import.meta.glob<Record<string, any>>('./*.json', { eager: true });
for (const mod of Object.values(jsonModules)) {
  const data = (mod && mod.default) ? mod.default : mod;
  if (data && data.id) {
    const slug = data.slug || data.id;
    registry[data.id] = {
      id: data.id,
      slug,
      getParsed: () => {
        if (Array.isArray(data.sections) && Array.isArray(data.ingredients)) {
          return data as RecipeJSON;
        }
        return recipeGraphToRecipeJSON(data as RecipeGraph);
      }
    };
    if (slug !== data.id) {
      registry[slug] = registry[data.id];
    }
  }
}

export function getAllRecipes(): RecipeJSON[] {
  const uniqueEntries = new Map<string, RecipeEntry>();
  for (const entry of Object.values(registry)) {
    if (!uniqueEntries.has(entry.id)) {
      uniqueEntries.set(entry.id, entry);
    }
  }
  return Array.from(uniqueEntries.values()).map(entry => entry.getParsed());
}

export function getRecipeById(id: string): RecipeJSON | null {
  const entry = registry[id];
  if (entry) return entry.getParsed();

  // Check Kitchen Studio local storage
  try {
    const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (raw) {
      const workspaces: StudioWorkspace[] = JSON.parse(raw);
      const match = workspaces.find(ws => ws.id === id || ws.graph?.id === id);
      if (match) {
        const normalized = normalizeWorkspace(match);
        const compiledGraph = exportStudioWorkspaceToRecipeGraph(normalized);
        return recipeGraphToRecipeJSON(compiledGraph);
      }
    }
  } catch {
    // Storage fallback
  }

  return null;
}
