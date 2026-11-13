import type { VesselSize } from '../types/orchestration'
import densityTable from '../data/densityTable.json'

export interface StandardIngredient {
  id: string
  name: string
  category: 'produce' | 'dairy' | 'pantry' | 'meat' | 'spice' | 'baking' | 'liquid'
  allowedUnits: string[]
  aliases?: string[]
}

interface DensityIngredientSchema {
  id: string
  name: string
  density: number
  category?: StandardIngredient['category']
  allowedUnits?: string[]
  aliases: string[]
}

function inferCategory(id: string, name: string): StandardIngredient['category'] {
  const lower = `${id} ${name}`.toLowerCase()
  if (lower.includes('milk') || lower.includes('cream') || lower.includes('cheese') || lower.includes('butter') || lower.includes('yogurt')) {
    return 'dairy'
  }
  if (lower.includes('pepper') || lower.includes('salt') || lower.includes('cinnamon') || lower.includes('spice') || lower.includes('oregano') || lower.includes('cumin')) {
    return 'spice'
  }
  if (lower.includes('oil') || lower.includes('water') || lower.includes('juice') || lower.includes('syrup') || lower.includes('sauce') || lower.includes('vinegar') || lower.includes('coffee')) {
    return 'liquid'
  }
  if (lower.includes('flour') || lower.includes('sugar') || lower.includes('powder') || lower.includes('soda') || lower.includes('yeast') || lower.includes('starch') || lower.includes('chocolate') || lower.includes('cocoa') || lower.includes('vanilla') || lower.includes('marshmallow') || lower.includes('cracker') || lower.includes('oat')) {
    return 'baking'
  }
  return 'pantry'
}

function inferAllowedUnits(id: string, name: string): string[] {
  const lower = `${id} ${name}`.toLowerCase()
  if (lower.includes('oil') || lower.includes('water') || lower.includes('syrup') || lower.includes('juice') || lower.includes('vinegar') || lower.includes('milk') || lower.includes('extract')) {
    return ['ml', 'l', 'cup', 'tbsp', 'tsp', 'g']
  }
  return ['g', 'kg', 'cup', 'tbsp', 'tsp', 'oz', 'lb']
}

const BASE_INGREDIENTS: StandardIngredient[] = [
  { id: 'salt', name: 'Salt', category: 'pantry', allowedUnits: ['g', 'tsp', 'tbsp', 'pinch'], aliases: ['salt', 'table salt', 'sea salt', 'kosher salt', 'fine salt'] },
  { id: 'black-pepper', name: 'Black pepper', category: 'spice', allowedUnits: ['g', 'tsp', 'pinch'], aliases: ['black pepper', 'ground black pepper', 'pepper', 'black peppercorns', 'black peppercorn'] },
  { id: 'olive-oil', name: 'Olive oil', category: 'pantry', allowedUnits: ['ml', 'tbsp', 'tsp', 'cup'], aliases: ['olive oil', 'extra virgin olive oil', 'evoo'] },
  { id: 'butter', name: 'Butter', category: 'dairy', allowedUnits: ['g', 'tbsp', 'cup'], aliases: ['butter', 'unsalted butter', 'salted butter'] },
  { id: 'garlic', name: 'Garlic', category: 'produce', allowedUnits: ['clove', 'g', 'piece'], aliases: ['garlic', 'garlic clove', 'garlic cloves'] },
  { id: 'onion', name: 'Onion', category: 'produce', allowedUnits: ['piece', 'g'], aliases: ['onion', 'onions', 'yellow onion', 'yellow onions', 'white onion', 'white onions', 'red onion', 'red onions'] },
  { id: 'all-purpose-flour', name: 'All-purpose flour', category: 'baking', allowedUnits: ['g', 'kg', 'cup', 'tbsp'], aliases: ['all-purpose flour', 'all purpose flour', 'ap flour', 'flour', 'plain flour', 'white flour'] },
  { id: 'granulated-sugar', name: 'Granulated sugar', category: 'baking', allowedUnits: ['g', 'cup', 'tbsp', 'tsp'], aliases: ['granulated sugar', 'white sugar', 'sugar'] },
  { id: 'brown-sugar', name: 'Brown sugar', category: 'baking', allowedUnits: ['g', 'cup', 'tbsp'], aliases: ['brown sugar', 'light brown sugar', 'dark brown sugar'] },
  { id: 'powdered-sugar', name: 'Powdered sugar', category: 'baking', allowedUnits: ['g', 'cup', 'tbsp'], aliases: ['powdered sugar', 'confectioners sugar', 'confectioner sugar', 'icing sugar'] },
  { id: 'large-eggs', name: 'Eggs', category: 'dairy', allowedUnits: ['piece'], aliases: ['egg', 'eggs', 'whole egg', 'whole eggs', 'large egg', 'large eggs'] },
  { id: 'egg-yolk', name: 'Egg yolk', category: 'dairy', allowedUnits: ['piece'], aliases: ['egg yolk', 'egg yolks', 'yolk', 'yolks'] },
  { id: 'egg-white', name: 'Egg white', category: 'dairy', allowedUnits: ['piece'], aliases: ['egg white', 'egg whites', 'white', 'whites'] },
  { id: 'whole-milk', name: 'Whole milk', category: 'dairy', allowedUnits: ['ml', 'l', 'cup', 'tbsp'], aliases: ['whole milk', 'milk', 'full cream milk'] },
  { id: 'heavy-cream', name: 'Heavy cream', category: 'dairy', allowedUnits: ['ml', 'cup', 'tbsp'], aliases: ['heavy cream', 'heavy whipping cream', 'double cream', 'whipping cream'] },
  { id: 'mascarpone', name: 'Mascarpone cheese', category: 'dairy', allowedUnits: ['g', 'cup'], aliases: ['mascarpone', 'mascarpone cheese'] },
  { id: 'vanilla-extract', name: 'Vanilla extract', category: 'baking', allowedUnits: ['tsp', 'tbsp', 'ml'], aliases: ['vanilla extract', 'vanilla', 'pure vanilla extract'] },
  { id: 'baking-powder', name: 'Baking powder', category: 'baking', allowedUnits: ['g', 'tsp', 'tbsp'], aliases: ['baking powder'] },
  { id: 'baking-soda', name: 'Baking soda', category: 'baking', allowedUnits: ['g', 'tsp'], aliases: ['baking soda', 'bicarbonate of soda'] },
  { id: 'cocoa-powder', name: 'Cocoa powder', category: 'baking', allowedUnits: ['g', 'tbsp', 'cup'], aliases: ['cocoa powder', 'unsweetened cocoa powder', 'cacao powder'] },
  { id: 'espresso-coffee', name: 'Espresso coffee', category: 'liquid', allowedUnits: ['ml', 'cup', 'tbsp'], aliases: ['espresso', 'espresso coffee', 'brewed espresso', 'strong coffee', 'coffee'] },
  { id: 'ladyfingers', name: 'Ladyfinger biscuits', category: 'pantry', allowedUnits: ['piece', 'g'], aliases: ['ladyfinger', 'ladyfingers', 'ladyfinger biscuits', 'savoiardi'] },
  { id: 'lemon-juice', name: 'Lemon juice', category: 'produce', allowedUnits: ['ml', 'tbsp', 'tsp'], aliases: ['lemon juice', 'fresh lemon juice'] },
  { id: 'soy-sauce', name: 'Soy sauce', category: 'pantry', allowedUnits: ['ml', 'tbsp', 'tsp'], aliases: ['soy sauce', 'light soy sauce', 'dark soy sauce'] },
  { id: 'chicken-breast', name: 'Chicken breast', category: 'meat', allowedUnits: ['g', 'kg', 'piece'], aliases: ['chicken breast', 'chicken breasts', 'boneless skinless chicken breast'] },
  { id: 'ground-beef', name: 'Ground beef', category: 'meat', allowedUnits: ['g', 'kg'], aliases: ['ground beef', 'minced beef', 'beef mince'] },
  { id: 'parmesan-cheese', name: 'Parmesan cheese', category: 'dairy', allowedUnits: ['g', 'cup', 'tbsp'], aliases: ['parmesan', 'parmesan cheese', 'parmigiano', 'parmigiano reggiano'] }
]

function buildStandardIngredients(): StandardIngredient[] {
  const map = new Map<string, StandardIngredient>()
  for (const base of BASE_INGREDIENTS) {
    map.set(base.id, {
      ...base,
      allowedUnits: [...base.allowedUnits],
      aliases: base.aliases ? [...base.aliases] : []
    })
  }

  const densityEntries = (densityTable.ingredients || []) as DensityIngredientSchema[]
  for (const entry of densityEntries) {
    const existing = map.get(entry.id)
    if (existing) {
      if (entry.allowedUnits && Array.isArray(entry.allowedUnits)) {
        existing.allowedUnits = Array.from(new Set([...existing.allowedUnits, ...entry.allowedUnits]))
      }
      if (entry.category) {
        existing.category = entry.category
      }
      if (entry.aliases && Array.isArray(entry.aliases)) {
        existing.aliases = Array.from(new Set([...(existing.aliases || []), ...entry.aliases]))
      }
    } else {
      const category = entry.category || inferCategory(entry.id, entry.name)
      const allowedUnits = entry.allowedUnits || inferAllowedUnits(entry.id, entry.name)
      map.set(entry.id, {
        id: entry.id,
        name: entry.name,
        category,
        allowedUnits,
        aliases: entry.aliases ? [...entry.aliases] : []
      })
    }
  }

  return Array.from(map.values())
}

export const NO_UNIT_OPTION = '(No Unit)'

export const ALL_MEASUREMENT_UNITS = [
  NO_UNIT_OPTION,
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'pinch',
  'piece',
  'slice',
  'clove',
  'can',
  'bunch',
  'dash'
]

export const STANDARD_INGREDIENTS: StandardIngredient[] = buildStandardIngredients()

export interface StandardCookware {
  id: string;
  name: string;
  type: 'bowl' | 'pan' | 'pot' | 'baking_dish' | 'tool';
  defaultSize: VesselSize;
}

export const STANDARD_COOKWARE: StandardCookware[] = [
  { id: 'mixing-bowl', name: 'Mixing Bowl', type: 'bowl', defaultSize: 'Normal' },
  { id: 'bowl-a', name: 'Bowl A', type: 'bowl', defaultSize: 'Normal' },
  { id: 'bowl-b', name: 'Bowl B', type: 'bowl', defaultSize: 'Normal' },
  { id: 'skillet', name: 'Skillet', type: 'pan', defaultSize: 'Normal' },
  { id: 'nonstick-pan', name: 'Non-stick Pan', type: 'pan', defaultSize: 'Normal' },
  { id: 'saucepan', name: 'Saucepan', type: 'pot', defaultSize: 'Med-small' },
  { id: 'stockpot', name: 'Stockpot', type: 'pot', defaultSize: 'Large' },
  { id: 'baking-dish', name: 'Baking Dish (9x13)', type: 'baking_dish', defaultSize: 'Med-large' },
  { id: 'sheet-pan', name: 'Baking Sheet', type: 'pan', defaultSize: 'Med-large' },
  { id: 'wire-whisk', name: 'Wire Whisk', type: 'tool', defaultSize: 'Normal' },
  { id: 'silicone-spatula', name: 'Silicone Spatula', type: 'tool', defaultSize: 'Normal' },
  { id: 'electric-mixer', name: 'Hand Mixer', type: 'tool', defaultSize: 'Normal' }
];

function getInflectionVariants(str: string): string[] {
  const variants = new Set<string>();
  const trimmed = str.trim();
  if (!trimmed) return [];

  // If plural ending in -ies -> -y (e.g., berries -> berry)
  if (trimmed.endsWith('ies') && trimmed.length > 4) {
    variants.add(trimmed.slice(0, -3) + 'y');
  }
  // If plural ending in -es -> -e or strip -es (e.g., tomatoes -> tomato, cloves -> clove)
  else if (trimmed.endsWith('es') && trimmed.length > 3) {
    variants.add(trimmed.slice(0, -2));
    variants.add(trimmed.slice(0, -1));
  }
  // If plural ending in -s -> strip -s (e.g., egg yolks -> egg yolk, eggs -> egg)
  else if (trimmed.endsWith('s') && !trimmed.endsWith('ss') && trimmed.length > 2) {
    variants.add(trimmed.slice(0, -1));
  }

  // Singular -> plural candidates
  if (!trimmed.endsWith('s')) {
    variants.add(trimmed + 's');
    variants.add(trimmed + 'es');
  }

  return Array.from(variants);
}

/**
 * Resolves an ingredient name, slug, or alias to a StandardIngredient.
 * Case-insensitive, punctuation-resilient, handles singular/plural variants,
 * and checks densityTable and built-in aliases.
 */
export function resolveStandardIngredient(rawNameOrId?: string): StandardIngredient | null {
  if (!rawNameOrId) return null;
  const clean = rawNameOrId.trim();
  if (!clean) return null;

  const lower = clean.toLowerCase();
  const slug = lower.replace(/[_\s]+/g, '-');

  // 1. Direct ID or exact name match in STANDARD_INGREDIENTS
  const direct = STANDARD_INGREDIENTS.find(
    i => i.id === clean || i.id === slug || i.name.toLowerCase() === lower
  );
  if (direct) return direct;

  // 2. Direct match against STANDARD_INGREDIENTS aliases
  const aliasMatch = STANDARD_INGREDIENTS.find(i =>
    i.aliases?.some(a => a.toLowerCase().trim() === lower || a.toLowerCase().replace(/[_\s]+/g, '-') === slug)
  );
  if (aliasMatch) return aliasMatch;

  // 3. Check densityTable aliases
  const densityEntries = (densityTable.ingredients || []) as DensityIngredientSchema[];
  for (const entry of densityEntries) {
    if (entry.id === clean || entry.id === slug || entry.name.toLowerCase() === lower) {
      return STANDARD_INGREDIENTS.find(i => i.id === entry.id) || null;
    }
    if (entry.aliases && Array.isArray(entry.aliases)) {
      if (entry.aliases.some(a => a.toLowerCase().trim() === lower)) {
        return STANDARD_INGREDIENTS.find(i => i.id === entry.id) || null;
      }
    }
  }

  // 4. Normalized name match (stripping punctuation/parentheses)
  const normalized = lower.replace(/\([^)]*\)/g, ' ').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalized && normalized !== lower) {
    const normSlug = normalized.replace(/[_\s]+/g, '-');
    const normMatch = STANDARD_INGREDIENTS.find(
      i => i.id === normSlug || i.name.toLowerCase() === normalized || i.aliases?.some(a => a.toLowerCase().trim() === normalized)
    );
    if (normMatch) return normMatch;

    for (const entry of densityEntries) {
      if (entry.aliases && Array.isArray(entry.aliases)) {
        if (entry.aliases.some(a => a.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim() === normalized)) {
          return STANDARD_INGREDIENTS.find(i => i.id === entry.id) || null;
        }
      }
    }
  }

  // 5. Singular / Plural inflection matching
  const formsToTest = [lower, ...(normalized && normalized !== lower ? [normalized] : [])];
  for (const form of formsToTest) {
    const variants = getInflectionVariants(form);
    for (const v of variants) {
      const vSlug = v.replace(/[_\s]+/g, '-');
      const vMatch = STANDARD_INGREDIENTS.find(
        i => i.id === v || i.id === vSlug || i.name.toLowerCase() === v || i.aliases?.some(a => a.toLowerCase().trim() === v)
      );
      if (vMatch) return vMatch;

      for (const entry of densityEntries) {
        if (entry.id === v || entry.id === vSlug || entry.name.toLowerCase() === v) {
          return STANDARD_INGREDIENTS.find(i => i.id === entry.id) || null;
        }
        if (entry.aliases && Array.isArray(entry.aliases)) {
          if (entry.aliases.some(a => a.toLowerCase().trim() === v)) {
            return STANDARD_INGREDIENTS.find(i => i.id === entry.id) || null;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Resolves a cookware name or slug to a StandardCookware case-insensitively.
 */
export function resolveStandardCookware(rawNameOrId?: string): StandardCookware | null {
  if (!rawNameOrId) return null;
  const clean = rawNameOrId.trim();
  if (!clean) return null;

  const lower = clean.toLowerCase();
  const slug = lower.replace(/[_\s]+/g, '-');

  const direct = STANDARD_COOKWARE.find(
    c => c.id === clean || c.id === slug || c.name.toLowerCase() === lower
  );
  if (direct) return direct;

  const variants = getInflectionVariants(lower);
  for (const v of variants) {
    const vSlug = v.replace(/[_\s]+/g, '-');
    const vMatch = STANDARD_COOKWARE.find(
      c => c.id === v || c.id === vSlug || c.name.toLowerCase() === v
    );
    if (vMatch) return vMatch;
  }

  return null;
}

export const VESSEL_SIZES: VesselSize[] = [
  'Small',
  'Med-small',
  'Normal',
  'Med-large',
  'Large'
];

/**
 * Parses shorthand time strings such as "22m30s", "22 m 30s", "1h 15m", "45s", "10 min"
 * Returns integer total seconds
 */
export function parseTimeStringToSeconds(input: string): number {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return 0;

  // Direct number check
  if (/^\d+$/.test(normalized)) {
    return parseInt(normalized, 10) * 60; // default bare numbers to minutes
  }

  let totalSec = 0;
  let matched = false;

  // Check hours
  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/);
  if (hourMatch) {
    totalSec += Math.round(parseFloat(hourMatch[1]) * 3600);
    matched = true;
  }

  // Check minutes
  const minMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)(?![a-z])/);
  if (minMatch) {
    totalSec += Math.round(parseFloat(minMatch[1]) * 60);
    matched = true;
  }

  // Check seconds
  const secMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)(?![a-z])/);
  if (secMatch) {
    totalSec += Math.round(parseFloat(secMatch[1]));
    matched = true;
  }

  // Shorthand like "22m30s" or "1h20m"
  if (!matched) {
    const compactRegex = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/;
    const compactMatch = normalized.match(compactRegex);
    if (compactMatch && (compactMatch[1] || compactMatch[2] || compactMatch[3])) {
      const h = compactMatch[1] ? parseInt(compactMatch[1], 10) : 0;
      const m = compactMatch[2] ? parseInt(compactMatch[2], 10) : 0;
      const s = compactMatch[3] ? parseInt(compactMatch[3], 10) : 0;
      return h * 3600 + m * 60 + s;
    }
  }

  return totalSec;
}

/**
 * Formats seconds into human friendly duration like "22 mins & 30s" or "1 hr 15 mins"
 */
export function formatSecondsToDisplay(seconds: number): string {
  if (seconds <= 0) return '0s';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts: string[] = [];
  if (h > 0) {
    parts.push(`${h} hr${h > 1 ? 's' : ''}`);
  }
  if (m > 0) {
    parts.push(`${m} min${m > 1 ? 's' : ''}`);
  }
  if (s > 0) {
    parts.push(`${s}s`);
  }

  if (parts.length === 3) {
    return `${parts[0]}, ${parts[1]} & ${parts[2]}`;
  }
  if (parts.length === 2) {
    return `${parts[0]} & ${parts[1]}`;
  }
  return parts[0] || '0s';
}
