import densityData from '../data/densityTable.json'

export interface IngredientDensityEntry {
  id: string
  name: string
  density: number
  aliases: string[]
}

export const SUPPORTED_INGREDIENTS: IngredientDensityEntry[] = densityData.ingredients

export function normalizeIngredientName(rawName: string): string {
  if (!rawName) return ''
  let name = rawName.toLowerCase().trim()
  name = name.replace(/\([^)]*\)/g, ' ').trim()
  name = name.replace(/[^\w\s-]/g, ' ')
  name = name.replace(/\s+/g, ' ').trim()
  return name
}

const EXACT_LOOKUP = new Map<string, number>()

for (const entry of SUPPORTED_INGREDIENTS) {
  EXACT_LOOKUP.set(entry.name.toLowerCase().trim(), entry.density)
  for (const alias of entry.aliases) {
    EXACT_LOOKUP.set(alias.toLowerCase().trim(), entry.density)
  }
}

const SUBSTRING_MATCHES: { pattern: string; density: number }[] = []
for (const entry of SUPPORTED_INGREDIENTS) {
  for (const alias of entry.aliases) {
    SUBSTRING_MATCHES.push({
      pattern: alias.toLowerCase().trim(),
      density: entry.density
    })
  }
}
SUBSTRING_MATCHES.sort((a, b) => b.pattern.length - a.pattern.length)

export function getIngredientDensity(rawName?: string): number | null {
  if (!rawName) return null
  const clean = normalizeIngredientName(rawName)
  if (!clean) return null

  const exact = EXACT_LOOKUP.get(clean)
  if (exact !== undefined) {
    return exact
  }

  for (const { pattern, density } of SUBSTRING_MATCHES) {
    if (clean.includes(pattern)) {
      return density
    }
  }

  return null
}
