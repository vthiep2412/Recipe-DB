import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import { ArrowLeft, Settings } from 'lucide-preact';
import type {
  StudioWorkspace,
  CanvasStepNode,
  CanvasSection
} from '../../types/orchestration';
import { exportStudioWorkspaceToRecipeGraph } from '../../parser/orchestrationParser';
import { SectionNode } from './SectionNode';
import { StepNode } from './StepNode';
import { NodeInspector } from './NodeInspector';
import { SidebarToolbox } from './SidebarToolbox';
import { PreviewDrawer } from './PreviewDrawer';
import { MediaModal } from './MediaModal';
import { CustomItemModal } from './CustomItemModal';
import { RecipeMetadataModal } from './RecipeMetadataModal';
import { CascadeDeleteModal } from './CascadeDeleteModal';
import { ExportRecipeModal } from './ExportRecipeModal';
import { ReparentSectionModal } from './ReparentSectionModal';

interface KitchenCanvasProps {
  workspace: StudioWorkspace;
  onUpdateWorkspace: (workspace: StudioWorkspace) => void;
  onBackToHub: () => void;
}

interface NodeLayoutPos {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function sanitizeYieldsFromDeleted(node: CanvasStepNode, deletedIds: Set<string>): CanvasStepNode {
  const hasYieldFromDeleted = node.mentions.some(
    m => (m.data?.yieldId && deletedIds.has(m.data.yieldId)) ||
         (m.data?.ingredientId && deletedIds.has(m.data.ingredientId.replace(/^yield-/, '')))
  );
  if (!hasYieldFromDeleted) return node;

  const nextMentions = node.mentions.map(m => {
    const yId = m.data?.yieldId || (m.data?.ingredientId ? m.data.ingredientId.replace(/^yield-/, '') : '');
    if (yId && deletedIds.has(yId)) {
      return {
        ...m,
        displayText: `${m.displayText} (Deleted Step)`,
        data: { ...m.data, yieldId: undefined, yieldStepTitle: undefined }
      };
    }
    return m;
  });

  const nextSegments = (node.segments || []).map(seg => {
    if (seg.type === 'mention') {
      const yId = seg.mention.data?.yieldId || (seg.mention.data?.ingredientId ? seg.mention.data.ingredientId.replace(/^yield-/, '') : '');
      if (yId && deletedIds.has(yId)) {
        return {
          ...seg,
          mention: {
            ...seg.mention,
            displayText: `${seg.mention.displayText} (Deleted Step)`,
            data: { ...seg.mention.data, yieldId: undefined, yieldStepTitle: undefined }
          }
        };
      }
    }
    return seg;
  });

  return { ...node, mentions: nextMentions, segments: nextSegments };
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

function clusterSectionsHierarchically(sections: CanvasSection[]): CanvasSection[] {
  const roots = sections.filter(s => !s.parentSectionId || !sections.some(p => p.id === s.parentSectionId));
  const result: CanvasSection[] = [];
  for (const root of roots) {
    result.push(root);
    const subs = sections.filter(s => s.parentSectionId === root.id);
    for (const sub of subs) {
      result.push(sub);
    }
  }
  for (const s of sections) {
    if (!result.some(r => r.id === s.id)) {
      result.push(s);
    }
  }
  return result.map((s, idx) => ({ ...s, order: idx }));
}

function reorderSectionsAndNodes(
  newSections: CanvasSection[],
  currentNodes: CanvasStepNode[]
): { sections: CanvasSection[]; canvasNodes: CanvasStepNode[] } {
  const clusteredSections = clusterSectionsHierarchically(newSections);

  const knownSectionIds = new Set(clusteredSections.map(s => s.id));
  const nodesById = new Map(currentNodes.map(n => [n.id, n]));
  const defaultSecId = clusteredSections[0]?.id || 'sec-main';

  const nodesBySection: Record<string, CanvasStepNode[]> = {};
  for (const s of clusteredSections) {
    nodesBySection[s.id] = [];
  }

  for (const node of currentNodes) {
    const sId = resolveNodeSectionId(node, nodesById, knownSectionIds, defaultSecId);
    if (!nodesBySection[sId]) nodesBySection[sId] = [];
    nodesBySection[sId].push({ ...node, sectionId: sId });
  }

  const nextNodes: CanvasStepNode[] = [];
  for (const s of clusteredSections) {
    const secNodes = nodesBySection[s.id] || [];
    nextNodes.push(...secNodes);
  }

  for (const [secId, sNodes] of Object.entries(nodesBySection)) {
    if (!knownSectionIds.has(secId)) {
      nextNodes.push(...sNodes);
    }
  }

  let countedStepIdx = 1;
  const resequencedNodes = nextNodes.map(n => {
    if (!n.isCountedStep) return n;
    const currentNum = countedStepIdx++;
    if (!n.title || /^step\s*\d+$/i.test(n.title.trim())) {
      return { ...n, title: `Step ${currentNum}` };
    }
    return n;
  });

  return {
    sections: clusteredSections,
    canvasNodes: resequencedNodes
  };
}

export function KitchenCanvas({
  workspace,
  onUpdateWorkspace,
  onBackToHub
}: KitchenCanvasProps) {
  // Canvas navigation state
  const [pan, setPan] = useState({ x: Math.max(window.innerWidth / 2 - 340, 40), y: 80 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).matches('input, textarea')) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Normalise sections list with fallback
  const currentSections = useMemo((): CanvasSection[] => {
    if (workspace.sections && workspace.sections.length > 0) {
      return [...workspace.sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return [{ id: 'sec-main', name: 'Main', order: 0, showInlineTools: false }];
  }, [workspace.sections]);

  // Selection state
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => currentSections[0]?.id || 'sec-main');
  const [activeMentionId, setActiveMentionId] = useState<string | null>(null);
  const [isYieldMode, setIsYieldMode] = useState(false);
  const [highlightedStepId, setHighlightedStepId] = useState<string | null>(null);
  const [isSmoothPan, setIsSmoothPan] = useState(false);

  // Selected entities
  const selectedSection = useMemo(() => {
    return currentSections.find(s => s.id === selectedNodeId) || null;
  }, [currentSections, selectedNodeId]);

  const selectedStep = useMemo(() => {
    return workspace.canvasNodes.find(n => n.id === selectedNodeId) || null;
  }, [workspace.canvasNodes, selectedNodeId]);

  // Active mention
  const activeMention = useMemo(() => {
    if (!selectedStep || !activeMentionId) return null;
    return selectedStep.mentions.find(m => m.id === activeMentionId) || null;
  }, [selectedStep, activeMentionId]);

  // Modals state
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [mediaModalType, setMediaModalType] = useState<'picture' | 'video' | null>(null);
  const [customItemModalType, setCustomItemModalType] = useState<'ingredient' | 'cookware' | null>(null);
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    type: 'section' | 'step';
    id: string;
    title: string;
    itemCount: number;
  } | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isReparentModalOpen, setIsReparentModalOpen] = useState(false);
  const [reorderAnimatingDeltas, setReorderAnimatingDeltas] = useState<Record<string, number>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3500);
  };

  const canvasRef = useRef<HTMLDivElement>(null);
  const transformLayerRef = useRef<HTMLDivElement>(null);

  // Auto save state
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  const updateWorkspaceState = (updated: StudioWorkspace) => {
    setSaveStatus('saving');
    onUpdateWorkspace(updated);
    setTimeout(() => setSaveStatus('saved'), 300);
  };

  // Backfill explicit sectionId on any unassigned canvas nodes
  useEffect(() => {
    const knownSectionIds = new Set(currentSections.map(s => s.id));
    const defaultSecId = currentSections[0]?.id || 'sec-main';
    const nodesById = new Map(workspace.canvasNodes.map(n => [n.id, n]));
    let needsUpdate = false;
    const nextNodes = workspace.canvasNodes.map(node => {
      if (!node.sectionId || !knownSectionIds.has(node.sectionId)) {
        const resolved = resolveNodeSectionId(node, nodesById, knownSectionIds, defaultSecId);
        if (node.sectionId !== resolved) {
          needsUpdate = true;
          return { ...node, sectionId: resolved };
        }
      }
      return node;
    });
    if (needsUpdate) {
      updateWorkspaceState({ ...workspace, canvasNodes: nextNodes });
    }
  }, [workspace.canvasNodes, currentSections]);

  // Compile active recipe graph
  const activeGraph = useMemo(() => {
    return exportStudioWorkspaceToRecipeGraph(workspace);
  }, [workspace]);

  const hasMasterVideo = Boolean(workspace.graph.media?.videoUrl);

  const panRef = useRef(pan);
  panRef.current = pan;

  // Drag reordering for section columns
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [dragCurrentDeltaX, setDragCurrentDeltaX] = useState<number>(0);
  const dragStartCanvasPointerXRef = useRef<number>(0);
  const dragRafIdRef = useRef<number | null>(null);
  const dragPointerClientXRef = useRef<number>(0);

  // Pan interaction handlers supporting middle click, spacebar, and canvas drag
  const handleMouseDown = (e: MouseEvent) => {
    const isMiddleClick = e.button === 1;
    const isBackgroundClick = !(e.target as HTMLElement).closest(
      '.studio-canvas-node, .section-node-card, .studio-sidebar-toolbox, .studio-json-drawer, .studio-preview-drawer, .studio-inspector-card, .canvas-top-bar, .universal-dropdown-container, .universal-dropdown-portal, .studio-modal-overlay, .studio-modal-backdrop'
    );

    // If click is outside the inspector and outside nodes, close the inspector
    const isInsideInspector = Boolean((e.target as HTMLElement).closest('.canvas-inspector-anchor, .studio-inspector-card, .universal-dropdown-container, .universal-dropdown-portal'));
    const isInsideSelectedStep = Boolean((e.target as HTMLElement).closest(`.studio-canvas-node[data-node-id="${selectedNodeId}"]`));
    if (!isInsideInspector && !isInsideSelectedStep) {
      if (activeMentionId || isYieldMode) {
        setActiveMentionId(null);
        setIsYieldMode(false);
      }
    }

    if (isMiddleClick || isSpacePressed || isBackgroundClick) {
      if (isMiddleClick) e.preventDefault();
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: WheelEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('.json-drawer-content') ||
      target.closest('.studio-preview-drawer') ||
      target.closest('.universal-dropdown-list') ||
      target.closest('.universal-dropdown-container') ||
      target.closest('.compact-dropdown-menu') ||
      target.closest('.compact-dropdown-container') ||
      target.closest('.studio-inspector-card') ||
      target.closest('.studio-modal-card') ||
      target.closest('.metadata-modal-dialog')
    ) {
      return;
    }
    e.preventDefault();

    const container = canvasRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const canvasX = (mouseX - pan.x) / zoom;
    const canvasY = (mouseY - pan.y) / zoom;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const nextZoom = Math.min(Math.max(zoom * zoomFactor, 0.4), 2.0);

    const nextPanX = mouseX - canvasX * nextZoom;
    const nextPanY = mouseY - canvasY * nextZoom;

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  };

  // Node dimension constants
  const SECTION_DEFAULT_WIDTH = 576;
  const SECTION_DEFAULT_HEIGHT = 160;
  const SUBSECTION_DEFAULT_WIDTH = 512;
  const STEP_DEFAULT_WIDTH = 576;
  const STEP_DEFAULT_HEIGHT = 260;

  const SECTION_ACCENT_COLORS = [
    '#ff7a00'
  ];

  const VERTICAL_GAP = 90;
  const HORIZONTAL_GAP = 80;

  interface NodeSize {
    width: number;
    height: number;
  }

  const [nodeSizes, setNodeSizes] = useState<Record<string, NodeSize>>({});
  const observerMapRef = useRef<Map<string, ResizeObserver>>(new Map());
  const restingLayoutRef = useRef<{ baseColumnX: Record<string, number>; slotWidths: Record<string, number> }>({ baseColumnX: {}, slotWidths: {} });

  const registerNodeRef = (id: string, el: HTMLElement | null) => {
    if (!el) {
      const existing = observerMapRef.current.get(id);
      if (existing) {
        existing.disconnect();
        observerMapRef.current.delete(id);
      }
      return;
    }

    const nodeCard = (el.querySelector('.studio-canvas-node, .section-node-card') as HTMLElement) || el;
    const initialW = Math.round(nodeCard.offsetWidth);
    const initialH = Math.round(nodeCard.offsetHeight);
    if (initialW > 0 && initialH > 0) {
      setNodeSizes(prev => {
        const curr = prev[id];
        if (curr && Math.abs(curr.width - initialW) < 1 && Math.abs(curr.height - initialH) < 1) {
          return prev;
        }
        return { ...prev, [id]: { width: initialW, height: initialH } };
      });
    }

    if (!observerMapRef.current.has(id)) {
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          const borderBox = entry.borderBoxSize?.[0];
          const w = Math.round(borderBox?.inlineSize || target.offsetWidth || 0);
          const h = Math.round(borderBox?.blockSize || target.offsetHeight || 0);
          if (w > 0 && h > 0) {
            setNodeSizes(prev => {
              const curr = prev[id];
              if (curr && Math.abs(curr.width - w) < 1 && Math.abs(curr.height - h) < 1) {
                return prev;
              }
              return { ...prev, [id]: { width: w, height: h } };
            });
          }
        }
      });
      observer.observe(nodeCard);
      observerMapRef.current.set(id, observer);
    }
  };

  useEffect(() => {
    return () => {
      observerMapRef.current.forEach(obs => obs.disconnect());
      observerMapRef.current.clear();
    };
  }, []);

  // Group sections hierarchically: roots followed immediately by child subsections
  const { orderedSections, sectionParentMap, sectionAccentMap, clusters } = useMemo(() => {
    const roots = currentSections.filter(s => !s.parentSectionId || !currentSections.some(p => p.id === s.parentSectionId));
    const ordered: CanvasSection[] = [];
    const parentMap: Record<string, CanvasSection> = {};
    const accentMap: Record<string, string> = {};
    const clusterList: { root: CanvasSection; subsections: CanvasSection[]; accentColor: string }[] = [];

    roots.forEach((root, rootIdx) => {
      const accent = SECTION_ACCENT_COLORS[rootIdx % SECTION_ACCENT_COLORS.length];
      const subs = currentSections.filter(s => s.parentSectionId === root.id);
      accentMap[root.id] = accent;
      ordered.push(root);

      subs.forEach(sub => {
        parentMap[sub.id] = root;
        accentMap[sub.id] = accent;
        ordered.push(sub);
      });

      clusterList.push({
        root,
        subsections: subs,
        accentColor: accent
      });
    });

    for (const s of currentSections) {
      if (!ordered.some(o => o.id === s.id)) {
        ordered.push(s);
        accentMap[s.id] = SECTION_ACCENT_COLORS[0];
      }
    }

    return {
      orderedSections: ordered,
      sectionParentMap: parentMap,
      sectionAccentMap: accentMap,
      clusters: clusterList
    };
  }, [currentSections]);

  // Compute dynamic positions for sections and child steps with real-time sliding
  const nodePositions = useMemo(() => {
    const positions: Record<string, NodeLayoutPos> = {};
    const knownSectionIds = new Set(orderedSections.map(s => s.id));
    const nodesById = new Map(workspace.canvasNodes.map(n => [n.id, n]));
    const defaultSecId = orderedSections[0]?.id || 'sec-main';

    const stepsBySection: Record<string, CanvasStepNode[]> = {};
    for (const sec of orderedSections) {
      stepsBySection[sec.id] = [];
    }
    for (const node of workspace.canvasNodes) {
      const sId = resolveNodeSectionId(node, nodesById, knownSectionIds, defaultSecId);
      if (!stepsBySection[sId]) stepsBySection[sId] = [];
      stepsBySection[sId].push(node);
    }

    const childrenByParent: Record<string, CanvasStepNode[]> = {};
    for (const node of workspace.canvasNodes) {
      const pId = node.parentId || defaultSecId;
      if (!childrenByParent[pId]) childrenByParent[pId] = [];
      childrenByParent[pId].push(node);
    }

    const getSubtreeWidth = (nodeId: string): number => {
      const children = childrenByParent[nodeId] || [];
      const ownWidth = nodeSizes[nodeId]?.width || STEP_DEFAULT_WIDTH;
      if (children.length === 0) return ownWidth;
      const childrenTotalWidth = children.reduce((acc, c, idx) => {
        return acc + getSubtreeWidth(c.id) + (idx > 0 ? 60 : 0);
      }, 0);
      return Math.max(ownWidth, childrenTotalWidth);
    };

    // First pass: compute resting base X and slot widths for all columns
    const baseColumnX: Record<string, number> = {};
    const slotWidths: Record<string, number> = {};
    let currentColumnX = 0;

    for (let secIdx = 0; secIdx < orderedSections.length; secIdx++) {
      const sec = orderedSections[secIdx];
      const isSub = Boolean(sec.parentSectionId);
      const defaultW = isSub ? SUBSECTION_DEFAULT_WIDTH : SECTION_DEFAULT_WIDTH;
      const secSteps = stepsBySection[sec.id] || [];
      const secW = nodeSizes[sec.id]?.width || defaultW;

      const rootStepNodes = secSteps.filter(
        n => n.parentId === sec.id || n.parentId === 'root' || !workspace.canvasNodes.some(x => x.id === n.parentId)
      );

      const subtreeWidths = rootStepNodes.map(r => getSubtreeWidth(r.id));
      const rootsTotalW = subtreeWidths.reduce((acc, w, idx) => acc + w + (idx > 0 ? 60 : 0), 0);
      const columnSlotWidth = Math.max(secW, rootsTotalW, defaultW);

      baseColumnX[sec.id] = currentColumnX;
      slotWidths[sec.id] = columnSlotWidth;
      currentColumnX += columnSlotWidth + HORIZONTAL_GAP;
    }

    restingLayoutRef.current = { baseColumnX, slotWidths };

    // Compute live real-time drag sliding deltas
    const liveDeltas: Record<string, number> = {};
    if (draggingSectionId) {
      const draggedCluster = clusters.find(c => c.root.id === draggingSectionId);
      if (draggedCluster) {
        // Atomic cluster drag: root and all subsections move together
        for (const member of [draggedCluster.root, ...draggedCluster.subsections]) {
          liveDeltas[member.id] = dragCurrentDeltaX;
        }

        const draggedClusterStartX = baseColumnX[draggedCluster.root.id] || 0;
        const lastMember = draggedCluster.subsections[draggedCluster.subsections.length - 1] || draggedCluster.root;
        const draggedClusterEndX = (baseColumnX[lastMember.id] || 0) + (slotWidths[lastMember.id] || SECTION_DEFAULT_WIDTH);
        const draggedClusterWidth = draggedClusterEndX - draggedClusterStartX;
        const draggedClusterCenter = draggedClusterStartX + draggedClusterWidth / 2 + dragCurrentDeltaX;
        const clusterIndex = clusters.indexOf(draggedCluster);

        // Real-time 50% midpoint crossover detection for other clusters
        clusters.forEach((otherCluster, oIdx) => {
          if (oIdx === clusterIndex) return;
          const otherStartX = baseColumnX[otherCluster.root.id] || 0;
          const otherLast = otherCluster.subsections[otherCluster.subsections.length - 1] || otherCluster.root;
          const otherEndX = (baseColumnX[otherLast.id] || 0) + (slotWidths[otherLast.id] || SECTION_DEFAULT_WIDTH);
          const otherWidth = otherEndX - otherStartX;
          const otherCenter = otherStartX + otherWidth / 2;

          if (oIdx > clusterIndex) {
            const midpoint = (draggedClusterStartX + draggedClusterWidth / 2 + otherCenter) / 2;
            if (draggedClusterCenter > midpoint) {
              const slideShift = -(draggedClusterWidth + HORIZONTAL_GAP);
              for (const m of [otherCluster.root, ...otherCluster.subsections]) {
                liveDeltas[m.id] = slideShift;
              }
            }
          } else {
            const midpoint = (draggedClusterStartX + draggedClusterWidth / 2 + otherCenter) / 2;
            if (draggedClusterCenter < midpoint) {
              const slideShift = (draggedClusterWidth + HORIZONTAL_GAP);
              for (const m of [otherCluster.root, ...otherCluster.subsections]) {
                liveDeltas[m.id] = slideShift;
              }
            }
          }
        });
      } else {
        // Individual subsection drag within cluster
        liveDeltas[draggingSectionId] = dragCurrentDeltaX;
        const parentCluster = clusters.find(c => c.subsections.some(s => s.id === draggingSectionId));
        if (parentCluster) {
          const subIdx = parentCluster.subsections.findIndex(s => s.id === draggingSectionId);
          const draggedSub = parentCluster.subsections[subIdx];
          const draggedBaseX = baseColumnX[draggedSub.id] || 0;
          const draggedW = slotWidths[draggedSub.id] || SUBSECTION_DEFAULT_WIDTH;
          const draggedCenter = draggedBaseX + draggedW / 2 + dragCurrentDeltaX;

          parentCluster.subsections.forEach((sibling, sibIdx) => {
            if (sibIdx === subIdx) return;
            const sibBaseX = baseColumnX[sibling.id] || 0;
            const sibW = slotWidths[sibling.id] || SUBSECTION_DEFAULT_WIDTH;
            const sibCenter = sibBaseX + sibW / 2;

            if (sibIdx > subIdx) {
              const midpoint = (draggedBaseX + draggedW / 2 + sibCenter) / 2;
              if (draggedCenter > midpoint) {
                liveDeltas[sibling.id] = -(draggedW + HORIZONTAL_GAP);
              }
            } else {
              const midpoint = (draggedBaseX + draggedW / 2 + sibCenter) / 2;
              if (draggedCenter < midpoint) {
                liveDeltas[sibling.id] = (draggedW + HORIZONTAL_GAP);
              }
            }
          });
        }
      }
    }

    // Second pass: position section headers and subtrees
    for (let secIdx = 0; secIdx < orderedSections.length; secIdx++) {
      const sec = orderedSections[secIdx];
      const isSub = Boolean(sec.parentSectionId);
      const defaultW = isSub ? SUBSECTION_DEFAULT_WIDTH : SECTION_DEFAULT_WIDTH;
      const secSteps = stepsBySection[sec.id] || [];
      const secW = nodeSizes[sec.id]?.width || defaultW;
      const secH = nodeSizes[sec.id]?.height || SECTION_DEFAULT_HEIGHT;
      const columnSlotWidth = slotWidths[sec.id] || defaultW;

      const secPosDeltaX = liveDeltas[sec.id] || 0;
      const columnCenterX = (baseColumnX[sec.id] || 0) + columnSlotWidth / 2 + secPosDeltaX;
      const secX = columnCenterX - secW / 2;
      const secY = 0;

      positions[sec.id] = {
        id: sec.id,
        x: secX,
        y: secY,
        width: secW,
        height: secH
      };

      const layoutSubtree = (parentId: string, parentPos: NodeLayoutPos) => {
        const children = childrenByParent[parentId] || [];
        if (children.length === 0) return;

        const parentActualH = nodeSizes[parentId]?.height || parentPos.height;
        const parentActualW = nodeSizes[parentId]?.width || parentPos.width;
        const parentCenterX = parentPos.x + parentActualW / 2;
        const childY = parentPos.y + parentActualH + VERTICAL_GAP;

        if (children.length === 1) {
          const child = children[0];
          const childW = nodeSizes[child.id]?.width || STEP_DEFAULT_WIDTH;
          const childH = nodeSizes[child.id]?.height || STEP_DEFAULT_HEIGHT;
          const childX = parentCenterX - childW / 2;
          positions[child.id] = {
            id: child.id,
            x: childX,
            y: childY,
            width: childW,
            height: childH
          };
          layoutSubtree(child.id, positions[child.id]);
        } else {
          const cSubtreeWidths = children.map(c => getSubtreeWidth(c.id));
          const totalBranchWidth = cSubtreeWidths.reduce((acc, w, idx) => acc + w + (idx > 0 ? 60 : 0), 0);
          let currentChildX = parentCenterX - totalBranchWidth / 2;

          for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const slotW = cSubtreeWidths[i];
            const childW = nodeSizes[child.id]?.width || STEP_DEFAULT_WIDTH;
            const childH = nodeSizes[child.id]?.height || STEP_DEFAULT_HEIGHT;
            const childX = currentChildX + (slotW - childW) / 2;

            positions[child.id] = {
              id: child.id,
              x: childX,
              y: childY,
              width: childW,
              height: childH
            };
            layoutSubtree(child.id, positions[child.id]);
            currentChildX += slotW + 60;
          }
        }
      };

      const rootStepNodes = secSteps.filter(
        n => n.parentId === sec.id || n.parentId === 'root' || !workspace.canvasNodes.some(x => x.id === n.parentId)
      );

      const subtreeWidths = rootStepNodes.map(r => getSubtreeWidth(r.id));
      const rootsTotalW = subtreeWidths.reduce((acc, w, idx) => acc + w + (idx > 0 ? 60 : 0), 0);

      if (rootStepNodes.length === 1) {
        const rootStep = rootStepNodes[0];
        const rW = nodeSizes[rootStep.id]?.width || STEP_DEFAULT_WIDTH;
        const rH = nodeSizes[rootStep.id]?.height || STEP_DEFAULT_HEIGHT;
        const rX = columnCenterX - rW / 2;
        const rY = secY + secH + VERTICAL_GAP;
        positions[rootStep.id] = {
          id: rootStep.id,
          x: rX,
          y: rY,
          width: rW,
          height: rH
        };
        layoutSubtree(rootStep.id, positions[rootStep.id]);
      } else if (rootStepNodes.length > 1) {
        let currentRootX = columnCenterX - rootsTotalW / 2;
        for (let i = 0; i < rootStepNodes.length; i++) {
          const rootStep = rootStepNodes[i];
          const slotW = subtreeWidths[i];
          const rW = nodeSizes[rootStep.id]?.width || STEP_DEFAULT_WIDTH;
          const rH = nodeSizes[rootStep.id]?.height || STEP_DEFAULT_HEIGHT;
          const rX = currentRootX + (slotW - rW) / 2;
          const rY = secY + secH + VERTICAL_GAP;
          positions[rootStep.id] = {
            id: rootStep.id,
            x: rX,
            y: rY,
            width: rW,
            height: rH
          };
          layoutSubtree(rootStep.id, positions[rootStep.id]);
          currentRootX += slotW + 60;
        }
      }
    }

    return positions;
  }, [workspace.canvasNodes, orderedSections, clusters, nodeSizes, draggingSectionId, dragCurrentDeltaX]);

  // Compute overarching tree brackets connecting parent sections to their child subsections
  const overarchingBrackets = useMemo(() => {
    const brackets: {
      key: string;
      parentDot: { cx: number; cy: number };
      childDots: { cx: number; cy: number }[];
      mainArchD: string;
      stemPaths: string[];
      accentColor: string;
    }[] = [];

    for (const cluster of clusters) {
      if (cluster.subsections.length === 0) continue;
      const rootPos = nodePositions[cluster.root.id];
      if (!rootPos) continue;

      const subPositions = cluster.subsections
        .map(s => nodePositions[s.id])
        .filter((p): p is NodeLayoutPos => Boolean(p));
      if (subPositions.length === 0) continue;

      const parentAnchorX = rootPos.x + rootPos.width / 2;
      const parentAnchorY = rootPos.y;

      const archHeight = 24 + (subPositions.length - 1) * 10;
      const archY = parentAnchorY - archHeight;
      const radius = 8;

      const lastChildPos = subPositions[subPositions.length - 1];
      const lastChildX = lastChildPos.x + lastChildPos.width / 2;

      const mainD = `M ${parentAnchorX} ${parentAnchorY} V ${archY + radius} A ${radius} ${radius} 0 0 1 ${parentAnchorX + radius} ${archY} H ${lastChildX}`;

      const stems: string[] = [];
      const childDots: { cx: number; cy: number }[] = [];

      for (const cPos of subPositions) {
        const cX = cPos.x + cPos.width / 2;
        const cY = cPos.y;
        stems.push(`M ${cX} ${archY} L ${cX} ${cY}`);
        childDots.push({ cx: cX, cy: cY });
      }

      brackets.push({
        key: `bracket-${cluster.root.id}`,
        parentDot: { cx: parentAnchorX, cy: parentAnchorY },
        childDots,
        mainArchD: mainD,
        stemPaths: stems,
        accentColor: cluster.accentColor
      });
    }

    return brackets;
  }, [clusters, nodePositions]);

  // Compute intra section connector wire paths
  const connectorWires = useMemo(() => {
    const wires: { fromId: string; toId: string; pathD: string }[] = [];
    const knownSectionIds = new Set(currentSections.map(s => s.id));
    const nodesById = new Map(workspace.canvasNodes.map(n => [n.id, n]));
    const defaultSecId = currentSections[0]?.id || 'sec-main';

    for (const node of workspace.canvasNodes) {
      let pId = node.parentId;
      if (!pId || pId === 'root' || !workspace.canvasNodes.some(n => n.id === pId)) {
        pId = resolveNodeSectionId(node, nodesById, knownSectionIds, defaultSecId);
      }

      const parentPos = nodePositions[pId];
      const childPos = nodePositions[node.id];
      if (!parentPos || !childPos) continue;

      const parentActualW = nodeSizes[pId]?.width || parentPos.width;
      const parentActualH = nodeSizes[pId]?.height || parentPos.height;
      const childActualW = nodeSizes[node.id]?.width || childPos.width;

      const fromX = parentPos.x + parentActualW / 2;
      const fromY = parentPos.y + parentActualH;
      const toX = childPos.x + childActualW / 2;
      const toY = childPos.y;

      let d = '';
      if (Math.abs(fromX - toX) < 1) {
        d = `M ${fromX} ${fromY} L ${fromX} ${toY}`;
      } else {
        const dy = Math.max(toY - fromY, 20);
        const controlOffset = dy * 0.5;
        d = `M ${fromX} ${fromY} C ${fromX} ${fromY + controlOffset}, ${toX} ${toY - controlOffset}, ${toX} ${toY}`;
      }

      wires.push({ fromId: pId, toId: node.id, pathD: d });
    }

    return wires;
  }, [workspace.canvasNodes, currentSections, nodePositions, nodeSizes]);

  // Compute yield dependency wires across producing and consuming steps
  const yieldWires = useMemo(() => {
    const wires: { fromId: string; toId: string; pathD: string; isHighlighted: boolean }[] = [];

    for (const node of workspace.canvasNodes) {
      for (const m of node.mentions) {
        const isYield = m.type === 'yield' || (m.type === 'ingredient' && Boolean(
          m.data?.yieldId || (m.data?.ingredientId && m.data.ingredientId.startsWith('yield-'))
        ));
        if (!isYield) continue;

        const sourceStepId = m.data?.yieldId || (m.data?.ingredientId ? m.data.ingredientId.replace(/^yield-/, '') : '');
        if (!sourceStepId || sourceStepId === node.id) continue;
        if (node.parentId === sourceStepId) continue;

        const sourcePos = nodePositions[sourceStepId];
        const destPos = nodePositions[node.id];
        if (!sourcePos || !destPos) continue;

        const sourceW = nodeSizes[sourceStepId]?.width || sourcePos.width;
        const sourceH = nodeSizes[sourceStepId]?.height || sourcePos.height;
        const destW = nodeSizes[node.id]?.width || destPos.width;

        const fromX = sourcePos.x + sourceW / 2;
        const fromY = sourcePos.y + sourceH;
        const toX = destPos.x + destW / 2;
        const toY = destPos.y;

        const dy = Math.max(Math.abs(toY - fromY), 30);
        const controlOffset = dy * 0.5;
        const d = `M ${fromX} ${fromY} C ${fromX} ${fromY + controlOffset}, ${toX} ${toY - controlOffset}, ${toX} ${toY}`;

        const isHighlighted = selectedNodeId === node.id || selectedNodeId === sourceStepId || highlightedStepId === sourceStepId;

        wires.push({ fromId: sourceStepId, toId: node.id, pathD: d, isHighlighted });
      }
    }
    return wires;
  }, [workspace.canvasNodes, nodePositions, nodeSizes, selectedNodeId, highlightedStepId]);

  // Section column drag reorder handlers with real-time sliding
  const handleStartDragSection = (e: PointerEvent, sectionId: string, _idx: number) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    setDraggingSectionId(sectionId);
    dragPointerClientXRef.current = e.clientX;
    dragStartCanvasPointerXRef.current = (e.clientX - panRef.current.x) / zoom;
    setDragCurrentDeltaX(0);

    const resting = restingLayoutRef.current;
    const baseColumnX = resting.baseColumnX;
    const slotWidths = resting.slotWidths;

    let moveRafId: number | null = null;
    let latestPointerClientX = e.clientX;

    const updateDelta = (clientX: number) => {
      dragPointerClientXRef.current = clientX;
      const currentCanvasPointerX = (clientX - panRef.current.x) / zoom;
      const rawDelta = currentCanvasPointerX - dragStartCanvasPointerXRef.current;
      setDragCurrentDeltaX(rawDelta);
    };

    const scheduleMoveUpdate = () => {
      if (moveRafId === null) {
        moveRafId = requestAnimationFrame(() => {
          moveRafId = null;
          updateDelta(latestPointerClientX);
        });
      }
    };

    const autoPanLoop = () => {
      const clientX = dragPointerClientXRef.current;
      let panDelta = 0;
      const edgeThreshold = 100;

      if (clientX < edgeThreshold) {
        const intensity = Math.min(1, Math.max(0.1, (edgeThreshold - clientX) / edgeThreshold));
        panDelta = Math.round(16 * intensity);
      } else if (clientX > window.innerWidth - edgeThreshold) {
        const intensity = Math.min(1, Math.max(0.1, (clientX - (window.innerWidth - edgeThreshold)) / edgeThreshold));
        panDelta = -Math.round(16 * intensity);
      }

      if (panDelta !== 0) {
        setPan(prev => {
          const nextPan = { ...prev, x: prev.x + panDelta };
          panRef.current = nextPan;
          return nextPan;
        });
        updateDelta(clientX);
      }

      dragRafIdRef.current = requestAnimationFrame(autoPanLoop);
    };

    dragRafIdRef.current = requestAnimationFrame(autoPanLoop);

    const handlePointerMove = (ev: PointerEvent) => {
      latestPointerClientX = ev.clientX;
      scheduleMoveUpdate();
    };

    const handlePointerUp = (ev: PointerEvent) => {
      if (moveRafId !== null) {
        cancelAnimationFrame(moveRafId);
        moveRafId = null;
      }
      if (dragRafIdRef.current !== null) {
        cancelAnimationFrame(dragRafIdRef.current);
        dragRafIdRef.current = null;
      }
      try {
        if (target.hasPointerCapture(ev.pointerId)) {
          target.releasePointerCapture(ev.pointerId);
        }
      } catch (_) {}
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      // Compute final delta from exact pointer release position
      const finalCanvasPointerX = (ev.clientX - panRef.current.x) / zoom;
      const finalDeltaX = finalCanvasPointerX - dragStartCanvasPointerXRef.current;

      const isRoot = !sectionParentMap[sectionId];
      if (isRoot) {
        const draggedCluster = clusters.find(c => c.root.id === sectionId);
        if (draggedCluster) {
          const currentClusterIdx = clusters.indexOf(draggedCluster);

          // Compute resting centers of all clusters
          const clusterRestingCenters = clusters.map(c => {
            const startX = baseColumnX[c.root.id] || 0;
            const last = c.subsections[c.subsections.length - 1] || c.root;
            const endX = (baseColumnX[last.id] || 0) + (slotWidths[last.id] || SECTION_DEFAULT_WIDTH);
            const width = endX - startX;
            return {
              cluster: c,
              center: startX + width / 2
            };
          });

          const currentEntry = clusterRestingCenters[currentClusterIdx];
          const startingCenter = currentEntry ? currentEntry.center : 0;
          const trueDroppedCenter = startingCenter + finalDeltaX;

          let targetClusterIdx = currentClusterIdx;
          let bestDist = Infinity;
          clusterRestingCenters.forEach((entry, idx) => {
            const dist = Math.abs(trueDroppedCenter - entry.center);
            if (dist < bestDist) {
              bestDist = dist;
              targetClusterIdx = idx;
            }
          });

          if (targetClusterIdx !== currentClusterIdx) {
            const nextClusters = [...clusters];
            const [moved] = nextClusters.splice(currentClusterIdx, 1);
            nextClusters.splice(targetClusterIdx, 0, moved);

            const nextSections: CanvasSection[] = [];
            for (const c of nextClusters) {
              nextSections.push(c.root, ...c.subsections);
            }
            const reordered = reorderSectionsAndNodes(nextSections, workspace.canvasNodes);
            updateWorkspaceState({
              ...workspace,
              sections: reordered.sections,
              canvasNodes: reordered.canvasNodes
            });
          }
        }
      } else {
        const parentCluster = clusters.find(c => c.subsections.some(s => s.id === sectionId));
        if (parentCluster) {
          const currentSubIdx = parentCluster.subsections.findIndex(s => s.id === sectionId);

          // Compute resting centers of all subsections in this cluster
          const subRestingCenters = parentCluster.subsections.map(s => {
            const startX = baseColumnX[s.id] || 0;
            const width = slotWidths[s.id] || SUBSECTION_DEFAULT_WIDTH;
            return {
              sub: s,
              center: startX + width / 2
            };
          });

          const currentSubEntry = subRestingCenters[currentSubIdx];
          const startingCenter = currentSubEntry ? currentSubEntry.center : 0;
          const trueDroppedCenter = startingCenter + finalDeltaX;

          let targetSubIdx = currentSubIdx;
          let bestDist = Infinity;
          subRestingCenters.forEach((entry, idx) => {
            const dist = Math.abs(trueDroppedCenter - entry.center);
            if (dist < bestDist) {
              bestDist = dist;
              targetSubIdx = idx;
            }
          });

          if (targetSubIdx !== currentSubIdx) {
            const nextSubs = [...parentCluster.subsections];
            const [moved] = nextSubs.splice(currentSubIdx, 1);
            nextSubs.splice(targetSubIdx, 0, moved);

            const nextSections: CanvasSection[] = [];
            for (const c of clusters) {
              if (c.root.id === parentCluster.root.id) {
                nextSections.push(c.root, ...nextSubs);
              } else {
                nextSections.push(c.root, ...c.subsections);
              }
            }
            const reordered = reorderSectionsAndNodes(nextSections, workspace.canvasNodes);
            updateWorkspaceState({
              ...workspace,
              sections: reordered.sections,
              canvasNodes: reordered.canvasNodes
            });
          }
        }
      }

      setDraggingSectionId(null);
      setDragCurrentDeltaX(0);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleMoveSection = (sectionId: string, direction: 'left' | 'right') => {
    const isRoot = !sectionParentMap[sectionId];
    if (isRoot) {
      const clusterIdx = clusters.findIndex(c => c.root.id === sectionId);
      if (clusterIdx === -1) return;
      const targetClusterIdx = direction === 'left' ? clusterIdx - 1 : clusterIdx + 1;
      if (targetClusterIdx < 0 || targetClusterIdx >= clusters.length) return;

      const currentCluster = clusters[clusterIdx];
      const targetCluster = clusters[targetClusterIdx];

      const currentStartX = nodePositions[currentCluster.root.id]?.x || 0;
      const targetStartX = nodePositions[targetCluster.root.id]?.x || 0;
      const dist = targetStartX - currentStartX;

      const animating: Record<string, number> = {};
      for (const m of [currentCluster.root, ...currentCluster.subsections]) {
        animating[m.id] = dist;
      }
      for (const m of [targetCluster.root, ...targetCluster.subsections]) {
        animating[m.id] = -dist;
      }
      setReorderAnimatingDeltas(animating);

      setTimeout(() => {
        const nextClusters = [...clusters];
        const [moved] = nextClusters.splice(clusterIdx, 1);
        nextClusters.splice(targetClusterIdx, 0, moved);

        const nextSections: CanvasSection[] = [];
        for (const c of nextClusters) {
          nextSections.push(c.root, ...c.subsections);
        }
        const reordered = reorderSectionsAndNodes(nextSections, workspace.canvasNodes);
        updateWorkspaceState({
          ...workspace,
          sections: reordered.sections,
          canvasNodes: reordered.canvasNodes
        });
        setReorderAnimatingDeltas({});
      }, 220);
    } else {
      const parentCluster = clusters.find(c => c.subsections.some(s => s.id === sectionId));
      if (!parentCluster) return;
      const subIdx = parentCluster.subsections.findIndex(s => s.id === sectionId);
      const targetSubIdx = direction === 'left' ? subIdx - 1 : subIdx + 1;
      if (targetSubIdx < 0 || targetSubIdx >= parentCluster.subsections.length) return;

      const currentSub = parentCluster.subsections[subIdx];
      const targetSub = parentCluster.subsections[targetSubIdx];
      const currentX = nodePositions[currentSub.id]?.x || 0;
      const targetX = nodePositions[targetSub.id]?.x || 0;
      const dist = targetX - currentX;

      const animating: Record<string, number> = {
        [currentSub.id]: dist,
        [targetSub.id]: -dist
      };
      setReorderAnimatingDeltas(animating);

      setTimeout(() => {
        const nextSubs = [...parentCluster.subsections];
        const [moved] = nextSubs.splice(subIdx, 1);
        nextSubs.splice(targetSubIdx, 0, moved);

        const nextSections: CanvasSection[] = [];
        for (const c of clusters) {
          if (c.root.id === parentCluster.root.id) {
            nextSections.push(c.root, ...nextSubs);
          } else {
            nextSections.push(c.root, ...c.subsections);
          }
        }
        const reordered = reorderSectionsAndNodes(nextSections, workspace.canvasNodes);
        updateWorkspaceState({
          ...workspace,
          sections: reordered.sections,
          canvasNodes: reordered.canvasNodes
        });
        setReorderAnimatingDeltas({});
      }, 220);
    }
  };

  const handleUpdateSection = (sectionId: string, updated: Partial<CanvasSection>) => {
    const nextSections = currentSections.map(s => {
      if (s.id === sectionId) return { ...s, ...updated };
      return s;
    });
    updateWorkspaceState({ ...workspace, sections: nextSections });
  };

  // Section and subsection creation with strict depth 1 rules
  const handleAddSectionNode = () => {
    const newId = `sec-${Date.now()}`;
    const order = currentSections.length;
    const newSection: CanvasSection = {
      id: newId,
      name: `Section ${order + 1}`,
      order,
      showInlineTools: false
    };

    const reordered = reorderSectionsAndNodes([...currentSections, newSection], workspace.canvasNodes);
    updateWorkspaceState({
      ...workspace,
      sections: reordered.sections,
      canvasNodes: reordered.canvasNodes
    });
    setSelectedNodeId(newId);
  };

  const handleAddSubsectionNode = () => {
    if (!selectedSection) return;
    if (selectedSection.parentSectionId) return;
    const targetParentId = selectedSection.id;
    const parentSec = currentSections.find(s => s.id === targetParentId);
    const parentName = parentSec?.name || 'Section';
    const existingSubsections = currentSections.filter(s => s.parentSectionId === targetParentId);
    const newId = `sec-sub-${Date.now()}`;
    const newSection: CanvasSection = {
      id: newId,
      name: `${parentName} Part ${existingSubsections.length + 2}`,
      order: currentSections.length,
      parentSectionId: targetParentId,
      showInlineTools: false
    };

    const reordered = reorderSectionsAndNodes([...currentSections, newSection], workspace.canvasNodes);
    updateWorkspaceState({
      ...workspace,
      sections: reordered.sections,
      canvasNodes: reordered.canvasNodes
    });
    setSelectedNodeId(newId);
  };

  const handleReparentSection = (sectionId: string, newParentSectionId?: string) => {
    const nextSections = currentSections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          parentSectionId: newParentSectionId || undefined
        };
      }
      return s;
    });
    const reordered = reorderSectionsAndNodes(nextSections, workspace.canvasNodes);
    updateWorkspaceState({
      ...workspace,
      sections: reordered.sections,
      canvasNodes: reordered.canvasNodes
    });
  };

  // Add step node with tree guardrails
  const handleAddStepNode = () => {
    let parentId: string;
    let targetSectionId: string;

    if (selectedStep) {
      targetSectionId = selectedStep.sectionId || currentSections[0].id;
      parentId = selectedStep.id;

      let depth = 1;
      let curr: CanvasStepNode | undefined = selectedStep;
      while (curr && curr.parentId && curr.parentId !== targetSectionId && !currentSections.some(s => s.id === curr?.parentId)) {
        depth++;
        const nextParent = workspace.canvasNodes.find(n => n.id === curr?.parentId);
        if (!nextParent) break;
        curr = nextParent;
      }
      if (depth >= 2) {
        showToast('Maximum nesting depth 2 reached');
        return;
      }

      const existingChildren = workspace.canvasNodes.filter(n => n.parentId === selectedStep.id);
      const countedChildren = existingChildren.filter(n => n.isCountedStep);
      const uncountedChildren = existingChildren.filter(n => !n.isCountedStep);

      const mustBeUncounted = !selectedStep.isCountedStep;
      if (mustBeUncounted || countedChildren.length >= 1) {
        if (uncountedChildren.length >= 3) {
          showToast('Maximum 3 note branches reached for this step');
          return;
        }
      }
    } else if (selectedSection) {
      targetSectionId = selectedSection.id;
      const sectionSteps = workspace.canvasNodes.filter(n => (n.sectionId || currentSections[0].id) === targetSectionId);
      if (sectionSteps.length === 0) {
        parentId = targetSectionId;
      } else {
        const countedSteps = sectionSteps.filter(n => n.isCountedStep);
        parentId = countedSteps.length > 0 ? countedSteps[countedSteps.length - 1].id : sectionSteps[sectionSteps.length - 1].id;
      }
    } else {
      targetSectionId = currentSections[0].id;
      const sectionSteps = workspace.canvasNodes.filter(n => (n.sectionId || currentSections[0].id) === targetSectionId);
      if (sectionSteps.length === 0) {
        parentId = targetSectionId;
      } else {
        const countedSteps = sectionSteps.filter(n => n.isCountedStep);
        parentId = countedSteps.length > 0 ? countedSteps[countedSteps.length - 1].id : sectionSteps[sectionSteps.length - 1].id;
      }
    }

    const parentNode = workspace.canvasNodes.find(n => n.id === parentId);
    let isCounted = true;
    if (parentNode) {
      if (!parentNode.isCountedStep) {
        isCounted = false;
      } else {
        const siblings = workspace.canvasNodes.filter(n => n.parentId === parentId);
        if (siblings.some(s => s.isCountedStep)) {
          isCounted = false;
        }
      }
    }

    const newId = `step-${Date.now()}`;
    const stepCount = workspace.canvasNodes.length + 1;

    const newNode: CanvasStepNode = {
      id: newId,
      parentId,
      sectionId: targetSectionId,
      title: isCounted ? `Step ${stepCount}` : 'Note',
      isCountedStep: isCounted,
      isLinkedToPrevious: false,
      instructionText: '',
      mentions: []
    };

    const currentNodesWithNew = [...workspace.canvasNodes, newNode];
    const reordered = reorderSectionsAndNodes(currentSections, currentNodesWithNew);
    updateWorkspaceState({
      ...workspace,
      canvasNodes: reordered.canvasNodes
    });
    setSelectedNodeId(newId);
  };

  // Cascade delete logic
  const handleRequestDeleteSection = (sectionId: string) => {
    const section = currentSections.find(s => s.id === sectionId);
    if (!section) return;
    if (currentSections.length <= 1) {
      showToast('Cannot delete the last remaining section');
      return;
    }
    const knownSectionIds = new Set(currentSections.map(s => s.id));
    const nodesById = new Map(workspace.canvasNodes.map(n => [n.id, n]));
    const defaultSecId = currentSections[0]?.id || 'sec-main';
    const childSteps = workspace.canvasNodes.filter(n =>
      resolveNodeSectionId(n, nodesById, knownSectionIds, defaultSecId) === sectionId
    );
    if (childSteps.length > 0) {
      setDeleteModalState({
        isOpen: true,
        type: 'section',
        id: sectionId,
        title: section.name || 'Untitled Section',
        itemCount: childSteps.length
      });
    } else {
      executeDeleteSection(sectionId);
    }
  };

  const handleRequestDeleteStep = (stepId: string) => {
    const step = workspace.canvasNodes.find(n => n.id === stepId);
    if (!step) return;
    const childSteps = workspace.canvasNodes.filter(n => n.parentId === stepId);
    if (childSteps.length > 0) {
      setDeleteModalState({
        isOpen: true,
        type: 'step',
        id: stepId,
        title: step.title || 'Step',
        itemCount: childSteps.length
      });
    } else {
      executeDeleteStep(stepId, false);
    }
  };

  const executeDeleteSection = (sectionId: string) => {
    const knownSectionIds = new Set(currentSections.map(s => s.id));
    const nodesById = new Map(workspace.canvasNodes.map(n => [n.id, n]));
    const defaultSecId = currentSections[0]?.id || 'sec-main';
    const stepsToDelete = workspace.canvasNodes.filter(n =>
      resolveNodeSectionId(n, nodesById, knownSectionIds, defaultSecId) === sectionId
    );
    const deletedIds = new Set(stepsToDelete.map(s => s.id));

    const nextSections = currentSections.filter(s => s.id !== sectionId).map((s, idx) => ({ ...s, order: idx }));
    const nextNodes = workspace.canvasNodes
      .filter(n => !deletedIds.has(n.id))
      .map(n => sanitizeYieldsFromDeleted(n, deletedIds));

    updateWorkspaceState({
      ...workspace,
      sections: nextSections,
      canvasNodes: nextNodes
    });
    setDeleteModalState(null);
    setSelectedNodeId(nextSections[0]?.id || '');
  };

  const executeDeleteStep = (stepId: string, cascadeChildren: boolean) => {
    const deletedIds = new Set<string>([stepId]);
    if (cascadeChildren) {
      const addDescendants = (parentId: string) => {
        const children = workspace.canvasNodes.filter(n => n.parentId === parentId);
        for (const child of children) {
          deletedIds.add(child.id);
          addDescendants(child.id);
        }
      };
      addDescendants(stepId);
    }

    const targetStep = workspace.canvasNodes.find(n => n.id === stepId);
    const parentOfDeleted = targetStep?.parentId || currentSections[0].id;

    const nextNodes = workspace.canvasNodes
      .filter(n => !deletedIds.has(n.id))
      .map(n => {
        let updated = n;
        if (!cascadeChildren && n.parentId === stepId) {
          updated = { ...updated, parentId: parentOfDeleted };
        }
        return sanitizeYieldsFromDeleted(updated, deletedIds);
      });

    updateWorkspaceState({
      ...workspace,
      canvasNodes: nextNodes
    });
    setDeleteModalState(null);
    setSelectedNodeId(parentOfDeleted);
    setActiveMentionId(null);
    setIsYieldMode(false);
  };

  const handleDeleteSelectedNode = () => {
    if (selectedSection) {
      handleRequestDeleteSection(selectedSection.id);
    } else if (selectedStep) {
      handleRequestDeleteStep(selectedStep.id);
    }
  };

  // Step Node modification
  const handleUpdateStep = (stepId: string, updated: Partial<CanvasStepNode>) => {
    const updatedNodes = workspace.canvasNodes.map(n => {
      if (n.id === stepId) {
        return { ...n, ...updated };
      }
      return n;
    });
    updateWorkspaceState({ ...workspace, canvasNodes: updatedNodes });
  };

  // Jump to step with glow and auto centering
  const handleJumpToStep = (targetStepId: string) => {
    const targetPos = nodePositions[targetStepId];
    if (!targetPos || !canvasRef.current) return;

    const containerRect = canvasRef.current.getBoundingClientRect();
    const nodeLeft = targetPos.x * zoom + pan.x;
    const nodeTop = targetPos.y * zoom + pan.y;
    const nodeRight = (targetPos.x + targetPos.width) * zoom + pan.x;
    const nodeBottom = (targetPos.y + targetPos.height) * zoom + pan.y;

    const margin = 50;
    const isVisible =
      nodeRight > margin &&
      nodeLeft < containerRect.width - margin &&
      nodeBottom > margin &&
      nodeTop < containerRect.height - margin;

    setHighlightedStepId(targetStepId);

    if (!isVisible) {
      const targetCenterX = targetPos.x + targetPos.width / 2;
      const targetCenterY = targetPos.y + targetPos.height / 2;
      const newPanX = containerRect.width / 2 - targetCenterX * zoom;
      const newPanY = containerRect.height / 2 - targetCenterY * zoom;

      setIsSmoothPan(true);
      setPan({ x: newPanX, y: newPanY });
      setTimeout(() => setIsSmoothPan(false), 550);
    }

    setTimeout(() => {
      setHighlightedStepId(prev => (prev === targetStepId ? null : prev));
    }, 1600);
  };

  // Open Export Recipe Modal
  const handleExport = () => {
    setIsExportModalOpen(true);
  };

  return (
    <div
      className={`kitchen-canvas-viewport ${isPanning ? 'is-panning' : ''} ${isSpacePressed ? 'is-space-grab' : ''}`}
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Canvas Top Bar */}
      <header className="canvas-top-bar">
        <div className="canvas-top-left">
          <button
            type="button"
            className="canvas-back-btn"
            onClick={onBackToHub}
            title="Return to Kitchen Studio Hub"
          >
            <ArrowLeft size={14} />
            <span>Workspaces</span>
          </button>
          <div className="canvas-recipe-title">
            <span>{workspace.title || 'Untitled Recipe'}</span>
            <button
              type="button"
              className="canvas-recipe-settings-btn"
              onClick={() => setIsMetadataModalOpen(true)}
              title="Edit Recipe Settings & Markdown"
            >
              <Settings size={14} />
              <span>Recipe Settings</span>
            </button>
            <span className={`canvas-save-status is-${saveStatus}`}>
              {saveStatus === 'saved' ? '● Saved' : '○ Saving...'}
            </span>
          </div>
        </div>

        <div className="canvas-top-right">
          {toastMessage && <div className="canvas-export-toast">{toastMessage}</div>}
          <button
            type="button"
            className="canvas-export-btn"
            onClick={handleExport}
          >
            Export to src/recipes
          </button>
        </div>
      </header>

      {/* Pannable and Zoomable Board */}
      <div
        ref={transformLayerRef}
        className={`canvas-transform-layer ${isSmoothPan ? 'is-smooth-transitioning' : ''}`}
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: '0 0'
        }}
      >
        {/* SVG Wire Layer for Connectors & Overarching Tree Brackets */}
        <svg className="canvas-wires-layer">
          {/* Overarching Tree Brackets connecting Parent Sections to Child Subsections */}
          {overarchingBrackets.map(b => (
            <g key={b.key}>
              <path
                d={b.mainArchD}
                className="canvas-wire-bracket"
                style={{ stroke: b.accentColor }}
              />
              {b.stemPaths.map((stemD, sIdx) => (
                <path
                  key={`stem-${b.key}-${sIdx}`}
                  d={stemD}
                  className="canvas-wire-bracket-stem"
                  style={{ stroke: b.accentColor }}
                />
              ))}
              <circle
                cx={b.parentDot.cx}
                cy={b.parentDot.cy}
                r={4}
                className="canvas-wire-bracket-dot"
                style={{ fill: b.accentColor }}
              />
              {b.childDots.map((cd, cdIdx) => (
                <circle
                  key={`child-dot-${b.key}-${cdIdx}`}
                  cx={cd.cx}
                  cy={cd.cy}
                  r={4}
                  className="canvas-wire-bracket-dot"
                  style={{ fill: b.accentColor }}
                />
              ))}
            </g>
          ))}

          {connectorWires.map((wire, idx) => (
            <path
              key={`tree-wire-${idx}`}
              d={wire.pathD}
              className="canvas-wire-path"
            />
          ))}
          {yieldWires.map((wire, idx) => (
            <path
              key={`yield-wire-${wire.fromId}-${wire.toId}-${idx}`}
              d={wire.pathD}
              className={`canvas-wire-path canvas-wire-yield ${wire.isHighlighted ? 'is-highlighted' : ''}`}
            />
          ))}
        </svg>

        {/* Section Nodes */}
        {orderedSections.map((sec, idx) => {
          const pos = nodePositions[sec.id];
          if (!pos) return null;

          const isRoot = !sectionParentMap[sec.id];
          let isFirst = false;
          let isLast = false;
          if (isRoot) {
            const cIdx = clusters.findIndex(c => c.root.id === sec.id);
            isFirst = cIdx === 0;
            isLast = cIdx === clusters.length - 1;
          } else {
            const parentCluster = clusters.find(c => c.subsections.some(s => s.id === sec.id));
            if (parentCluster) {
              const sIdx = parentCluster.subsections.findIndex(s => s.id === sec.id);
              isFirst = sIdx === 0;
              isLast = sIdx === parentCluster.subsections.length - 1;
            }
          }

          const isDirectlyDragged = draggingSectionId === sec.id;
          const isPartOfDraggedCluster = Boolean(
            draggingSectionId &&
            clusters.some(c => c.root.id === draggingSectionId && (c.root.id === sec.id || c.subsections.some(s => s.id === sec.id)))
          );
          const isActivelyDragged = isDirectlyDragged || isPartOfDraggedCluster;
          const slideDelta = reorderAnimatingDeltas[sec.id] || 0;
          const isSliding = !isActivelyDragged && (Boolean(draggingSectionId) || slideDelta !== 0);

          return (
            <div
              key={sec.id}
              ref={el => registerNodeRef(sec.id, el as HTMLElement)}
              className={`canvas-node-wrapper ${isActivelyDragged ? 'is-dragging' : isSliding ? 'is-sliding' : ''}`}
              style={{
                transform: `translate3d(${pos.x + slideDelta}px, ${pos.y}px, 0)`
              }}
            >
              <SectionNode
                section={sec}
                isFirst={isFirst}
                isLast={isLast}
                isSelected={selectedNodeId === sec.id}
                accentColor={sectionAccentMap[sec.id]}
                parentName={sectionParentMap[sec.id]?.name}
                onSelect={() => {
                  setSelectedNodeId(sec.id);
                  setActiveMentionId(null);
                  setIsYieldMode(false);
                }}
                onChange={updated => handleUpdateSection(sec.id, updated)}
                onMoveLeft={() => handleMoveSection(sec.id, 'left')}
                onMoveRight={() => handleMoveSection(sec.id, 'right')}
                onStartDrag={e => handleStartDragSection(e, sec.id, idx)}
                onDelete={() => handleRequestDeleteSection(sec.id)}
              />
            </div>
          );
        })}

        {/* Step Nodes */}
        {workspace.canvasNodes.map((node, index) => {
          const pos = nodePositions[node.id];
          if (!pos) return null;

          const isThisNodeInspectorOpen = selectedNodeId === node.id && Boolean(activeMention || isYieldMode);
          const nodeSecId = node.sectionId || 'sec-main';
          const isStepParentDragged = Boolean(
            draggingSectionId && (
              draggingSectionId === nodeSecId ||
              clusters.some(c => c.root.id === draggingSectionId && (c.root.id === nodeSecId || c.subsections.some(s => s.id === nodeSecId)))
            )
          );
          const stepSlideDelta = reorderAnimatingDeltas[nodeSecId] || 0;
          const isStepSliding = !isStepParentDragged && (Boolean(draggingSectionId) || stepSlideDelta !== 0);

          return (
            <div
              key={node.id}
              ref={el => registerNodeRef(node.id, el as HTMLElement)}
              className={`canvas-node-wrapper ${isThisNodeInspectorOpen ? 'is-inspector-open' : ''} ${isStepParentDragged ? 'is-dragging' : isStepSliding ? 'is-sliding' : ''}`}
              style={{
                transform: `translate3d(${pos.x + stepSlideDelta}px, ${pos.y}px, 0)`,
                zIndex: isThisNodeInspectorOpen ? 100 : 10
              }}
            >
              <StepNode
                node={node}
                stepNumber={index + 1}
                allNodes={workspace.canvasNodes}
                isSelected={selectedNodeId === node.id}
                isJumpHighlighted={highlightedStepId === node.id}
                selectedMentionId={activeMentionId || undefined}
                hasMasterVideo={hasMasterVideo}
                onSelect={() => {
                  setSelectedNodeId(node.id);
                  setActiveMentionId(null);
                  setIsYieldMode(false);
                }}
                onChange={updated => handleUpdateStep(node.id, updated)}
                onSelectMention={mention => {
                  setSelectedNodeId(node.id);
                  setActiveMentionId(mention.id);
                  setIsYieldMode(false);
                }}
                onJumpToStep={handleJumpToStep}
                onToggleYield={() => {
                  setIsYieldMode(true);
                  setActiveMentionId(null);
                }}
              />

              {/* Sliding Inspector Card placed right beside the active step node */}
              {selectedNodeId === node.id && (activeMention || isYieldMode) && (
                <div className="canvas-inspector-anchor">
                  <NodeInspector
                    activeStep={node}
                    activeMention={activeMention}
                    isYieldMode={isYieldMode}
                    workspace={workspace}
                    onClose={() => {
                      setActiveMentionId(null);
                      setIsYieldMode(false);
                    }}
                    onUpdateMention={(mentionId, data) => {
                      const updatedMentions = node.mentions.map(m => {
                        if (m.id === mentionId) {
                          return { ...m, ...data };
                        }
                        return m;
                      });
                      const updatedSegments = (node.segments || []).map(seg => {
                        if (seg.type === 'mention' && seg.mention.id === mentionId) {
                          return {
                            ...seg,
                            mention: { ...seg.mention, ...data }
                          };
                        }
                        return seg;
                      });
                      const updatedInstructionText = (updatedSegments.length > 0 ? updatedSegments : [{ type: 'text' as const, id: 'init', text: node.instructionText }])
                        .map(s => (s.type === 'text' ? s.text : `[${s.mention.displayText}]`))
                        .join('');
                      handleUpdateStep(node.id, {
                        mentions: updatedMentions,
                        segments: updatedSegments,
                        instructionText: updatedInstructionText
                      });
                    }}
                    onUpdateYield={(stepId, yieldData) => {
                      const updatedNodes = workspace.canvasNodes.map(n => {
                        if (n.id === stepId) {
                          return { ...n, producesYield: yieldData };
                        }
                        if (yieldData) {
                          const hasMatching = n.mentions.some(
                            m => m.data?.yieldId === stepId || m.data?.ingredientId === `yield-${stepId}`
                          );
                          if (hasMatching) {
                            const nextMentions = n.mentions.map(m => {
                              if (m.data?.yieldId === stepId || m.data?.ingredientId === `yield-${stepId}`) {
                                return {
                                  ...m,
                                  displayText: yieldData.name,
                                  data: { ...m.data, yieldName: yieldData.name }
                                };
                              }
                              return m;
                            });
                            const nextSegments = (n.segments || []).map(seg => {
                              if (
                                seg.type === 'mention' &&
                                (seg.mention.data?.yieldId === stepId || seg.mention.data?.ingredientId === `yield-${stepId}`)
                              ) {
                                return {
                                  ...seg,
                                  mention: {
                                    ...seg.mention,
                                    displayText: yieldData.name,
                                    data: { ...seg.mention.data, yieldName: yieldData.name }
                                  }
                                };
                              }
                              return seg;
                            });
                            return { ...n, mentions: nextMentions, segments: nextSegments };
                          }
                        }
                        return n;
                      });
                      updateWorkspaceState({ ...workspace, canvasNodes: updatedNodes });
                    }}
                    onOpenCustomItemModal={type => setCustomItemModalType(type)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Figma Style Right Sidebar Toolbox */}
      <SidebarToolbox
        selectedNodeId={selectedNodeId}
        selectedStep={selectedStep}
        selectedSection={selectedSection}
        zoom={zoom}
        onAddSectionNode={handleAddSectionNode}
        onAddSubsectionNode={handleAddSubsectionNode}
        onChangeParentSection={() => setIsReparentModalOpen(true)}
        onAddStepNode={handleAddStepNode}
        onDeleteSelectedNode={handleDeleteSelectedNode}
        onZoomIn={() => setZoom(prev => Math.min(prev * 1.15, 2.0))}
        onZoomOut={() => setZoom(prev => Math.max(prev * 0.85, 0.4))}
        onResetZoom={() => {
          setZoom(1);
          setPan({ x: window.innerWidth / 2 - 270, y: 80 });
        }}
      />

      {/* Collapsible Live Multi-Mode Preview Drawer */}
      <PreviewDrawer graph={activeGraph} workspace={workspace} />

      {/* Recipe Settings & Metadata Modal with Obsidian Editor */}
      <RecipeMetadataModal
        isOpen={isMetadataModalOpen}
        graph={workspace.graph}
        onClose={() => setIsMetadataModalOpen(false)}
        onOpenMediaModal={type => setMediaModalType(type)}
        onSave={updatedGraph => {
          updateWorkspaceState({
            ...workspace,
            title: updatedGraph.title ?? workspace.title,
            graph: {
              ...workspace.graph,
              ...updatedGraph
            }
          });
        }}
      />

      {/* Cascade Deletion Confirmation Dialog */}
      <CascadeDeleteModal
        isOpen={Boolean(deleteModalState?.isOpen)}
        type={deleteModalState?.type || 'step'}
        title={deleteModalState?.title || ''}
        itemCount={deleteModalState?.itemCount || 0}
        onConfirm={() => {
          if (!deleteModalState) return;
          if (deleteModalState.type === 'section') {
            executeDeleteSection(deleteModalState.id);
          } else {
            executeDeleteStep(deleteModalState.id, true);
          }
        }}
        onCancel={() => setDeleteModalState(null)}
      />

      {/* Media Modal */}
      <MediaModal
        isOpen={Boolean(mediaModalType)}
        mediaType={mediaModalType || 'picture'}
        currentUrl={
          mediaModalType === 'picture'
            ? workspace.graph.media?.pictureUrl
            : workspace.graph.media?.videoUrl
        }
        onClose={() => setMediaModalType(null)}
        onSave={url => {
          const field = mediaModalType === 'picture' ? 'pictureUrl' : 'videoUrl';
          updateWorkspaceState({
            ...workspace,
            graph: {
              ...workspace.graph,
              media: {
                ...workspace.graph.media,
                [field]: url
              }
            }
          });
        }}
      />

      {/* Custom Item Modal */}
      <CustomItemModal
        isOpen={Boolean(customItemModalType)}
        itemType={customItemModalType || 'ingredient'}
        onClose={() => setCustomItemModalType(null)}
        onSave={item => {
          if (customItemModalType === 'ingredient') {
            updateWorkspaceState({
              ...workspace,
              customIngredients: [...workspace.customIngredients, item]
            });
          } else {
            updateWorkspaceState({
              ...workspace,
              customCookware: [...workspace.customCookware, { ...item, size: 'Normal' }]
            });
          }
        }}
      />

      {/* Export Recipe Modal */}
      <ExportRecipeModal
        isOpen={isExportModalOpen}
        workspace={workspace}
        finalGraph={exportStudioWorkspaceToRecipeGraph(workspace)}
        onClose={() => setIsExportModalOpen(false)}
        onExportSuccess={(slug, filePath) => {
          showToast(`Saved to ${filePath || `src/recipes/${slug}.json`}!`);
          updateWorkspaceState({
            ...workspace,
            graph: {
              ...workspace.graph,
              id: slug
            }
          });
        }}
      />

      {/* Reparent / Change Hierarchy Modal */}
      <ReparentSectionModal
        isOpen={isReparentModalOpen}
        section={selectedSection}
        sections={currentSections}
        onClose={() => setIsReparentModalOpen(false)}
        onReparent={handleReparentSection}
      />
    </div>
  );
}
