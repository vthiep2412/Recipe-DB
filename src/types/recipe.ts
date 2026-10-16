export interface RecipeIngredient {
  id: string;
  name: string;
  quantityValue: number | null;
  unit: string | null;
  quantityText: string | null;
  note: string | null;
  isHidden: boolean;
}

export type StepToken =
  | { type: 'text'; value: string }
  | { type: 'ingredient'; name: string; quantityText?: string; note?: string; isHidden?: boolean }
  | { type: 'cookware'; name: string; quantityText?: string }
  | { type: 'timer'; durationText: string; timerId?: string }
  | { type: 'yield'; yieldId: string; displayText: string; partition?: string };


export interface RecipeStep {
  index: number;
  rawText: string;
  tokens: StepToken[];
  id?: string;
  stepId?: string;
  title?: string;
  sectionId?: string;
  isCountedStep?: boolean;
  isLinkedToPrevious?: boolean;
  image?: string;
  media?: {
    galleryUrls?: string[];
    videoClip?: {
      startSec: number;
      endSec?: number;
    };
  };
  showInlineTools?: boolean;
  producesYield?: { id: string; name: string; vesselId?: string };
}

export interface RecipeSubsection {
  id: string;
  name: string;
  description?: string;
  steps: RecipeStep[];
}

export interface RecipeSection {
  id?: string;
  name: string;
  description?: string;
  image?: string;
  subsections?: RecipeSubsection[];
  steps: RecipeStep[];
}

export interface RecipeTimes {
  total?: string;
  prep?: string;
  cook?: string;
  bake?: string;
  rest?: string;
  [key: string]: string | undefined;
}

export interface RecipeJSON {
  id: string;
  title: string;
  description: string;
  image?: string;
  gallery?: string[];
  video?: string;
  importantNotes?: string;
  author?: {
    name?: string;
    url?: string;
  };
  source?: {
    url?: string;
  };
  servings: {
    base: number;
    unitName: string;
  };
  difficulty?: string;
  cuisine?: string;
  course?: string;
  times: RecipeTimes;
  tags: string[];
  metadata: Record<string, string>;
  ingredients: RecipeIngredient[];
  sections: RecipeSection[];
  rawCooklang: string;
}
