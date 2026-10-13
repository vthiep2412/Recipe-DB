export interface RecipeMetadata {
  title: string;
  description?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  servings: number;
  tips?: string;
  importantNotes?: string;
  author?: {
    name?: string;
    url?: string;
  };
  source?: {
    url?: string;
  };
  media?: {
    pictureUrl?: string;
    videoUrl?: string;
    galleryUrls?: string[];
  };
  times: {
    prepSec?: number;
    cookSec?: number;
    bakeSec?: number;
    restSec?: number;
    totalSec?: number;
    custom?: { label: string; seconds: number }[];
  };
}

export interface CanvasSection {
  id: string;
  name: string;
  description?: string;
  order: number;
  colorIndex?: number;
  parentSectionId?: string;
  showInlineTools?: boolean;
}

export interface RecipeGraph {
  schemaVersion: 1 | 2;
  id: string;
  title: string;
  servings: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  description?: string;
  tips?: string;
  importantNotes?: string;
  leadTimeSummary?: string;
  author?: {
    name?: string;
    url?: string;
  };
  source?: {
    url?: string;
  };
  media?: {
    pictureUrl?: string;
    videoUrl?: string;
    galleryUrls?: string[];
  };
  times: {
    prepSec?: number;
    cookSec?: number;
    bakeSec?: number;
    restSec?: number;
    totalSec?: number;
    custom?: { label: string; seconds: number }[];
  };
  inputs: RecipeInput[];
  vessels: RecipeVessel[];
  components: RecipeComponent[];
  sections?: CanvasSection[];
  meta?: Record<string, unknown>;
}

export interface RecipeInput {
  id: string;
  name: string;
  amount: number | string;
  unit: string;
  prepState?: string;
  leadTimeSec?: number;
  notes?: string;
}

export type VesselSize = 'Small' | 'Med-small' | 'Normal' | 'Med-large' | 'Large';

export interface RecipeVessel {
  id: string;
  name: string;
  type: 'bowl' | 'pan' | 'pot' | 'baking_dish' | 'tool';
  size?: VesselSize;
  capacity?: string;
  dimensions?: string;
}

export interface RecipeComponent {
  id: string;
  name: string;
  steps: RecipeStepNode[];
}

export interface RecipeStepNode {
  id: string;
  componentId: string;
  isCountedStep: boolean;
  isLinkedToPrevious?: boolean;
  instructionText: string;
  tokens: RecipeToken[];
  vessels?: {
    vesselId: string;
    role: 'primary' | 'source' | 'destination';
    actionAfter?: 'holding_yield' | 'empty' | 'needs_wash' | 'wipe_clean';
  }[];
  consumesYields?: { yieldId: string; partition?: string }[];
  producesYield?: {
    id: string;
    name: string;
    vesselId: string;
    description?: string;
  };
  timer?: StepTimer;
  media?: {
    galleryUrls?: string[];
    videoClip?: {
      startSec: number;
      endSec?: number;
    };
  };
  showInlineTools?: boolean;
  meta?: Record<string, unknown>;
}

export interface StepTimer {
  id: string;
  label: string;
  minSec: number;
  maxSec?: number;
  creatorNote?: string;
  donenessCue?: {
    type: 'visual' | 'tactile' | 'temperature' | 'aroma';
    description: string;
    targetTemp?: { value: number; unit: 'C' | 'F' };
  };
}

export type RecipeToken =
  | { type: 'text'; text: string }
  | { type: 'ingredient'; inputId: string; displayText: string; amount?: number | string; unit?: string; note?: string }
  | { type: 'cookware'; vesselId: string; displayText: string }
  | { type: 'yield'; yieldId: string; sourceStepId: string; displayText: string; partition?: string }
  | { type: 'timer'; timerId: string; displayText: string };

export type MentionType = 'ingredient' | 'cookware' | 'timer' | 'yield';

export interface StepMentionToken {
  id: string;
  type: MentionType;
  displayText: string;
  data?: {
    ingredientId?: string;
    amount?: number | string;
    unit?: string;
    vesselId?: string;
    vesselSize?: VesselSize;
    timerSec?: number;
    creatorNote?: string;
    donenessDescription?: string;
    yieldId?: string;
    yieldName?: string;
    yieldStepTitle?: string;
    yieldVesselId?: string;
    yieldPartition?: string;
  };
}

export type StepInstructionSegment =
  | { type: 'text'; id: string; text: string }
  | { type: 'mention'; id: string; mention: StepMentionToken };

export interface CanvasStepNode {
  id: string;
  sectionId?: string;
  parentId: string; // section id, subsection id, or another step id
  title: string;
  isCountedStep: boolean;
  isLinkedToPrevious: boolean;
  instructionText: string;
  segments?: StepInstructionSegment[];
  mentions: StepMentionToken[];
  media?: {
    galleryUrls?: string[];
    videoClip?: {
      startSec: number;
      endSec?: number;
    };
  };
  showInlineTools?: boolean;
  producesYield?: {
    name: string;
    vesselId: string;
  };
}

export interface StudioWorkspace {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  graph: RecipeGraph;
  sections?: CanvasSection[];
  canvasNodes: CanvasStepNode[];
  customIngredients: { id: string; name: string; allowedUnits?: string[] }[];
  customCookware: { id: string; name: string; size?: VesselSize }[];
}
