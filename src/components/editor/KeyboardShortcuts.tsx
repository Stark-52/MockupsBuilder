"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Keyboard, X } from "lucide-react";

const shortcuts = [
  { category: "Tools", items: [
    { keys: ["V"], description: "Select" },
    { keys: ["H"], description: "Hand / Pan" },
    { keys: ["T"], description: "Text" },
    { keys: ["R"], description: "Rectangle" },
    { keys: ["O"], description: "Circle / Ellipse" },
    { keys: ["L"], description: "Line / Arrow" },
    { keys: ["S"], description: "Star" },
  ]},
  { category: "Edit", items: [
    { keys: ["⌘", "Z"], description: "Undo" },
    { keys: ["⌘", "⇧", "Z"], description: "Redo" },
    { keys: ["⌘", "C"], description: "Copy" },
    { keys: ["⌘", "V"], description: "Paste" },
    { keys: ["⌘", "D"], description: "Duplicate" },
    { keys: ["⌘", "A"], description: "Select all" },
    { keys: ["Delete"], description: "Delete element" },
    { keys: ["Backspace"], description: "Delete element" },
  ]},
  { category: "Transform", items: [
    { keys: ["↑", "↓", "←", "→"], description: "Move 1px" },
    { keys: ["⇧", "+ Arrow"], description: "Move 10px" },
  ]},
  { category: "View", items: [
    { keys: ["⌘", "+"], description: "Zoom in" },
    { keys: ["⌘", "−"], description: "Zoom out" },
    { keys: ["⌘", "0"], description: "Zoom to 100%" },
    { keys: ["Scroll"], description: "Zoom (over canvas)" },
  ]},
  { category: "Layers", items: [
    { keys: ["⌘", "]"], description: "Bring forward" },
    { keys: ["⌘", "["], description: "Send backward" },
  ]},
];

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Keyboard Shortcuts"
        onClick={() => setOpen(true)}
      >
        <Keyboard className="h-4 w-4" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="bg-background border border-border rounded-lg shadow-xl w-120 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-semibold">Keyboard Shortcuts</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              {shortcuts.map((group) => (
                <div key={group.category}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {group.category}
                  </h3>
                  <div className="space-y-1">
                    {group.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-1">
                        <span className="text-sm text-foreground">{item.description}</span>
                        <div className="flex gap-1">
                          {item.keys.map((key, k) => (
                            <kbd
                              key={k}
                              className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 text-[11px] font-medium bg-muted border border-border rounded text-muted-foreground"
                            >
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
