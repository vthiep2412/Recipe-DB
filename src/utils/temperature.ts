export type TemperatureUnit = 'F' | 'C';

export interface ParsedTemperature {
  isRange: boolean;
  value?: number;
  rangeMin?: number;
  rangeMax?: number;
  unit: TemperatureUnit;
  raw: string;
}

// Matches degree symbols, lookalikes, or word variations
const DEG_SYM = '(?:[°º˚⁰]|deg(?:rees?)?)';

// Range pattern matching: {num} - {num} followed by unit or both having units
// e.g. 350 - 375°F, 350-375°F, 350°F - 375°F, 350F - 375F
export const TEMP_RANGE_REGEX = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*(?:${DEG_SYM}\\s*([CF])|([CF])(?:\\s*${DEG_SYM})?)?\\s*(?:-|–|to)\\s*(\\d+(?:\\.\\d+)?)\\s*(?:${DEG_SYM}\\s*([CF])|([CF])(?:\\s*${DEG_SYM})?)\\b`,
  'i'
);

export const TEMP_SINGLE_REGEX = new RegExp(
  `\\b(\\d+(?:\\.\\d+)?)\\s*(?:${DEG_SYM}\\s*([CF])|([CF])(?:\\s*${DEG_SYM})?)\\b`,
  'i'
);

const RANGE_PATTERN_SOURCE = `(\\d+(?:\\.\\d+)?)\\s*(?:${DEG_SYM}\\s*([CF])|([CF])(?:\\s*${DEG_SYM})?)?\\s*(?:-|–|to)\\s*(\\d+(?:\\.\\d+)?)\\s*(?:${DEG_SYM}\\s*([CF])|([CF])(?:\\s*${DEG_SYM})?)\\b`;
const SINGLE_PATTERN_SOURCE = `\\b(\\d+(?:\\.\\d+)?)\\s*(?:${DEG_SYM}\\s*([CF])|([CF])(?:\\s*${DEG_SYM})?)\\b`;

// Global regex to search and replace temperatures in text
export const TEMP_SEARCH_REGEX = new RegExp(
  `${RANGE_PATTERN_SOURCE}|${SINGLE_PATTERN_SOURCE}`,
  'gi'
);

/**
 * Parses a temperature string into structured data (detecting single or range).
 */
export function parseTemperature(text: string): ParsedTemperature | null {
  if (!text) return null;
  const clean = text.trim();

  // Test Range first
  const rangeMatch = clean.match(TEMP_RANGE_REGEX);
  if (rangeMatch) {
    const minVal = parseFloat(rangeMatch[1]);
    const maxVal = parseFloat(rangeMatch[4]);
    const unit1 = (rangeMatch[2] || rangeMatch[3] || '').toUpperCase();
    const unit2 = (rangeMatch[5] || rangeMatch[6] || '').toUpperCase();
    const unit: TemperatureUnit = (unit2 || unit1 || 'F') as TemperatureUnit;

    return {
      isRange: true,
      rangeMin: Math.min(minVal, maxVal),
      rangeMax: Math.max(minVal, maxVal),
      unit: unit === 'C' ? 'C' : 'F',
      raw: rangeMatch[0]
    };
  }

  // Test Single
  const singleMatch = clean.match(TEMP_SINGLE_REGEX);
  if (singleMatch) {
    const val = parseFloat(singleMatch[1]);
    const unitStr = (singleMatch[2] || singleMatch[3] || 'F').toUpperCase();
    const unit: TemperatureUnit = unitStr === 'C' ? 'C' : 'F';

    return {
      isRange: false,
      value: val,
      unit,
      raw: singleMatch[0]
    };
  }

  return null;
}

/**
 * Formats a temperature into clean standard plain text.
 * Direct: 350°F
 * Range: 350-375°F
 */
export function formatTemperature(data: {
  isRange?: boolean;
  value?: number;
  rangeMin?: number;
  rangeMax?: number;
  unit: TemperatureUnit;
}): string {
  const unit = data.unit || 'F';
  if (data.isRange) {
    const min = data.rangeMin ?? 350;
    const max = data.rangeMax ?? 375;
    return `${min}-${max}°${unit}`;
  }
  const val = data.value ?? 350;
  return `${val}°${unit}`;
}

/**
 * Converts a temperature value between Fahrenheit and Celsius.
 * Applies culinary rounding:
 * - Baking / oven temps (>= 200°F or >= 90°C) round to nearest 5° interval
 * - Sub-oven temps round to nearest whole integer
 */
export function convertTemperature(val: number, fromUnit: TemperatureUnit, toUnit: TemperatureUnit): number {
  if (fromUnit === toUnit) return val;

  if (fromUnit === 'F' && toUnit === 'C') {
    const rawC = ((val - 32) * 5) / 9;
    if (val >= 200) {
      // Common culinary rounding: 350°F -> 175°C, 375°F -> 190°C, 400°F -> 200°C
      return Math.round(rawC / 5) * 5;
    }
    return Math.round(rawC);
  }

  if (fromUnit === 'C' && toUnit === 'F') {
    const rawF = (val * 9) / 5 + 32;
    if (val >= 90) {
      return Math.round(rawF / 5) * 5;
    }
    return Math.round(rawF);
  }

  return Math.round(val);
}

/**
 * Standardizes or converts all temperatures in a given text snippet.
 */
export function standardizeTemperaturesInText(text: string, targetUnit?: TemperatureUnit): string {
  if (!text) return text;

  return text.replace(TEMP_SEARCH_REGEX, (match) => {
    const parsed = parseTemperature(match);
    if (!parsed) return match;

    const currentUnit = parsed.unit;
    const finalUnit = targetUnit || currentUnit;

    if (parsed.isRange) {
      const min = parsed.rangeMin ?? 0;
      const max = parsed.rangeMax ?? 0;
      const convertedMin = targetUnit ? convertTemperature(min, currentUnit, finalUnit) : min;
      const convertedMax = targetUnit ? convertTemperature(max, currentUnit, finalUnit) : max;
      return `${convertedMin}-${convertedMax}°${finalUnit}`;
    }

    const val = parsed.value ?? 0;
    const convertedVal = targetUnit ? convertTemperature(val, currentUnit, finalUnit) : val;
    return `${convertedVal}°${finalUnit}`;
  });
}

/**
 * Splits plain text around temperature patterns, converting them into structured temperature mention tokens.
 */
export function extractTemperatureTokensFromText(text: string, idPrefix = 'temp'): {
  segments: Array<
    | { type: 'text'; id: string; text: string }
    | {
        type: 'mention';
        id: string;
        mention: {
          id: string;
          type: 'temperature';
          displayText: string;
          data: {
            isRange?: boolean;
            temperatureValue?: number;
            rangeMin?: number;
            rangeMax?: number;
            temperatureUnit: TemperatureUnit;
          };
        };
      }
  >;
  tokens: Array<{
    id: string;
    type: 'temperature';
    displayText: string;
    data: {
      isRange?: boolean;
      temperatureValue?: number;
      rangeMin?: number;
      rangeMax?: number;
      temperatureUnit: TemperatureUnit;
    };
  }>;
} {
  const segments: Array<any> = [];
  const tokens: Array<any> = [];
  if (!text) return { segments, tokens };

  let lastIndex = 0;
  let counter = 0;

  for (const match of text.matchAll(TEMP_SEARCH_REGEX)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      segments.push({
        type: 'text',
        id: `seg-txt-${idPrefix}-${counter++}`,
        text: text.slice(lastIndex, matchIndex)
      });
    }

    const parsed = parseTemperature(match[0]);
    if (parsed) {
      const display = formatTemperature(parsed);
      const mentionId = `m-temp-${idPrefix}-${counter++}`;
      const token = {
        id: mentionId,
        type: 'temperature' as const,
        displayText: display,
        data: {
          isRange: parsed.isRange,
          temperatureValue: parsed.value,
          rangeMin: parsed.rangeMin,
          rangeMax: parsed.rangeMax,
          temperatureUnit: parsed.unit
        }
      };
      tokens.push(token);
      segments.push({
        type: 'mention',
        id: mentionId,
        mention: token
      });
    } else {
      segments.push({
        type: 'text',
        id: `seg-txt-${idPrefix}-${counter++}`,
        text: match[0]
      });
    }
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      id: `seg-txt-${idPrefix}-${counter++}`,
      text: text.slice(lastIndex)
    });
  }

  return { segments, tokens };
}

