# RecipeDB

A standalone recipe web application built with Preact, Vite, and Bun. Parses Cooklang markdown files and renders a rich two-column view with interactive step tracking, cooking and shopping modes, dynamic servings scaling, and unit conversion.

## Tech Stack

- **Framework**: Preact + TypeScript
- **Bundler / Dev Server**: Vite
- **Runtime / Package Manager**: Bun
- **Icons**: Lucide Preact
- **License**: Apache-2.0

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.0 or higher)

### Installation

```bash
bun install
```

### Development Server

Runs the local development server on port 5176:

```bash
bun run dev
```

### Production Build

Compiles TypeScript and bundles assets to `dist/`:

```bash
bun run build
```

### Preview Production Build

```bash
bun run preview
```

### Remote Tunneling

Exposes the local dev server via Cloudflare tunnel:

```bash
bun run tunnel
```

## Features and Syntax

- **Spacious Recipe Search & Grid**:
  - **Dynamic Placeholders**: Rotates through 60 curated culinary ideas with smooth typewriter animation.
  - **Title Search & Tag Scoping**: Search matches recipe titles while active tags filter by category.
  - **Anchored Tag Menus**: Minimal tag button pops open a floating dropright menu on desktop (with auto-fallback to dropdown on narrow viewports) and a full dropdown on mobile. Includes real-time fuzzy tag search.
  - **Active Filter Chips**: Selected tags appear above the search bar with instant click-to-remove.
  - **Responsive Multi-Column Grid**: Dynamic grid scaling smoothly from single-column mobile view to multi-column desktop layout.
- **Two-Column Rich UI**: Desktop view features a left-hand ingredient sidebar and a right-hand media hero and step-by-step method panel.
- **Cooklang & Fablang Parsing Engine**:
  - `@ingredient{quantity%unit}(note)`: Standard ingredient with amounts and notes.
  - `@ingredient{quantity}`: Ingredients without units ("(No Unit)"), displaying raw count without arbitrary measurement labels.
  - `@@ingredient{quantity%unit}`: Hidden ingredients visible in method steps but excluded from ingredient checklists.
  - `#cookware{quantity}`: Kitchen tools and equipment.
  - `~timer{duration%unit}`: Active timers with countdowns.
- **Cooking vs. Prepare Modes**:
  - **Prepare Mode**: Checklists for all ingredients and cookware with checkboxes and clear-all actions for advance mise-en-place.
  - **Cooking Mode**: Grouped by section, presenting section cookware on top with checkboxes separated by a hairline divider from step ingredients.
- **Unified Checklist & Focus Persistence**: Automatically saves checklist states, active mode, and section focus to `localStorage`.
- **Scoped Step Dimming & Focus Memory**: Active step stays at full brightness with an orange indicator, sibling steps dim to 0.65 opacity, and other sections retain their last remembered step with a muted amber indicator.
- **Yield Provenance Linking**: Interactive yield badges trace ingredients back to the producing step with smooth scrolling and highlight pulses. Gracefully informs when an origin step was deleted.
- **Inline Step Tools**: Step cards can display compact chip bars of ingredients and cookware directly in the method view.
- **Widescreen Media Clamping**: Step and section images adhere to fixed 16:9 and 21:9 letterbox aspect ratios with height clamping.
- **Dynamic Servings Scaling**: Stepper scales quantities and fraction display automatically.
- **Zero-Syntax Temperature Tool & Unit Conversion**:
  - **Kitchen Studio Canvas Tool**: Dedicated `+ Temp 🌡️` button in the Step Node action bar to create single temperatures (`350°F`) or ranges (`350-375°F`).
  - **Zero-Syntax Storage**: Outputs clean standard plain text without custom markup, preserving standard Cooklang and Markdown compatibility.
  - **Auto-Detection**: Any temperature typed or loaded in Kitchen Studio transforms into an interactive card token.
  - **Dynamic Conversion**: Recipe View standardizes temperature formatting and converts between Fahrenheit and Celsius based on the user's unit settings.
- **Smart Internal Recipe Links (`recipe:{slug-id}`)**:
  - **Universal Linking**: Links formatted as `recipe:{slug-id}` (or markdown links `[Title](recipe:{slug-id})`) automatically resolve to `/recipes/{slug-id}` on the current host.
  - **Seamless SPA Navigation**: Clicking internal recipe links transitions smoothly via client-side routing without full page reloads, while middle-click or right-click preserves new-tab browser behaviors.
- **Multi-Image Hero, Step Galleries & YouTube Lightbox**:
  - **Dynamic Splits**: Automatically adapts layout for 1 photo (full-width), 2 photos (50/50 split), 3+ photos (split with Facebook-style `+N` darkened overlay), or video pinned to right (native MP4 or YouTube embed via `youtube-nocookie`).
  - **Step-Level Multi-Image Support**: Method steps support multiple pictures with an integrated gallery manager modal in Kitchen Studio (`+{count - 1}` badge indicator on card) and Facebook-style split banners in the cooking view.
  - **Ghost-Button Lightbox**: Clean image viewer with borderless ghost navigation arrows, position counter (`1 / N`), thumbnail scrub strip, and keyboard navigation (`ArrowLeft`, `ArrowRight`, `Escape`).
  - **Studio Media Ingest**: Image management grid in Kitchen Studio with per-image deletion, URL loading, file uploads, and cover badges in recipe settings and method steps.
- **Universal Cloudinary Media Pipeline & Streaming Optimization**:
  - **Automatic Ingest**: Routes all non-Cloudinary images (drag-and-drop local files, base64 strings, and external HTTP/HTTPS URLs) through Cloudinary upon publish or update in Kitchen Studio while preserving YouTube embeds.
  - **Bandwidth-Saving Lossy Streams**: Enforces dynamic `f_auto,q_auto:good,fl_strip_profile` streaming transformations across viewer, search, and studio delivery to serve lossy AVIF (and WebP fallback) with perceptual quality calibration, stripped metadata, and zero dimensional downscaling.
  - **One-Time Database Migration Tool**: Standalone migration runner (`scripts/migrate-media-to-cloudinary.ts`) to scan Supabase `recipes` and `recipe_details`, ingest external image URLs to Cloudinary, and update database rows in batch with `--dry-run` inspection.
- **Creator Application Workflow**: Dedicated application portal equipped with an Obsidian-style live Markdown editor, guidelines for aspiring creators, and status tracking connected to review workflows.
- **Theme**: Obsidian dark grey aesthetic (`#1e1e1e` / `#242424`) with warm orange accents.

## Project Structure

```
src/
├── components/          # Preact components (Navbar, RecipeDetailView, SearchPage, AppSettingsModal)
├── parser/              # Cooklang AST parser, fraction formatter, and unit converter
├── recipes/             # Recipe markdown files and dynamic loader
├── styles/              # Theme variables and component styles
├── types/               # TypeScript interfaces (RecipeJSON, tokens, AST)
└── main.tsx             # Root application component, router, and entry point
```
