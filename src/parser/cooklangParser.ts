import type { RecipeJSON, RecipeIngredient, RecipeSection, StepToken, RecipeTimes } from '../types/recipe';

export function parseFraction(fractionStr: string): number | null {
  const trimmed = fractionStr.trim();
  if (!trimmed) return null;

  if (trimmed.includes(' ')) {
    const parts = trimmed.split(' ');
    if (parts.length === 2) {
      const whole = parseFloat(parts[0]);
      const frac = parseFraction(parts[1]);
      if (!isNaN(whole) && frac !== null) {
        return whole + frac;
      }
    }
  }

  if (trimmed.includes('/')) {
    const [num, den] = trimmed.split('/').map(s => parseFloat(s.trim()));
    if (!isNaN(num) && !isNaN(den) && den !== 0) {
      return num / den;
    }
  }

  const num = parseFloat(trimmed);
  return isNaN(num) ? null : num;
}

export function formatFraction(num: number): string {
  const epsilon = 0.02;
  const whole = Math.floor(num);
  const remainder = num - whole;

  if (remainder < epsilon) return `${whole}`;
  if (Math.abs(remainder - 1) < epsilon) return `${whole + 1}`;

  const commonFractions: [number, string][] = [
    [1 / 8, '1/8'],
    [1 / 4, '1/4'],
    [1 / 3, '1/3'],
    [3 / 8, '3/8'],
    [1 / 2, '1/2'],
    [5 / 8, '5/8'],
    [2 / 3, '2/3'],
    [3 / 4, '3/4'],
    [7 / 8, '7/8'],
  ];

  for (const [val, label] of commonFractions) {
    if (Math.abs(remainder - val) < epsilon) {
      return whole > 0 ? `${whole} ${label}` : label;
    }
  }

  return `${Math.round(num * 100) / 100}`;
}

export function parseCooklang(rawContent: string, id = 'recipe-1'): RecipeJSON {
  const metadata: Record<string, string> = {};
  let bodyContent = rawContent;

  if (rawContent.startsWith('---')) {
    const endIdx = rawContent.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const frontmatter = rawContent.slice(3, endIdx).trim();
      bodyContent = rawContent.slice(endIdx + 4).trim();

      const lines = frontmatter.split('\n');
      let currentKey: string | null = null;
      let currentValue = '';
      let activeQuote: string | null = null;

      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        const isIndented = line.startsWith(' ') || line.startsWith('\t');
        const isNewKey = !activeQuote && !isIndented && colonIdx !== -1;

        if (isNewKey) {
          if (currentKey) {
            metadata[currentKey] = currentValue.trim().replace(/^["']|["']$/g, '');
          }
          currentKey = line.slice(0, colonIdx).trim();
          currentValue = line.slice(colonIdx + 1);

          const valTrimmed = currentValue.trim();
          if (
            (valTrimmed.startsWith('"') || valTrimmed.startsWith("'")) &&
            (valTrimmed.length === 1 || !valTrimmed.endsWith(valTrimmed[0]) || valTrimmed.endsWith('\\' + valTrimmed[0]))
          ) {
            activeQuote = valTrimmed[0];
          } else {
            activeQuote = null;
          }
        } else if (currentKey) {
          currentValue += '\n' + line;
          if (
            activeQuote &&
            line.trim().endsWith(activeQuote) &&
            !line.trim().endsWith('\\' + activeQuote)
          ) {
            activeQuote = null;
          }
        }
      }
      if (currentKey) {
        metadata[currentKey] = currentValue.trim().replace(/^["']|["']$/g, '');
      }
    }
  }

  const lines = bodyContent.split('\n');
  const sections: RecipeSection[] = [];
  let currentSection: RecipeSection = { name: 'Instructions', steps: [] };
  const allIngredientsMap = new Map<string, RecipeIngredient>();

  let stepCounter = 1;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.startsWith('>>')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.slice(2, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        metadata[key] = value;
      }
      continue;
    }

    if (line.startsWith('--')) continue;

    if (line.startsWith('=') && line.endsWith('=')) {
      if (currentSection.steps.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        name: line.replace(/=/g, '').trim(),
        steps: []
      };
      continue;
    }

    const tokens: StepToken[] = [];
    const tokenRegex = /(@@[^@#~,;{}\n]+?\{[^}\n]*\}(?:\([^)\n]*\))?|@[^@#~,;{}\n]+?\{[^}\n]*\}(?:\([^)\n]*\))?|@@[^\s,.;:!?()[\]{}]+|@[^\s,.;:!?()[\]{}]+|#[^@#~,;{}\n]+?\{[^}\n]*\}|#[^\s,.;:!?()[\]{}]+|~[^@#~,;{}\n]*?\{[^}\n]*\})/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({
          type: 'text',
          value: line.slice(lastIndex, match.index)
        });
      }

      const rawMatch = match[0];

      if (rawMatch.startsWith('@@') || rawMatch.startsWith('@')) {
        const isHidden = rawMatch.startsWith('@@');
        const tokenText = isHidden ? rawMatch.slice(2) : rawMatch.slice(1);

        let name = tokenText;
        let quantityText: string | undefined;
        let unit: string | null = null;
        let note: string | null = null;

        const noteMatch = tokenText.match(/\(([^)]+)\)$/);
        let workingToken = tokenText;
        if (noteMatch) {
          note = noteMatch[1].trim();
          workingToken = workingToken.slice(0, noteMatch.index).trim();
        }

        const braceMatch = workingToken.match(/^([^{]+)(?:{([^}]*)})?$/);
        if (braceMatch) {
          name = braceMatch[1].trim();
          const insideBraces = braceMatch[2];
          if (insideBraces !== undefined && insideBraces.trim() !== '') {
            if (insideBraces.includes('%')) {
              const [q, u] = insideBraces.split('%');
              quantityText = q.trim();
              unit = u.trim();
            } else {
              quantityText = insideBraces.trim();
            }
          }
        }

        const numVal = quantityText ? parseFraction(quantityText) : null;
        const normalizedKey = name.toLowerCase();

        if (!allIngredientsMap.has(normalizedKey)) {
          allIngredientsMap.set(normalizedKey, {
            id: `ing-${allIngredientsMap.size + 1}`,
            name,
            quantityValue: numVal,
            unit,
            quantityText: quantityText || null,
            note,
            isHidden
          });
        } else if (!isHidden && allIngredientsMap.get(normalizedKey)?.isHidden) {
          const existing = allIngredientsMap.get(normalizedKey)!;
          existing.isHidden = false;
        }

        tokens.push({
          type: 'ingredient',
          name,
          quantityText: quantityText ? (unit ? `${quantityText} ${unit}` : quantityText) : undefined,
          note: note || undefined,
          isHidden
        });
      } else if (rawMatch.startsWith('#')) {
        const tokenText = rawMatch.slice(1);
        let name = tokenText;
        let quantityText: string | undefined;

        const braceMatch = tokenText.match(/^([^{]+)(?:{([^}]*)})?$/);
        if (braceMatch) {
          name = braceMatch[1].trim();
          quantityText = braceMatch[2]?.trim() || undefined;
        }

        tokens.push({
          type: 'cookware',
          name,
          quantityText
        });
      } else if (rawMatch.startsWith('~')) {
        const braceIdx = rawMatch.indexOf('{');
        if (braceIdx !== -1 && rawMatch.endsWith('}')) {
          const inside = rawMatch.slice(braceIdx + 1, -1).trim();
          let durationText = inside;
          if (inside.includes('%')) {
            const [d, u] = inside.split('%');
            durationText = `${d.trim()} ${u.trim()}`;
          }
          tokens.push({
            type: 'timer',
            durationText
          });
        }
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      tokens.push({
        type: 'text',
        value: line.slice(lastIndex)
      });
    }

    currentSection.steps.push({
      index: stepCounter++,
      rawText: line,
      tokens
    });
  }

  if (currentSection.steps.length > 0) {
    sections.push(currentSection);
  }

  let servingsBase = 1;
  let servingsUnitName = 'servings';
  const servingsRaw = metadata['servings'] || metadata['yield'];
  if (servingsRaw) {
    const match = servingsRaw.match(/^([\d.]+)\s*(.*)$/);
    if (match) {
      servingsBase = parseFloat(match[1]) || 1;
      servingsUnitName = match[2].trim() || 'servings';
    }
  }

  const times: RecipeTimes = {};
  if (metadata['time']) times.total = metadata['time'];
  if (metadata['cook_time']) times.cook = metadata['cook_time'];
  if (metadata['prep_time']) times.prep = metadata['prep_time'];
  if (metadata['bake_time']) times.bake = metadata['bake_time'];
  if (metadata['rest_time']) times.rest = metadata['rest_time'];

  const tags: string[] = [];
  if (metadata['tags']) {
    tags.push(...metadata['tags'].split(',').map(t => t.trim()).filter(Boolean));
  }

  return {
    id,
    title: metadata['title'] || 'Untitled Recipe',
    description: metadata['description'] || '',
    image: metadata['image'],
    video: metadata['video'],
    author: metadata['author'] ? { name: metadata['author'] } : undefined,
    source: metadata['source'] ? { url: metadata['source'] } : undefined,
    servings: {
      base: servingsBase,
      unitName: servingsUnitName
    },
    difficulty: metadata['difficulty'],
    cuisine: metadata['cuisine'],
    course: metadata['course'],
    times,
    tags,
    metadata,
    ingredients: Array.from(allIngredientsMap.values()),
    sections,
    rawCooklang: rawContent
  };
}
