<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Mockups Builder — Agent Guide

## Project Overview
App Store & Mac App Store screenshot mockup editor built with Next.js 16 (App Router) + TypeScript + react-konva + shadcn/ui (Base UI) + Tailwind CSS 4.

## Architecture

### Routes
- `/` — Dashboard (project list). Implementation: `src/app/page.tsx` re-exports `src/app/dashboard.tsx`
- `/editor/[projectId]` — Canvas editor. Implementation: `src/app/editor/[projectId]/page.tsx`

### Key Files
| File | Purpose |
|------|---------|
| `src/lib/types.ts` | All TypeScript types: `CanvasElement`, `Project`, `DeviceConfig`, `Template` |
| `src/lib/store.ts` | Zustand store: elements, selection, history (undo/redo), zoom, active tool |
| `src/lib/db.ts` | Dexie.js IndexedDB schema for project persistence |
| `src/lib/devices.ts` | Device configs with App Store dimensions (iPhone 6.9"/6.7"/6.5"/5.5", iPad, Mac) |
| `src/lib/templates.ts` | Pre-built template definitions (JSON element arrays) |
| `src/lib/export.ts` | PNG export via `stage.toDataURL()` at exact store dimensions |
| `src/lib/mcp-bridge.ts` | Browser-side WebSocket client that receives MCP commands and executes on Zustand |
| `src/mcp/server.ts` | MCP server (stdio + WebSocket bridge) exposing all editor tools to AI agents |
| `src/components/editor/Canvas.tsx` | react-konva Stage with zoom/pan, element rendering, drag bounds clamping |
| `src/components/editor/Toolbar.tsx` | Top bar: tools, device selector, zoom, undo/redo, save, export |
| `src/components/editor/LeftSidebar.tsx` | Layers panel + template gallery |
| `src/components/editor/RightSidebar.tsx` | Context-sensitive property editor |

### State Management
- **Zustand** (`src/lib/store.ts`): Single store with `useEditorStore` hook
- Access outside React: `useEditorStore.getState()` / `useEditorStore.setState()`
- History: `pushHistory()` before mutations, `undo()`/`redo()` to navigate

### Element Types
All elements extend `BaseElement` (id, x, y, width, height, rotation, opacity, visible, locked, name):
- `TextElement` — text, fontSize, fontFamily, fontWeight, fill, align, lineHeight
- `ImageElement` — src (data URL)
- `RectangleElement` — fill, stroke, strokeWidth, cornerRadius
- `DeviceFrameElement` — deviceId, screenshotSrc

### Adding a New Device
Add an entry to the `DEVICES` array in `src/lib/devices.ts`. Required fields: `id`, `name`, `category`, `width`, `height`.

### Adding a New Template
Add an entry to the `TEMPLATES` array in `src/lib/templates.ts`. Elements use `CanvasElementWithoutId` (no `id` field — assigned at runtime).

### Adding a New Element Type
1. Define the interface in `src/lib/types.ts` extending `BaseElement`
2. Add to the `CanvasElement` union type
3. Add rendering logic in `Canvas.tsx` → `ElementRenderer`
4. Add property controls in `RightSidebar.tsx`

## Important Conventions
- **shadcn/ui is Base UI-based** (not Radix). No `asChild` prop — use `render` prop or native HTML instead.
- **Slider** uses a custom native `<input type="range">` (not Base UI Slider) to avoid script tag hydration errors.
- Canvas elements are clamped to stay within mockup dimensions via `dragBoundFunc`.
- All components are client components (`"use client"`).
- Persistence: IndexedDB via Dexie.js, no backend.

## Build & Dev
```bash
npm run dev    # Start dev server (Turbopack)
npm run build  # Production build
npm run lint   # ESLint
npm run mcp    # Start MCP server (for AI agent integration)
```

## MCP Server (AI Agent Integration)

### Architecture
```
AI Client (Claude/Copilot) ←(stdio)→ MCP Server ←(WebSocket :3333)→ Browser (Zustand store)
```

The MCP server (`src/mcp/server.ts`) runs as a standalone Node.js process. It:
1. Communicates with AI clients via **stdio** (Model Context Protocol)
2. Runs a **WebSocket server** on port 3333 (configurable via `MCP_WS_PORT` env)
3. The browser connects automatically when the editor is open (`src/lib/mcp-bridge.ts`)

### Available MCP Tools
| Tool | Description |
|------|-------------|
| `get_state` | Current project state (screens, zoom, selection) |
| `list_elements` | All elements on the active screen |
| `get_element` | Single element by ID |
| `list_screens` | All screens in the project |
| `get_devices` | Available device configurations |
| `get_templates` | Available pre-built templates |
| `add_text` | Add a text element |
| `add_rectangle` | Add a rectangle element |
| `add_image` | Add an image element (base64) |
| `update_element` | Update any element's properties |
| `delete_element` | Delete an element |
| `delete_all_elements` | Clear all elements on current screen |
| `move_element_layer` | Reorder element (up/down/top/bottom) |
| `duplicate_element` | Clone an element with offset |
| `add_screen` | Add a new screen |
| `switch_screen` | Switch active screen |
| `duplicate_screen` | Clone a screen |
| `remove_screen` | Delete a screen |
| `update_screen` | Update screen name/background |
| `set_background` | Set background color |
| `apply_template` | Apply a pre-built template |
| `select_elements` | Select elements by ID |
| `set_zoom` | Set zoom level |
| `undo` / `redo` | History navigation |
| `batch` | Execute multiple commands in one call |

### Setup
MCP config is in `.vscode/mcp.json`. For Claude Desktop, add to `~/.claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "mockups-builder": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/path/to/Mockups Builder"
    }
  }
}
```
