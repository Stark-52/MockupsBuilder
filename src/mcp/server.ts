#!/usr/bin/env node
/**
 * MCP Server for Mockups Builder
 *
 * Exposes the editor's Zustand store as MCP tools so AI agents
 * can programmatically create, edit, and manage mockup elements.
 *
 * Architecture:
 *   AI Client ←(stdio)→ MCP Server ←(WebSocket :3333)→ Browser (Zustand store)
 *
 * Run:  npx tsx src/mcp/server.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";

const WS_PORT = Number(process.env.MCP_WS_PORT) || 3333;

// ── WebSocket Bridge ──────────────────────────────────────────────

let browserSocket: WebSocket | null = null;
let pendingRequests = new Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws) => {
  browserSocket = ws;
  process.stderr.write(`[mcp] Browser connected on ws://localhost:${WS_PORT}\n`);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const pending = pendingRequests.get(msg.id);
      if (pending) {
        pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.result);
        }
      }
    } catch {
      process.stderr.write(`[mcp] Bad message from browser\n`);
    }
  });

  ws.on("close", () => {
    if (browserSocket === ws) browserSocket = null;
    process.stderr.write(`[mcp] Browser disconnected\n`);
  });
});

process.stderr.write(`[mcp] WebSocket server listening on ws://localhost:${WS_PORT}\n`);

/** Send a command to the browser and wait for a response. */
function sendCommand(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!browserSocket || browserSocket.readyState !== WebSocket.OPEN) {
      reject(new Error("No browser connected. Open the Mockups Builder editor in your browser first."));
      return;
    }
    const id = crypto.randomUUID();
    pendingRequests.set(id, { resolve, reject });
    browserSocket.send(JSON.stringify({ id, method, params }));

    // Timeout after 30s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error("Timeout waiting for browser response"));
      }
    }, 30_000);
  });
}

// ── MCP Server ────────────────────────────────────────────────────

const server = new McpServer({
  name: "mockups-builder",
  version: "1.0.0",
});

// ─── Read-Only Tools ──────────────────────────────────────────────

server.tool(
  "get_state",
  "Get the current project state: screens, active screen, elements, background, zoom",
  {},
  async () => {
    const result = await sendCommand("get_state");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "list_elements",
  "List all elements on the current screen with their properties",
  {},
  async () => {
    const result = await sendCommand("list_elements");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_element",
  "Get a single element by ID",
  { id: z.string().describe("Element ID") },
  async ({ id }) => {
    const result = await sendCommand("get_element", { id });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "list_screens",
  "List all screens in the current project",
  {},
  async () => {
    const result = await sendCommand("list_screens");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_devices",
  "List all available device configurations (iPhone, iPad, Mac) with their dimensions",
  {},
  async () => {
    const result = await sendCommand("get_devices");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_templates",
  "List all available pre-built templates",
  {},
  async () => {
    const result = await sendCommand("get_templates");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_patterns",
  "List available background patterns (waves, lines, dots, geometric)",
  {},
  async () => {
    const result = await sendCommand("get_patterns");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "add_pattern",
  "Add a background pattern (SVG) as a locked image layer. Great for modern backgrounds.",
  {
    patternId: z.string().describe("Pattern ID (use get_patterns to list)"),
    opacity: z.number().optional().default(1).describe("Opacity (0-1)"),
  },
  async (params) => {
    const result = await sendCommand("add_pattern", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// ─── Element Creation ─────────────────────────────────────────────

server.tool(
  "add_text",
  "Add a text element to the current screen",
  {
    text: z.string().describe("The text content"),
    x: z.number().describe("X position in pixels"),
    y: z.number().describe("Y position in pixels"),
    width: z.number().optional().default(400).describe("Width in pixels"),
    height: z.number().optional().default(100).describe("Height in pixels"),
    fontSize: z.number().optional().default(48).describe("Font size"),
    fontFamily: z.string().optional().default("SF Pro Display").describe("Font family"),
    fontWeight: z.string().optional().default("700").describe("Font weight (400, 600, 700, 800, 900)"),
    fill: z.string().optional().default("#ffffff").describe("Text color (hex)"),
    align: z.enum(["left", "center", "right"]).optional().default("center").describe("Text alignment"),
    lineHeight: z.number().optional().default(1.2).describe("Line height multiplier"),
    autoFit: z.boolean().optional().default(false).describe("Auto-shrink font size to fit container width (great for i18n)"),
    strokeColor: z.string().optional().describe("Text stroke/outline color (hex)"),
    strokeWidth: z.number().optional().describe("Text stroke/outline width"),
    gradientFill: z.object({
      type: z.enum(["linear", "radial"]),
      angle: z.number(),
      stops: z.array(z.object({ offset: z.number(), color: z.string() })),
    }).optional().describe("Gradient fill for text (overrides solid fill)"),
    translations: z.record(z.string(), z.string()).optional().describe("Locale translations, e.g. {\"fr\": \"Bonjour\", \"de\": \"Hallo\"}"),
    opacity: z.number().optional().default(1).describe("Opacity (0-1)"),
    rotation: z.number().optional().default(0).describe("Rotation in degrees"),
    name: z.string().optional().default("Text").describe("Layer name"),
  },
  async (params) => {
    const result = await sendCommand("add_text", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "add_rectangle",
  "Add a rectangle element to the current screen. Can also be used as a background or container.",
  {
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    width: z.number().describe("Width"),
    height: z.number().describe("Height"),
    fill: z.string().optional().default("#333333").describe("Fill color (hex)"),
    stroke: z.string().optional().default("").describe("Stroke color (hex, empty for none)"),
    strokeWidth: z.number().optional().default(0).describe("Stroke width"),
    cornerRadius: z.number().optional().default(0).describe("Corner radius"),
    clipImageSrc: z.string().optional().describe("Data URL of an image to clip inside this rectangle"),
    gradient: z.object({
      type: z.enum(["linear", "radial"]),
      angle: z.number(),
      stops: z.array(z.object({ offset: z.number(), color: z.string() })),
    }).optional().describe("Gradient fill (overrides solid fill)"),
    opacity: z.number().optional().default(1).describe("Opacity (0-1)"),
    rotation: z.number().optional().default(0).describe("Rotation in degrees"),
    name: z.string().optional().default("Rectangle").describe("Layer name"),
  },
  async (params) => {
    const result = await sendCommand("add_rectangle", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "add_image",
  "Add an image element. Provide a base64 data URL.",
  {
    src: z.string().describe("Image as data URL (data:image/png;base64,...)"),
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    width: z.number().describe("Width"),
    height: z.number().describe("Height"),
    opacity: z.number().optional().default(1).describe("Opacity (0-1)"),
    rotation: z.number().optional().default(0).describe("Rotation in degrees"),
    name: z.string().optional().default("Image").describe("Layer name"),
  },
  async (params) => {
    const result = await sendCommand("add_image", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "add_circle",
  "Add a circle/ellipse element to the current screen",
  {
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    width: z.number().describe("Width (horizontal diameter)"),
    height: z.number().describe("Height (vertical diameter, same as width for perfect circle)"),
    fill: z.string().optional().default("#8b5cf6").describe("Fill color (hex)"),
    stroke: z.string().optional().default("").describe("Stroke color (hex, empty for none)"),
    strokeWidth: z.number().optional().default(0).describe("Stroke width"),
    gradient: z.object({
      type: z.enum(["linear", "radial"]),
      angle: z.number(),
      stops: z.array(z.object({ offset: z.number(), color: z.string() })),
    }).optional().describe("Gradient fill (overrides solid fill)"),
    opacity: z.number().optional().default(1).describe("Opacity (0-1)"),
    rotation: z.number().optional().default(0).describe("Rotation in degrees"),
    name: z.string().optional().default("Circle").describe("Layer name"),
  },
  async (params) => {
    const result = await sendCommand("add_circle", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "add_line",
  "Add a line or arrow element to the current screen",
  {
    x: z.number().describe("X position (start point)"),
    y: z.number().describe("Y position (start point)"),
    width: z.number().describe("Horizontal length"),
    height: z.number().optional().default(0).describe("Vertical length (0 for horizontal line)"),
    stroke: z.string().optional().default("#ffffff").describe("Line color (hex)"),
    strokeWidth: z.number().optional().default(4).describe("Line thickness"),
    lineStart: z.enum(["none", "arrow", "dot"]).optional().default("none").describe("Start point style"),
    lineEnd: z.enum(["none", "arrow", "dot"]).optional().default("none").describe("End point style"),
    dash: z.boolean().optional().default(false).describe("Whether the line is dashed"),
    opacity: z.number().optional().default(1).describe("Opacity (0-1)"),
    rotation: z.number().optional().default(0).describe("Rotation in degrees"),
    name: z.string().optional().default("Line").describe("Layer name"),
  },
  async (params) => {
    const result = await sendCommand("add_line", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "add_star",
  "Add a star element to the current screen",
  {
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    width: z.number().optional().default(200).describe("Size (width = height)"),
    numPoints: z.number().optional().default(5).describe("Number of star points (3-20)"),
    innerRadiusRatio: z.number().optional().default(0.4).describe("Inner radius ratio (0.1-0.9, lower = spikier)"),
    fill: z.string().optional().default("#fbbf24").describe("Fill color (hex)"),
    stroke: z.string().optional().default("").describe("Stroke color (hex, empty for none)"),
    strokeWidth: z.number().optional().default(0).describe("Stroke width"),
    gradient: z.object({
      type: z.enum(["linear", "radial"]),
      angle: z.number(),
      stops: z.array(z.object({ offset: z.number(), color: z.string() })),
    }).optional().describe("Gradient fill (overrides solid fill)"),
    opacity: z.number().optional().default(1).describe("Opacity (0-1)"),
    rotation: z.number().optional().default(0).describe("Rotation in degrees"),
    name: z.string().optional().default("Star").describe("Layer name"),
  },
  async (params) => {
    const result = await sendCommand("add_star", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "add_icon",
  "Add an SVG icon element to the current screen. Use get_icons to list available icon names.",
  {
    iconName: z.string().describe("Icon name (use get_icons to list available ones)"),
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    width: z.number().optional().default(150).describe("Icon size (width)"),
    height: z.number().optional().default(150).describe("Icon size (height)"),
    fill: z.string().optional().default("#ffffff").describe("Icon fill color (hex)"),
    stroke: z.string().optional().default("").describe("Icon stroke color (hex, empty for none)"),
    strokeWidth: z.number().optional().default(0).describe("Icon stroke width"),
    opacity: z.number().optional().default(1).describe("Opacity (0-1)"),
    rotation: z.number().optional().default(0).describe("Rotation in degrees"),
    name: z.string().optional().describe("Layer name (defaults to icon name)"),
  },
  async (params) => {
    const result = await sendCommand("add_icon", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_icons",
  "List all available icon names organized by category",
  {},
  async () => {
    const result = await sendCommand("get_icons");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "add_device_frame",
  "Add a device frame (iPhone/iPad) to the current screen. Drop a screenshot inside it.",
  {
    deviceId: z.string().optional().default("iphone-6.7").describe("Device ID (e.g. iphone-6.7, ipad-13, mac-2880)"),
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    width: z.number().optional().describe("Frame width (auto-calculated from height if omitted)"),
    height: z.number().optional().default(1600).describe("Frame height"),
    screenshotSrc: z.string().optional().describe("Screenshot data URL (data:image/png;base64,...)"),
    frameColor: z.enum(["black", "silver"]).optional().default("black").describe("Frame color: black (Space Black/titanium) or silver (aluminum)"),
    screenshotFit: z.enum(["cover", "contain", "fill"]).optional().default("cover").describe("How the screenshot fits the screen: cover (fill+crop), contain (fit inside), fill (stretch)"),
    skewX: z.number().optional().default(0).describe("Horizontal tilt in degrees (-5 to 5)"),
    skewY: z.number().optional().default(0).describe("Vertical tilt in degrees (-5 to 5)"),
    perspective: z.number().optional().default(0).describe("Depth/perspective effect (-50 to 50, 0=flat)"),
    opacity: z.number().optional().default(1).describe("Opacity (0-1)"),
    rotation: z.number().optional().default(0).describe("Rotation in degrees"),
    name: z.string().optional().default("Device Frame").describe("Layer name"),
  },
  async (params) => {
    const result = await sendCommand("add_device_frame", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// ─── Element Modification ─────────────────────────────────────────

server.tool(
  "update_element",
  "Update one or more properties of an existing element by ID. Pass only the properties you want to change.",
  {
    id: z.string().describe("Element ID"),
    x: z.number().optional().describe("X position"),
    y: z.number().optional().describe("Y position"),
    width: z.number().optional().describe("Width"),
    height: z.number().optional().describe("Height"),
    rotation: z.number().optional().describe("Rotation in degrees"),
    opacity: z.number().optional().describe("Opacity (0-1)"),
    visible: z.boolean().optional().describe("Whether element is visible"),
    locked: z.boolean().optional().describe("Whether element is locked"),
    name: z.string().optional().describe("Layer name"),
    // Shadow / Effects
    shadowEnabled: z.boolean().optional().describe("Enable drop shadow"),
    shadowColor: z.string().optional().describe("Shadow color (hex)"),
    shadowBlur: z.number().optional().describe("Shadow blur radius (0-100)"),
    shadowOffsetX: z.number().optional().describe("Shadow X offset"),
    shadowOffsetY: z.number().optional().describe("Shadow Y offset"),
    shadowOpacity: z.number().optional().describe("Shadow opacity (0-1)"),
    // Text-specific
    text: z.string().optional().describe("Text content (text elements only)"),
    fontSize: z.number().optional().describe("Font size (text elements only)"),
    fontFamily: z.string().optional().describe("Font family (text elements only)"),
    fontWeight: z.string().optional().describe("Font weight (text elements only)"),
    fill: z.string().optional().describe("Color (text/rectangle elements)"),
    align: z.enum(["left", "center", "right"]).optional().describe("Text alignment"),
    lineHeight: z.number().optional().describe("Line height (text elements only)"),
    autoFit: z.boolean().optional().describe("Auto-shrink font to fit width (text elements only)"),
    // Rectangle-specific
    stroke: z.string().optional().describe("Stroke color (rectangle elements)"),
    strokeWidth: z.number().optional().describe("Stroke width (rectangle elements)"),
    cornerRadius: z.number().optional().describe("Corner radius (rectangle elements)"),
    clipImageSrc: z.string().optional().describe("Clip image data URL (rectangle elements)"),
    gradient: z.object({
      type: z.enum(["linear", "radial"]),
      angle: z.number(),
      stops: z.array(z.object({ offset: z.number(), color: z.string() })),
    }).optional().nullable().describe("Gradient fill for rectangles (null to remove)"),
    // Image-specific
    src: z.string().optional().describe("Image data URL (image elements)"),
    // Device-frame-specific
    deviceId: z.string().optional().describe("Device ID (device-frame elements)"),
    screenshotSrc: z.string().optional().describe("Screenshot data URL (device-frame elements)"),
    frameColor: z.enum(["black", "silver"]).optional().describe("Frame color: black or silver (device-frame elements)"),
    screenshotFit: z.enum(["cover", "contain", "fill"]).optional().describe("Screenshot fit mode: cover, contain, or fill (device-frame elements)"),
    skewX: z.number().optional().describe("Horizontal tilt -5 to 5 (device-frame elements)"),
    skewY: z.number().optional().describe("Vertical tilt -5 to 5 (device-frame elements)"),
    perspective: z.number().optional().describe("Depth/perspective -50 to 50 (device-frame elements)"),
    // Circle-specific (fill, stroke, strokeWidth shared with rectangle)
    // Line-specific
    lineStart: z.enum(["none", "arrow", "dot"]).optional().describe("Line start style (line elements)"),
    lineEnd: z.enum(["none", "arrow", "dot"]).optional().describe("Line end style (line elements)"),
    dash: z.boolean().optional().describe("Dashed line (line elements)"),
    // Star-specific
    numPoints: z.number().optional().describe("Number of star points (star elements)"),
    innerRadiusRatio: z.number().optional().describe("Inner radius ratio 0.1-0.9 (star elements)"),
    // Icon-specific
    iconName: z.string().optional().describe("Icon name (icon elements)"),
    // Effects — applicable to ALL element types
    blurEnabled: z.boolean().optional().describe("Enable gaussian blur effect"),
    blurRadius: z.number().optional().describe("Blur radius (0-50)"),
    flipX: z.boolean().optional().describe("Flip element horizontally"),
    flipY: z.boolean().optional().describe("Flip element vertically"),
    // Text effects
    strokeColor: z.string().optional().describe("Text stroke/outline color (text elements)"),
    textStrokeWidth: z.number().optional().describe("Text stroke/outline width (text elements, maps to strokeWidth)"),
    gradientFill: z.object({
      type: z.enum(["linear", "radial"]),
      angle: z.number(),
      stops: z.array(z.object({ offset: z.number(), color: z.string() })),
    }).optional().nullable().describe("Gradient fill for text elements (null to remove)"),
    translations: z.record(z.string(), z.string()).optional().describe("Locale translations for text elements"),
  },
  async (params) => {
    const result = await sendCommand("update_element", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "delete_element",
  "Delete an element by ID",
  { id: z.string().describe("Element ID to delete") },
  async ({ id }) => {
    const result = await sendCommand("delete_element", { id });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "delete_all_elements",
  "Delete ALL elements on the current screen. Use with caution.",
  {},
  async () => {
    const result = await sendCommand("delete_all_elements");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "move_element_layer",
  "Move an element in the layer stack",
  {
    id: z.string().describe("Element ID"),
    direction: z.enum(["up", "down", "top", "bottom"]).describe("Direction to move"),
  },
  async (params) => {
    const result = await sendCommand("move_element_layer", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "duplicate_element",
  "Duplicate an existing element with an offset",
  {
    id: z.string().describe("Element ID to duplicate"),
    offsetX: z.number().optional().default(20).describe("X offset for the copy"),
    offsetY: z.number().optional().default(20).describe("Y offset for the copy"),
  },
  async (params) => {
    const result = await sendCommand("duplicate_element", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// ─── Screen Operations ────────────────────────────────────────────

server.tool(
  "add_screen",
  "Add a new screen to the project",
  {
    name: z.string().optional().default("New Screen").describe("Screen name"),
    deviceTarget: z.string().optional().default("iphone-6.7").describe("Device ID (e.g. iphone-6.7, ipad-13, mac-2880)"),
    backgroundColor: z.string().optional().default("#1a1a2e").describe("Background color (hex)"),
    backgroundGradient: z.object({
      type: z.enum(["linear", "radial"]),
      angle: z.number(),
      stops: z.array(z.object({ offset: z.number(), color: z.string() })),
    }).optional().describe("Background gradient (overrides solid color)"),
    bannerSegments: z.number().optional().describe("Number of banner segments (≥2 enables banner mode)"),
  },
  async (params) => {
    const result = await sendCommand("add_screen", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "switch_screen",
  "Switch to a different screen by index (0-based)",
  { index: z.number().describe("Screen index (0-based)") },
  async ({ index }) => {
    const result = await sendCommand("switch_screen", { index });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "duplicate_screen",
  "Duplicate a screen",
  { index: z.number().optional().describe("Screen index to duplicate (defaults to current)") },
  async ({ index }) => {
    const result = await sendCommand("duplicate_screen", { index });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "remove_screen",
  "Remove a screen by index",
  { index: z.number().describe("Screen index to remove") },
  async ({ index }) => {
    const result = await sendCommand("remove_screen", { index });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "update_screen",
  "Update screen properties (name, background, banner mode)",
  {
    index: z.number().optional().describe("Screen index (defaults to current)"),
    name: z.string().optional().describe("New screen name"),
    backgroundColor: z.string().optional().describe("New background color (hex)"),
    backgroundGradient: z.object({
      type: z.enum(["linear", "radial"]),
      angle: z.number(),
      stops: z.array(z.object({ offset: z.number(), color: z.string() })),
    }).optional().nullable().describe("Background gradient (null to remove)"),
    bannerSegments: z.number().optional().describe("Number of banner segments (≥2 enables banner, 1 or 0 disables)"),
  },
  async (params) => {
    const result = await sendCommand("update_screen", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// ─── Canvas Operations ────────────────────────────────────────────

server.tool(
  "align_elements",
  "Align or distribute selected elements within the current screen (or banner segment). Single element: aligns to canvas/segment bounds. 3+ elements: distribute evenly.",
  {
    ids: z.array(z.string()).describe("Element IDs to align/distribute"),
    action: z.enum(["left", "center-h", "right", "top", "center-v", "bottom", "distribute-h", "distribute-v"])
      .describe("Alignment action"),
  },
  async (params) => {
    const result = await sendCommand("align_elements", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "set_background",
  "Set the background color or gradient of the current screen",
  {
    color: z.string().describe("Background color (hex, e.g. #1a1a2e)"),
    gradient: z.object({
      type: z.enum(["linear", "radial"]).describe("Gradient type"),
      angle: z.number().describe("Angle in degrees (linear only)"),
      stops: z.array(z.object({
        offset: z.number().min(0).max(1).describe("Stop position (0-1)"),
        color: z.string().describe("Stop color (hex)"),
      })).describe("Color stops (min 2)"),
    }).optional().describe("Gradient config (omit for solid color)"),
  },
  async ({ color, gradient }) => {
    const result = await sendCommand("set_background", { color, gradient: gradient ?? undefined });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "apply_template",
  "Apply a pre-built template to the current screen. This replaces all existing elements.",
  { templateId: z.string().describe("Template ID (use get_templates to list available ones)") },
  async ({ templateId }) => {
    const result = await sendCommand("apply_template", { templateId });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "select_elements",
  "Select elements by their IDs (for visual highlighting in the editor)",
  { ids: z.array(z.string()).describe("Array of element IDs to select") },
  async ({ ids }) => {
    const result = await sendCommand("select_elements", { ids });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "set_zoom",
  "Set the canvas zoom level",
  { zoom: z.number().min(0.05).max(3).describe("Zoom level (0.05 to 3, 1 = 100%)") },
  async ({ zoom }) => {
    const result = await sendCommand("set_zoom", { zoom });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// ─── History ──────────────────────────────────────────────────────

server.tool(
  "undo",
  "Undo the last action",
  {},
  async () => {
    const result = await sendCommand("undo");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "redo",
  "Redo the previously undone action",
  {},
  async () => {
    const result = await sendCommand("redo");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// ─── Batch Operations ─────────────────────────────────────────────

server.tool(
  "batch",
  "Execute multiple commands in a single call for efficiency. Each command is an object with 'method' and 'params'.",
  {
    commands: z
      .array(
        z.object({
          method: z.string().describe("Command name (e.g. add_text, update_element, delete_element)"),
          params: z.record(z.string(), z.unknown()).optional().default({}).describe("Parameters for the command"),
        }),
      )
      .describe("Array of commands to execute sequentially"),
  },
  async ({ commands }) => {
    const results: unknown[] = [];
    for (const cmd of commands) {
      try {
        const result = await sendCommand(cmd.method, cmd.params as Record<string, unknown>);
        results.push({ method: cmd.method, ok: true, result });
      } catch (err) {
        results.push({ method: cmd.method, ok: false, error: (err as Error).message });
      }
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
  },
);

// ─── Start ────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[mcp] Mockups Builder MCP server running (stdio)\n");
}

main().catch((err) => {
  process.stderr.write(`[mcp] Fatal: ${err}\n`);
  process.exit(1);
});
