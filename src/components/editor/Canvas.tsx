"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group, Transformer } from "react-konva";
import Konva from "konva";
import { useEditorStore } from "@/lib/store";
import { CanvasElement, GradientConfig, RectangleElement } from "@/lib/types";

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

function ElementRenderer({ el, isSelected, onSelect, onChange, canvasW, canvasH, activeTool }: {
  el: CanvasElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  canvasW: number;
  canvasH: number;
  activeTool: string;
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
    visible: el.visible,
    onClick: onSelect,
    onTap: onSelect,
    dragBoundFunc: makeDragBound(el, canvasW, canvasH),
    onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => handleDragStart(e, el),
    onDragMove: handleDragMove,
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
    return (
      <>
        <Text
          ref={shapeRef as React.RefObject<Konva.Text>}
          {...commonProps}
          text={el.text}
          fontSize={el.fontSize}
          fontFamily={el.fontFamily}
          fontStyle={getKonvaFontStyle(el.fontWeight, el.fontStyle)}
          fill={el.fill}
          align={el.align}
          lineHeight={el.lineHeight}
          wrap="word"
          ellipsis={true}
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

  return null;
}

export function Canvas() {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

  // Drag-to-create state for text/rectangle tools
  const [drawingRect, setDrawingRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  // Shift key tracking for multi-select
  const shiftHeldRef = useRef(false);

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
    activeTool,
    setActiveTool,
    addElement,
    getActiveScreen,
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
    const down = (e: KeyboardEvent) => { if (e.key === "Shift") shiftHeldRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === "Shift") shiftHeldRef.current = false; };
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
        if (e.key === "Escape") useEditorStore.getState().clearSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Wheel zoom
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const scaleBy = 1.05;
      const newZoom = e.evt.deltaY < 0 ? zoom * scaleBy : zoom / scaleBy;
      setZoom(newZoom);
    },
    [zoom, setZoom]
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
    if (activeTool !== "text" && activeTool !== "rectangle") return;
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
    }

    // Switch back to select tool and select the new element
    setActiveTool("select");
    setSelectedIds([newId]);
  };

  // Offset to center the canvas
  const offsetX = (stageSize.width - canvasW * zoom) / 2;
  const offsetY = (stageSize.height - canvasH * zoom) / 2;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden bg-muted/50"
      style={{ cursor: activeTool === "hand" ? "grab" : activeTool === "text" || activeTool === "rectangle" ? "crosshair" : "default" }}
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
        draggable={activeTool === "hand"}
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
              }}
            />
          ))}

          {/* Drag-to-create preview */}
          {drawingRect && drawingRect.w > 2 && drawingRect.h > 2 && (
            <Rect
              x={drawingRect.x}
              y={drawingRect.y}
              width={drawingRect.w}
              height={drawingRect.h}
              fill={activeTool === "rectangle" ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.15)"}
              stroke={activeTool === "rectangle" ? "#3b82f6" : "#ffffff"}
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
