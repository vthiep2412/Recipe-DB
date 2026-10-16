import type {
  RecipeGraph,
  RecipeInput,
  RecipeVessel,
  RecipeStepNode,
  RecipeToken,
  CanvasStepNode,
  CanvasSection,
  StudioWorkspace,
  StepMentionToken,
  StepInstructionSegment
} from '../types/orchestration';
import { parseFraction } from './cooklangParser';
import { parseTimeStringToSeconds } from '../constants/standardKitchenData';

export type IngestFormat = 'fablang' | 'cooklang' | 'app_markdown' | 'plain_text';

export interface FablangSyntaxError {
  line: number;
  message: string;
  rawLine?: string;
}

export function isFablangDeclared(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (/^---\s*[\s\S]*?\n(isFabLang|isFablang|format|syntax)\s*:\s*(true|['"]?fablang['"]?)/i.test(trimmed)) {
    return true;
  }
  if (/(?:^|\n)\s*!{1,3}=\s*[^=]+| - \[title:| -> \*[^*]+\*|\bclip:\s*\d+:\d+/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function validateFablang(rawText: string): FablangSyntaxError[] {
  const errors: FablangSyntaxError[] = [];
  const lines = rawText.split('\n');
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    if (i === 0 && trimmed === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === '---') {
        inFrontmatter = false;
      }
      continue;
    }

    if (!trimmed || trimmed.startsWith('--')) continue;

    // 1. Strict subsection depth rule: only depth 1 allowed
    if (/^\s*!{2,}=/.test(line)) {
      errors.push({
        line: lineNum,
        message: 'Invalid subsection depth: only 1 depth level is allowed with !=',
        rawLine: line
      });
      continue;
    }

    // 2. Section check: must end with =
    if (/^\s*!?=/.test(line)) {
      if (!/=\s*(\[tools\])?\s*$/.test(line)) {
        errors.push({
          line: lineNum,
          message: 'Malformed section header: must be enclosed like = Section = or != Subsection =',
          rawLine: line
        });
      }
      continue;
    }

    // 3. Directives check
    if (trimmed.startsWith('>')) {
      if (!/^\s*>\s*(image\d*|clip|desc):/i.test(line)) {
        errors.push({
          line: lineNum,
          message: 'Unrecognized directive: supported directives are > image:, > image<N>:, > clip:, and > desc:',
          rawLine: line
        });
      }
      continue;
    }

    // 4. Step prefix validation
    const isCounted = /^\s*-\s+/.test(line);
    const isUncounted = /^\s*\+\s+/.test(line);

    if (!isCounted && !isUncounted && !trimmed.startsWith('>>')) {
      if (/^-\S/.test(trimmed)) {
        errors.push({
          line: lineNum,
          message: 'Invalid step prefix: counted steps must start with " - " (space dash space)',
          rawLine: line
        });
      } else if (/^\+\S/.test(trimmed)) {
        errors.push({
          line: lineNum,
          message: 'Invalid step prefix: note steps must start with " + " (space plus space)',
          rawLine: line
        });
      }
    }

    // 5. Yield production directive validation
    if (line.includes('->')) {
      if (!/->\s*\*([^*]+)\*\{#([^}]+)\}/.test(line)) {
        errors.push({
          line: lineNum,
          message: 'Invalid yield production directive: syntax must be -> *name*{#vessel}',
          rawLine: line
        });
      }
    }

    // 6. Token matching balance check
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push({
        line: lineNum,
        message: 'Unbalanced curly braces in step tokens',
        rawLine: line
      });
    }

    const asterisks = (line.match(/\*/g) || []).length;
    if (asterisks % 2 !== 0) {
      errors.push({
        line: lineNum,
        message: 'Unclosed yield asterisk marker in step tokens',
        rawLine: line
      });
    }
  }

  return errors;
}

export function generateAiRepairPrompt(rawText: string, errors: FablangSyntaxError[]): string {
  const errorLines = errors.map(e => `- Line ${e.line}: ${e.message}${e.rawLine ? ` (in: "${e.rawLine.trim()}")` : ''}`).join('\n');
  return `You are an expert F&Blang parser and culinary formatter. The following .fablang recipe contains syntax errors that prevent it from compiling.

### Detected Syntax Errors:
${errorLines}

### Strict F&Blang Grammar Rules:
1. Section Hierarchy:
   - Root section: = Section Name =
   - Single-level subsection: != Subsection Name = (or !== Subsection Name ==)
   - Strict rule: Depth 2 is strictly forbidden (e.g., !!= is an error). Root sections can have unlimited subsections, but subsections cannot have children.
2. Step Prefixes:
   - Counted step: " - " (space, dash, space)
   - Uncounted / note step: " + " (space, plus, space)
   - Optional directives: " - [title: Step Title] [link] [tools] "
3. Rich Tokens:
   - Ingredient: @name{quantity%unit}(notes)
   - Re-mention: @@name{quantity%unit}(notes)
   - Cookware: #cookware{size}(notes)
   - Yield Reference: *yield name*{quantity%#vessel}(notes)
   - Yield Production: placed at the end of the step: -> *yield name*{#vessel}
   - Sensory Timer: ~{duration%unit%temp}(sensory cue)
4. Multimedia Directives:
   - > image1: <url>
   - > clip: MM:SS to MM:SS
   - > desc: <text>

### Broken Recipe Code:
\`\`\`fablang
${rawText}
\`\`\`

Please repair the syntax errors while preserving all recipe ingredients, instructions, and metadata. Output ONLY the repaired valid .fablang code inside a single \`\`\`fablang codeblock.`;
}

function parseRawYamlValue(val: string): string {
  const trimmed = val.trim();
  if ((trimmed.startsWith('r"') && trimmed.endsWith('"')) || (trimmed.startsWith("r'") && trimmed.endsWith("'"))) {
    const inner = trimmed.slice(2, -1);
    return inner.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const inner = trimmed.slice(1, -1);
    return inner.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return trimmed;
}

function parseTimestampToSeconds(ts: string): number {
  const parts = ts.trim().split(':').map(p => parseInt(p, 10));
  if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
  return parseInt(ts, 10) || 0;
}

export function parseFablang(rawText: string, workspaceId: string = crypto.randomUUID()): {
  workspace: StudioWorkspace;
  errors: FablangSyntaxError[];
} {
  const errors = validateFablang(rawText);
  const now = new Date().toISOString();

  let title = 'Untitled Recipe';
  let description = '';
  let importantNotes = '';
  let tips = '';
  let author = 'anonymous';
  let sourceUrl = '';
  let servings = 4;
  let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
  let pictureUrl = '';
  let videoUrl = '';
  const recipeGalleryUrls: string[] = [];

  const times: RecipeGraph['times'] = {};

  const lines = rawText.split('\n');
  let inFrontmatter = false;
  let bodyStartIndex = 0;
  let currentFmSection: 'times' | 'media' | 'customTimes' | 'gallery' | null = null;
  let pendingCustomTime: { label?: string; duration?: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (i === 0 && trimmed === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === '---') {
        inFrontmatter = false;
        bodyStartIndex = i + 1;
        break;
      }
      if (!trimmed) continue;

      const isIndented = /^\s+/.test(rawLine);
      if (!isIndented) {
        currentFmSection = null;
        const colonIdx = rawLine.indexOf(':');
        if (colonIdx !== -1) {
          const key = rawLine.slice(0, colonIdx).trim().toLowerCase();
          const rawVal = rawLine.slice(colonIdx + 1).trim();
          const val = parseRawYamlValue(rawVal);

          if (key === 'title') title = val;
          else if (key === 'author') author = val;
          else if (key === 'source' || key === 'url') sourceUrl = val;
          else if (key === 'servings') servings = parseInt(val, 10) || 4;
          else if (key === 'description') description = val;
          else if (key === 'important_notes' || key === 'importantnotes') importantNotes = val;
          else if (key === 'tips' || key === 'notes') tips = val;
          else if (key === 'difficulty' && (val === 'easy' || val === 'medium' || val === 'hard')) difficulty = val;
          else if (key === 'image') pictureUrl = val;
          else if (key === 'video') videoUrl = val;
          else if (key === 'times') currentFmSection = 'times';
          else if (key === 'media') currentFmSection = 'media';
        }
      } else {
        if (currentFmSection === 'times' || currentFmSection === 'customTimes') {
          if (/^custom:\s*$/i.test(trimmed)) {
            currentFmSection = 'customTimes';
            continue;
          }
          if (currentFmSection === 'customTimes') {
            const labelMatch = trimmed.match(/^-\s*label:\s*(.*)/i);
            if (labelMatch) {
              if (pendingCustomTime && pendingCustomTime.label) {
                times.custom = times.custom || [];
                times.custom.push({ label: pendingCustomTime.label, seconds: pendingCustomTime.duration || 0 });
              }
              pendingCustomTime = { label: parseRawYamlValue(labelMatch[1]) };
              continue;
            }
            const durMatch = trimmed.match(/^duration:\s*(.*)/i);
            if (durMatch && pendingCustomTime) {
              pendingCustomTime.duration = parseTimeStringToSeconds(durMatch[1]);
              times.custom = times.custom || [];
              times.custom.push({ label: pendingCustomTime.label || 'Custom', seconds: pendingCustomTime.duration });
              pendingCustomTime = null;
              continue;
            }
          }
          const colonIdx = trimmed.indexOf(':');
          if (colonIdx !== -1) {
            const subKey = trimmed.slice(0, colonIdx).trim().toLowerCase();
            const subVal = trimmed.slice(colonIdx + 1).trim();
            const sec = parseTimeStringToSeconds(subVal);
            if (subKey === 'prep') times.prepSec = sec;
            else if (subKey === 'cook') times.cookSec = sec;
            else if (subKey === 'bake') times.bakeSec = sec;
            else if (subKey === 'rest') times.restSec = sec;
            else if (subKey === 'total') times.totalSec = sec;
          }
        } else if (currentFmSection === 'media' || currentFmSection === 'gallery') {
          if (/^gallery:\s*$/i.test(trimmed)) {
            currentFmSection = 'gallery';
            continue;
          }
          if (currentFmSection === 'gallery') {
            const itemMatch = trimmed.match(/^-\s*(.*)/);
            if (itemMatch) {
              const url = parseRawYamlValue(itemMatch[1]);
              if (url) recipeGalleryUrls.push(url);
              continue;
            }
          }
          const colonIdx = trimmed.indexOf(':');
          if (colonIdx !== -1) {
            const subKey = trimmed.slice(0, colonIdx).trim().toLowerCase();
            const subVal = parseRawYamlValue(trimmed.slice(colonIdx + 1).trim());
            if (subKey === 'image') pictureUrl = subVal;
            else if (subKey === 'video') videoUrl = subVal;
          }
        }
      }
    }
  }

  if (pendingCustomTime && pendingCustomTime.label) {
    times.custom = times.custom || [];
    times.custom.push({ label: pendingCustomTime.label, seconds: pendingCustomTime.duration || 0 });
  }

  if (!times.totalSec && (times.prepSec || times.cookSec || times.bakeSec || times.restSec)) {
    times.totalSec = (times.prepSec || 0) + (times.cookSec || 0) + (times.bakeSec || 0) + (times.restSec || 0);
  }

  const sections: CanvasSection[] = [];
  const canvasNodes: CanvasStepNode[] = [];
  const inputsMap = new Map<string, RecipeInput>();
  const vesselsMap = new Map<string, RecipeVessel>();

  let currentRootSectionId = 'sec-main';
  let currentSectionId = 'sec-main';
  let defaultSectionCreated = false;

  const ensureDefaultSection = () => {
    if (sections.length === 0 && !defaultSectionCreated) {
      defaultSectionCreated = true;
      const sec: CanvasSection = {
        id: 'sec-main',
        name: 'Main Instructions',
        order: 0,
        showInlineTools: false
      };
      sections.push(sec);
      currentSectionId = sec.id;
      currentRootSectionId = sec.id;
    }
  };

  let pendingStepDirectives: {
    title?: string;
    isLinked?: boolean;
    showInlineTools?: boolean;
    galleryUrls: string[];
    videoClip?: { startSec: number; endSec?: number };
  } = { galleryUrls: [] };

  let countedStepCounter = 1;
  let previousStepId: string | null = null;

  for (let i = bodyStartIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('--')) continue;

    // Check Section or Subsection
    if (/^\s*!?=/.test(rawLine)) {
      const isSub = /^\s*!=/.test(rawLine);
      const cleanHeader = trimmed.replace(/^!*=+\s*|\s*=+$/g, '').trim();
      const hasToolsDirective = cleanHeader.includes('[tools]');
      const sectionName = cleanHeader.replace(/\[tools\]/g, '').trim() || (isSub ? 'Subsection' : 'Section');

      if (!isSub) {
        const secId = `sec-${sections.length + 1}`;
        const newSec: CanvasSection = {
          id: secId,
          name: sectionName,
          order: sections.length,
          showInlineTools: hasToolsDirective
        };
        sections.push(newSec);
        currentRootSectionId = secId;
        currentSectionId = secId;
        previousStepId = null;
      } else {
        ensureDefaultSection();
        const secId = `sec-sub-${sections.length + 1}`;
        const newSubSec: CanvasSection = {
          id: secId,
          name: sectionName,
          order: sections.length,
          parentSectionId: currentRootSectionId,
          showInlineTools: hasToolsDirective
        };
        sections.push(newSubSec);
        currentSectionId = secId;
        previousStepId = null;
      }
      continue;
    }

    // Directives
    if (trimmed.startsWith('>')) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const dirName = trimmed.slice(1, colonIdx).trim().toLowerCase();
        const dirVal = trimmed.slice(colonIdx + 1).trim();

        if (dirName === 'image' && sections.length > 0) {
          sections[sections.length - 1].description = sections[sections.length - 1].description
            ? `${sections[sections.length - 1].description}\n[Banner: ${dirVal}]`
            : `[Banner: ${dirVal}]`;
        } else if (dirName === 'desc' && sections.length > 0) {
          sections[sections.length - 1].description = dirVal;
        } else if (/^image\d*$/.test(dirName)) {
          pendingStepDirectives.galleryUrls.push(dirVal);
        } else if (dirName === 'clip') {
          const parts = dirVal.split(/\s+to\s+/i);
          const startSec = parseTimestampToSeconds(parts[0] || '0');
          const endSec = parts[1] ? parseTimestampToSeconds(parts[1]) : undefined;
          pendingStepDirectives.videoClip = { startSec, endSec };
        }
      }
      continue;
    }

    // Step Lines
    const isCountedStep = /^\s*-\s+/.test(rawLine);
    const isUncountedStep = /^\s*\+\s+/.test(rawLine);

    if (isCountedStep || isUncountedStep) {
      ensureDefaultSection();

      let prose = rawLine.replace(/^\s*[-+]\s+/, '').trim();
      let stepTitle: string | undefined;
      let isLinked = false;
      let showInline = false;

      // Extract inline bracket directives
      const titleMatch = prose.match(/\[title:\s*([^\]]+)\]/i);
      if (titleMatch) {
        stepTitle = titleMatch[1].trim();
        prose = prose.replace(titleMatch[0], '').trim();
      }

      if (/\[link\]/i.test(prose)) {
        isLinked = true;
        prose = prose.replace(/\[link\]/gi, '').trim();
      }

      if (/\[tools\]/i.test(prose)) {
        showInline = true;
        prose = prose.replace(/\[tools\]/gi, '').trim();
      }

      // Extract Yield production directive: -> *yieldName*{#vesselName}
      let producesYield: { name: string; vesselId: string } | undefined;
      const yieldProdMatch = prose.match(/->\s*\*([^*]+)\*\{#([^}]+)\}\s*$/);
      if (yieldProdMatch) {
        const yieldName = yieldProdMatch[1].trim();
        const vesselName = yieldProdMatch[2].trim();
        const vesselSlug = vesselName.toLowerCase().replace(/\s+/g, '-');
        producesYield = {
          name: yieldName,
          vesselId: vesselSlug
        };
        if (!vesselsMap.has(vesselSlug)) {
          vesselsMap.set(vesselSlug, {
            id: vesselSlug,
            name: vesselName,
            type: 'bowl'
          });
        }
        prose = prose.slice(0, yieldProdMatch.index).trim();
      }

      // Parse tokens from prose
      const segments: StepInstructionSegment[] = [];
      const mentions: StepMentionToken[] = [];
      const stepIdx = canvasNodes.length + 1;
      let tokenCounter = 1;
      let lastIdx = 0;

      const tokenRegex = /(@@?[^@#~*,\s;{}()]+\{[^}]*\}(?:\([^)]*\))?|@@?[^@#~*,\s;{}()]+\([^)]*\)|@@?[^\s,.;:!?()[\]{}]+|#[^@#~*,\s;{}()]+\{[^}]*\}(?:\([^)]*\))?|#[^@#~*,\s;{}()]+\([^)]*\)|#[^\s,.;:!?()[\]{}]+|\*[^*]+\*(?:\{[^}]*\})?(?:\([^)]*\))?|~\{[^}]*\}(?:\([^)]*\))?|~[^@#~*,\s;{}()]+\([^)]*\))/g;
      let match: RegExpExecArray | null;

      while ((match = tokenRegex.exec(prose)) !== null) {
        if (match.index > lastIdx) {
          segments.push({
            type: 'text',
            id: `seg-text-${stepIdx}-${tokenCounter++}`,
            text: prose.slice(lastIdx, match.index)
          });
        }

        const fullToken = match[0];
        const mId = `m-${stepIdx}-${tokenCounter++}`;

        if (fullToken.startsWith('*')) {
          // Yield consumption
          const innerMatch = fullToken.match(/^\*([^*]+)\*(?:\{([^}]*)\})?(?:\(([^)]*)\))?/);
          const yName = innerMatch ? innerMatch[1].trim() : fullToken.replace(/\*/g, '').trim();
          const details = innerMatch && innerMatch[2] ? innerMatch[2].trim() : '';
          const creatorNote = innerMatch && innerMatch[3] ? innerMatch[3].trim() : undefined;

          let partition: string | undefined;
          let vesselId: string | undefined;
          if (details) {
            if (details.includes('#')) {
              const [part, vName] = details.split('#');
              partition = part.replace('%', '').trim() || undefined;
              vesselId = vName.trim().toLowerCase().replace(/\s+/g, '-');
            } else {
              partition = details;
            }
          }

          const mention: StepMentionToken = {
            id: mId,
            type: 'yield',
            displayText: yName,
            data: {
              yieldId: `yield-${yName.toLowerCase().replace(/\s+/g, '-')}`,
              yieldName: yName,
              yieldPartition: partition,
              yieldVesselId: vesselId,
              creatorNote
            }
          };
          mentions.push(mention);
          segments.push({ type: 'mention', id: mId, mention });
        } else if (fullToken.startsWith('@')) {
          // Ingredient or re-mention
          const isHidden = fullToken.startsWith('@@');
          let working = isHidden ? fullToken.slice(2) : fullToken.slice(1);
          let creatorNote: string | undefined;

          const noteMatch = working.match(/\(([^)]+)\)$/);
          if (noteMatch) {
            creatorNote = noteMatch[1].trim();
            working = working.slice(0, noteMatch.index).trim();
          }

          const braceMatch = working.match(/^([^{]+)(?:\{([^}]*)\})?$/);
          let name = working;
          let amount: number | string = 1;
          let unit = 'piece';

          if (braceMatch) {
            name = braceMatch[1].trim();
            const details = braceMatch[2];
            if (details && details.trim() !== '') {
              if (details.includes('%')) {
                const [q, u] = details.split('%');
                const tQ = q.trim();
                amount = tQ.includes('/') ? tQ : (parseFloat(tQ) || parseFraction(tQ) || 1);
                unit = u.trim();
              } else {
                const tD = details.trim();
                amount = tD.includes('/') ? tD : (parseFloat(tD) || parseFraction(tD) || 1);
              }
            }
          }

          const inputSlug = name.toLowerCase().replace(/\s+/g, '-');
          if (!isHidden && !inputsMap.has(inputSlug)) {
            inputsMap.set(inputSlug, {
              id: inputSlug,
              name,
              amount,
              unit,
              notes: creatorNote
            });
          }

          const mention: StepMentionToken = {
            id: mId,
            type: 'ingredient',
            displayText: name,
            data: {
              ingredientId: inputSlug,
              amount,
              unit,
              creatorNote,
              isRemention: isHidden
            }
          };
          mentions.push(mention);
          segments.push({ type: 'mention', id: mId, mention });
        } else if (fullToken.startsWith('#')) {
          // Cookware
          let working = fullToken.slice(1);
          let creatorNote: string | undefined;

          const noteMatch = working.match(/\(([^)]+)\)$/);
          if (noteMatch) {
            creatorNote = noteMatch[1].trim();
            working = working.slice(0, noteMatch.index).trim();
          }

          const braceMatch = working.match(/^([^{]+)(?:\{([^}]*)\})?$/);
          const name = (braceMatch ? braceMatch[1] : working).trim();
          const size = braceMatch && braceMatch[2] ? braceMatch[2].trim() : undefined;
          const vesselSlug = name.toLowerCase().replace(/\s+/g, '-');

          if (!vesselsMap.has(vesselSlug)) {
            vesselsMap.set(vesselSlug, {
              id: vesselSlug,
              name,
              type: 'bowl'
            });
          }

          const mention: StepMentionToken = {
            id: mId,
            type: 'cookware',
            displayText: name,
            data: {
              vesselId: vesselSlug,
              vesselSize: size === 'large' ? 'Large' : size === 'small' ? 'Small' : 'Normal',
              creatorNote
            }
          };
          mentions.push(mention);
          segments.push({ type: 'mention', id: mId, mention });
        } else if (fullToken.startsWith('~')) {
          // Timer
          let working = fullToken.slice(1);
          let creatorNote: string | undefined;

          const noteMatch = working.match(/\(([^)]+)\)$/);
          if (noteMatch) {
            creatorNote = noteMatch[1].trim();
            working = working.slice(0, noteMatch.index).trim();
          }

          const braceMatch = working.match(/\{([^}]*)\}/);
          const timeSpec = braceMatch ? braceMatch[1] : working;
          const cleanSpec = timeSpec.replace('%', ' ').trim();
          const seconds = parseTimeStringToSeconds(cleanSpec);

          const mention: StepMentionToken = {
            id: mId,
            type: 'timer',
            displayText: cleanSpec || '5 min',
            data: {
              timerSec: seconds || 300,
              creatorNote: creatorNote || '',
              donenessDescription: creatorNote || ''
            }
          };
          mentions.push(mention);
          segments.push({ type: 'mention', id: mId, mention });
        }

        lastIdx = match.index + fullToken.length;
      }

      if (lastIdx < prose.length) {
        segments.push({
          type: 'text',
          id: `seg-text-${stepIdx}-${tokenCounter++}`,
          text: prose.slice(lastIdx)
        });
      }

      const stepId = `step-${stepIdx}`;
      const parentId = isLinked && previousStepId ? previousStepId : (previousStepId || currentSectionId);
      const activeSection = sections.find(s => s.id === currentSectionId);

      const stepNode: CanvasStepNode = {
        id: stepId,
        sectionId: currentSectionId,
        parentId,
        title: stepTitle || (isCountedStep ? `Step ${countedStepCounter++}` : 'Note'),
        isCountedStep,
        isLinkedToPrevious: isLinked,
        instructionText: prose,
        segments: segments.length > 0 ? segments : [{ type: 'text', id: `seg-init-${stepIdx}`, text: prose }],
        mentions,
        media: {
          galleryUrls: pendingStepDirectives.galleryUrls.length > 0 ? pendingStepDirectives.galleryUrls : undefined,
          videoClip: pendingStepDirectives.videoClip
        },
        showInlineTools: showInline || Boolean(activeSection?.showInlineTools),
        producesYield
      };

      canvasNodes.push(stepNode);
      previousStepId = stepId;
      pendingStepDirectives = { galleryUrls: [] };
    }
  }

  ensureDefaultSection();

  const finalGraph: RecipeGraph = {
    schemaVersion: 2,
    id: workspaceId,
    title,
    servings,
    difficulty,
    description: description || undefined,
    importantNotes: importantNotes || undefined,
    tips: tips || undefined,
    author: { name: author },
    source: sourceUrl ? { url: sourceUrl } : undefined,
    media: {
      pictureUrl: pictureUrl || undefined,
      videoUrl: videoUrl || undefined,
      galleryUrls: recipeGalleryUrls.length > 0 ? recipeGalleryUrls : undefined
    },
    times,
    inputs: Array.from(inputsMap.values()),
    vessels: Array.from(vesselsMap.values()),
    components: sections.map(s => ({
      id: `component-${s.id}`,
      name: s.name,
      steps: []
    })),
    sections
  };

  const workspace: StudioWorkspace = {
    id: workspaceId,
    title,
    createdAt: now,
    updatedAt: now,
    graph: finalGraph,
    sections,
    canvasNodes,
    customIngredients: [],
    customCookware: []
  };

  return { workspace, errors };
}

export function detectInputFormat(text: string): IngestFormat {
  const trimmed = text.trim();
  if (!trimmed) return 'plain_text';

  if (isFablangDeclared(trimmed)) return 'fablang';

  // Cooklang token markers
  const hasCooklangTokens = /[@#~]\{|>>|--\s|=+\s*[^=]+\s*=+/.test(trimmed);
  if (hasCooklangTokens) return 'cooklang';

  // Markdown recipe markers
  const hasMarkdownStructure = /^(?:---[\s\S]*?---\s*)?(?:#+\s*Ingredients|#+\s*Instructions|#+\s*Method|\*\s+[A-Za-z])/im.test(trimmed);
  if (hasMarkdownStructure) return 'app_markdown';

  // Check for step numbers like 1. or Step 1
  const hasNumberedSteps = /^\s*(?:\d+\.|\bstep\s*\d+:)/im.test(trimmed);
  if (hasNumberedSteps) return 'app_markdown';

  return 'plain_text';
}

/**
 * Parses raw text into a StudioWorkspace with auto-connected canvas nodes
 */
export function parseTextToStudioWorkspace(rawText: string, workspaceId: string = crypto.randomUUID()): StudioWorkspace {
  const trimmed = rawText.trim();
  const format = detectInputFormat(trimmed);

  if (format === 'fablang') {
    return parseFablang(trimmed, workspaceId).workspace;
  }

  const now = new Date().toISOString();
  let title = 'Untitled Recipe';
  let description = '';
  let tips = '';
  let author = 'anonymous';
  let sourceUrl = '';
  let servings = 4;
  let difficulty: 'easy' | 'medium' | 'hard' = 'medium';

  const rawStepTexts: string[] = [];

  if (trimmed && format !== 'plain_text') {
    // Extract frontmatter if present
    let body = trimmed;
    if (trimmed.startsWith('---')) {
      const endIdx = trimmed.indexOf('\n---', 3);
      if (endIdx !== -1) {
        const fm = trimmed.slice(3, endIdx);
        body = trimmed.slice(endIdx + 4).trim();
        for (const line of fm.split('\n')) {
          const colon = line.indexOf(':');
          if (colon !== -1) {
            const key = line.slice(0, colon).trim().toLowerCase();
            const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
            if (key === 'title') title = val;
            if (key === 'author') author = val;
            if (key === 'source' || key === 'url' || key === 'origin') sourceUrl = val;
            if (key === 'servings') servings = parseInt(val, 10) || 4;
            if (key === 'description') description = val;
            if (key === 'tips' || key === 'notes') tips = val;
            if (key === 'difficulty' && (val === 'easy' || val === 'medium' || val === 'hard')) {
              difficulty = val;
            }
          }
        }
      }
    }

    // Split lines
    const lines = body.split('\n');
    let isInsideInstructions = false;

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('--')) continue;

      if (line.startsWith('>>')) {
        const colon = line.indexOf(':');
        if (colon !== -1) {
          const key = line.slice(2, colon).trim().toLowerCase();
          const val = line.slice(colon + 1).trim();
          if (key === 'title') title = val;
          if (key === 'author') author = val;
          if (key === 'source' || key === 'url' || key === 'origin') sourceUrl = val;
          if (key === 'servings') servings = parseInt(val, 10) || 4;
          if (key === 'description') description = val;
          if (key === 'tips' || key === 'notes') tips = val;
        }
        continue;
      }

      if (/^#+\s*(?:instructions|method|steps|directions)/i.test(line)) {
        isInsideInstructions = true;
        continue;
      }

      if (/^#+\s*(?:ingredients|cookware)/i.test(line)) {
        isInsideInstructions = false;
        continue;
      }

      if (line.startsWith('=') && line.endsWith('=')) {
        continue;
      }

      // If markdown format, capture numbered or bulleted lines or general lines under instructions
      if (format === 'app_markdown') {
        const cleanLine = line.replace(/^(?:\d+\.|\*|-)\s+/, '').trim();
        if (cleanLine && (isInsideInstructions || /^(?:\d+\.|\bstep\b)/i.test(line))) {
          rawStepTexts.push(cleanLine);
        }
      } else {
        // Cooklang body step lines
        if (!line.startsWith('#')) {
          rawStepTexts.push(line);
        }
      }
    }
  }

  // If no steps were found, provide an initial template step
  if (rawStepTexts.length === 0) {
    rawStepTexts.push('Add ingredients to bowl and mix well.');
  }

  // Convert raw step lines into CanvasStepNodes
  const canvasNodes: CanvasStepNode[] = [];
  let prevNodeId = 'root';

  for (let i = 0; i < rawStepTexts.length; i++) {
    const stepId = `step-${i + 1}`;
    const rawStep = rawStepTexts[i];
    const { cleanText, mentions, segments } = extractMentionsFromStep(rawStep, i + 1);

    canvasNodes.push({
      id: stepId,
      parentId: prevNodeId,
      sectionId: 'sec-main',
      title: `Step ${i + 1}`,
      isCountedStep: true,
      isLinkedToPrevious: false,
      instructionText: cleanText,
      segments,
      mentions
    });

    prevNodeId = stepId;
  }

  const initialGraph: RecipeGraph = {
    schemaVersion: 1,
    id: workspaceId,
    title,
    servings,
    difficulty,
    description,
    tips,
    author: { name: author },
    source: sourceUrl ? { url: sourceUrl } : undefined,
    media: { pictureUrl: '', videoUrl: '' },
    times: {
      prepSec: 0,
      cookSec: 0,
      totalSec: 0,
      custom: []
    },
    inputs: [],
    vessels: [],
    components: []
  };

  return {
    id: workspaceId,
    title,
    createdAt: now,
    updatedAt: now,
    graph: initialGraph,
    sections: [{ id: 'sec-main', name: 'Main', order: 0, showInlineTools: false }],
    canvasNodes,
    customIngredients: [],
    customCookware: []
  };
}

/**
 * Extracts mentions from Cooklang syntax like @ingredient{quantity%unit} or #cookware or ~{time}
 */
function extractMentionsFromStep(stepText: string, stepIndex: number): {
  cleanText: string;
  mentions: StepMentionToken[];
  segments: StepInstructionSegment[];
} {
  const segments: StepInstructionSegment[] = [];
  const mentions: StepMentionToken[] = [];
  let tokenCounter = 1;
  let lastIndex = 0;

  const tokenRegex = /(@@?[^@#~,;{}\n]+?\{[^}\n]*\}(?:\([^)\n]*\))?|@@?[^\s,.;:!?()[\]{}]+|#[^@#~,;{}\n]+?\{[^}\n]*\}|#[^\s,.;:!?()[\]{}]+|~[^@#~,;{}\n]*?\{[^}\n]*\})/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(stepText)) !== null) {
    if (match.index > lastIndex) {
      const textChunk = stepText.slice(lastIndex, match.index);
      segments.push({
        type: 'text',
        id: `seg-text-${stepIndex}-${tokenCounter++}`,
        text: textChunk
      });
    }

    const fullMatch = match[0];
    const mentionId = `m-${stepIndex}-${tokenCounter++}`;

    if (fullMatch.startsWith('@')) {
      const isHidden = fullMatch.startsWith('@@');
      const tokenContent = isHidden ? fullMatch.slice(2) : fullMatch.slice(1);

      let working = tokenContent;
      let creatorNote: string | undefined;

      const noteMatch = working.match(/\(([^)]+)\)$/);
      if (noteMatch) {
        creatorNote = noteMatch[1].trim();
        working = working.slice(0, noteMatch.index).trim();
      }

      const braceMatch = working.match(/^([^{]+)(?:\{([^}]*)\})?$/);
      let name = working;
      let amount: number | string = 1;
      let unit = 'piece';

      if (braceMatch) {
        name = braceMatch[1].trim();
        const details = braceMatch[2];
        if (details && details.trim() !== '') {
          if (details.includes('%')) {
            const [q, u] = details.split('%');
            const trimmedQ = q.trim();
            amount = trimmedQ.includes('/') ? trimmedQ : (parseFloat(trimmedQ) || parseFraction(trimmedQ) || 1);
            unit = u.trim();
          } else {
            const trimmedD = details.trim();
            amount = trimmedD.includes('/') ? trimmedD : (parseFloat(trimmedD) || parseFraction(trimmedD) || 1);
          }
        }
      }

      const mention: StepMentionToken = {
        id: mentionId,
        type: 'ingredient',
        displayText: name,
        data: {
          ingredientId: name.toLowerCase().replace(/\s+/g, '-'),
          amount,
          unit,
          creatorNote
        }
      };
      mentions.push(mention);
      segments.push({
        type: 'mention',
        id: mentionId,
        mention
      });
    } else if (fullMatch.startsWith('#')) {
      const tokenContent = fullMatch.slice(1);
      const braceMatch = tokenContent.match(/^([^{]+)(?:\{[^}]*\})?$/);
      const name = (braceMatch ? braceMatch[1] : tokenContent).trim();

      const mention: StepMentionToken = {
        id: mentionId,
        type: 'cookware',
        displayText: name,
        data: {
          vesselId: name.toLowerCase().replace(/\s+/g, '-'),
          vesselSize: 'Normal'
        }
      };
      mentions.push(mention);
      segments.push({
        type: 'mention',
        id: mentionId,
        mention
      });
    } else if (fullMatch.startsWith('~')) {
      const braceMatch = fullMatch.match(/\{([^}]*)\}/);
      const timeSpec = braceMatch ? braceMatch[1] : '';
      const cleanSpec = timeSpec.replace('%', ' ').trim();
      const seconds = parseTimeStringToSeconds(cleanSpec);

      const mention: StepMentionToken = {
        id: mentionId,
        type: 'timer',
        displayText: cleanSpec || '5 min',
        data: {
          timerSec: seconds || 300,
          creatorNote: '',
          donenessDescription: ''
        }
      };
      mentions.push(mention);
      segments.push({
        type: 'mention',
        id: mentionId,
        mention
      });
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < stepText.length) {
    segments.push({
      type: 'text',
      id: `seg-text-${stepIndex}-${tokenCounter++}`,
      text: stepText.slice(lastIndex)
    });
  }

  if (segments.length === 0) {
    segments.push({
      type: 'text',
      id: `seg-text-${stepIndex}-1`,
      text: ''
    });
  }

  const cleanText = segments
    .map(s => (s.type === 'text' ? s.text : s.mention.displayText))
    .join('');

  return { cleanText, mentions, segments };
}

function resolveNodeSectionId(
  node: CanvasStepNode,
  nodesById: Map<string, CanvasStepNode>,
  knownSectionIds: Set<string>,
  fallbackSectionId: string
): string {
  if (node.sectionId && knownSectionIds.has(node.sectionId)) {
    return node.sectionId;
  }
  let curr: CanvasStepNode | undefined = node;
  const visited = new Set<string>();
  while (curr) {
    if (visited.has(curr.id)) break;
    visited.add(curr.id);
    if (curr.sectionId && knownSectionIds.has(curr.sectionId)) {
      return curr.sectionId;
    }
    if (curr.parentId && knownSectionIds.has(curr.parentId)) {
      return curr.parentId;
    }
    if (!curr.parentId || curr.parentId === 'root') break;
    curr = nodesById.get(curr.parentId);
  }
  return fallbackSectionId;
}

/**
 * Serializes workspace data into a schemaVersion 1 RecipeGraph
 */
export function exportStudioWorkspaceToRecipeGraph(workspace: StudioWorkspace): RecipeGraph {
  const inputsMap = new Map<string, RecipeInput>();
  const vesselsMap = new Map<string, RecipeVessel>();
  const stepNodes: RecipeStepNode[] = [];

  for (const node of workspace.canvasNodes) {
    const tokens: RecipeToken[] = [];
    if (node.segments && node.segments.length > 0) {
      for (const seg of node.segments) {
        if (seg.type === 'text') {
          if (seg.text) tokens.push({ type: 'text', text: seg.text });
        } else if (seg.type === 'mention') {
          const m = seg.mention;
          const isYieldMention = m.type === 'yield' || (m.type === 'ingredient' && Boolean(
            m.data?.yieldId || (m.data?.ingredientId && m.data.ingredientId.startsWith('yield-'))
          ));

          if (isYieldMention) {
            const rawYieldId = m.data?.yieldId || (m.data?.ingredientId ? m.data.ingredientId.replace(/^yield-/, '') : m.id);
            const fullYieldId = rawYieldId.startsWith('yield-') ? rawYieldId : `yield-${rawYieldId}`;
            tokens.push({
              type: 'yield',
              yieldId: fullYieldId,
              sourceStepId: rawYieldId,
              displayText: m.displayText,
              partition: m.data?.amount !== undefined ? String(m.data.amount) : 'all'
            });
          } else if (m.type === 'ingredient') {
            tokens.push({
              type: 'ingredient',
              inputId: m.data?.ingredientId || m.id,
              displayText: m.displayText,
              amount: m.data?.amount,
              unit: m.data?.unit,
              note: m.data?.creatorNote,
              isRemention: m.data?.isRemention
            });
          } else if (m.type === 'cookware') {
            tokens.push({
              type: 'cookware',
              vesselId: m.data?.vesselId || m.id,
              displayText: m.displayText
            });
          } else if (m.type === 'timer') {
            tokens.push({
              type: 'timer',
              timerId: m.id,
              displayText: m.displayText
            });
          }
        }
      }
    } else {
      tokens.push({ type: 'text', text: node.instructionText });
    }

    const consumedYieldsList: { yieldId: string; partition?: string }[] = [];

    for (const mention of node.mentions) {
      const isYieldMention = mention.type === 'yield' || (mention.type === 'ingredient' && Boolean(
        mention.data?.yieldId || (mention.data?.ingredientId && mention.data.ingredientId.startsWith('yield-'))
      ));

      if (isYieldMention) {
        const rawYieldId = mention.data?.yieldId || (mention.data?.ingredientId ? mention.data.ingredientId.replace(/^yield-/, '') : mention.id);
        const fullYieldId = rawYieldId.startsWith('yield-') ? rawYieldId : `yield-${rawYieldId}`;
        const partition = mention.data?.amount !== undefined ? String(mention.data.amount) : 'all';
        if (!consumedYieldsList.some(c => c.yieldId === fullYieldId)) {
          consumedYieldsList.push({ yieldId: fullYieldId, partition });
        }
      } else if (mention.type === 'ingredient' && mention.data && !mention.data.isRemention) {
        const inputId = mention.data.ingredientId || mention.id;
        if (!inputsMap.has(inputId)) {
          const rawAmount = mention.data.amount;
          const finalAmount =
            typeof rawAmount === 'string' && rawAmount.includes('/')
              ? rawAmount
              : typeof rawAmount === 'number'
              ? rawAmount
              : rawAmount
              ? parseFraction(rawAmount) || rawAmount || 1
              : 1;

          inputsMap.set(inputId, {
            id: inputId,
            name: mention.displayText,
            amount: finalAmount,
            unit: mention.data.unit || 'piece',
            notes: mention.data.creatorNote
          });
        }
      } else if (mention.type === 'cookware' && mention.data) {
        const vesselId = mention.data.vesselId || mention.id;
        if (!vesselsMap.has(vesselId)) {
          vesselsMap.set(vesselId, {
            id: vesselId,
            name: mention.displayText,
            type: 'bowl',
            size: mention.data.vesselSize || 'Normal'
          });
        }
      }
    }

    // Step node mapping
    const stepNode: RecipeStepNode = {
      id: node.id,
      componentId: 'component-main',
      isCountedStep: node.isCountedStep,
      isLinkedToPrevious: node.isLinkedToPrevious,
      instructionText: node.instructionText,
      tokens,
      media: node.media,
      showInlineTools: node.showInlineTools
    };

    if (consumedYieldsList.length > 0) {
      stepNode.consumesYields = consumedYieldsList;
    }

    if (node.producesYield) {
      stepNode.producesYield = {
        id: `yield-${node.id}`,
        name: node.producesYield.name,
        vesselId: node.producesYield.vesselId
      };
    }

    const timerMention = node.mentions.find(m => m.type === 'timer');
    if (timerMention && timerMention.data) {
      stepNode.timer = {
        id: `timer-${node.id}`,
        label: timerMention.displayText || 'Step Timer',
        minSec: timerMention.data.timerSec || 60,
        creatorNote: timerMention.data.creatorNote,
        donenessCue: timerMention.data.donenessDescription
          ? { type: 'visual', description: timerMention.data.donenessDescription }
          : undefined
      };
    }

    stepNodes.push(stepNode);
  }

  const rawSectionsList = (workspace.sections && workspace.sections.length > 0)
    ? workspace.sections.slice().sort((a, b) => a.order - b.order)
    : [{ id: 'section-main', name: 'Instructions', order: 0 }];

  const roots = rawSectionsList.filter(s => !s.parentSectionId || !rawSectionsList.some(p => p.id === s.parentSectionId));
  const sectionsList: typeof rawSectionsList = [];

  for (const root of roots) {
    sectionsList.push(root);
    const subs = rawSectionsList.filter(s => s.parentSectionId === root.id);
    for (const sub of subs) {
      sectionsList.push(sub);
    }
  }

  for (const s of rawSectionsList) {
    if (!sectionsList.some(item => item.id === s.id)) {
      sectionsList.push(s);
    }
  }

  const knownSectionIds = new Set(sectionsList.map(s => s.id));
  const nodesById = new Map(workspace.canvasNodes.map(n => [n.id, n]));
  const defaultSecId = sectionsList[0].id;

  const components = sectionsList.map(sec => {
    const secSteps = stepNodes.filter(sn => {
      const origNode = nodesById.get(sn.id);
      if (!origNode) return false;
      const sId = resolveNodeSectionId(origNode, nodesById, knownSectionIds, defaultSecId);
      return sId === sec.id;
    });

    return {
      id: `component-${sec.id}`,
      name: sec.name || 'Instructions',
      steps: secSteps.length > 0 ? secSteps : (sectionsList.length === 1 ? stepNodes : [])
    };
  });

  return {
    ...workspace.graph,
    schemaVersion: 2,
    id: workspace.graph?.id || workspace.id,
    title: workspace.title || 'Untitled Recipe',
    inputs: Array.from(inputsMap.values()),
    vessels: Array.from(vesselsMap.values()),
    components,
    sections: sectionsList
  };
}
