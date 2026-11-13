# RecipeDB Dashboard Architecture Plan (Concept)

> [!NOTE]
> This document locks the visual and structural architecture for the RecipeDB Dashboard. It is a conceptual design blueprint for alignment and future expansion, not an immediate implementation trigger.

---

## 1. Role and Core Purpose

The RecipeDB Dashboard is an editorial launchpad and focused discovery screen. It does not function as an administrative metrics center. It answers one kitchen question clearly: **"What should I cook right now?"**

The screen balances two distinct user modes:
1. **Decisive Focus (Top):** An editorial recommendation with strong context.
2. **Autonomous Browsing (Bottom):** A horizontally scrollable row of "Recipes to Try" for personal discovery when the top recommendation is not chosen.

---

## 2. Core Layout Architecture (Phase 1 Baseline)

```
+-----------------------------------------------------------+
|                                                           |
|             EDITORIAL OCCASION HERO BANNER               |
|   [Context Badge: Dinner Tonight / Weekend Project]       |
|   [Recipe Information]                                    |
|                                                           |
+-----------------------------------------------------------+

  RECIPES TO TRY
+-----------+  +-----------+  +-----------+  +-----------+  +--->
| Card 1    |  | Card 2    |  | Card 3    |  | Card 4    |  |
| Thumbnail |  | Thumbnail |  | Thumbnail |  | Thumbnail |  | (Scroll)
| [Recipe   |  | [Recipe   |  | [Recipe   |  | [Recipe   |  |
|  Info]    |  |  Info]    |  |  Info]    |  |  Info]    |  |
+-----------+  +-----------+  +-----------+  +-----------+  +--->
```

### Component A: Editorial Occasion Hero
- **Aspect Ratio:** Wide responsive container (16:9 mobile, 21:9 desktop).
- **Context Pill:** Timely label (such as "Dinner Tonight", "Weekend Baking", or "Holiday Feast").
- **Content:** Key recipe information kept clean and scannable.
- **Dynamic Logic:** Automatically shifts based on local time and day (e.g. quick weekday meals in the evening, baking projects on Sunday mornings).

### Component B: Recipes to Try (Horizontal Snap Rail)
- **Item Count:** Capped at 8 to 12 curated recommendations to prevent scrolling fatigue.
- **Card Data:** Thumbnail image alongside essential recipe information.
- **Interaction:**
  - Touch: Fluid horizontal scroll snap (`x mandatory`) landing squarely on card boundaries.
  - Desktop: Subtle directional chevron buttons and edge fades indicating card overflow.

---

## 3. Modular Expansion Architecture (Future Shelves)

As RecipeDB expands, the screen extends downward with additional standardized horizontal shelves beneath the Recipes to Try row. Each shelf answers a specific culinary need without altering the primary hero structure.

### Future Shelf Stack
1. **Shelf 1 (Baseline):** `Recipes to Try` (habit-based recommendations)
2. **Shelf 2 (Speed):** `Under 20 Minutes` (fast weekday solutions with minimal prep)
3. **Shelf 3 (Occasion):** `Seasonal & Curated Collections` (holiday guides, grilling season, baking bases)
4. **Shelf 4 (Habit):** `Cooked Again & Again` (your most-frequent staples and highest-rated dishes)
5. **Shelf 5 (Technique):** `Foundational Skills & Base Recipes` (stocks, doughs, mother sauces)

Each shelf uses the exact same scroll-snap rail component, keeping visual rhythm unified while data queries remain modular.

---

## 4. Anti-Slop Guidelines for Dashboard

1. **Zero Invented Metrics:** No fake stats, total recipes cooked counters, or completion percentages.
2. **Zero Unasked Charts:** No cooking frequency line graphs or calorie donut charts.
3. **No Decorative Emojis:** Interface labels rely on clear typography and functional iconography only.
4. **Balanced Contrast:** Cards use solid, warm neutral surfaces matching RecipeDB dark and light tokens, avoiding noisy full-screen gradients or excessive glass blur.

---

## 5. Next Steps

- Review this concept and confirm whether the hierarchy and expansion layout match your vision.
- Once approved, this plan will serve as the architectural reference whenever you decide to begin implementation.
