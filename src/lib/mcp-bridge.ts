"use client";

/**
 * Browser-side MCP bridge.
 *
 * Connects to the MCP server's WebSocket, receives commands,
 * and executes them on the Zustand editor store.
 */

import { useEditorStore } from "./store";
import { DEVICES } from "./devices";
import { TEMPLATES } from "./templates";
import { BACKGROUND_PATTERNS } from "./patterns";
import { ICON_NAMES, ICON_CATEGORIES } from "./icons";
import type { CanvasElement, Screen } from "./types";

const WS_URL = `ws://localhost:${process.env.NEXT_PUBLIC_MCP_WS_PORT || 3333}`;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _connected = false;

export function isMcpConnected() {
  return _connected;
}

/** Start the MCP bridge. Call once when the editor mounts. */
export function startMcpBridge() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return; // already connected
  }
  connect();
}

/** Stop the MCP bridge. Call when the editor unmounts. */
export function stopMcpBridge() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (ws) {
    ws.close();
    ws = null;
  }
  _connected = false;
}

function connect() {
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    _connected = true;
    console.log("[mcp-bridge] Connected to MCP server");
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      handleCommand(msg);
    } catch (err) {
      console.error("[mcp-bridge] Bad message", err);
    }
  };

  ws.onclose = () => {
    _connected = false;
    scheduleReconnect();
  };

  ws.onerror = () => {
    _connected = false;
    ws?.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

function reply(id: string, result: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id, result }));
  }
}

function replyError(id: string, error: string) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id, error }));
  }
}

// ── Command Handlers ──────────────────────────────────────────────

type Params = Record<string, unknown>;

function handleCommand(msg: { id: string; method: string; params?: Params }) {
  const { id, method, params = {} } = msg;
  try {
    const result = dispatch(method, params);
    reply(id, result);
  } catch (err) {
    replyError(id, (err as Error).message);
  }
}

function dispatch(method: string, p: Params): unknown {
  const store = useEditorStore.getState();

  switch (method) {
    // ── Read ────────────────────────────────────────────────────
    case "get_state": {
      const screen = store.getActiveScreen();
      return {
        projectId: store.project?.id,
        projectName: store.project?.name,
        screenCount: store.project?.screens.length ?? 0,
        activeScreenIndex: store.activeScreenIndex,
        activeScreen: screen
          ? { id: screen.id, name: screen.name, deviceTarget: screen.deviceTarget, canvasWidth: screen.canvasWidth, canvasHeight: screen.canvasHeight, backgroundColor: screen.backgroundColor, elementCount: screen.elements.length }
          : null,
        zoom: store.zoom,
        selectedIds: store.selectedIds,
        elementCount: store.elements.length,
      };
    }

    case "list_elements":
      return store.elements.map(summarizeElement);

    case "get_element": {
      const el = store.elements.find((e) => e.id === p.id);
      if (!el) throw new Error(`Element not found: ${p.id}`);
      return el;
    }

    case "list_screens":
      return (store.project?.screens ?? []).map((s, i) => ({
        index: i,
        id: s.id,
        name: s.name,
        deviceTarget: s.deviceTarget,
        canvasWidth: s.canvasWidth,
        canvasHeight: s.canvasHeight,
        backgroundColor: s.backgroundColor,
        ...(s.backgroundGradient ? { backgroundGradient: s.backgroundGradient } : {}),
        ...(s.bannerSegments ? { bannerSegments: s.bannerSegments, bannerBaseWidth: s.bannerBaseWidth } : {}),
        elementCount: s.elements.length,
        active: i === store.activeScreenIndex,
      }));

    case "get_devices":
      return DEVICES.map((d) => ({ id: d.id, name: d.name, category: d.category, width: d.width, height: d.height }));

    case "get_templates":
      return TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, deviceTarget: t.deviceTarget, elementCount: t.elements.length }));

    case "get_patterns":
      return BACKGROUND_PATTERNS.map((p) => ({ id: p.id, name: p.name, category: p.category }));

    case "add_pattern": {
      const patternId = str(p.patternId, "");
      const pat = BACKGROUND_PATTERNS.find((bp) => bp.id === patternId);
      if (!pat) throw new Error(`Pattern not found: ${patternId}`);
      const screen = store.getActiveScreen();
      const proj = store.project;
      const cw = screen?.canvasWidth ?? proj?.canvasWidth ?? 1290;
      const ch = screen?.canvasHeight ?? proj?.canvasHeight ?? 2796;
      const src = pat.generate(cw, ch);
      const el: CanvasElement = {
        id: crypto.randomUUID(),
        type: "image",
        x: 0, y: 0,
        width: cw, height: ch,
        rotation: 0, opacity: num(p.opacity, 1),
        visible: true, locked: true,
        name: `Pattern: ${pat.name}`,
        src,
      };
      store.pushHistory();
      store.setElements([el, ...store.elements]);
      return { ok: true, id: el.id };
    }

    // ── Element Creation ────────────────────────────────────────
    case "add_text": {
      const el: CanvasElement = {
        id: crypto.randomUUID(),
        type: "text",
        x: num(p.x, 0),
        y: num(p.y, 0),
        width: num(p.width, 400),
        height: num(p.height, 100),
        rotation: num(p.rotation, 0),
        opacity: num(p.opacity, 1),
        visible: true,
        locked: false,
        name: str(p.name, "Text"),
        text: str(p.text, "Text"),
        fontSize: num(p.fontSize, 48),
        fontFamily: str(p.fontFamily, "SF Pro Display"),
        fontStyle: "normal",
        fontWeight: str(p.fontWeight, "700"),
        fill: str(p.fill, "#ffffff"),
        align: (p.align as "left" | "center" | "right") || "center",
        lineHeight: num(p.lineHeight, 1.2),
        ...(p.autoFit ? { autoFit: true } : {}),
        ...(p.strokeColor ? { strokeColor: str(p.strokeColor, "") } : {}),
        ...(p.strokeWidth !== undefined ? { strokeWidth: num(p.strokeWidth, 0) } : {}),
        ...(p.gradientFill ? { gradientFill: p.gradientFill as import("./types").GradientConfig } : {}),
        ...(p.translations ? { translations: p.translations as Record<string, string> } : {}),
      };
      store.addElement(el);
      return { ok: true, id: el.id };
    }

    case "add_rectangle": {
      const el: CanvasElement = {
        id: crypto.randomUUID(),
        type: "rectangle",
        x: num(p.x, 0),
        y: num(p.y, 0),
        width: num(p.width, 200),
        height: num(p.height, 200),
        rotation: num(p.rotation, 0),
        opacity: num(p.opacity, 1),
        visible: true,
        locked: false,
        name: str(p.name, "Rectangle"),
        fill: str(p.fill, "#333333"),
        stroke: str(p.stroke, ""),
        strokeWidth: num(p.strokeWidth, 0),
        cornerRadius: num(p.cornerRadius, 0),
        ...(p.clipImageSrc ? { clipImageSrc: str(p.clipImageSrc, "") } : {}),
        ...(p.gradient ? { gradient: p.gradient as import("./types").GradientConfig } : {}),
      };
      store.addElement(el);
      return { ok: true, id: el.id };
    }

    case "add_device_frame": {
      const deviceId = str(p.deviceId, "iphone-6.7");
      const device = DEVICES.find((d) => d.id === deviceId);
      if (!device) throw new Error(`Unknown device: ${deviceId}`);
      const frameH = num(p.height, 1600);
      const frameW = num(p.width, frameH * (device.width / device.height));
      const el: CanvasElement = {
        id: crypto.randomUUID(),
        type: "device-frame",
        x: num(p.x, 0),
        y: num(p.y, 0),
        width: frameW,
        height: frameH,
        rotation: num(p.rotation, 0),
        opacity: num(p.opacity, 1),
        visible: true,
        locked: false,
        name: str(p.name, "Device Frame"),
        deviceId,
        screenshotSrc: p.screenshotSrc ? str(p.screenshotSrc, "") : null,
        frameColor: p.frameColor === "silver" ? "silver" : "black",
        ...(p.screenshotFit ? { screenshotFit: str(p.screenshotFit, "cover") as "cover" | "contain" | "fill" } : {}),
        ...(p.skewX !== undefined ? { skewX: num(p.skewX, 0) } : {}),
        ...(p.skewY !== undefined ? { skewY: num(p.skewY, 0) } : {}),
        ...(p.perspective !== undefined ? { perspective: num(p.perspective, 0) } : {}),
      };
      store.addElement(el);
      return { ok: true, id: el.id };
    }

    case "add_image": {
      const el: CanvasElement = {
        id: crypto.randomUUID(),
        type: "image",
        x: num(p.x, 0),
        y: num(p.y, 0),
        width: num(p.width, 300),
        height: num(p.height, 300),
        rotation: num(p.rotation, 0),
        opacity: num(p.opacity, 1),
        visible: true,
        locked: false,
        name: str(p.name, "Image"),
        src: str(p.src, ""),
      };
      store.addElement(el);
      return { ok: true, id: el.id };
    }

    case "add_circle": {
      const el: CanvasElement = {
        id: crypto.randomUUID(),
        type: "circle",
        x: num(p.x, 0),
        y: num(p.y, 0),
        width: num(p.width, 200),
        height: num(p.height, 200),
        rotation: num(p.rotation, 0),
        opacity: num(p.opacity, 1),
        visible: true,
        locked: false,
        name: str(p.name, "Circle"),
        fill: str(p.fill, "#8b5cf6"),
        stroke: str(p.stroke, ""),
        strokeWidth: num(p.strokeWidth, 0),
        ...(p.gradient ? { gradient: p.gradient as import("./types").GradientConfig } : {}),
      };
      store.addElement(el);
      return { ok: true, id: el.id };
    }

    case "add_line": {
      const el: CanvasElement = {
        id: crypto.randomUUID(),
        type: "line",
        x: num(p.x, 0),
        y: num(p.y, 0),
        width: num(p.width, 300),
        height: num(p.height, 0),
        rotation: num(p.rotation, 0),
        opacity: num(p.opacity, 1),
        visible: true,
        locked: false,
        name: str(p.name, "Line"),
        stroke: str(p.stroke, "#ffffff"),
        strokeWidth: num(p.strokeWidth, 4),
        lineStart: (p.lineStart as "none" | "arrow" | "dot") || "none",
        lineEnd: (p.lineEnd as "none" | "arrow" | "dot") || "none",
        ...(p.dash ? { dash: [10, 5] } : {}),
      };
      store.addElement(el);
      return { ok: true, id: el.id };
    }

    case "add_star": {
      const size = num(p.width, 200);
      const el: CanvasElement = {
        id: crypto.randomUUID(),
        type: "star",
        x: num(p.x, 0),
        y: num(p.y, 0),
        width: size,
        height: size,
        rotation: num(p.rotation, 0),
        opacity: num(p.opacity, 1),
        visible: true,
        locked: false,
        name: str(p.name, "Star"),
        fill: str(p.fill, "#fbbf24"),
        stroke: str(p.stroke, ""),
        strokeWidth: num(p.strokeWidth, 0),
        numPoints: num(p.numPoints, 5),
        innerRadiusRatio: num(p.innerRadiusRatio, 0.4),
        ...(p.gradient ? { gradient: p.gradient as import("./types").GradientConfig } : {}),
      };
      store.addElement(el);
      return { ok: true, id: el.id };
    }

    case "add_icon": {
      const iconName = str(p.iconName, "star");
      if (!ICON_NAMES.includes(iconName)) throw new Error(`Unknown icon: ${iconName}. Use get_icons to list available icons.`);
      const el: CanvasElement = {
        id: crypto.randomUUID(),
        type: "icon",
        x: num(p.x, 0),
        y: num(p.y, 0),
        width: num(p.width, 150),
        height: num(p.height, 150),
        rotation: num(p.rotation, 0),
        opacity: num(p.opacity, 1),
        visible: true,
        locked: false,
        name: str(p.name, iconName),
        iconName,
        fill: str(p.fill, "#ffffff"),
        stroke: str(p.stroke, ""),
        strokeWidth: num(p.strokeWidth, 0),
      };
      store.addElement(el);
      return { ok: true, id: el.id };
    }

    case "get_icons":
      return { names: ICON_NAMES, categories: ICON_CATEGORIES };

    // ── Element Modification ────────────────────────────────────
    case "update_element": {
      const id = str(p.id, "");
      if (!id) throw new Error("id is required");
      const el = store.elements.find((e) => e.id === id);
      if (!el) throw new Error(`Element not found: ${id}`);
      // Extract only defined, non-id fields
      const updates: Params = {};
      const allowed = [
        "x", "y", "width", "height", "rotation", "opacity", "visible", "locked", "name",
        "shadowEnabled", "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY", "shadowOpacity",
        "text", "fontSize", "fontFamily", "fontWeight", "fontStyle", "fill", "align", "lineHeight", "autoFit",
        "stroke", "strokeWidth", "cornerRadius", "clipImageSrc", "gradient",
        "src", "deviceId", "screenshotSrc", "frameColor", "screenshotFit", "skewX", "skewY", "perspective",
        // New element types
        "lineStart", "lineEnd", "dash",
        "numPoints", "innerRadiusRatio",
        "iconName",
        // Effects
        "blurEnabled", "blurRadius", "flipX", "flipY",
        "strokeColor",
        "gradientFill", "translations",
      ];
      for (const key of allowed) {
        if (p[key] !== undefined) updates[key] = p[key];
      }
      // Handle text stroke width mapping (textStrokeWidth → strokeWidth for text elements)
      if (p.textStrokeWidth !== undefined && el.type === "text") {
        updates.strokeWidth = p.textStrokeWidth;
      }
      store.pushHistory();
      store.updateElement(id, updates as Partial<CanvasElement>);
      return { ok: true };
    }

    case "delete_element": {
      const id = str(p.id, "");
      if (!id) throw new Error("id is required");
      store.removeElement(id);
      return { ok: true };
    }

    case "delete_all_elements": {
      store.pushHistory();
      store.setElements([]);
      return { ok: true };
    }

    case "move_element_layer": {
      const id = str(p.id, "");
      const direction = str(p.direction, "up") as "up" | "down" | "top" | "bottom";
      store.moveElement(id, direction);
      return { ok: true };
    }

    case "duplicate_element": {
      const srcId = str(p.id, "");
      const el = store.elements.find((e) => e.id === srcId);
      if (!el) throw new Error(`Element not found: ${srcId}`);
      const clone: CanvasElement = {
        ...JSON.parse(JSON.stringify(el)),
        id: crypto.randomUUID(),
        x: el.x + num(p.offsetX, 20),
        y: el.y + num(p.offsetY, 20),
        name: el.name + " copy",
      };
      store.addElement(clone);
      return { ok: true, id: clone.id };
    }

    // ── Screen Operations ───────────────────────────────────────
    case "add_screen": {
      const deviceId = str(p.deviceTarget, "iphone-6.7");
      const device = DEVICES.find((d) => d.id === deviceId);
      if (!device) throw new Error(`Unknown device: ${deviceId}`);
      const bannerSegs = p.bannerSegments ? num(p.bannerSegments, 0) : 0;
      const isBanner = bannerSegs >= 2;
      const screen: Screen = {
        id: crypto.randomUUID(),
        name: str(p.name, "New Screen"),
        deviceTarget: deviceId,
        canvasWidth: isBanner ? device.width * bannerSegs : device.width,
        canvasHeight: device.height,
        backgroundColor: str(p.backgroundColor, "#1a1a2e"),
        ...(p.backgroundGradient ? { backgroundGradient: p.backgroundGradient as import("./types").GradientConfig } : {}),
        ...(isBanner ? { bannerSegments: bannerSegs, bannerBaseWidth: device.width } : {}),
        elements: [],
      };
      store.addScreen(screen);
      return { ok: true, screenId: screen.id, index: (store.project?.screens.length ?? 1) - 1 };
    }

    case "switch_screen": {
      const index = num(p.index, 0);
      store.setActiveScreenIndex(index);
      return { ok: true, activeScreenIndex: index };
    }

    case "duplicate_screen": {
      const index = p.index !== undefined ? num(p.index, 0) : store.activeScreenIndex;
      store.duplicateScreen(index);
      return { ok: true };
    }

    case "remove_screen": {
      const index = num(p.index, 0);
      store.removeScreen(index);
      return { ok: true };
    }

    case "update_screen": {
      const index = p.index !== undefined ? num(p.index, 0) : store.activeScreenIndex;
      const updates: Partial<Screen> = {};
      if (p.name !== undefined) updates.name = str(p.name, "");
      if (p.backgroundColor !== undefined) {
        updates.backgroundColor = str(p.backgroundColor, "#1a1a2e");
        if (index === store.activeScreenIndex) {
          store.setBackgroundColor(updates.backgroundColor);
        }
      }
      if (p.backgroundGradient !== undefined) {
        if (p.backgroundGradient === null) {
          updates.backgroundGradient = undefined;
          if (index === store.activeScreenIndex) {
            store.setBackgroundGradient(null);
          }
        } else {
          updates.backgroundGradient = p.backgroundGradient as import("./types").GradientConfig;
          if (index === store.activeScreenIndex) {
            store.setBackgroundGradient(updates.backgroundGradient);
          }
        }
      }
      if (p.bannerSegments !== undefined) {
        const segs = num(p.bannerSegments, 1);
        const screen = store.project?.screens[index];
        if (screen) {
          const device = DEVICES.find((d) => d.id === screen.deviceTarget);
          const baseW = screen.bannerBaseWidth ?? device?.width ?? screen.canvasWidth;
          if (segs >= 2) {
            updates.bannerSegments = segs;
            updates.bannerBaseWidth = baseW;
            updates.canvasWidth = baseW * segs;
          } else {
            updates.bannerSegments = undefined;
            updates.bannerBaseWidth = undefined;
            updates.canvasWidth = baseW;
          }
        }
      }
      store.updateScreen(index, updates);
      return { ok: true };
    }

    // ── Canvas ──────────────────────────────────────────────────
    case "set_background": {
      const color = str(p.color, "#1a1a2e");
      store.pushHistory();
      store.setBackgroundColor(color);
      if (p.gradient) {
        store.setBackgroundGradient(p.gradient as import("./types").GradientConfig);
      } else if (p.gradient === null) {
        store.setBackgroundGradient(null);
      }
      return { ok: true };
    }

    case "apply_template": {
      const tpl = TEMPLATES.find((t) => t.id === str(p.templateId, ""));
      if (!tpl) throw new Error(`Template not found: ${p.templateId}`);
      store.pushHistory();
      const elements = tpl.elements.map((e) => ({
        ...e,
        id: crypto.randomUUID(),
      })) as CanvasElement[];
      store.setElements(elements);
      store.setBackgroundColor(tpl.backgroundColor);
      store.setBackgroundGradient(tpl.backgroundGradient || null);
      return { ok: true, elementCount: elements.length };
    }

    case "select_elements": {
      const ids = (p.ids as string[]) || [];
      store.setSelectedIds(ids);
      return { ok: true };
    }

    case "set_zoom": {
      const zoom = num(p.zoom, 1);
      store.setZoom(zoom);
      return { ok: true, zoom: store.zoom };
    }

    // ── History ─────────────────────────────────────────────────
    case "undo":
      store.undo();
      return { ok: true };

    case "redo":
      store.redo();
      return { ok: true };

    // ── Alignment ───────────────────────────────────────────────
    case "align_elements": {
      const ids = (p.ids as string[]) || [];
      const action = str(p.action, "center-h");
      const screen = store.getActiveScreen();
      const proj = store.project;
      const canvasW = screen?.canvasWidth ?? proj?.canvasWidth ?? 1290;
      const canvasH = screen?.canvasHeight ?? proj?.canvasHeight ?? 2796;
      const selectedEls = store.elements.filter((e) => ids.includes(e.id));
      if (selectedEls.length === 0) throw new Error("No matching elements found");

      // Segment detection for banner mode
      const getSegBounds = (el: { x: number; width: number }) => {
        if (screen?.bannerSegments && screen.bannerSegments > 1 && screen.bannerBaseWidth) {
          const segW = screen.bannerBaseWidth;
          const centerX = el.x + el.width / 2;
          const segIndex = Math.max(0, Math.min(screen.bannerSegments - 1, Math.floor(centerX / segW)));
          return { left: segIndex * segW, right: (segIndex + 1) * segW };
        }
        return { left: 0, right: canvasW };
      };

      store.pushHistory();

      if (action === "distribute-h" || action === "distribute-v") {
        if (selectedEls.length < 3) throw new Error("Distribute requires 3+ elements");
        if (action === "distribute-h") {
          const sorted = [...selectedEls].sort((a, b) => a.x - b.x);
          const minX = sorted[0].x;
          const maxX = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
          const totalW = sorted.reduce((s, e) => s + e.width, 0);
          const gap = (maxX - minX - totalW) / (sorted.length - 1);
          let cx = sorted[0].x + sorted[0].width + gap;
          for (let i = 1; i < sorted.length - 1; i++) {
            store.updateElement(sorted[i].id, { x: cx });
            cx += sorted[i].width + gap;
          }
        } else {
          const sorted = [...selectedEls].sort((a, b) => a.y - b.y);
          const minY = sorted[0].y;
          const maxY = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
          const totalH = sorted.reduce((s, e) => s + e.height, 0);
          const gap = (maxY - minY - totalH) / (sorted.length - 1);
          let cy = sorted[0].y + sorted[0].height + gap;
          for (let i = 1; i < sorted.length - 1; i++) {
            store.updateElement(sorted[i].id, { y: cy });
            cy += sorted[i].height + gap;
          }
        }
      } else {
        // Single-element alignment (or align all to bounds)
        for (const el of selectedEls) {
          const seg = getSegBounds(el);
          switch (action) {
            case "left":
              store.updateElement(el.id, { x: seg.left });
              break;
            case "center-h":
              store.updateElement(el.id, { x: seg.left + ((seg.right - seg.left) - el.width) / 2 });
              break;
            case "right":
              store.updateElement(el.id, { x: seg.right - el.width });
              break;
            case "top":
              store.updateElement(el.id, { y: 0 });
              break;
            case "center-v":
              store.updateElement(el.id, { y: (canvasH - el.height) / 2 });
              break;
            case "bottom":
              store.updateElement(el.id, { y: canvasH - el.height });
              break;
          }
        }
      }
      return { ok: true };
    }

    default:
      throw new Error(`Unknown command: ${method}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function num(val: unknown, def: number): number {
  return typeof val === "number" ? val : def;
}

function str(val: unknown, def: string): string {
  return typeof val === "string" ? val : def;
}

function summarizeElement(el: CanvasElement) {
  const base = {
    id: el.id,
    type: el.type,
    name: el.name,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    visible: el.visible,
    locked: el.locked,
    ...(el.blurEnabled ? { blurEnabled: true, blurRadius: el.blurRadius } : {}),
    ...(el.flipX ? { flipX: true } : {}),
    ...(el.flipY ? { flipY: true } : {}),
  };
  if (el.type === "text") return { ...base, text: el.text, fontSize: el.fontSize, fill: el.fill, ...(el.strokeColor ? { strokeColor: el.strokeColor } : {}), ...(el.gradientFill ? { gradientFill: el.gradientFill } : {}), ...(el.translations ? { locales: Object.keys(el.translations) } : {}) };
  if (el.type === "rectangle") return { ...base, fill: el.fill, cornerRadius: el.cornerRadius };
  if (el.type === "image") return { ...base, hasImage: !!el.src };
  if (el.type === "device-frame") return { ...base, deviceId: el.deviceId, frameColor: el.frameColor ?? "black", screenshotFit: el.screenshotFit ?? "cover", skewX: el.skewX ?? 0, skewY: el.skewY ?? 0, perspective: el.perspective ?? 0 };
  if (el.type === "circle") return { ...base, fill: el.fill };
  if (el.type === "line") return { ...base, stroke: el.stroke, lineStart: el.lineStart, lineEnd: el.lineEnd };
  if (el.type === "star") return { ...base, fill: el.fill, numPoints: el.numPoints, innerRadiusRatio: el.innerRadiusRatio };
  if (el.type === "icon") return { ...base, iconName: el.iconName, fill: el.fill };
  return base;
}
