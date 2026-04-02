"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group, Transformer, Line, Star, Arrow, Ellipse, Path } from "react-konva";
import Konva from "konva";
import { useEditorStore } from "@/lib/store";
import { getDevice } from "@/lib/devices";
import { CanvasElement, DeviceFrameElement, GradientConfig, RectangleElement, TextElement, CircleElement, LineElement, StarElement, IconElement } from "@/lib/types";
import { ICON_PATHS } from "@/lib/icons";

// Track drag start position for shift-lock axis constraint
const dragState: { startX: number; startY: number; axis: "x" | "y" | null; duplicated: boolean } = {
  startX: 0,
  startY: 0,
  axis: null,
  duplicated: false,
};

function useImage(src: string | null | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) { setImage(null); return; }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);
  return image;
}

function handleDragStart(e: Konva.KonvaEventObject<DragEvent>, el: CanvasElement) {
  dragState.startX = el.x;
  dragState.startY = el.y;
  dragState.axis = null;
  dragState.duplicated = false;

  // Option/Alt + drag = duplicate
  if (e.evt.altKey) {
    const store = useEditorStore.getState();
    store.pushHistory();
    const clone: CanvasElement = {
      ...JSON.parse(JSON.stringify(el)),
      id: crypto.randomUUID(),
      name: el.name + " copy",
    };
    // Add clone at the original position (it stays behind)
    store.addElement(clone);
    dragState.duplicated = true;
  }
}

function handleDragMove(e: Konva.KonvaEventObject<DragEvent>) {
  if (!e.evt.shiftKey) {
    dragState.axis = null;
    return;
  }

  const node = e.target;
  const dx = Math.abs(node.x() - dragState.startX);
  const dy = Math.abs(node.y() - dragState.startY);

  // Lock to the axis with more movement (with a threshold to detect)
  if (dx > 5 || dy > 5) {
    if (!dragState.axis) {
      dragState.axis = dx >= dy ? "x" : "y";
    }
  }

  if (dragState.axis === "x") {
    node.y(dragState.startY);
  } else if (dragState.axis === "y") {
    node.x(dragState.startX);
  }
}

/** Combine fontWeight + fontStyle into Konva's single fontStyle prop */
function getKonvaFontStyle(fontWeight: string, fontStyle: string): string {
  const parts: string[] = [];
  if (fontWeight && fontWeight !== "normal" && fontWeight !== "400") {
    parts.push(fontWeight);
  }
  if (fontStyle === "italic") {
    parts.push("italic");
  }
  return parts.length > 0 ? parts.join(" ") : "normal";
}

/** Convert GradientConfig to Konva gradient props */
function getGradientProps(gradient: GradientConfig | undefined | null, width: number, height: number): Record<string, unknown> {
  if (!gradient || gradient.stops.length < 2) return {};
  const stops = gradient.stops.flatMap((s) => [s.offset, s.color]);

  if (gradient.type === "linear") {
    const rad = ((gradient.angle - 90) * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const len = Math.sqrt(width * width + height * height) / 2;
    return {
      fill: undefined,
      fillLinearGradientStartPoint: { x: cx - Math.cos(rad) * len, y: cy - Math.sin(rad) * len },
      fillLinearGradientEndPoint: { x: cx + Math.cos(rad) * len, y: cy + Math.sin(rad) * len },
      fillLinearGradientColorStops: stops,
    };
  }

  if (gradient.type === "radial") {
    const r = Math.max(width, height) / 2;
    return {
      fill: undefined,
      fillRadialGradientStartPoint: { x: width / 2, y: height / 2 },
      fillRadialGradientEndPoint: { x: width / 2, y: height / 2 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: r,
      fillRadialGradientColorStops: stops,
    };
  }

  return {};
}

/**
 * Auto-fit: find the largest fontSize where text fills the container
 * using word-wrap. Maximizes both width and height usage.
 */
let _measureCanvas: HTMLCanvasElement | null = null;

function textFitsAt(
  text: string,
  fontStr: string,
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  maxWidth: number,
  maxHeight: number,
  ctx: CanvasRenderingContext2D,
): boolean {
  ctx.font = `${fontStr} ${fontSize}px ${fontFamily}`;
  let totalLines = 0;

  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) { totalLines++; continue; }
    const words = paragraph.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        totalLines++;
        currentLine = word;
        // Single word wider than container → font too big
        if (ctx.measureText(word).width > maxWidth) return false;
      } else {
        currentLine = testLine;
      }
    }
    totalLines++;
  }

  return totalLines * fontSize * lineHeight <= maxHeight;
}

function calculateAutoFitFontSize(
  text: string,
  fontFamily: string,
  fontWeight: string,
  fontStyle: string,
  containerWidth: number,
  containerHeight: number,
  maxFontSize: number,
  lineHeight: number,
): number {
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas");
  const ctx = _measureCanvas.getContext("2d")!;
  const style = getKonvaFontStyle(fontWeight, fontStyle);
  const pad = 10;
  const w = containerWidth - pad * 2;
  const h = containerHeight - pad;

  // Binary search: largest fontSize that fits
  let lo = 8;
  let hi = maxFontSize;
  let best = lo;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (textFitsAt(text, style, fontFamily, mid, lineHeight, w, h, ctx)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best;
}

/** Open an inline textarea overlay for editing a Text element */
function openInlineTextEditor(
  el: TextElement,
  stageContainer: HTMLDivElement,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const screenX = offsetX + el.x * zoom;
  const screenY = offsetY + el.y * zoom;
  const style = getKonvaFontStyle(el.fontWeight, el.fontStyle);

  const textarea = document.createElement("textarea");
  textarea.value = el.text;
  Object.assign(textarea.style, {
    position: "absolute",
    left: `${screenX}px`,
    top: `${screenY}px`,
    width: `${el.width * zoom}px`,
    height: `${Math.max(el.height * zoom, 40)}px`,
    fontSize: `${(el.autoFit ? calculateAutoFitFontSize(el.text, el.fontFamily, el.fontWeight, el.fontStyle, el.width, el.height, el.fontSize, el.lineHeight) : el.fontSize) * zoom}px`,
    fontFamily: el.fontFamily,
    fontWeight: el.fontWeight,
    fontStyle: el.fontStyle.includes("italic") ? "italic" : "normal",
    color: el.fill,
    textAlign: el.align,
    lineHeight: String(el.lineHeight),
    background: "rgba(0,0,0,0.8)",
    border: "2px solid #3b82f6",
    borderRadius: "4px",
    outline: "none",
    resize: "none",
    zIndex: "9999",
    padding: "4px",
    margin: "0",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
  } as Record<string, string>);

  stageContainer.style.position = "relative";
  stageContainer.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const finish = () => {
    const store = useEditorStore.getState();
    store.pushHistory();
    store.updateElement(el.id, { text: textarea.value } as Partial<TextElement>);
    textarea.remove();
  };

  textarea.addEventListener("blur", finish);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      textarea.removeEventListener("blur", finish);
      textarea.remove();
    }
    // Shift+Enter for newline, Enter alone to confirm
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    }
    e.stopPropagation(); // prevent canvas shortcuts
  });
}

function makeDragBound(el: CanvasElement, canvasW: number, canvasH: number) {
  return (pos: Konva.Vector2d) => ({
    x: Math.max(-el.width * 0.5, Math.min(canvasW - el.width * 0.5, pos.x)),
    y: Math.max(-el.height * 0.5, Math.min(canvasH - el.height * 0.5, pos.y)),
  });
}

function getShadowProps(el: CanvasElement) {
  if (!el.shadowEnabled) return {};
  return {
    shadowColor: el.shadowColor ?? "rgba(0,0,0,0.5)",
    shadowBlur: el.shadowBlur ?? 10,
    shadowOffsetX: el.shadowOffsetX ?? 0,
    shadowOffsetY: el.shadowOffsetY ?? 4,
    shadowOpacity: el.shadowOpacity ?? 0.5,
    shadowEnabled: true,
    shadowForStrokeEnabled: false,
  };
}

function getBlurFilter(el: CanvasElement) {
  if (!el.blurEnabled || !el.blurRadius) return [];
  return [Konva.Filters.Blur];
}

function getFlipProps(el: CanvasElement): { scaleX?: number; scaleY?: number; offsetX?: number; offsetY?: number } {
  const props: { scaleX?: number; scaleY?: number; offsetX?: number; offsetY?: number } = {};
  if (el.flipX) {
    props.scaleX = -1;
    props.offsetX = el.width;
  }
  if (el.flipY) {
    props.scaleY = -1;
    props.offsetY = el.height;
  }
  return props;
}

/** Snap guide calculation */
function calculateSnapGuides(
  dragEl: CanvasElement,
  allElements: CanvasElement[],
  canvasW: number,
  canvasH: number,
  threshold: number = 5,
): { x: number[]; y: number[]; snapX?: number; snapY?: number } {
  const guides: { x: number[]; y: number[] } = { x: [], y: [] };
  let snapX: number | undefined;
  let snapY: number | undefined;

  // Target positions (edges + center)
  const dragCX = dragEl.x + dragEl.width / 2;
  const dragCY = dragEl.y + dragEl.height / 2;
  const dragR = dragEl.x + dragEl.width;
  const dragB = dragEl.y + dragEl.height;

  // Canvas center + edges
  const refPointsX = [0, canvasW / 2, canvasW];
  const refPointsY = [0, canvasH / 2, canvasH];

  // Other elements
  for (const el of allElements) {
    if (el.id === dragEl.id) continue;
    refPointsX.push(el.x, el.x + el.width / 2, el.x + el.width);
    refPointsY.push(el.y, el.y + el.height / 2, el.y + el.height);
  }

  // Check X snap
  for (const dragPoint of [dragEl.x, dragCX, dragR]) {
    for (const refPoint of refPointsX) {
      if (Math.abs(dragPoint - refPoint) < threshold) {
        guides.x.push(refPoint);
        if (snapX === undefined) snapX = refPoint - (dragPoint - dragEl.x);
      }
    }
  }

  // Check Y snap
  for (const dragPoint of [dragEl.y, dragCY, dragB]) {
    for (const refPoint of refPointsY) {
      if (Math.abs(dragPoint - refPoint) < threshold) {
        guides.y.push(refPoint);
        if (snapY === undefined) snapY = refPoint - (dragPoint - dragEl.y);
      }
    }
  }

  return { ...guides, snapX, snapY };
}

function ImageNode({ el, isSelected, onSelect, onChange, canvasW, canvasH, activeTool }: {
  el: CanvasElement & { type: "image" };
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  canvasW: number;
  canvasH: number;
  activeTool: string;
}) {
  const image = useImage(el.src);
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        image={image ?? undefined}
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rotation={el.rotation}
        opacity={el.opacity}
        draggable={!el.locked && activeTool === "select"}
        listening={activeTool === "select"}
        visible={el.visible}
        {...getShadowProps(el)}
        onClick={onSelect}
        onTap={onSelect}
        dragBoundFunc={makeDragBound(el, canvasW, canvasH)}
        onDragStart={(e) => handleDragStart(e, el)}
        onDragMove={handleDragMove}
        onDragEnd={(e) => {
          onChange({ x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
            rotation: node.rotation(),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          boundBoxFunc={(_, newBox) => ({
            ...newBox,
            width: Math.max(5, newBox.width),
            height: Math.max(5, newBox.height),
          })}
        />
      )}
    </>
  );
}

function ClippedRectNode({ el, isSelected, onSelect, onChange, canvasW, canvasH, activeTool }: {
  el: RectangleElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  canvasW: number;
  canvasH: number;
  activeTool: string;
}) {
  const clipImage = useImage(el.clipImageSrc);
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const cr = el.cornerRadius;

  return (
    <>
      <Group
        ref={groupRef}
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rotation={el.rotation}
        opacity={el.opacity}
        draggable={!el.locked && activeTool === "select"}
        listening={activeTool === "select"}
        visible={el.visible}
        onClick={onSelect}
        onTap={onSelect}
        dragBoundFunc={makeDragBound(el, canvasW, canvasH)}
        onDragStart={(e) => handleDragStart(e, el)}
        onDragMove={handleDragMove}
        onDragEnd={(e) => {
          onChange({ x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
            rotation: node.rotation(),
          });
        }}
        clipFunc={cr > 0 ? (ctx: Konva.Context) => {
          const w = el.width;
          const h = el.height;
          const r = Math.min(cr, w / 2, h / 2);
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(w - r, 0);
          ctx.arcTo(w, 0, w, r, r);
          ctx.lineTo(w, h - r);
          ctx.arcTo(w, h, w - r, h, r);
          ctx.lineTo(r, h);
          ctx.arcTo(0, h, 0, h - r, r);
          ctx.lineTo(0, r);
          ctx.arcTo(0, 0, r, 0, r);
          ctx.closePath();
        } : (ctx: Konva.Context) => {
          ctx.rect(0, 0, el.width, el.height);
        }}
      >
        <Rect
          x={0}
          y={0}
          width={el.width}
          height={el.height}
          fill={el.gradient ? undefined : el.fill}
          {...getGradientProps(el.gradient, el.width, el.height)}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
          cornerRadius={cr}
        />
        {clipImage && (
          <KonvaImage
            image={clipImage}
            x={0}
            y={0}
            width={el.width}
            height={el.height}
          />
        )}
      </Group>
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          boundBoxFunc={(_, newBox) => ({
            ...newBox,
            width: Math.max(5, newBox.width),
            height: Math.max(5, newBox.height),
          })}
        />
      )}
    </>
  );
}

/** Device frame layout calculations */
function getFrameLayout(width: number, height: number, category: string) {
  const shorter = Math.min(width, height);
  const bezel = shorter * (category === "ipad" ? 0.02 : 0.025);
  const cornerOuter = shorter * (category === "ipad" ? 0.05 : 0.11);
  const cornerInner = cornerOuter * 0.82;
  const isLandscape = width > height;

  return {
    screenX: bezel,
    screenY: bezel,
    screenW: width - bezel * 2,
    screenH: height - bezel * 2,
    cornerOuter,
    cornerInner,
    bezel,
    dynamicIsland: category === "iphone" && !isLandscape ? {
      x: width * 0.35,
      y: bezel + (height - bezel * 2) * 0.01,
      w: width * 0.3,
      h: shorter * 0.025,
      r: shorter * 0.0125,
    } : null,
  };
}

function DeviceFrameNode({ el, isSelected, onSelect, onChange, canvasW, canvasH, activeTool }: {
  el: DeviceFrameElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  canvasW: number;
  canvasH: number;
  activeTool: string;
}) {
  const screenshotImage = useImage(el.screenshotSrc);
  const device = getDevice(el.deviceId);
  const category = device?.category ?? "iphone";
  const layout = getFrameLayout(el.width, el.height, category);
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <Group
        ref={groupRef}
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rotation={el.rotation}
        opacity={el.opacity}
        draggable={!el.locked && activeTool === "select"}
        listening={activeTool === "select"}
        visible={el.visible}
        onClick={onSelect}
        onTap={onSelect}
        {...getShadowProps(el)}
        dragBoundFunc={makeDragBound(el, canvasW, canvasH)}
        onDragStart={(e) => handleDragStart(e, el)}
        onDragMove={handleDragMove}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(), y: node.y(),
            width: Math.max(50, node.width() * scaleX),
            height: Math.max(50, node.height() * scaleY),
            rotation: node.rotation(),
          });
        }}
      >
        {/* Phone body */}
        <Rect
          x={0} y={0}
          width={el.width} height={el.height}
          fill="#1a1a1a"
          cornerRadius={layout.cornerOuter}
        />
        {/* Screen area with clipping */}
        <Group
          clipFunc={(ctx: Konva.Context) => {
            const r = layout.cornerInner;
            const x = layout.screenX;
            const y = layout.screenY;
            const w = layout.screenW;
            const h = layout.screenH;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.arcTo(x + w, y, x + w, y + r, r);
            ctx.lineTo(x + w, y + h - r);
            ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
            ctx.lineTo(x + r, y + h);
            ctx.arcTo(x, y + h, x, y + h - r, r);
            ctx.lineTo(x, y + r);
            ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
          }}
        >
          {screenshotImage ? (
            <KonvaImage
              image={screenshotImage}
              x={layout.screenX} y={layout.screenY}
              width={layout.screenW} height={layout.screenH}
            />
          ) : (
            <Rect
              x={layout.screenX} y={layout.screenY}
              width={layout.screenW} height={layout.screenH}
              fill="#000000"
            />
          )}
        </Group>
        {/* Dynamic Island */}
        {layout.dynamicIsland && (
          <Rect
            x={layout.dynamicIsland.x}
            y={layout.dynamicIsland.y}
            width={layout.dynamicIsland.w}
            height={layout.dynamicIsland.h}
            fill="#000000"
            cornerRadius={layout.dynamicIsland.r}
          />
        )}
      </Group>
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          boundBoxFunc={(_, newBox) => ({
            ...newBox,
            width: Math.max(50, newBox.width),
            height: Math.max(50, newBox.height),
          })}
        />
      )}
    </>
  );
}

/* ──────── Circle Node ──────── */
function CircleNode({ el, isSelected, onSelect, onChange, canvasW, canvasH, activeTool }: {
  el: CircleElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  canvasW: number;
  canvasH: number;
  activeTool: string;
}) {
  const shapeRef = useRef<Konva.Ellipse>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const radiusX = el.width / 2;
  const radiusY = el.height / 2;

  return (
    <>
      <Ellipse
        ref={shapeRef}
        x={el.x + radiusX}
        y={el.y + radiusY}
        radiusX={radiusX}
        radiusY={radiusY}
        rotation={el.rotation}
        opacity={el.opacity}
        fill={el.gradient ? undefined : el.fill}
        {...getGradientProps(el.gradient, el.width, el.height)}
        stroke={el.stroke}
        strokeWidth={el.strokeWidth}
        draggable={!el.locked && activeTool === "select"}
        listening={activeTool === "select"}
        visible={el.visible}
        {...getShadowProps(el)}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={(e) => handleDragStart(e, el)}
        onDragMove={handleDragMove}
        onDragEnd={(e) => {
          onChange({ x: e.target.x() - radiusX, y: e.target.y() - radiusY });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          const newRadiusX = node.radiusX() * scaleX;
          const newRadiusY = node.radiusY() * scaleY;
          onChange({
            x: node.x() - newRadiusX,
            y: node.y() - newRadiusY,
            width: newRadiusX * 2,
            height: newRadiusY * 2,
            rotation: node.rotation(),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          boundBoxFunc={(_, newBox) => ({
            ...newBox,
            width: Math.max(10, newBox.width),
            height: Math.max(10, newBox.height),
          })}
        />
      )}
    </>
  );
}

/* ──────── Line / Arrow Node ──────── */
function LineNode({ el, isSelected, onSelect, onChange, canvasW, canvasH, activeTool }: {
  el: LineElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  canvasW: number;
  canvasH: number;
  activeTool: string;
}) {
  const shapeRef = useRef<Konva.Arrow | Konva.Line>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const points = [0, 0, el.width, el.height];
  const hasArrowEnd = el.lineEnd === "arrow";
  const hasArrowStart = el.lineStart === "arrow";
  const pointerLength = Math.max(10, el.strokeWidth * 3);
  const pointerWidth = Math.max(10, el.strokeWidth * 3);

  const LineComponent = (hasArrowEnd || hasArrowStart) ? Arrow : Line;

  return (
    <>
      <LineComponent
        ref={shapeRef as React.RefObject<never>}
        x={el.x}
        y={el.y}
        points={points}
        stroke={el.stroke}
        strokeWidth={el.strokeWidth}
        dash={el.dash}
        opacity={el.opacity}
        rotation={el.rotation}
        draggable={!el.locked && activeTool === "select"}
        listening={activeTool === "select"}
        visible={el.visible}
        hitStrokeWidth={Math.max(20, el.strokeWidth * 3)}
        {...getShadowProps(el)}
        {...(hasArrowEnd ? { pointerLength, pointerWidth } : {})}
        {...(hasArrowStart ? { pointerAtBeginning: true } : {})}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={(e) => handleDragStart(e, el)}
        onDragMove={handleDragMove}
        onDragEnd={(e) => {
          onChange({ x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            width: el.width * scaleX,
            height: el.height * scaleY,
            rotation: node.rotation(),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
        />
      )}
    </>
  );
}

/* ──────── Star Node ──────── */
function StarNode({ el, isSelected, onSelect, onChange, canvasW, canvasH, activeTool }: {
  el: StarElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  canvasW: number;
  canvasH: number;
  activeTool: string;
}) {
  const shapeRef = useRef<Konva.Star>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const outerRadius = Math.min(el.width, el.height) / 2;
  const innerRadius = outerRadius * (el.innerRadiusRatio || 0.4);

  return (
    <>
      <Star
        ref={shapeRef}
        x={el.x + el.width / 2}
        y={el.y + el.height / 2}
        numPoints={el.numPoints}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        fill={el.gradient ? undefined : el.fill}
        {...getGradientProps(el.gradient, el.width, el.height)}
        stroke={el.stroke}
        strokeWidth={el.strokeWidth}
        rotation={el.rotation}
        opacity={el.opacity}
        draggable={!el.locked && activeTool === "select"}
        listening={activeTool === "select"}
        visible={el.visible}
        {...getShadowProps(el)}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={(e) => handleDragStart(e, el)}
        onDragMove={handleDragMove}
        onDragEnd={(e) => {
          onChange({ x: e.target.x() - el.width / 2, y: e.target.y() - el.height / 2 });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          const size = Math.max(10, outerRadius * 2 * Math.max(scaleX, scaleY));
          onChange({
            x: node.x() - size / 2,
            y: node.y() - size / 2,
            width: size,
            height: size,
            rotation: node.rotation(),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          boundBoxFunc={(_, newBox) => ({
            ...newBox,
            width: Math.max(10, newBox.width),
            height: Math.max(10, newBox.height),
          })}
        />
      )}
    </>
  );
}

/* ──────── Icon Node (SVG path rendered as Konva.Path) ──────── */
function IconNode({ el, isSelected, onSelect, onChange, canvasW, canvasH, activeTool }: {
  el: IconElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  canvasW: number;
  canvasH: number;
  activeTool: string;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const pathData = ICON_PATHS[el.iconName] || ICON_PATHS["star"] || "";
  // Icons are 24×24 viewBox, scale to element size
  const scaleX = el.width / 24;
  const scaleY = el.height / 24;

  return (
    <>
      <Group
        ref={groupRef}
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rotation={el.rotation}
        opacity={el.opacity}
        draggable={!el.locked && activeTool === "select"}
        listening={activeTool === "select"}
        visible={el.visible}
        {...getShadowProps(el)}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={(e) => handleDragStart(e, el)}
        onDragMove={handleDragMove}
        onDragEnd={(e) => {
          onChange({ x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            width: Math.max(10, el.width * sx),
            height: Math.max(10, el.height * sy),
            rotation: node.rotation(),
          });
        }}
      >
        {/* Invisible rect for hit area */}
        <Rect x={0} y={0} width={el.width} height={el.height} fill="transparent" />
        {pathData.split("M").filter(Boolean).map((seg: string, i: number) => (
          <Path
            key={i}
            data={"M" + seg}
            fill={el.fill || undefined}
            stroke={el.stroke || undefined}
            strokeWidth={(el.strokeWidth || 2) / Math.max(scaleX, scaleY)}
            scaleX={scaleX}
            scaleY={scaleY}
            listening={false}
          />
        ))}
      </Group>
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          boundBoxFunc={(_, newBox) => ({
            ...newBox,
            width: Math.max(10, newBox.width),
            height: Math.max(10, newBox.height),
          })}
        />
      )}
    </>
  );
}

function ElementRenderer({ el, isSelected, onSelect, onChange, canvasW, canvasH, activeTool, activeLocale, onDragMoveSnap }: {
  el: CanvasElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  canvasW: number;
  canvasH: number;
  activeTool: string;
  activeLocale: string | null;
  onDragMoveSnap?: (dragEl: CanvasElement) => { snapX?: number; snapY?: number };
}) {
  const shapeRef = useRef<Konva.Shape>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const commonProps = {
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    opacity: el.opacity,
    draggable: !el.locked && activeTool === "select",
    listening: activeTool === "select",
    ...getShadowProps(el),
    ...getFlipProps(el),
    ...(getBlurFilter(el).length > 0 ? { filters: getBlurFilter(el), blurRadius: el.blurRadius || 0 } : {}),
    visible: el.visible,
    onClick: onSelect,
    onTap: onSelect,
    dragBoundFunc: makeDragBound(el, canvasW, canvasH),
    onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => handleDragStart(e, el),
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      handleDragMove(e);
      if (onDragMoveSnap) {
        const node = e.target;
        const dragEl = { ...el, x: node.x(), y: node.y() };
        const result = onDragMoveSnap(dragEl);
        if (result.snapX !== undefined) node.x(result.snapX);
        if (result.snapY !== undefined) node.y(result.snapY);
      }
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onChange({ x: e.target.x(), y: e.target.y() });
    },
    onTransformEnd: () => {
      const node = shapeRef.current;
      if (!node) return;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      onChange({
        x: node.x(),
        y: node.y(),
        width: Math.max(5, node.width() * scaleX),
        height: Math.max(5, node.height() * scaleY),
        rotation: node.rotation(),
      });
    },
  };

  const transformer = isSelected ? (
    <Transformer
      ref={trRef}
      rotateEnabled
      enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
      boundBoxFunc={(_, newBox) => ({
        ...newBox,
        width: Math.max(5, newBox.width),
        height: Math.max(5, newBox.height),
      })}
    />
  ) : null;

  if (el.type === "image") {
    return (
      <ImageNode el={el} isSelected={isSelected} onSelect={onSelect} onChange={onChange} canvasW={canvasW} canvasH={canvasH} activeTool={activeTool} />
    );
  }

  if (el.type === "text") {
    const displayText = (activeLocale && el.translations?.[activeLocale]) || el.text;
    const computedFontSize = el.autoFit
      ? calculateAutoFitFontSize(displayText, el.fontFamily, el.fontWeight, el.fontStyle, el.width, el.height, el.fontSize, el.lineHeight)
      : el.fontSize;
    return (
      <>
        <Text
          ref={shapeRef as React.RefObject<Konva.Text>}
          {...commonProps}
          text={displayText}
          fontSize={computedFontSize}
          fontFamily={el.fontFamily}
          fontStyle={getKonvaFontStyle(el.fontWeight, el.fontStyle)}
          fill={el.fill}
          stroke={el.strokeColor || undefined}
          strokeWidth={el.strokeWidth || 0}
          align={el.align}
          lineHeight={el.lineHeight}
          wrap="word"
          ellipsis={!el.autoFit}
        />
        {transformer}
      </>
    );
  }

  if (el.type === "rectangle") {
    if (el.clipImageSrc) {
      return <ClippedRectNode el={el} isSelected={isSelected} onSelect={onSelect} onChange={onChange} canvasW={canvasW} canvasH={canvasH} activeTool={activeTool} />;
    }
    return (
      <>
        <Rect
          ref={shapeRef as React.RefObject<Konva.Rect>}
          {...commonProps}
          fill={el.gradient ? undefined : el.fill}
          {...getGradientProps(el.gradient, el.width, el.height)}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
          cornerRadius={el.cornerRadius}
        />
        {transformer}
      </>
    );
  }

  if (el.type === "device-frame") {
    return (
      <DeviceFrameNode el={el} isSelected={isSelected} onSelect={onSelect} onChange={onChange} canvasW={canvasW} canvasH={canvasH} activeTool={activeTool} />
    );
  }

  if (el.type === "circle") {
    return (
      <CircleNode el={el} isSelected={isSelected} onSelect={onSelect} onChange={onChange} canvasW={canvasW} canvasH={canvasH} activeTool={activeTool} />
    );
  }

  if (el.type === "line") {
    return (
      <LineNode el={el} isSelected={isSelected} onSelect={onSelect} onChange={onChange} canvasW={canvasW} canvasH={canvasH} activeTool={activeTool} />
    );
  }

  if (el.type === "star") {
    return (
      <StarNode el={el} isSelected={isSelected} onSelect={onSelect} onChange={onChange} canvasW={canvasW} canvasH={canvasH} activeTool={activeTool} />
    );
  }

  if (el.type === "icon") {
    return (
      <IconNode el={el} isSelected={isSelected} onSelect={onSelect} onChange={onChange} canvasW={canvasW} canvasH={canvasH} activeTool={activeTool} />
    );
  }

  return null;
}

export function Canvas() {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

  // Drag-to-create state for text/rectangle/circle/line/star tools
  const [drawingRect, setDrawingRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  // Shift key tracking for multi-select
  const shiftHeldRef = useRef(false);

  // Space key tracking for panning
  const spaceHeldRef = useRef(false);

  // Clipboard for copy/paste
  const clipboardRef = useRef<CanvasElement[]>([]);

  const {
    project,
    elements,
    backgroundColor,
    backgroundGradient,
    selectedIds,
    setSelectedIds,
    updateElement,
    pushHistory,
    zoom,
    setZoom,
    panX,
    panY,
    setPan,
    activeTool,
    setActiveTool,
    addElement,
    getActiveScreen,
    activeLocale,
    snapEnabled,
    setSnapGuides,
    snapGuides,
    gridEnabled,
    gridSize,
  } = useEditorStore();

  const screen = getActiveScreen();
  const canvasW = screen?.canvasWidth ?? project?.canvasWidth ?? 1290;
  const canvasH = screen?.canvasHeight ?? project?.canvasHeight ?? 2796;

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setStageSize({ width, height });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Shift key tracking
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeldRef.current = true;
      if (e.code === "Space" && !(e.target as HTMLElement)?.matches("input, textarea")) {
        e.preventDefault();
        spaceHeldRef.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeldRef.current = false;
      if (e.code === "Space") spaceHeldRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Delete" || e.key === "Backspace") {
        const { selectedIds, removeElement } = useEditorStore.getState();
        selectedIds.forEach((id) => removeElement(id));
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          useEditorStore.getState().redo();
        } else {
          useEditorStore.getState().undo();
        }
      }
      // Copy
      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        const store = useEditorStore.getState();
        const selected = store.elements.filter((el) => store.selectedIds.includes(el.id));
        if (selected.length > 0) {
          clipboardRef.current = JSON.parse(JSON.stringify(selected));
        }
      }
      // Paste
      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        e.preventDefault();
        if (clipboardRef.current.length > 0) {
          const store = useEditorStore.getState();
          store.pushHistory();
          const newIds: string[] = [];
          for (const el of clipboardRef.current) {
            const id = crypto.randomUUID();
            store.addElement({ ...el, id, x: el.x + 40, y: el.y + 40, name: el.name });
            newIds.push(id);
          }
          store.setSelectedIds(newIds);
          clipboardRef.current = clipboardRef.current.map((el) => ({ ...el, x: el.x + 40, y: el.y + 40 }));
        }
      }
      // Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        const store = useEditorStore.getState();
        const selected = store.elements.filter((el) => store.selectedIds.includes(el.id));
        if (selected.length > 0) {
          store.pushHistory();
          const newIds: string[] = [];
          for (const el of selected) {
            const id = crypto.randomUUID();
            store.addElement({ ...el, id, x: el.x + 20, y: el.y + 20, name: el.name + " copy" });
            newIds.push(id);
          }
          store.setSelectedIds(newIds);
        }
      }
      // Select All
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        const store = useEditorStore.getState();
        store.setSelectedIds(store.elements.map((el) => el.id));
      }
      // Tool shortcuts (only without modifiers)
      if (!e.metaKey && !e.ctrlKey) {
        if (e.key === "v") useEditorStore.getState().setActiveTool("select");
        if (e.key === "h") useEditorStore.getState().setActiveTool("hand");
        if (e.key === "t") useEditorStore.getState().setActiveTool("text");
        if (e.key === "r") useEditorStore.getState().setActiveTool("rectangle");
        if (e.key === "o" || e.key === "c") useEditorStore.getState().setActiveTool("circle");
        if (e.key === "l") useEditorStore.getState().setActiveTool("line");
        if (e.key === "s") useEditorStore.getState().setActiveTool("star");
        if (e.key === "Escape") useEditorStore.getState().clearSelection();
        // Arrow key nudge (1px, 10px with shift)
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
          const store = useEditorStore.getState();
          if (store.selectedIds.length === 0) return;
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          store.pushHistory();
          for (const id of store.selectedIds) {
            const el = store.elements.find((el) => el.id === id);
            if (el) store.updateElement(id, { x: el.x + dx, y: el.y + dy });
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Wheel: pinch/ctrl+scroll = zoom, regular scroll = pan
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      if (e.evt.ctrlKey || e.evt.metaKey) {
        // Zoom (pinch gesture or ctrl+scroll)
        const scaleBy = 1.05;
        const newZoom = e.evt.deltaY < 0 ? zoom * scaleBy : zoom / scaleBy;
        setZoom(newZoom);
      } else {
        // Pan
        setPan(panX - e.evt.deltaX, panY - e.evt.deltaY);
      }
    },
    [zoom, setZoom, panX, panY, setPan]
  );

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // Clicking on empty area — deselect
    if (e.target === e.target.getStage() || e.target.attrs?.id === "canvas-bg") {
      if (activeTool === "select" || activeTool === "hand") {
        setSelectedIds([]);
      }
      // text/rectangle creation handled by mousedown/up flow
    }
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool !== "text" && activeTool !== "rectangle" && activeTool !== "circle" && activeTool !== "line" && activeTool !== "star") return;
    const isCanvas = e.target === e.target.getStage() || e.target.attrs?.id === "canvas-bg";
    if (!isCanvas) return;

    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    drawStartRef.current = { x: pos.x, y: pos.y };
    setDrawingRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!drawStartRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    const start = drawStartRef.current;
    const x = Math.min(start.x, pos.x);
    const y = Math.min(start.y, pos.y);
    const w = Math.abs(pos.x - start.x);
    const h = Math.abs(pos.y - start.y);
    setDrawingRect({ x, y, w, h });
  };

  const handleStageMouseUp = () => {
    if (!drawStartRef.current) return;
    const rect = drawingRect;
    drawStartRef.current = null;
    setDrawingRect(null);

    if (!rect) return;

    // Minimum drag threshold: if barely dragged, use a default size
    const minDrag = 10;
    const didDrag = rect.w > minDrag && rect.h > minDrag;

    const newId = crypto.randomUUID();

    if (activeTool === "text") {
      addElement({
        id: newId,
        type: "text",
        x: rect.x,
        y: rect.y,
        width: didDrag ? rect.w : 400,
        height: didDrag ? rect.h : 100,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        name: "Text",
        text: "Double-click to edit",
        fontSize: 64,
        fontFamily: "SF Pro Display",
        fontStyle: "normal",
        fontWeight: "bold",
        fill: "#ffffff",
        align: "left",
        lineHeight: 1.2,
      });
    } else if (activeTool === "rectangle") {
      addElement({
        id: newId,
        type: "rectangle",
        x: rect.x,
        y: rect.y,
        width: didDrag ? rect.w : 300,
        height: didDrag ? rect.h : 200,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        name: "Rectangle",
        fill: "#3b82f6",
        stroke: "",
        strokeWidth: 0,
        cornerRadius: 0,
      });
    } else if (activeTool === "circle") {
      const size = didDrag ? Math.max(rect.w, rect.h) : 200;
      addElement({
        id: newId,
        type: "circle",
        x: rect.x,
        y: rect.y,
        width: didDrag ? rect.w : size,
        height: didDrag ? rect.h : size,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        name: "Circle",
        fill: "#8b5cf6",
        stroke: "",
        strokeWidth: 0,
      });
    } else if (activeTool === "line") {
      addElement({
        id: newId,
        type: "line",
        x: rect.x,
        y: rect.y,
        width: didDrag ? rect.w : 300,
        height: didDrag ? rect.h : 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        name: "Line",
        stroke: "#ffffff",
        strokeWidth: 4,
        lineEnd: "none",
        lineStart: "none",
      });
    } else if (activeTool === "star") {
      const size = didDrag ? Math.max(rect.w, rect.h) : 200;
      addElement({
        id: newId,
        type: "star",
        x: rect.x,
        y: rect.y,
        width: size,
        height: size,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        name: "Star",
        fill: "#fbbf24",
        stroke: "",
        strokeWidth: 0,
        numPoints: 5,
        innerRadiusRatio: 0.4,
      });
    }

    // Switch back to select tool and select the new element
    setActiveTool("select");
    setSelectedIds([newId]);
  };

  // Offset to center the canvas + pan
  const offsetX = (stageSize.width - canvasW * zoom) / 2 + panX;
  const offsetY = (stageSize.height - canvasH * zoom) / 2 + panY;

  // Drag & drop images onto canvas
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer.files)) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        const img = new window.Image();
        img.onload = () => {
          const maxW = canvasW * 0.8;
          const scale = Math.min(1, maxW / img.width);
          addElement({
            id: crypto.randomUUID(),
            type: "image",
            x: canvasW / 2 - (img.width * scale) / 2,
            y: canvasH / 2 - (img.height * scale) / 2,
            width: img.width * scale,
            height: img.height * scale,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            name: file.name,
            src,
          });
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    }
  }, [canvasW, canvasH, addElement]);

  // Double-click on text to edit inline
  const handleStageDblClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool !== "select") return;
    const target = e.target;
    if (target === e.target.getStage() || target.attrs?.id === "canvas-bg") return;

    // Find which element was double-clicked
    const clickedEl = elements.find((el) => {
      if (el.type !== "text") return false;
      const node = stageRef.current?.findOne(`#${el.id}`) ?? stageRef.current?.findOne(`.${el.id}`);
      return node === target;
    });

    // Fallback: check if any selected text element
    const textEl = clickedEl || (selectedIds.length === 1
      ? elements.find((el) => el.id === selectedIds[0] && el.type === "text")
      : null);

    if (textEl && textEl.type === "text" && containerRef.current) {
      openInlineTextEditor(textEl as TextElement, containerRef.current, zoom, offsetX, offsetY);
    }
  }, [activeTool, elements, selectedIds, zoom, offsetX, offsetY]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden bg-muted/50"
      style={{ cursor: (activeTool === "hand" || spaceHeldRef.current) ? "grab" : (activeTool === "text" || activeTool === "rectangle" || activeTool === "circle" || activeTool === "line" || activeTool === "star") ? "crosshair" : "default" }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={zoom}
        scaleY={zoom}
        x={offsetX}
        y={offsetY}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onDblClick={handleStageDblClick}
        draggable={activeTool === "hand" || spaceHeldRef.current}
        onDragEnd={(e) => {
          // Sync pan state from Stage position after hand-tool drag
          const stage = e.target;
          if (stage === stageRef.current) {
            const newX = stage.x();
            const newY = stage.y();
            const baseX = (stageSize.width - canvasW * zoom) / 2;
            const baseY = (stageSize.height - canvasH * zoom) / 2;
            setPan(newX - baseX, newY - baseY);
          }
        }}
      >
        <Layer>
          {/* Canvas Background */}
          <Rect
            id="canvas-bg"
            x={0}
            y={0}
            width={canvasW}
            height={canvasH}
            fill={backgroundGradient ? undefined : backgroundColor}
            {...getGradientProps(backgroundGradient, canvasW, canvasH)}
            shadowColor="rgba(0,0,0,0.3)"
            shadowBlur={20}
            shadowOffsetX={0}
            shadowOffsetY={4}
          />

          {/* Elements */}
          {elements.map((el) => (
            <ElementRenderer
              key={el.id}
              el={el}
              canvasW={canvasW}
              canvasH={canvasH}
              activeTool={activeTool}
              activeLocale={activeLocale}
              isSelected={selectedIds.includes(el.id)}
              onSelect={() => {
                if (activeTool !== "select") return;
                if (shiftHeldRef.current) {
                  setSelectedIds(
                    selectedIds.includes(el.id)
                      ? selectedIds.filter((id) => id !== el.id)
                      : [...selectedIds, el.id]
                  );
                } else {
                  setSelectedIds([el.id]);
                }
              }}
              onChange={(updates) => {
                pushHistory();
                updateElement(el.id, updates);
                // Clear snap guides on drop
                if (snapEnabled && (updates.x !== undefined || updates.y !== undefined)) {
                  setSnapGuides({ x: [], y: [] });
                }
              }}
              onDragMoveSnap={snapEnabled ? (dragEl: CanvasElement) => {
                const result = calculateSnapGuides(dragEl, elements, canvasW, canvasH);
                setSnapGuides({ x: result.x, y: result.y });
                return { snapX: result.snapX, snapY: result.snapY };
              } : undefined}
            />
          ))}

          {/* Banner overlays — hidden during export */}
          {screen?.bannerSegments && screen.bannerSegments > 1 && screen.bannerBaseWidth && (
            <Group name="overlays" listening={false}>
              {(() => {
                const segW = screen.bannerBaseWidth!;
                return Array.from({ length: screen.bannerSegments! - 1 }, (_, i) => {
                  const x = (i + 1) * segW;
                  return (
                    <Group key={`seg-${i}`}>
                      <Line
                        points={[x, 0, x, canvasH]}
                        stroke="#ff4444"
                        strokeWidth={3 / zoom}
                        dash={[12 / zoom, 6 / zoom]}
                        opacity={0.6}
                      />
                      <Rect
                        x={x - 20 / zoom}
                        y={6 / zoom}
                        width={40 / zoom}
                        height={24 / zoom}
                        fill="#ff4444"
                        cornerRadius={4 / zoom}
                        opacity={0.8}
                      />
                      <Text
                        x={x - 20 / zoom}
                        y={8 / zoom}
                        width={40 / zoom}
                        height={20 / zoom}
                        text={`${i + 1}|${i + 2}`}
                        fontSize={11 / zoom}
                        fontFamily="SF Pro Display"
                        fontStyle="bold"
                        fill="#ffffff"
                        align="center"
                      />
                    </Group>
                  );
                });
              })()}
              {(() => {
                const segW = screen.bannerBaseWidth!;
                return Array.from({ length: screen.bannerSegments! }, (_, i) => (
                  <Text
                    key={`seg-label-${i}`}
                    x={i * segW + segW / 2 - 30 / zoom}
                    y={canvasH - 40 / zoom}
                    width={60 / zoom}
                    text={`#${i + 1}`}
                    fontSize={16 / zoom}
                    fontFamily="SF Pro Display"
                    fontStyle="bold"
                    fill="#ff4444"
                    opacity={0.5}
                    align="center"
                  />
                ));
              })()}
            </Group>
          )}

          {/* Grid overlay */}
          {gridEnabled && (
            <Group name="overlays" listening={false} opacity={0.15}>
              {Array.from({ length: Math.floor(canvasW / gridSize) }, (_, i) => (
                <Line
                  key={`gx-${i}`}
                  points={[(i + 1) * gridSize, 0, (i + 1) * gridSize, canvasH]}
                  stroke="#888888"
                  strokeWidth={1 / zoom}
                />
              ))}
              {Array.from({ length: Math.floor(canvasH / gridSize) }, (_, i) => (
                <Line
                  key={`gy-${i}`}
                  points={[0, (i + 1) * gridSize, canvasW, (i + 1) * gridSize]}
                  stroke="#888888"
                  strokeWidth={1 / zoom}
                />
              ))}
              {/* Canvas center guides */}
              <Line
                points={[canvasW / 2, 0, canvasW / 2, canvasH]}
                stroke="#3b82f6"
                strokeWidth={1 / zoom}
                dash={[8 / zoom, 4 / zoom]}
              />
              <Line
                points={[0, canvasH / 2, canvasW, canvasH / 2]}
                stroke="#3b82f6"
                strokeWidth={1 / zoom}
                dash={[8 / zoom, 4 / zoom]}
              />
            </Group>
          )}

          {/* Snap guide lines */}
          {snapEnabled && (snapGuides.x.length > 0 || snapGuides.y.length > 0) && (
            <Group name="overlays" listening={false}>
              {[...new Set(snapGuides.x)].map((x, i) => (
                <Line
                  key={`snap-x-${i}`}
                  points={[x, 0, x, canvasH]}
                  stroke="#f43f5e"
                  strokeWidth={1 / zoom}
                  dash={[6 / zoom, 3 / zoom]}
                />
              ))}
              {[...new Set(snapGuides.y)].map((y, i) => (
                <Line
                  key={`snap-y-${i}`}
                  points={[0, y, canvasW, y]}
                  stroke="#f43f5e"
                  strokeWidth={1 / zoom}
                  dash={[6 / zoom, 3 / zoom]}
                />
              ))}
            </Group>
          )}

          {/* Drag-to-create preview */}
          {drawingRect && drawingRect.w > 2 && drawingRect.h > 2 && (
            <Rect
              x={drawingRect.x}
              y={drawingRect.y}
              width={drawingRect.w}
              height={drawingRect.h}
              fill={activeTool === "rectangle" || activeTool === "circle" ? "rgba(59,130,246,0.3)" : activeTool === "star" ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.15)"}
              stroke={activeTool === "rectangle" || activeTool === "circle" ? "#3b82f6" : activeTool === "star" ? "#fbbf24" : "#ffffff"}
              strokeWidth={2 / zoom}
              dash={[8 / zoom, 4 / zoom]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
