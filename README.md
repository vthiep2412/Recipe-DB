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

- **Two-Column Rich UI**: Desktop view features a left-hand ingredient sidebar and a right-hand media hero and step-by-step method panel.
- **Cooklang Parsing Engine**:
  - `@ingredient{quantity%unit}(note)`: Standard ingredient with amounts and notes.
  - `@@ingredient{quantity%unit}`: Hidden ingredients visible in method steps but excluded from ingredient checklists.
  - `#cookware{quantity}`: Kitchen tools and equipment.
  - `~timer{duration%unit}`: Active timers with countdowns.
- **Cooking vs. Shopping Modes**:
  - **Cooking Mode**: Groups ingredients by step so you see only what is needed during each cooking phase.
  - **Shopping Mode**: Flattens all ingredients across the entire recipe for grocery trips.
- **Dynamic Servings Scaling**: Stepper scales quantities and fraction display automatically.
- **Theme**: Obsidian dark grey aesthetic (`#1e1e1e` / `#242424`) with warm orange accents.

## Project Structure

```
src/
├── components/          # Preact components (Navbar, RecipeDetailView, SearchPage, AppSettingsModal)
├── parser/              # Cooklang AST parser, fraction formatter, and unit converter
├── recipes/             # Recipe markdown files and dynamic loader
├── styles/              # Theme variables and component styles
├── types/               # TypeScript interfaces (RecipeJSON, tokens, AST)
├── App.tsx              # Root application component and router
└── main.tsx             # Entry point
```
