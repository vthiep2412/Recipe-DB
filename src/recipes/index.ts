import { parseCooklang } from '../parser/cooklangParser';
import type { RecipeJSON } from '../types/recipe';
import chewySmoresRaw from './chewy-smores-cookies.md?raw';

export interface RecipeEntry {
  id: string;
  slug: string;
  rawText: string;
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

export function getAllRecipes(): RecipeJSON[] {
  return Object.values(registry).map(entry => entry.getParsed());
}

export function getRecipeById(id: string): RecipeJSON | null {
  const entry = registry[id];
  return entry ? entry.getParsed() : null;
}
