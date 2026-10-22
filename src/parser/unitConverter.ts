import { getIngredientDensity } from './densityData'

export interface ConversionResult {
  value: number
  unit: string
}

export interface UnitSettings {
  unitConversionMode: 'off' | 'metric' | 'australia' | 'us' | 'custom'
  convertVolumeUnits?: boolean
  spoonCupPreference?: 'volume' | 'weight'
  customConversionRatios?: string
}

const PRESETS = {
  us: {
    cup: 236.59,
    tbsp: 14.79,
    tsp: 4.93,
    fl_oz: 29.57,
    pt: 473.18,
    qt: 946.35,
    gal: 3785.41,
    oz: 28.35,
    lb: 453.59
  },
  metric: {
    cup: 250,
    tbsp: 15,
    tsp: 5,
    fl_oz: 28.41,
    pt: 568.26,
    qt: 1136.52,
    gal: 4546.09,
    oz: 28.35,
    lb: 453.59
  },
  australia: {
    cup: 250,
    tbsp: 20,
    tsp: 5,
    fl_oz: 28.41,
    pt: 568.26,
    qt: 1136.52,
    gal: 4546.09,
    oz: 28.35,
    lb: 453.59
  }
}

const METRIC_WEIGHT_VOLUME = new Set([
  'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms',
  'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters'
])

export function convertUnit(
  value: number,
  unit: string,
  settings?: UnitSettings,
  ingredientName?: string
): ConversionResult {
  const mode = settings?.unitConversionMode || 'off'
  if (mode === 'off' || !unit) {
    return { value, unit }
  }

  const rawUnit = unit.trim().toLowerCase()
  const isCup = rawUnit === 'cup' || rawUnit === 'cups'
  const isTbsp = rawUnit === 'tbsp' || rawUnit === 'tablespoon' || rawUnit === 'tablespoons'
  const isTsp = rawUnit === 'tsp' || rawUnit === 'teaspoon' || rawUnit === 'teaspoons'

  if (isCup || isTbsp || isTsp) {
    if (!settings?.convertVolumeUnits) {
      return { value, unit }
    }

    const density = getIngredientDensity(ingredientName)
    if (density === null) {
      return { value, unit }
    }

    const preset = mode === 'australia' ? PRESETS.australia : mode === 'us' ? PRESETS.us : PRESETS.metric
    let volumeMl = 0
    if (isCup) {
      volumeMl = value * preset.cup
    } else if (isTbsp) {
      volumeMl = value * preset.tbsp
    } else if (isTsp) {
      volumeMl = value * preset.tsp
    }

    const grams = volumeMl * density

    if (mode === 'us') {
      const oz = grams / 28.35
      if (oz >= 16) {
        return { value: Math.round((grams / 453.59) * 100) / 100, unit: 'lb' }
      }
      return { value: Math.round(oz * 10) / 10, unit: 'oz' }
    }

    if (grams >= 1000) {
      return { value: Math.round((grams / 1000) * 100) / 100, unit: 'kg' }
    }
    if (grams >= 10) {
      return { value: Math.round(grams), unit: 'g' }
    }
    return { value: Math.round(grams * 10) / 10, unit: 'g' }
  }

  if (mode === 'metric' || mode === 'australia') {
    if (METRIC_WEIGHT_VOLUME.has(rawUnit)) {
      return { value, unit }
    }

    const preset = mode === 'australia' ? PRESETS.australia : PRESETS.metric

    if (rawUnit === 'oz' || rawUnit === 'ounce' || rawUnit === 'ounces') {
      const g = value * 28.35
      return g >= 1000 ? { value: Math.round((g / 1000) * 100) / 100, unit: 'kg' } : { value: Math.round(g), unit: 'g' }
    }
    if (rawUnit === 'lb' || rawUnit === 'pound' || rawUnit === 'pounds') {
      const g = value * 453.59
      return { value: Math.round((g / 1000) * 100) / 100, unit: 'kg' }
    }
    if (rawUnit === 'fl_oz' || rawUnit === 'fl oz' || rawUnit === 'floz' || rawUnit === 'fluid ounce' || rawUnit === 'fluid ounces') {
      const ml = value * preset.fl_oz
      return ml >= 1000 ? { value: Math.round((ml / 1000) * 100) / 100, unit: 'l' } : { value: Math.round(ml), unit: 'ml' }
    }
    if (rawUnit === 'pt' || rawUnit === 'pts' || rawUnit === 'pint' || rawUnit === 'pints') {
      const ml = value * preset.pt
      return ml >= 1000 ? { value: Math.round((ml / 1000) * 100) / 100, unit: 'l' } : { value: Math.round(ml), unit: 'ml' }
    }
    if (rawUnit === 'qt' || rawUnit === 'qts' || rawUnit === 'quart' || rawUnit === 'quarts') {
      const ml = value * preset.qt
      return ml >= 1000 ? { value: Math.round((ml / 1000) * 100) / 100, unit: 'l' } : { value: Math.round(ml), unit: 'ml' }
    }
    if (rawUnit === 'gal' || rawUnit === 'gals' || rawUnit === 'gallon' || rawUnit === 'gallons') {
      const ml = value * preset.gal
      return ml >= 1000 ? { value: Math.round((ml / 1000) * 100) / 100, unit: 'l' } : { value: Math.round(ml), unit: 'ml' }
    }
  }

  if (mode === 'us') {
    if (rawUnit === 'g' || rawUnit === 'gram' || rawUnit === 'grams') {
      const oz = value / 28.35
      return oz >= 16 ? { value: Math.round((value / 453.59) * 100) / 100, unit: 'lb' } : { value: Math.round(oz * 100) / 100, unit: 'oz' }
    }
    if (rawUnit === 'kg' || rawUnit === 'kilogram' || rawUnit === 'kilograms') {
      return { value: Math.round((value * 2.20462) * 100) / 100, unit: 'lb' }
    }
    if (rawUnit === 'ml' || rawUnit === 'milliliter' || rawUnit === 'milliliters') {
      return { value: Math.round((value / 29.57) * 100) / 100, unit: 'fl oz' }
    }
    if (rawUnit === 'l' || rawUnit === 'liter' || rawUnit === 'liters') {
      return { value: Math.round((value * 33.814) * 100) / 100, unit: 'fl oz' }
    }
  }

  return { value, unit }
}
