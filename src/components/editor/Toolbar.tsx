"use client";

import { useEditorStore } from "@/lib/store";
import { getDevice, DEVICES } from "@/lib/devices";
import { db } from "@/lib/db";
import { exportStageToPNG, downloadBlob } from "@/lib/export";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  MousePointer2,
  Type,
  Square,
  Hand,
  ImagePlus,
  Undo2,
  Redo2,
  Download,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Konva from "konva";

interface ToolbarProps {
  onBack: () => void;
}

export function Toolbar({ onBack }: ToolbarProps) {
  const {
    project,
    elements,
    backgroundColor,
    activeTool,
    setActiveTool,
    zoom,
    setZoom,
    addElement,
    undo,
    redo,
    historyIndex,
    history,
  } = useEditorStore();

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleAddImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        const img = new window.Image();
        img.onload = () => {
          const screen = useEditorStore.getState().getActiveScreen();
          const cw = screen?.canvasWidth ?? 1290;
          const ch = screen?.canvasHeight ?? 2796;
          const maxW = cw * 0.8;
          const scale = Math.min(1, maxW / img.width);
          addElement({
            id: crypto.randomUUID(),
            type: "image",
            x: cw / 2 - (img.width * scale) / 2,
            y: ch / 2 - (img.height * scale) / 2,
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
    };
    input.click();
  };

  const handleExport = async () => {
    if (!project) return;
    const stageNode = Konva.stages[0];
    if (!stageNode) return;
    const screen = useEditorStore.getState().getActiveScreen();
    const w = screen?.canvasWidth ?? project.canvasWidth;
    const h = screen?.canvasHeight ?? project.canvasHeight;
    const blob = await exportStageToPNG(stageNode, w, h);
    downloadBlob(blob, `${project.name}.png`);
  };

  const handleSave = async () => {
    if (!project) return;
    // Sync current screen state to project
    useEditorStore.getState()._syncToProject();
    const synced = useEditorStore.getState().project;
    if (!synced) return;
    await db.projects.update(project.id, {
      screens: synced.screens,
      activeScreenIndex: synced.activeScreenIndex,
      // Keep deprecated fields in sync for backwards compat
      elements: synced.screens[synced.activeScreenIndex]?.elements ?? [],
      backgroundColor: synced.screens[synced.activeScreenIndex]?.backgroundColor ?? "#1a1a2e",
      updatedAt: Date.now(),
    });
  };

  const tools = [
    { id: "select" as const, icon: MousePointer2, label: "Select (V)" },
    { id: "hand" as const, icon: Hand, label: "Hand (H)" },
    { id: "text" as const, icon: Type, label: "Text (T)" },
    { id: "rectangle" as const, icon: Square, label: "Rectangle (R)" },
  ];

  return (
    <div className="flex h-12 items-center gap-2 border-b border-border bg-background px-3">
      <Button variant="ghost" size="icon" onClick={onBack} className="mr-1">
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <span className="mr-4 text-sm font-medium truncate max-w-40">
        {project?.name ?? "Untitled"}
      </span>

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-0.5 ml-2">
        {tools.map((tool) => (
          <Button
            key={tool.id}
            variant={activeTool === tool.id ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            title={tool.label}
            onClick={() => setActiveTool(tool.id)}
          >
            <tool.icon className="h-4 w-4" />
          </Button>
        ))}
      </div>

      <div className="h-6 w-px bg-border mx-1" />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Add Image"
        onClick={handleAddImage}
      >
        <ImagePlus className="h-4 w-4" />
      </Button>

      <div className="flex-1" />

      {/* Device selector */}
      <Select
        value={project?.screens?.[project?.activeScreenIndex ?? 0]?.deviceTarget ?? project?.deviceTarget ?? "iphone-6.9"}
        onValueChange={async (value: string | null) => {
          if (!project || !value) return;
          const device = getDevice(value);
          if (!device) return;
          const { activeScreenIndex, updateScreen } = useEditorStore.getState();
          updateScreen(activeScreenIndex, {
            deviceTarget: value,
            canvasWidth: device.width,
            canvasHeight: device.height,
          });
          // Also update top-level deprecated fields for compat
          useEditorStore.setState({
            project: {
              ...useEditorStore.getState().project!,
              deviceTarget: value,
              canvasWidth: device.width,
              canvasHeight: device.height,
            },
          });
        }}
      >
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DEVICES.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name} ({d.width}×{d.height})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="h-6 w-px bg-border mx-1" />

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setZoom(zoom - 0.05)}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs w-12 text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setZoom(zoom + 0.05)}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="h-6 w-px bg-border mx-1" />

      {/* Undo / Redo */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={!canUndo}
        title="Undo (⌘Z)"
        onClick={undo}
      >
        <Undo2 className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={!canRedo}
        title="Redo (⌘⇧Z)"
        onClick={redo}
      >
        <Redo2 className="h-4 w-4" />
      </Button>

      <div className="h-6 w-px bg-border mx-1" />

      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleSave}>
        Save
      </Button>

      <Button variant="default" size="sm" className="h-8 text-xs" title="Export at full resolution" onClick={handleExport}>
        <Download className="h-3.5 w-3.5 mr-1" />
        Export PNG
      </Button>
    </div>
  );
}
