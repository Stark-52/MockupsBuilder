"use client";

import { useState } from "react";
import { useEditorStore } from "@/lib/store";
import { getDevice, DEVICES } from "@/lib/devices";
import { db } from "@/lib/db";
import { exportStageToPNG, exportAllScreensAsZip, exportBannerSegments, exportAllLocales, downloadBlob } from "@/lib/export";
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
  FolderArchive,
  Smartphone,
  PanelLeftDashed,
  Globe,
  Plus,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
    activeLocale,
    setActiveLocale,
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

  const handleAddDeviceFrame = () => {
    const screen = useEditorStore.getState().getActiveScreen();
    const cw = screen?.canvasWidth ?? 1290;
    const ch = screen?.canvasHeight ?? 2796;
    const device = getDevice(screen?.deviceTarget ?? "iphone-6.7");
    // Frame at ~60% of canvas height, centered
    const frameH = ch * 0.6;
    const frameW = device ? frameH * (device.width / device.height) : frameH * 0.46;
    addElement({
      id: crypto.randomUUID(),
      type: "device-frame",
      x: cw / 2 - frameW / 2,
      y: ch * 0.3,
      width: frameW,
      height: frameH,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      name: "Device Frame",
      deviceId: screen?.deviceTarget ?? "iphone-6.7",
      screenshotSrc: null,
    });
  };

  const currentScreen = useEditorStore.getState().getActiveScreen();
  const isBanner = (currentScreen?.bannerSegments ?? 0) > 1;
  const bannerSegs = currentScreen?.bannerSegments ?? 1;

  const toggleBanner = () => {
    const { activeScreenIndex, updateScreen, getActiveScreen } = useEditorStore.getState();
    const screen = getActiveScreen();
    if (!screen) return;
    const device = getDevice(screen.deviceTarget);
    const baseW = device?.width ?? 1290;

    if (screen.bannerSegments && screen.bannerSegments > 1) {
      // Exit banner mode
      updateScreen(activeScreenIndex, {
        canvasWidth: baseW,
        bannerSegments: undefined,
        bannerBaseWidth: undefined,
      });
    } else {
      // Enter banner mode with 3 segments
      const segs = 3;
      updateScreen(activeScreenIndex, {
        canvasWidth: baseW * segs,
        bannerSegments: segs,
        bannerBaseWidth: baseW,
      });
    }
  };

  const setBannerSegments = (segs: number) => {
    const { activeScreenIndex, updateScreen, getActiveScreen } = useEditorStore.getState();
    const screen = getActiveScreen();
    if (!screen || !screen.bannerBaseWidth) return;
    const clamped = Math.max(2, Math.min(20, segs));
    updateScreen(activeScreenIndex, {
      canvasWidth: screen.bannerBaseWidth * clamped,
      bannerSegments: clamped,
    });
  };

  const handleExportBanner = async () => {
    if (!project || exporting) return;
    const screen = useEditorStore.getState().getActiveScreen();
    if (!screen?.bannerBaseWidth || !screen.bannerSegments) return;
    const stageNode = Konva.stages[0];
    if (!stageNode) return;
    setExporting(true);
    try {
      await exportBannerSegments(
        stageNode,
        screen.bannerBaseWidth,
        screen.canvasHeight,
        screen.bannerSegments,
        project.name,
      );
    } finally {
      setExporting(false);
    }
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

  const [exporting, setExporting] = useState(false);
  const handleExportAll = async () => {
    if (!project || exporting) return;
    const stageNode = Konva.stages[0];
    if (!stageNode) return;
    setExporting(true);
    try {
      await exportAllScreensAsZip(stageNode, project);
    } finally {
      setExporting(false);
    }
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

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Add Device Frame"
        onClick={handleAddDeviceFrame}
      >
        <Smartphone className="h-4 w-4" />
      </Button>

      <div className="h-6 w-px bg-border mx-1" />

      {/* Banner Mode */}
      <Button
        variant={isBanner ? "secondary" : "ghost"}
        size="sm"
        className="h-8 text-xs gap-1"
        title="Banner Mode — one continuous canvas, sliced at export"
        onClick={toggleBanner}
      >
        <PanelLeftDashed className="h-3.5 w-3.5" />
        Banner
      </Button>
      {isBanner && (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            className="h-7 w-12 text-xs text-center"
            value={bannerSegs}
            min={2}
            max={20}
            onChange={(e) => setBannerSegments(Number(e.target.value))}
          />
          <span className="text-[10px] text-muted-foreground">segs</span>
        </div>
      )}

      <div className="h-6 w-px bg-border mx-1" />

      {/* Locale selector */}
      <Popover>
        <PopoverTrigger
          className={`inline-flex items-center justify-center gap-1 rounded-md px-2 h-8 text-xs font-medium transition-colors ${project?.locales?.length ? "bg-secondary text-secondary-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}
          title="Manage locales"
        >
          <Globe className="h-3.5 w-3.5" />
          {activeLocale?.toUpperCase() || "Locales"}
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-2">Locales</p>
          {/* Default / base */}
          <button
            className={`w-full text-left text-xs px-2 py-1.5 rounded ${!activeLocale ? "bg-accent" : "hover:bg-muted"}`}
            onClick={() => setActiveLocale(null)}
          >
            Base (default)
          </button>
          {(project?.locales ?? []).map((loc) => (
            <div key={loc} className="flex items-center">
              <button
                className={`flex-1 text-left text-xs px-2 py-1.5 rounded ${activeLocale === loc ? "bg-accent" : "hover:bg-muted"}`}
                onClick={() => setActiveLocale(loc)}
              >
                {loc.toUpperCase()}
              </button>
              <button
                className="text-[10px] text-muted-foreground hover:text-destructive px-1"
                onClick={() => {
                  if (!project) return;
                  const newLocales = (project.locales ?? []).filter((l) => l !== loc);
                  useEditorStore.setState({ project: { ...project, locales: newLocales } });
                  if (activeLocale === loc) {
                    setActiveLocale(null);
                  }
                }}
              >
                x
              </button>
            </div>
          ))}
          <div className="mt-2 flex gap-1">
            <Input
              id="new-locale"
              className="h-7 text-xs flex-1"
              placeholder="e.g. de, fr, ar"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const val = (e.target as HTMLInputElement).value.trim().toLowerCase();
                if (!val || !project) return;
                const locales = [...(project.locales ?? [])];
                if (!locales.includes(val)) locales.push(val);
                useEditorStore.setState({ project: { ...project, locales } });
                (e.target as HTMLInputElement).value = "";
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => {
                const input = document.getElementById("new-locale") as HTMLInputElement;
                const val = input?.value.trim().toLowerCase();
                if (!val || !project) return;
                const locales = [...(project.locales ?? [])];
                if (!locales.includes(val)) locales.push(val);
                useEditorStore.setState({ project: { ...project, locales } });
                input.value = "";
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {(project?.locales?.length ?? 0) > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2 h-7 text-xs"
              disabled={exporting}
              onClick={async () => {
                if (!project || exporting) return;
                const stageNode = Konva.stages[0];
                if (!stageNode) return;
                setExporting(true);
                try { await exportAllLocales(stageNode, project); } finally { setExporting(false); }
              }}
            >
              {exporting ? "Exporting..." : "Export All Locales"}
            </Button>
          )}
        </PopoverContent>
      </Popover>

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

      {isBanner ? (
        <Button
          variant="default"
          size="sm"
          className="h-8 text-xs"
          title="Export each segment as a separate PNG in a ZIP"
          disabled={exporting}
          onClick={handleExportBanner}
        >
          <FolderArchive className="h-3.5 w-3.5 mr-1" />
          {exporting ? "Exporting..." : `Export ${bannerSegs} Segments`}
        </Button>
      ) : (
        <>
          <Button variant="default" size="sm" className="h-8 text-xs" title="Export current screen" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Export
          </Button>
          {(project?.screens?.length ?? 0) > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              title="Export all screens as ZIP"
              disabled={exporting}
              onClick={handleExportAll}
            >
              <FolderArchive className="h-3.5 w-3.5 mr-1" />
              {exporting ? "Exporting..." : "All ZIP"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
