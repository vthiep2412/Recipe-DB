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
import { JsonDrawer } from './JsonDrawer';
import { MediaModal } from './MediaModal';
import { CustomItemModal } from './CustomItemModal';
import { RecipeMetadataModal } from './RecipeMetadataModal';
import { CascadeDeleteModal } from './CascadeDeleteModal';

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

function reorderSectionsAndNodes(
  newSections: CanvasSection[],
  currentNodes: CanvasStepNode[]
): { sections: CanvasSection[]; canvasNodes: CanvasStepNode[] } {
  newSections.forEach((s, idx) => {
    s.order = idx;
  });

  const knownSectionIds = new Set(newSections.map(s => s.id));
  const nodesById = new Map(currentNodes.map(n => [n.id, n]));
  const defaultSecId = newSections[0]?.id || 'sec-main';

  const nodesBySection: Record<string, CanvasStepNode[]> = {};
  for (const s of newSections) {
    nodesBySection[s.id] = [];
  }

  for (const node of currentNodes) {
    const sId = resolveNodeSectionId(node, nodesById, knownSectionIds, defaultSecId);
    if (!nodesBySection[sId]) nodesBySection[sId] = [];
    nodesBySection[sId].push({ ...node, sectionId: sId });
  }

  const nextNodes: CanvasStepNode[] = [];
  for (const s of newSections) {
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
    sections: newSections,
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
  const dragSectionIndexRef = useRef<number>(-1);
  const dragRafIdRef = useRef<number | null>(null);
  const dragPointerClientXRef = useRef<number>(0);

  // Pan interaction handlers supporting middle click, spacebar, and canvas drag
  const handleMouseDown = (e: MouseEvent) => {
    const isMiddleClick = e.button === 1;
    const isBackgroundClick = !(e.target as HTMLElement).closest(
      '.studio-canvas-node, .section-node-card, .studio-sidebar-toolbox, .studio-json-drawer, .studio-inspector-card, .canvas-top-bar'
    );

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
  const STEP_DEFAULT_WIDTH = 576;
  const STEP_DEFAULT_HEIGHT = 260;

  const VERTICAL_GAP = 90;
  const HORIZONTAL_GAP = 80;

  interface NodeSize {
    width: number;
    height: number;
  }

  const [nodeSizes, setNodeSizes] = useState<Record<string, NodeSize>>({});
  const observerMapRef = useRef<Map<string, ResizeObserver>>(new Map());

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

  // Compute dynamic positions for sections and child steps
  const nodePositions = useMemo(() => {
    const positions: Record<string, NodeLayoutPos> = {};
    const knownSectionIds = new Set(currentSections.map(s => s.id));
    const nodesById = new Map(workspace.canvasNodes.map(n => [n.id, n]));
    const defaultSecId = currentSections[0]?.id || 'sec-main';

    const stepsBySection: Record<string, CanvasStepNode[]> = {};
    for (const sec of currentSections) {
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

    let currentColumnX = 0;

    for (let secIdx = 0; secIdx < currentSections.length; secIdx++) {
      const sec = currentSections[secIdx];
      const secSteps = stepsBySection[sec.id] || [];
      const secW = nodeSizes[sec.id]?.width || SECTION_DEFAULT_WIDTH;
      const secH = nodeSizes[sec.id]?.height || SECTION_DEFAULT_HEIGHT;

      const rootStepNodes = secSteps.filter(
        n => n.parentId === sec.id || n.parentId === 'root' || !workspace.canvasNodes.some(x => x.id === n.parentId)
      );

      const subtreeWidths = rootStepNodes.map(r => getSubtreeWidth(r.id));
      const rootsTotalW = subtreeWidths.reduce((acc, w, idx) => acc + w + (idx > 0 ? 60 : 0), 0);
      const columnSlotWidth = Math.max(secW, rootsTotalW, SECTION_DEFAULT_WIDTH);

      let secPosDeltaX = 0;
      if (draggingSectionId === sec.id) {
        secPosDeltaX = dragCurrentDeltaX;
      }

      const columnCenterX = currentColumnX + columnSlotWidth / 2 + secPosDeltaX;
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

      currentColumnX += columnSlotWidth + HORIZONTAL_GAP;
    }

    return positions;
  }, [workspace.canvasNodes, currentSections, nodeSizes, draggingSectionId, dragCurrentDeltaX]);

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

  // Section column drag reorder handlers
  const handleStartDragSection = (e: PointerEvent, sectionId: string, idx: number) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    setDraggingSectionId(sectionId);
    dragSectionIndexRef.current = idx;
    dragPointerClientXRef.current = e.clientX;
    dragStartCanvasPointerXRef.current = (e.clientX - panRef.current.x) / zoom;
    setDragCurrentDeltaX(0);

    const slotDist = STEP_DEFAULT_WIDTH + HORIZONTAL_GAP;
    const minDelta = -idx * slotDist;
    const maxDelta = (currentSections.length - 1 - idx) * slotDist;

    const applyElasticResistance = (rawDelta: number): number => {
      if (rawDelta < minDelta) {
        const overshoot = minDelta - rawDelta;
        return minDelta - overshoot * 0.25;
      }
      if (rawDelta > maxDelta) {
        const overshoot = rawDelta - maxDelta;
        return maxDelta + overshoot * 0.25;
      }
      return rawDelta;
    };

    const updateDelta = (clientX: number) => {
      dragPointerClientXRef.current = clientX;
      const currentCanvasPointerX = (clientX - panRef.current.x) / zoom;
      const rawDelta = currentCanvasPointerX - dragStartCanvasPointerXRef.current;
      setDragCurrentDeltaX(applyElasticResistance(rawDelta));
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
      updateDelta(ev.clientX);
    };

    const handlePointerUp = (ev: PointerEvent) => {
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

      const currentCanvasPointerX = (ev.clientX - panRef.current.x) / zoom;
      const finalDelta = currentCanvasPointerX - dragStartCanvasPointerXRef.current;
      const threshold = 180;
      let slotShift = 0;
      if (Math.abs(finalDelta) >= threshold) {
        slotShift = finalDelta > 0
          ? Math.max(1, Math.round(finalDelta / slotDist))
          : Math.min(-1, Math.round(finalDelta / slotDist));
      }

      if (slotShift !== 0) {
        const fromIdx = dragSectionIndexRef.current;
        const targetIdx = Math.max(0, Math.min(currentSections.length - 1, fromIdx + slotShift));
        if (targetIdx !== fromIdx) {
          const nextSections = [...currentSections];
          const [moved] = nextSections.splice(fromIdx, 1);
          nextSections.splice(targetIdx, 0, moved);
          const reordered = reorderSectionsAndNodes(nextSections, workspace.canvasNodes);
          updateWorkspaceState({
            ...workspace,
            sections: reordered.sections,
            canvasNodes: reordered.canvasNodes
          });
        }
      }

      setDraggingSectionId(null);
      setDragCurrentDeltaX(0);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleMoveSection = (sectionIndex: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? sectionIndex - 1 : sectionIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentSections.length) return;
    const nextSections = [...currentSections];
    const temp = nextSections[sectionIndex];
    nextSections[sectionIndex] = nextSections[targetIndex];
    nextSections[targetIndex] = temp;
    const reordered = reorderSectionsAndNodes(nextSections, workspace.canvasNodes);
    updateWorkspaceState({
      ...workspace,
      sections: reordered.sections,
      canvasNodes: reordered.canvasNodes
    });
  };

  const handleUpdateSection = (sectionId: string, updated: Partial<CanvasSection>) => {
    const nextSections = currentSections.map(s => {
      if (s.id === sectionId) return { ...s, ...updated };
      return s;
    });
    updateWorkspaceState({ ...workspace, sections: nextSections });
  };

  // Section and subsection creation
  const handleAddSectionNode = () => {
    const newId = `sec-${Date.now()}`;
    const order = currentSections.length;
    const newSection: CanvasSection = {
      id: newId,
      name: `Section ${order + 1}`,
      order,
      showInlineTools: false
    };

    updateWorkspaceState({
      ...workspace,
      sections: [...currentSections, newSection]
    });
    setSelectedNodeId(newId);
  };

  const handleAddSubsectionNode = () => {
    if (!selectedSection || selectedSection.parentSectionId) return;
    const newId = `sec-sub-${Date.now()}`;
    const order = currentSections.length;
    const newSection: CanvasSection = {
      id: newId,
      name: `${selectedSection.name} Part 2`,
      order,
      parentSectionId: selectedSection.id,
      showInlineTools: false
    };

    updateWorkspaceState({
      ...workspace,
      sections: [...currentSections, newSection]
    });
    setSelectedNodeId(newId);
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

  // Export recipe graph to disk via Vite server endpoint
  const handleExport = async () => {
    const finalGraph = exportStudioWorkspaceToRecipeGraph(workspace);
    const jsonString = JSON.stringify(finalGraph, null, 2);

    try {
      const res = await fetch('/api/save-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonString
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Saved to src/recipes/${data.id}.json!`);
      }
    } catch {
      // Ignore network errors on static hosting
    }
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
        {/* SVG Wire Layer for Connectors */}
        <svg className="canvas-wires-layer">
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
        {currentSections.map((sec, idx) => {
          const pos = nodePositions[sec.id];
          if (!pos) return null;

          return (
            <div
              key={sec.id}
              ref={el => registerNodeRef(sec.id, el as HTMLElement)}
              className="canvas-node-wrapper"
              style={{
                transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`
              }}
            >
              <SectionNode
                section={sec}
                isFirst={idx === 0}
                isLast={idx === currentSections.length - 1}
                isSelected={selectedNodeId === sec.id}
                onSelect={() => {
                  setSelectedNodeId(sec.id);
                  setActiveMentionId(null);
                  setIsYieldMode(false);
                }}
                onChange={updated => handleUpdateSection(sec.id, updated)}
                onMoveLeft={() => handleMoveSection(idx, 'left')}
                onMoveRight={() => handleMoveSection(idx, 'right')}
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

          return (
            <div
              key={node.id}
              ref={el => registerNodeRef(node.id, el as HTMLElement)}
              className="canvas-node-wrapper"
              style={{
                transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`
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
        onAddStepNode={handleAddStepNode}
        onDeleteSelectedNode={handleDeleteSelectedNode}
        onZoomIn={() => setZoom(prev => Math.min(prev * 1.15, 2.0))}
        onZoomOut={() => setZoom(prev => Math.max(prev * 0.85, 0.4))}
        onResetZoom={() => {
          setZoom(1);
          setPan({ x: window.innerWidth / 2 - 270, y: 80 });
        }}
      />

      {/* Collapsible Live JSON Preview Drawer */}
      <JsonDrawer graph={activeGraph} />

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
    </div>
  );
}
