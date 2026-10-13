import type {
  RecipeGraph,
  RecipeInput,
  RecipeVessel,
  RecipeStepNode,
  RecipeToken,
  CanvasStepNode,
  StudioWorkspace,
  StepMentionToken,
  StepInstructionSegment
} from '../types/orchestration';
import { parseFraction } from './cooklangParser';
import { parseTimeStringToSeconds } from '../constants/standardKitchenData';

export type IngestFormat = 'cooklang' | 'app_markdown' | 'plain_text';

export function detectInputFormat(text: string): IngestFormat {
  const trimmed = text.trim();
  if (!trimmed) return 'plain_text';

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
              note: m.data?.creatorNote
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
      } else if (mention.type === 'ingredient' && mention.data) {
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
      tokens
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

  const sectionsList = (workspace.sections && workspace.sections.length > 0)
    ? workspace.sections.slice().sort((a, b) => a.order - b.order)
    : [{ id: 'section-main', name: 'Instructions', order: 0 }];

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
    id: workspace.id,
    title: workspace.title || 'Untitled Recipe',
    inputs: Array.from(inputsMap.values()),
    vessels: Array.from(vesselsMap.values()),
    components,
    sections: workspace.sections
  };
}
