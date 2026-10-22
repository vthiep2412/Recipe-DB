import type { VesselSize } from '../types/orchestration'
import densityTable from '../data/densityTable.json'

export interface StandardIngredient {
  id: string
  name: string
  category: 'produce' | 'dairy' | 'pantry' | 'meat' | 'spice' | 'baking' | 'liquid'
  allowedUnits: string[]
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
  { id: 'salt', name: 'Salt', category: 'pantry', allowedUnits: ['g', 'tsp', 'tbsp', 'pinch'] },
  { id: 'black-pepper', name: 'Black pepper', category: 'spice', allowedUnits: ['g', 'tsp', 'pinch'] },
  { id: 'olive-oil', name: 'Olive oil', category: 'pantry', allowedUnits: ['ml', 'tbsp', 'tsp', 'cup'] },
  { id: 'butter', name: 'Butter', category: 'dairy', allowedUnits: ['g', 'tbsp', 'cup'] },
  { id: 'garlic', name: 'Garlic', category: 'produce', allowedUnits: ['clove', 'g', 'piece'] },
  { id: 'onion', name: 'Onion', category: 'produce', allowedUnits: ['piece', 'g'] },
  { id: 'all-purpose-flour', name: 'All-purpose flour', category: 'baking', allowedUnits: ['g', 'kg', 'cup', 'tbsp'] },
  { id: 'granulated-sugar', name: 'Granulated sugar', category: 'baking', allowedUnits: ['g', 'cup', 'tbsp', 'tsp'] },
  { id: 'brown-sugar', name: 'Brown sugar', category: 'baking', allowedUnits: ['g', 'cup', 'tbsp'] },
  { id: 'powdered-sugar', name: 'Powdered sugar', category: 'baking', allowedUnits: ['g', 'cup', 'tbsp'] },
  { id: 'large-eggs', name: 'Eggs', category: 'dairy', allowedUnits: ['piece'] },
  { id: 'egg-yolk', name: 'Egg yolk', category: 'dairy', allowedUnits: ['piece'] },
  { id: 'egg-white', name: 'Egg white', category: 'dairy', allowedUnits: ['piece'] },
  { id: 'whole-milk', name: 'Whole milk', category: 'dairy', allowedUnits: ['ml', 'l', 'cup', 'tbsp'] },
  { id: 'heavy-cream', name: 'Heavy cream', category: 'dairy', allowedUnits: ['ml', 'cup', 'tbsp'] },
  { id: 'mascarpone', name: 'Mascarpone cheese', category: 'dairy', allowedUnits: ['g', 'cup'] },
  { id: 'vanilla-extract', name: 'Vanilla extract', category: 'baking', allowedUnits: ['tsp', 'tbsp', 'ml'] },
  { id: 'baking-powder', name: 'Baking powder', category: 'baking', allowedUnits: ['g', 'tsp', 'tbsp'] },
  { id: 'baking-soda', name: 'Baking soda', category: 'baking', allowedUnits: ['g', 'tsp'] },
  { id: 'cocoa-powder', name: 'Cocoa powder', category: 'baking', allowedUnits: ['g', 'tbsp', 'cup'] },
  { id: 'espresso-coffee', name: 'Espresso coffee', category: 'liquid', allowedUnits: ['ml', 'cup', 'tbsp'] },
  { id: 'ladyfingers', name: 'Ladyfinger biscuits', category: 'pantry', allowedUnits: ['piece', 'g'] },
  { id: 'lemon-juice', name: 'Lemon juice', category: 'produce', allowedUnits: ['ml', 'tbsp', 'tsp'] },
  { id: 'soy-sauce', name: 'Soy sauce', category: 'pantry', allowedUnits: ['ml', 'tbsp', 'tsp'] },
  { id: 'chicken-breast', name: 'Chicken breast', category: 'meat', allowedUnits: ['g', 'kg', 'piece'] },
  { id: 'ground-beef', name: 'Ground beef', category: 'meat', allowedUnits: ['g', 'kg'] },
  { id: 'parmesan-cheese', name: 'Parmesan cheese', category: 'dairy', allowedUnits: ['g', 'cup', 'tbsp'] }
]

function buildStandardIngredients(): StandardIngredient[] {
  const map = new Map<string, StandardIngredient>()
  for (const base of BASE_INGREDIENTS) {
    map.set(base.id, { ...base, allowedUnits: [...base.allowedUnits] })
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
    } else {
      const category = entry.category || inferCategory(entry.id, entry.name)
      const allowedUnits = entry.allowedUnits || inferAllowedUnits(entry.id, entry.name)
      map.set(entry.id, {
        id: entry.id,
        name: entry.name,
        category,
        allowedUnits
      })
    }
  }

  return Array.from(map.values())
}

export const ALL_MEASUREMENT_UNITS = [
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
