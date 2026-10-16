import type { RecipeGraph } from '../types/orchestration';
import type { RecipeJSON, RecipeIngredient, RecipeSection, RecipeStep, StepToken } from '../types/recipe';
import { parseFraction, formatFraction } from './cooklangParser';

function formatSecondsToDisplay(sec?: number): string | undefined {
  if (!sec) return undefined;
  const mins = Math.round(sec / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} minutes`;
}

/**
 * Adapts RecipeGraph JSON into RecipeJSON preserving exact token structure and styles
 */
export function recipeGraphToRecipeJSON(graph: RecipeGraph): RecipeJSON {
  const ingredients: RecipeIngredient[] = graph.inputs.map((inp, idx) => {
    const rawAmt = inp.amount;
    const numVal = typeof rawAmt === 'number'
      ? rawAmt
      : rawAmt
      ? parseFraction(rawAmt)
      : null;

    let displayAmt = '';
    if (typeof rawAmt === 'number') {
      displayAmt = formatFraction(rawAmt);
    } else if (typeof rawAmt === 'string') {
      const parsed = parseFraction(rawAmt);
      displayAmt = parsed !== null ? formatFraction(parsed) : rawAmt;
    }

    const unitStr = inp.unit ? ` ${inp.unit}` : '';
    const quantityText = displayAmt ? `${displayAmt}${unitStr}`.trim() : null;

    return {
      id: inp.id || `ing-${idx + 1}`,
      name: inp.name,
      quantityValue: numVal,
      unit: inp.unit || null,
      quantityText,
      note: inp.notes || null,
      isHidden: false
    };
  });

  const sections: RecipeSection[] = graph.components.map(comp => {
    const rawSecId = comp.id.replace(/^component-/, '');
    const sectionMeta = graph.sections?.find(s => s.id === rawSecId || s.name === comp.name);
    const sectionShowInline = sectionMeta?.showInlineTools ?? false;

    const steps: RecipeStep[] = comp.steps.map((node, stepIdx) => {
      const tokens: StepToken[] = [];

      for (const tok of node.tokens) {
        if (tok.type === 'text') {
          tokens.push({ type: 'text', value: tok.text });
        } else if (tok.type === 'ingredient') {
          const rawAmt = tok.amount;
          let displayAmt = '';
          if (typeof rawAmt === 'number') {
            displayAmt = formatFraction(rawAmt);
          } else if (typeof rawAmt === 'string') {
            const parsed = parseFraction(rawAmt);
            displayAmt = parsed !== null ? formatFraction(parsed) : rawAmt;
          }
          const unitStr = tok.unit ? ` ${tok.unit}` : '';
          const quantityText = tok.isRemention
            ? undefined
            : (displayAmt ? `${displayAmt}${unitStr}`.trim() : undefined);

          tokens.push({
            type: 'ingredient',
            name: tok.displayText,
            quantityText,
            note: tok.note,
            isHidden: false
          });
        } else if (tok.type === 'cookware') {
          tokens.push({
            type: 'cookware',
            name: tok.displayText
          });
        } else if (tok.type === 'timer') {
          tokens.push({
            type: 'timer',
            durationText: tok.displayText.replace('⏱', '').trim(),
            timerId: tok.timerId
          });
        } else if (tok.type === 'yield') {
          tokens.push({
            type: 'yield',
            yieldId: tok.yieldId,
            displayText: tok.displayText,
            partition: tok.partition
          });
        }
      }

      return {
        index: stepIdx + 1,
        rawText: node.instructionText,
        tokens,
        stepId: node.id,
        isCountedStep: node.isCountedStep,
        producesYield: node.producesYield,
        image: node.media?.galleryUrls?.[0],
        media: node.media,
        showInlineTools: node.showInlineTools ?? sectionShowInline
      };
    });

    return {
      id: comp.id,
      name: comp.name || 'Instructions',
      description: sectionMeta?.description,
      steps
    };
  });

  const totalTime = formatSecondsToDisplay(graph.times.totalSec)
    || formatSecondsToDisplay(graph.times.cookSec)
    || '20 minutes';

  const diffStr = graph.difficulty
    ? graph.difficulty.charAt(0).toUpperCase() + graph.difficulty.slice(1)
    : 'Medium';

  return {
    id: graph.id,
    title: graph.title,
    description: graph.description || '',
    image: graph.media?.pictureUrl || 'https://bakewithzoha.com/wp-content/uploads/2025/11/smores-cookie-featured2.jpg',
    gallery: graph.media?.galleryUrls || [],
    video: graph.media?.videoUrl,
    importantNotes: graph.importantNotes,
    author: {
      name: graph.author?.name || 'anonymous'
    },
    source: graph.source?.url ? { url: graph.source.url } : undefined,
    servings: {
      base: graph.servings || 5,
      unitName: 'large cookies'
    },
    difficulty: diffStr,
    times: {
      total: totalTime,
      prep: formatSecondsToDisplay(graph.times.prepSec) || '20 minutes',
      cook: formatSecondsToDisplay(graph.times.cookSec) || '20 minutes',
      bake: formatSecondsToDisplay(graph.times.bakeSec),
      rest: formatSecondsToDisplay(graph.times.restSec)
    },
    tags: ['cookies', 'dessert', 'smores', 'baking'],
    metadata: {},
    ingredients,
    sections,
    rawCooklang: ''
  };
}

/**
 * Normalizes any legacy or untyped StudioWorkspace data into a valid StudioWorkspace
 * Prevents app crashes from outdated schemas or missing properties
 */
export function normalizeWorkspace(ws: any): import('../types/orchestration').StudioWorkspace {
  if (!ws) {
    throw new Error('Workspace is null or undefined');
  }

  const sections: import('../types/orchestration').CanvasSection[] = Array.isArray(ws.sections) && ws.sections.length > 0
    ? ws.sections
    : [
        {
          id: 'section-1',
          name: 'Instructions',
          order: 0,
          colorIndex: 0
        }
      ];

  const defaultSectionId = sections[0].id;

  const canvasNodes: import('../types/orchestration').CanvasStepNode[] = Array.isArray(ws.canvasNodes)
    ? ws.canvasNodes.map((node: any) => {
        const parentId = (!node.parentId || node.parentId === 'root') ? defaultSectionId : node.parentId;
        const sectionId = node.sectionId || defaultSectionId;
        return {
          ...node,
          parentId,
          sectionId,
          isCountedStep: node.isCountedStep !== false,
          isLinkedToPrevious: Boolean(node.isLinkedToPrevious),
          mentions: Array.isArray(node.mentions) ? node.mentions : [],
          media: node.media || {}
        };
      })
    : [];

  const graph: import('../types/orchestration').RecipeGraph = {
    schemaVersion: 2,
    id: ws.graph?.id || ws.id || `recipe-${Date.now()}`,
    title: ws.graph?.title || ws.title || 'Untitled Recipe',
    servings: ws.graph?.servings || 4,
    difficulty: ws.graph?.difficulty || 'medium',
    description: ws.graph?.description || '',
    tips: ws.graph?.tips || '',
    importantNotes: ws.graph?.importantNotes || '',
    author: {
      name: ws.graph?.author?.name || ws.author?.name || 'anonymous'
    },
    source: (ws.graph?.source?.url || ws.source?.url) ? { url: ws.graph?.source?.url || ws.source?.url } : undefined,
    media: {
      pictureUrl: ws.graph?.media?.pictureUrl || '',
      videoUrl: ws.graph?.media?.videoUrl || '',
      galleryUrls: Array.isArray(ws.graph?.media?.galleryUrls) ? ws.graph.media.galleryUrls : []
    },
    times: {
      prepSec: ws.graph?.times?.prepSec || 0,
      cookSec: ws.graph?.times?.cookSec || 0,
      bakeSec: ws.graph?.times?.bakeSec || 0,
      restSec: ws.graph?.times?.restSec || 0,
      totalSec: ws.graph?.times?.totalSec || 0,
      custom: Array.isArray(ws.graph?.times?.custom) ? ws.graph.times.custom : []
    },
    inputs: Array.isArray(ws.graph?.inputs) ? ws.graph.inputs : [],
    vessels: Array.isArray(ws.graph?.vessels) ? ws.graph.vessels : [],
    components: Array.isArray(ws.graph?.components) ? ws.graph.components : [],
    sections
  };

  return {
    id: ws.id || `ws-${Date.now()}`,
    title: ws.title || graph.title,
    createdAt: ws.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    graph,
    sections,
    canvasNodes,
    customIngredients: Array.isArray(ws.customIngredients) ? ws.customIngredients : [],
    customCookware: Array.isArray(ws.customCookware) ? ws.customCookware : []
  };
}
