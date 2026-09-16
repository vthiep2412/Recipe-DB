export interface ConversionResult {
  value: number;
  unit: string;
}

export interface UnitSettings {
  unitConversionMode: 'off' | 'metric' | 'australia' | 'us' | 'custom';
  spoonCupPreference?: 'volume' | 'weight';
  customConversionRatios?: string;
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
};

const METRIC_UNITS = new Set([
  'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms',
  'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters'
]);

export function convertUnit(
  value: number,
  unit: string,
  settings?: UnitSettings
): ConversionResult {
  const mode = settings?.unitConversionMode || 'off';
  if (mode === 'off' || !unit) {
    return { value, unit };
  }

  const rawUnit = unit.trim().toLowerCase();

  if (mode === 'metric' || mode === 'australia') {
    if (METRIC_UNITS.has(rawUnit)) {
      return { value, unit };
    }

    const preset = mode === 'australia' ? PRESETS.australia : PRESETS.metric;

    if (rawUnit === 'cup' || rawUnit === 'cups') {
      const ml = value * preset.cup;
      return ml >= 1000 ? { value: Math.round((ml / 1000) * 100) / 100, unit: 'l' } : { value: Math.round(ml), unit: 'ml' };
    }
    if (rawUnit === 'tbsp' || rawUnit === 'tablespoon' || rawUnit === 'tablespoons') {
      return { value: Math.round(value * preset.tbsp), unit: 'ml' };
    }
    if (rawUnit === 'tsp' || rawUnit === 'teaspoon' || rawUnit === 'teaspoons') {
      return { value: Math.round(value * preset.tsp), unit: 'ml' };
    }
    if (rawUnit === 'oz' || rawUnit === 'ounce' || rawUnit === 'ounces') {
      const g = value * 28.35;
      return g >= 1000 ? { value: Math.round((g / 1000) * 100) / 100, unit: 'kg' } : { value: Math.round(g), unit: 'g' };
    }
    if (rawUnit === 'lb' || rawUnit === 'pound' || rawUnit === 'pounds') {
      const g = value * 453.59;
      return { value: Math.round((g / 1000) * 100) / 100, unit: 'kg' };
    }
  }

  return { value, unit };
}
