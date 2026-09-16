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
  | { type: 'timer'; durationText: string };

export interface RecipeStep {
  index: number;
  rawText: string;
  tokens: StepToken[];
}

export interface RecipeSection {
  name: string;
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
  video?: string;
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
