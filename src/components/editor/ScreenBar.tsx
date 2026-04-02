"use client";

import { useEditorStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Plus, Copy, Trash2 } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export function ScreenBar() {
  const {
    project,
    activeScreenIndex,
    setActiveScreenIndex,
    addScreen,
    duplicateScreen,
    removeScreen,
  } = useEditorStore();

  if (!project) return null;

  const screens = project.screens ?? [];

  const handleAddScreen = () => {
    const current = screens[activeScreenIndex];
    addScreen({
      id: crypto.randomUUID(),
      name: `Screen ${screens.length + 1}`,
      deviceTarget: current?.deviceTarget ?? "iphone-6.9",
      canvasWidth: current?.canvasWidth ?? 1320,
      canvasHeight: current?.canvasHeight ?? 2868,
      backgroundColor: current?.backgroundColor ?? "#1a1a2e",
      elements: [],
    });
  };

  return (
    <div className="flex h-20 items-center border-t border-border bg-muted/30 px-2 gap-2">
      <ScrollArea className="flex-1">
        <div className="flex items-center gap-2 py-1 px-1">
          {screens.map((screen, index) => (
            <div
              key={screen.id}
              className={`group relative flex flex-col items-center gap-1 rounded-md px-2 py-1.5 transition-colors shrink-0 cursor-pointer ${
                index === activeScreenIndex
                  ? "bg-accent ring-1 ring-accent-foreground/20"
                  : "hover:bg-muted"
              }`}
              onClick={() => setActiveScreenIndex(index)}
            >
              {/* Mini preview */}
              <div
                className="rounded-sm border border-border/50"
                style={{
                  width: 40,
                  height: screen.canvasHeight > screen.canvasWidth ? 56 : 28,
                  backgroundColor: screen.backgroundColor,
                }}
              />
              <span className="text-[10px] text-muted-foreground truncate max-w-16">
                {screen.name}
              </span>

              {/* Hover actions */}
              <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                <span
                  role="button"
                  className="rounded-full bg-background border border-border p-0.5 hover:bg-muted cursor-pointer"
                  title="Duplicate"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateScreen(index);
                  }}
                >
                  <Copy className="h-2.5 w-2.5" />
                </span>
                {screens.length > 1 && (
                  <span
                    role="button"
                    className="rounded-full bg-background border border-border p-0.5 hover:bg-destructive hover:text-destructive-foreground cursor-pointer"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeScreen(index);
                    }}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        title="Add Screen"
        onClick={handleAddScreen}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
