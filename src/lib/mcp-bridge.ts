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
        "src", "deviceId", "screenshotSrc",
      ];
      for (const key of allowed) {
        if (p[key] !== undefined) updates[key] = p[key];
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
      const screen: Screen = {
        id: crypto.randomUUID(),
        name: str(p.name, "New Screen"),
        deviceTarget: deviceId,
        canvasWidth: device.width,
        canvasHeight: device.height,
        backgroundColor: str(p.backgroundColor, "#1a1a2e"),
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
  };
  if (el.type === "text") return { ...base, text: el.text, fontSize: el.fontSize, fill: el.fill };
  if (el.type === "rectangle") return { ...base, fill: el.fill, cornerRadius: el.cornerRadius };
  if (el.type === "image") return { ...base, hasImage: !!el.src };
  if (el.type === "device-frame") return { ...base, deviceId: el.deviceId };
  return base;
}
