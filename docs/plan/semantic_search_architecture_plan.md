# RecipeDB Semantic Search Architecture Plan (EmbeddingGemma 2)

> [!NOTE]
> This document locks the visual, frontend, and local backend architecture for semantic recipe search. It is an architectural reference blueprint to guide implementation when ready.

---

## 1. System Overview

```
+-------------------------------------------------------------------------+
|                              CLIENT (UI)                                |
|  - Search Bar (always visible)                                          |
|  - Initial State: "Hot Search" recipes (if available) or clean bar only  |
|  - Post-Search State: Semantic results displayed, tag filter unhidden   |
+-------------------------------------------------------------------------+
                                    |
                            Query (HTTP POST)
                                    v
+-------------------------------------------------------------------------+
|                         LOCAL BACKEND SERVER                            |
|  - Embedding Engine: EmbeddingGemma 2 (740M Multimodal, ~567 MB RAM)     |
|  - Query Embedding: Encodes search text into shared vector space        |
|  - In-Memory Match: Dot product against cached recipe vectors (1-2 ms)  |
|  - Context Re-Ranking: Time-of-day and weekday contextual boost         |
|  - Fallback Guard: Reverts to fuzzy keyword search if model is offline  |
+-------------------------------------------------------------------------+
                                    |
                           Sorted Candidates (JSON)
                                    v
+-------------------------------------------------------------------------+
|                       CLIENT-SIDE POST-FILTER                           |
|  - User toggles active tags (e.g. #baking, #quick)                      |
|  - In-memory boolean filter applied over semantic candidates            |
+-------------------------------------------------------------------------+
```

---

## 2. Frontend User Experience (SearchPage)

### State 1: Initial (Idle)
- **Search Bar:** Centered, prominent input.
- **Tag Filter Button:** Completely hidden before search execution to avoid visual clutter.
- **Content Area:**
  - If Hot Search recipes exist: Display a compact row or grid of trending dishes.
  - If no Hot Search recipes exist: Clean blank slate containing only the search bar.

### State 2: Searching (Active)
- User enters natural language (such as "cozy winter pasta" or "sweet 3-step snack").
- Quiet skeleton cards indicate search calculation without jarring UI jumps.

### State 3: Results Displayed
- Top 30 to 50 semantic candidates returned from local backend.
- **Tag Filter Button Appears:** Unhides next to or below the search input.
- User can click tags (such as `#easy`, `#dairy-free`, `#baking`) to instantly refine the candidate list in memory.
- If no matches survive the tag filter, a clear empty state explains why and suggests removing a tag.

---

## 3. Local Backend and Embedding Pipeline

### Model Selection: EmbeddingGemma 2
- **License:** Apache 2.0 (commercially permissive).
- **Footprint:** ~567 MB active RAM when quantized for multimodal execution on local laptop hardware.
- **Modalities:** Jointly maps recipe text, ingredients, step structure, and food photography into one shared 768-dimension vector space.

### Recipe Indexing (Executed on Recipe Creation or Update)
1. **Metadata Packing:** Concatenate title, description, step counts, total prep/cook times, and key ingredients.
2. **Visual Inclusion:** Pass the recipe hero photo along with the packed text to EmbeddingGemma 2.
3. **MRL Compression:** Truncate output vectors from 768 dimensions down to 256 dimensions using Matryoshka Representation Learning.
4. **Storage:** Cache vector numbers in a local JSON index file or SQLite table (less than 1 MB total for 1,000 recipes).

### Query Retrieval and Scoring
1. User query string received at `/api/search`.
2. Query text embedded via EmbeddingGemma 2.
3. Fast dot product computed against all cached recipe vectors in memory.
4. **Contextual Boost Applied:**
   - Client sends local hour and day with the query.
   - If evening (6:00 PM to 8:30 PM), recipes tagged "dinner" or under 30 minutes receive a `+0.15` score boost.
   - If weekend morning, recipes tagged "baking" or "brunch" receive a boost.
5. Return top ranked candidates to the client.

---

## 4. Defensive Verification and Resilience Baselines

1. **Candidate Pool Depth:** Always retrieve at least 30 to 50 candidates from the vector step so client-side tag filtering does not prematurely zero out results.
2. **Offline Fallback:** If the local Python/Node embedding service is stopped or starting up, [SearchPage.tsx](file:///c:/Workspace/Project%20App/RecipeDB/src/components/SearchPage.tsx) seamlessly falls back to standard fuzzy text matching without crashing the page.
3. **Input Sanitization:** Search query input is trimmed and sanitized against injection before passing to the local embedding runner.

---

## 5. Next Steps

- This plan is strictly conceptual and locks in the architecture.
- No files or codebase components will be modified until you review and give explicit approval.
