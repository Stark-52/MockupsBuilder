"use client";

import { useEditorStore } from "@/lib/store";
import { TEMPLATES } from "@/lib/templates";
import { CanvasElement } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  ChevronUp,
  ChevronDown,
  LayoutTemplate,
  Layers,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function LeftSidebar() {
  const {
    elements,
    selectedIds,
    setSelectedIds,
    updateElement,
    removeElement,
    moveElement,
    addElement,
    setElements,
    setBackgroundColor,
    pushHistory,
  } = useEditorStore();

  const handleApplyTemplate = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    pushHistory();
    const newElements: CanvasElement[] = template.elements.map((el) => ({
      ...el,
      id: crypto.randomUUID(),
    })) as CanvasElement[];
    setElements(newElements);
    setBackgroundColor(template.backgroundColor);
  };

  return (
    <div className="flex w-64 flex-col border-r border-border bg-background">
      <Tabs defaultValue="layers" className="flex flex-col h-full">
        <TabsList className="mx-2 mt-2">
          <TabsTrigger value="layers">
            <Layers className="h-3.5 w-3.5 mr-1" />
            Layers
          </TabsTrigger>
          <TabsTrigger value="templates">
            <LayoutTemplate className="h-3.5 w-3.5 mr-1" />
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="layers" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-0.5">
              {elements.length === 0 && (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  No elements yet. Use the toolbar to add text, images, or shapes.
                </p>
              )}
              {[...elements].reverse().map((el) => (
                <div
                  key={el.id}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                    selectedIds.includes(el.id)
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSelectedIds([el.id])}
                >
                  <span className="flex-1 truncate">{el.name}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">
                    {el.type}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateElement(el.id, { visible: !el.visible });
                    }}
                  >
                    {el.visible ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateElement(el.id, { locked: !el.locked });
                    }}
                  >
                    {el.locked ? (
                      <Lock className="h-3 w-3" />
                    ) : (
                      <Unlock className="h-3 w-3" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveElement(el.id, "up");
                    }}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveElement(el.id, "down");
                    }}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeElement(el.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="templates" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-2">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className="w-full rounded-lg border border-border p-3 text-left hover:bg-muted transition-colors"
                  onClick={() => handleApplyTemplate(template.id)}
                >
                  <div
                    className="mb-2 h-20 rounded-md"
                    style={{ backgroundColor: template.backgroundColor }}
                  />
                  <p className="text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {template.description}
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
