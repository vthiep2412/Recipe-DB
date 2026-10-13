# Recipe Capabilities and Data Specifications

This document outlines the recipe structures, culinary data models, and instructional features supported by Kitchen Studio.

## 1. Recipe Metadata and Culinary Context

- **General Information**: Title, author attribution, source URL, base servings count, and difficulty rating (easy, medium, hard).
- **Rich Description and Commentary**: Recipe overview and culinary backstory supporting markdown formatting, wiki-style concept links, and author notes.
- **Media References**: Primary dish photography, step technique galleries, and master preparation video references.

## 2. Structural Organization (Components and Sections)

- **Component-Based Sections**: Divides recipes into logical preparation components (such as Dough, Filling, Sauce, Assembly) rather than a flat, unstructured step sequence.
- **Subsection Nesting**: Supports single-level subsections within a major component to group related sub-tasks.
- **Section Tool Checklists**: Groups required cookware and tools per section so cooks can prepare equipment before beginning a component.

## 3. Step Architecture and Instruction Types

- **Counted Steps**: Chronological action steps numbered sequentially (Step 1, Step 2, Step 3) for the core preparation workflow.
- **Uncounted Notes and Callouts**: Non-sequential advisory steps for setup notes, advance warnings, hygiene checkpoints, or general kitchen tips that do not advance the step counter.
- **Video Timestamp Synchronization**: Individual steps can bind to specific start and end timestamps in a master video, linking written instructions to visual footage.

## 4. Ingredients and Culinary Inputs

- **Amounts, Units, and Fractions**: Precise measurement quantities with unit handling and fractional scaling support.
- **Ingredient Notes**: Per-ingredient guidance (such as room temperature, packed, sifted, or brand recommendations).
- **Hidden Ingredients**: Ingredients marked for visibility in specific step instructions while excluded from primary shopping and mise-en-place checklists.
- **Preparation States**: Flags for ingredients requiring preliminary states (such as softened butter, cold water, or finely minced herbs).
- **Advance Lead Times**: Per-ingredient lead times (such as 30 minutes tempering or 2 hours marinating) that inform upfront preparation warnings.

## 5. Cookware, Tools, and Vessel Management

- **Cookware Categorization**: Tools and vessels classified into types (bowl, pan, pot, baking dish, general tool).
- **Vessel Sizing**: Explicit vessel capacity sizing (small, medium-small, normal, medium-large, large) to avoid overflowing cookware.
- **Vessel Roles**: Steps define vessel usage roles (primary vessel, source vessel, destination vessel).
- **Vessel Reuse and Post-Step State**: Instructions track vessel status after step completion (holding intermediate yield, emptied, needs washing, wipe clean for reuse).

## 6. Intermediate Yields and Graph Provenance (DAG Workflows)

- **Step Yield Production**: Steps can declare a named intermediate output (for example, whipped egg whites, cookie dough, caramel sauce) and identify the specific vessel holding it.
- **Yield Consumption**: Downstream steps can consume named yields from earlier steps as ingredients.
- **Provenance Tracing**: Every consumed yield maintains explicit provenance back to the originating step that produced it.
- **Yield Partitioning**: Steps can consume partial quantities of a yield (such as reserving half of a sauce for garnish).
- **Safe Step Removal**: If an origin step is removed, dependent yield mentions gracefully mark the source as deleted rather than corrupting the recipe structure.

## 7. Multi-Phase Culinary Timing

- **Standard Kitchen Phases**: Explicit tracking for common preparation phases:
  - Prep Time
  - Cook Time
  - Bake Time
  - Rest Time
  - Chill Time
  - Marinate Time
  - Simmer Time
  - Proofing Time
  - Fermentation Time
  - Freeze Time
- **Custom Labeled Phases**: Extensible time entries for specialized culinary steps with designated hours and minutes.

## 8. Timers and Sensory Doneness Cues

- **Duration Windows**: Supports exact durations or duration ranges (for example, 20 to 25 minutes) to reflect real-world cooking variance.
- **Creator Guidance Notes**: Maker-authored instructions providing context when a timer rings.
- **Sensory Doneness Triggers**: Verifiable doneness checkpoints linked directly to timers:
  - Visual cues (such as golden brown edges, bubbling center)
  - Tactile cues (such as firm to the touch, toothpick comes out clean)
  - Aroma cues (such as nutty toasted fragrance)
  - Internal core temperatures with target values in Celsius or Fahrenheit
