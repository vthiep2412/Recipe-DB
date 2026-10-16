import type { RecipeGraph, CanvasStepNode, StudioWorkspace } from '../types/orchestration';
import { formatFraction } from './cooklangParser';

function formatSecondsToDuration(sec?: number): string {
  if (!sec || sec <= 0) return '0m';
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function escapeRawYamlString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Generates valid F&Blang (.fablang) recipe content from a RecipeGraph or StudioWorkspace
 */
export function generateFablang(
  graph: RecipeGraph,
  canvasNodes?: CanvasStepNode[],
  _workspace?: StudioWorkspace
): string {
  const lines: string[] = [];

  // 1. YAML Frontmatter
  lines.push('---');
  lines.push(`title: "${escapeRawYamlString(graph.title || 'Untitled Recipe')}"`);

  if (graph.difficulty) {
    const diff = graph.difficulty.toLowerCase();
    lines.push(`difficulty: ${diff}`);
  }

  if (typeof graph.servings === 'number') {
    lines.push(`servings: ${graph.servings}`);
  }

  if (graph.author?.name) {
    lines.push(`author: "${escapeRawYamlString(graph.author.name)}"`);
  }

  if (graph.source?.url) {
    lines.push(`source: "${escapeRawYamlString(graph.source.url)}"`);
  }

  if (graph.description) {
    lines.push(`description: r"${escapeRawYamlString(graph.description)}"`);
  }

  if (graph.importantNotes) {
    lines.push(`important_notes: r"${escapeRawYamlString(graph.importantNotes)}"`);
  }

  // Times
  const times = graph.times;
  if (times) {
    const hasAnyTime =
      (times.prepSec && times.prepSec > 0) ||
      (times.cookSec && times.cookSec > 0) ||
      (times.bakeSec && times.bakeSec > 0) ||
      (times.restSec && times.restSec > 0) ||
      (times.custom && times.custom.length > 0);

    if (hasAnyTime) {
      lines.push('times:');
      if (times.prepSec && times.prepSec > 0) lines.push(`  prep: ${formatSecondsToDuration(times.prepSec)}`);
      if (times.cookSec && times.cookSec > 0) lines.push(`  cook: ${formatSecondsToDuration(times.cookSec)}`);
      if (times.bakeSec && times.bakeSec > 0) lines.push(`  bake: ${formatSecondsToDuration(times.bakeSec)}`);
      if (times.restSec && times.restSec > 0) lines.push(`  rest: ${formatSecondsToDuration(times.restSec)}`);

      if (times.custom && times.custom.length > 0) {
        lines.push('  custom:');
        for (const c of times.custom) {
          const durSec = typeof c.seconds === 'number' ? c.seconds : 0;
          lines.push(`    - label: "${escapeRawYamlString(c.label)}"`);
          lines.push(`      duration: ${formatSecondsToDuration(durSec)}`);
        }
      }
    }
  }

  // Media
  const media = graph.media;
  if (media && (media.pictureUrl || media.videoUrl || (media.galleryUrls && media.galleryUrls.length > 0))) {
    lines.push('media:');
    if (media.pictureUrl) lines.push(`  image: "${escapeRawYamlString(media.pictureUrl)}"`);
    if (media.videoUrl) lines.push(`  video: "${escapeRawYamlString(media.videoUrl)}"`);
    if (media.galleryUrls && media.galleryUrls.length > 0) {
      lines.push('  gallery:');
      for (const g of media.galleryUrls) {
        lines.push(`    - "${escapeRawYamlString(g)}"`);
      }
    }
  }

  lines.push('---');
  lines.push('');

  // 2. Sections and Steps
  const nodesMap = new Map<string, CanvasStepNode>();
  if (canvasNodes) {
    for (const node of canvasNodes) {
      nodesMap.set(node.id, node);
    }
  }

  const rawSections = graph.sections && graph.sections.length > 0
    ? graph.sections
    : [{ id: 'section-main', name: 'Instructions', order: 0 }];

  // Cluster sections hierarchically so child subsections immediately follow their parent root section
  const roots = rawSections.filter(s => !s.parentSectionId || !rawSections.some(p => p.id === s.parentSectionId));
  const sections: typeof rawSections = [];

  if (roots.length === 0 && rawSections.length > 0) {
    sections.push({ id: 'section-main', name: 'Instructions', order: 0 });
    for (const sub of rawSections) {
      sections.push(sub);
    }
  } else {
    for (const root of roots) {
      sections.push(root);
      const subs = rawSections.filter(s => s.parentSectionId === root.id);
      for (const sub of subs) {
        sections.push(sub);
      }
    }
    for (const s of rawSections) {
      if (!sections.some(item => item.id === s.id)) {
        sections.push(s);
      }
    }
  }

  for (const section of sections) {
    const isSub = Boolean(section.parentSectionId);
    const toolsSuffix = section.showInlineTools ? ' [tools]' : '';
    if (isSub) {
      lines.push(`!= ${section.name || 'Subsection'} =${toolsSuffix}`);
    } else {
      lines.push(`= ${section.name || 'Instructions'} =${toolsSuffix}`);
    }

    if (section.description) {
      lines.push(` > desc: ${section.description}`);
    }

    // Find steps for this section
    const matchingComponent = graph.components.find(c =>
      c.id === `component-${section.id}` || c.id === section.id
    ) || graph.components.find(c => c.name === section.name);
    let steps = matchingComponent ? matchingComponent.steps : [];
    if (steps.length === 0 && canvasNodes && canvasNodes.length > 0) {
      const matchingCanvasNodes = canvasNodes.filter(n => n.sectionId === section.id);
      if (matchingCanvasNodes.length > 0) {
        steps = matchingCanvasNodes as any;
      }
    }

    for (const step of steps) {
      const canvasNode = nodesMap.get(step.id);

      // Media directives for step
      const stepGallery = canvasNode?.media?.galleryUrls || (step.media?.galleryUrls);
      if (stepGallery && stepGallery.length > 0) {
        stepGallery.forEach((imgUrl, idx) => {
          lines.push(` > image${idx + 1}: ${imgUrl}`);
        });
      }

      const clip = canvasNode?.media?.videoClip || step.media?.videoClip;
      if (clip && (clip.startSec > 0 || (clip.endSec && clip.endSec > 0))) {
        const startM = Math.floor(clip.startSec / 60);
        const startS = clip.startSec % 60;
        const startStr = `${startM}:${startS < 10 ? '0' : ''}${startS}`;
        if (clip.endSec && clip.endSec > clip.startSec) {
          const endM = Math.floor(clip.endSec / 60);
          const endS = clip.endSec % 60;
          const endStr = `${endM}:${endS < 10 ? '0' : ''}${endS}`;
          lines.push(` > clip: ${startStr} to ${endStr}`);
        } else {
          lines.push(` > clip: ${startStr}`);
        }
      }

      // Step Prefix
      const isCounted = step.isCountedStep !== false;
      const prefix = isCounted ? ' - ' : ' + ';

      // Directives
      let directives = '';
      if (canvasNode?.title || (step as any).title) {
        const titleStr = canvasNode?.title || (step as any).title;
        directives += `[title: ${titleStr}] `;
      }
      if (step.isLinkedToPrevious) {
        directives += '[link] ';
      }
      if (canvasNode?.showInlineTools || step.showInlineTools) {
        directives += '[tools] ';
      }

      // Build step text with tokens
      let textContent = '';
      if (canvasNode && canvasNode.segments && canvasNode.segments.length > 0) {
        textContent = canvasNode.segments.map(seg => {
          if (seg.type === 'text') return seg.text;
          const m = seg.mention;
          const isYieldMention = m.type === 'yield' || Boolean(
            m.data?.yieldId || (m.data?.ingredientId && m.data.ingredientId.startsWith('yield-'))
          );

          if (isYieldMention) {
            const name = m.displayText;
            const vesselId = m.data?.yieldVesselId || '';
            const partition = m.data?.yieldPartition || (m.type === 'ingredient' && m.data?.amount !== undefined ? String(m.data.amount) : '');
            let specStr = '';
            if (partition && vesselId) {
              specStr = `{${partition}%#${vesselId}}`;
            } else if (partition) {
              specStr = `{${partition}}`;
            } else if (vesselId) {
              specStr = `{#${vesselId}}`;
            }
            const noteStr = m.data?.creatorNote ? `(${m.data.creatorNote})` : '';
            return `*${name}*${specStr}${noteStr}`;
          }

          if (m.type === 'ingredient') {
            const isRemention = Boolean(
              m.data && (m.data as any).isRemention
            );
            const prefixChar = isRemention ? '@@' : '@';
            const name = m.displayText;
            const noteStr = m.data?.creatorNote ? `(${m.data.creatorNote})` : '';

            if (isRemention && !m.data?.amount) {
              return `${prefixChar}${name}${noteStr || (name.includes(' ') ? '{}' : '')}`;
            }

            let amtStr = '';
            if (m.data?.amount !== undefined && m.data.amount !== '') {
              const formattedAmt = typeof m.data.amount === 'number' ? formatFraction(m.data.amount) : String(m.data.amount);
              const u = m.data?.unit ? `%${m.data.unit}` : '';
              amtStr = `{${formattedAmt}${u}}`;
            } else if (name.includes(' ') && !noteStr) {
              amtStr = '{}';
            }
            return `${prefixChar}${name}${amtStr}${noteStr}`;
          }

          if (m.type === 'cookware') {
            const name = m.displayText;
            const sizeStr = m.data?.vesselSize ? `{${m.data.vesselSize}}` : (name.includes(' ') ? '{}' : '');
            const noteStr = m.data?.creatorNote ? `(${m.data.creatorNote})` : '';
            return `#${name}${sizeStr}${noteStr}`;
          }

          if (m.type === 'timer') {
            const sec = m.data?.timerSec || 60;
            const noteStr = m.data?.creatorNote || m.data?.donenessDescription
              ? `(${m.data.creatorNote || m.data.donenessDescription})`
              : '';
            if (sec % 60 === 0) {
              const mins = Math.max(1, sec / 60);
              return `~{${mins}%minutes}${noteStr}`;
            }
            return `~{${sec}%seconds}${noteStr}`;
          }

          return `[${m.displayText}]`;
        }).join('');
      } else {
        textContent = step.instructionText;
      }

      // Append yield production syntax if step produces yield
      let yieldProductionSuffix = '';
      if (step.producesYield) {
        yieldProductionSuffix = ` -> *${step.producesYield.name}*{#${step.producesYield.vesselId}}`;
      }

      lines.push(`${prefix}${directives}${textContent.trim()}${yieldProductionSuffix}`);
    }

    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}
