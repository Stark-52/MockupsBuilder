"use client";

import { useEditorStore } from "@/lib/store";
import { CanvasElement, TextElement, RectangleElement, ImageElement, GradientConfig, GradientStop } from "@/lib/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignStartVertical,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
} from "lucide-react";

const GRADIENT_PRESETS: { name: string; gradient: GradientConfig }[] = [
  { name: "Sunset", gradient: { type: "linear", angle: 135, stops: [{ offset: 0, color: "#ff6b6b" }, { offset: 1, color: "#feca57" }] } },
  { name: "Ocean", gradient: { type: "linear", angle: 180, stops: [{ offset: 0, color: "#0652DD" }, { offset: 1, color: "#19B5FE" }] } },
  { name: "Purple", gradient: { type: "linear", angle: 135, stops: [{ offset: 0, color: "#7c3aed" }, { offset: 1, color: "#ec4899" }] } },
  { name: "Mint", gradient: { type: "linear", angle: 90, stops: [{ offset: 0, color: "#00b894" }, { offset: 1, color: "#00cec9" }] } },
  { name: "Night", gradient: { type: "linear", angle: 180, stops: [{ offset: 0, color: "#0f2027" }, { offset: 0.5, color: "#203a43" }, { offset: 1, color: "#2c5364" }] } },
  { name: "Fire", gradient: { type: "linear", angle: 45, stops: [{ offset: 0, color: "#f12711" }, { offset: 1, color: "#f5af19" }] } },
  { name: "Aurora", gradient: { type: "linear", angle: 135, stops: [{ offset: 0, color: "#0f0c29" }, { offset: 0.5, color: "#302b63" }, { offset: 1, color: "#24243e" }] } },
  { name: "Peach", gradient: { type: "linear", angle: 135, stops: [{ offset: 0, color: "#ffecd2" }, { offset: 1, color: "#fcb69f" }] } },
  { name: "Sky", gradient: { type: "radial", angle: 0, stops: [{ offset: 0, color: "#a18cd1" }, { offset: 1, color: "#fbc2eb" }] } },
  { name: "Neon", gradient: { type: "linear", angle: 90, stops: [{ offset: 0, color: "#00f260" }, { offset: 1, color: "#0575e6" }] } },
  { name: "Dark Glow", gradient: { type: "radial", angle: 0, stops: [{ offset: 0, color: "#1a1a3e" }, { offset: 0.6, color: "#0f0f23" }, { offset: 1, color: "#000000" }] } },
  { name: "Warm", gradient: { type: "linear", angle: 135, stops: [{ offset: 0, color: "#f093fb" }, { offset: 1, color: "#f5576c" }] } },
];

function gradientToCSS(g: GradientConfig): string {
  const stops = g.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(", ");
  if (g.type === "radial") return `radial-gradient(circle, ${stops})`;
  return `linear-gradient(${g.angle}deg, ${stops})`;
}

function GradientEditor({
  gradient,
  onChange,
  label,
}: {
  gradient: GradientConfig | null | undefined;
  onChange: (g: GradientConfig | null) => void;
  label: string;
}) {
  const isGradient = !!gradient;
  const g = gradient || { type: "linear" as const, angle: 135, stops: [{ offset: 0, color: "#7c3aed" }, { offset: 1, color: "#ec4899" }] };

  const updateStop = (index: number, updates: Partial<GradientStop>) => {
    const newStops = g.stops.map((s, i) => (i === index ? { ...s, ...updates } : s));
    onChange({ ...g, stops: newStops });
  };

  const addStop = () => {
    const last = g.stops[g.stops.length - 1];
    onChange({ ...g, stops: [...g.stops, { offset: 1, color: last?.color || "#ffffff" }] });
  };

  const removeStop = (index: number) => {
    if (g.stops.length <= 2) return;
    onChange({ ...g, stops: g.stops.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionHeader>{label}</SectionHeader>
        <div className="flex gap-0.5">
          <Button
            variant={!isGradient ? "secondary" : "ghost"}
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => onChange(null)}
          >
            Solid
          </Button>
          <Button
            variant={isGradient && g.type === "linear" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => onChange({ ...g, type: "linear" })}
          >
            Linear
          </Button>
          <Button
            variant={isGradient && g.type === "radial" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => onChange({ ...g, type: "radial" })}
          >
            Radial
          </Button>
        </div>
      </div>

      {isGradient && (
        <>
          {/* Preview */}
          <div
            className="h-8 rounded-md border border-border"
            style={{ background: gradientToCSS(g) }}
          />

          {/* Angle (linear only) */}
          {g.type === "linear" && (
            <PropertyRow label="Angle">
              <div className="flex items-center gap-2">
                <Slider
                  value={[g.angle]}
                  onValueChange={(v: number | readonly number[]) => {
                    const val = typeof v === "number" ? v : v[0];
                    onChange({ ...g, angle: val });
                  }}
                  min={0}
                  max={360}
                  step={1}
                  className="flex-1 py-2"
                />
                <span className="text-[10px] text-muted-foreground w-8 text-right">{g.angle}</span>
              </div>
            </PropertyRow>
          )}

          {/* Color Stops */}
          <div className="space-y-1.5">
            {g.stops.map((stop, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={stop.color}
                  onChange={(e) => updateStop(i, { color: e.target.value })}
                  className="h-6 w-6 rounded border border-border cursor-pointer shrink-0"
                />
                <Slider
                  value={[stop.offset * 100]}
                  onValueChange={(v: number | readonly number[]) => {
                    const val = typeof v === "number" ? v : v[0];
                    updateStop(i, { offset: val / 100 });
                  }}
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1 py-2"
                />
                <span className="text-[10px] text-muted-foreground w-7 text-right shrink-0">{Math.round(stop.offset * 100)}%</span>
                {g.stops.length > 2 && (
                  <button
                    className="text-[10px] text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeStop(i)}
                  >
                    x
                  </button>
                )}
              </div>
            ))}
            <Button variant="ghost" size="sm" className="h-6 text-[10px] w-full" onClick={addStop}>
              + Add Stop
            </Button>
          </div>

          {/* Presets */}
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Presets</span>
            <div className="grid grid-cols-6 gap-1">
              {GRADIENT_PRESETS.map((p) => (
                <button
                  key={p.name}
                  className="h-6 w-full rounded border border-border hover:ring-1 hover:ring-ring transition-all"
                  style={{ background: gradientToCSS(p.gradient) }}
                  title={p.name}
                  onClick={() => onChange(p.gradient)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const FONT_OPTIONS = [
  "SF Pro Display",
  "SF Pro Text",
  "SF Pro Rounded",
  "Inter",
  "DM Sans",
  "Helvetica Neue",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "system-ui",
];

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[56px_1fr] items-center gap-2">
      <Label className="text-[11px] text-muted-foreground truncate">{label}</Label>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <Input
      type="number"
      className="h-7 text-xs"
      value={Math.round(value * 100) / 100}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function AlignmentControls() {
  const { elements, selectedIds, updateElement, pushHistory, getActiveScreen, project } = useEditorStore();
  const screen = getActiveScreen();
  const canvasW = screen?.canvasWidth ?? project?.canvasWidth ?? 1290;
  const canvasH = screen?.canvasHeight ?? project?.canvasHeight ?? 2796;

  const selected = selectedIds.length === 1
    ? elements.find((el) => el.id === selectedIds[0])
    : null;

  if (!selected) return null;

  const align = (action: string) => {
    pushHistory();
    switch (action) {
      case "left":
        updateElement(selected.id, { x: 0 });
        break;
      case "center-h":
        updateElement(selected.id, { x: (canvasW - selected.width) / 2 });
        break;
      case "right":
        updateElement(selected.id, { x: canvasW - selected.width });
        break;
      case "top":
        updateElement(selected.id, { y: 0 });
        break;
      case "center-v":
        updateElement(selected.id, { y: (canvasH - selected.height) / 2 });
        break;
      case "bottom":
        updateElement(selected.id, { y: canvasH - selected.height });
        break;
    }
  };

  // Distribute: works with multiple selected elements
  const distribute = (axis: "h" | "v") => {
    const selectedEls = elements.filter((el) => selectedIds.includes(el.id));
    if (selectedEls.length < 3) return;
    pushHistory();

    if (axis === "h") {
      const sorted = [...selectedEls].sort((a, b) => a.x - b.x);
      const minX = sorted[0].x;
      const maxX = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
      const totalElWidth = sorted.reduce((sum, el) => sum + el.width, 0);
      const gap = (maxX - minX - totalElWidth) / (sorted.length - 1);
      let currentX = sorted[0].x + sorted[0].width + gap;
      for (let i = 1; i < sorted.length - 1; i++) {
        updateElement(sorted[i].id, { x: currentX });
        currentX += sorted[i].width + gap;
      }
    } else {
      const sorted = [...selectedEls].sort((a, b) => a.y - b.y);
      const minY = sorted[0].y;
      const maxY = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
      const totalElHeight = sorted.reduce((sum, el) => sum + el.height, 0);
      const gap = (maxY - minY - totalElHeight) / (sorted.length - 1);
      let currentY = sorted[0].y + sorted[0].height + gap;
      for (let i = 1; i < sorted.length - 1; i++) {
        updateElement(sorted[i].id, { y: currentY });
        currentY += sorted[i].height + gap;
      }
    }
  };

  return (
    <div className="space-y-2">
      <SectionHeader>Align</SectionHeader>
      <div className="grid grid-cols-6 gap-1">
        <Button variant="ghost" size="sm" className="h-8 w-full p-0" title="Align left" onClick={() => align("left")}>
          <AlignStartHorizontal className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-full p-0" title="Center horizontally" onClick={() => align("center-h")}>
          <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-full p-0" title="Align right" onClick={() => align("right")}>
          <AlignEndHorizontal className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-full p-0" title="Align top" onClick={() => align("top")}>
          <AlignStartVertical className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-full p-0" title="Center vertically" onClick={() => align("center-v")}>
          <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-full p-0" title="Align bottom" onClick={() => align("bottom")}>
          <AlignEndVertical className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Button variant="ghost" size="sm" className="h-8 text-[10px] gap-1" title="Distribute horizontally (3+ elements)" onClick={() => distribute("h")}>
          <AlignHorizontalSpaceBetween className="h-3.5 w-3.5" /> Distribute H
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-[10px] gap-1" title="Distribute vertically (3+ elements)" onClick={() => distribute("v")}>
          <AlignVerticalSpaceBetween className="h-3.5 w-3.5" /> Distribute V
        </Button>
      </div>
    </div>
  );
}

export function RightSidebar() {
  const { elements, selectedIds, updateElement, pushHistory, backgroundColor, setBackgroundColor, backgroundGradient, setBackgroundGradient } =
    useEditorStore();

  const selected = selectedIds.length === 1
    ? elements.find((el) => el.id === selectedIds[0])
    : null;

  const update = (updates: Partial<CanvasElement>) => {
    if (!selected) return;
    pushHistory();
    updateElement(selected.id, updates);
  };

  return (
    <div className="flex w-80 flex-col border-l border-border bg-background">
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-xs font-medium truncate">
          {selected ? `${selected.type} — ${selected.name}` : "Properties"}
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {!selected && (
            <>
              <div className="space-y-2">
                <SectionHeader>Canvas Background</SectionHeader>
                {!backgroundGradient && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={backgroundColor}
                      onChange={(e) => {
                        pushHistory();
                        setBackgroundColor(e.target.value);
                      }}
                      className="h-8 w-8 rounded border border-border cursor-pointer"
                    />
                    <Input
                      value={backgroundColor}
                      onChange={(e) => {
                        pushHistory();
                        setBackgroundColor(e.target.value);
                      }}
                      className="h-7 text-xs flex-1"
                    />
                  </div>
                )}
                <GradientEditor
                  gradient={backgroundGradient}
                  label="Fill Mode"
                  onChange={(g) => {
                    pushHistory();
                    setBackgroundGradient(g);
                  }}
                />
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Select an element to edit its properties.
              </p>
            </>
          )}

          {selected && (
            <>
              {/* Alignment */}
              <AlignmentControls />

              <Separator />

              {/* Position & Size */}
              <div className="space-y-2">
                <SectionHeader>Transform</SectionHeader>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">X</span>
                    <NumberInput value={selected.x} onChange={(v) => update({ x: v })} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">Y</span>
                    <NumberInput value={selected.y} onChange={(v) => update({ y: v })} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">W</span>
                    <NumberInput value={selected.width} onChange={(v) => update({ width: v })} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">H</span>
                    <NumberInput value={selected.height} onChange={(v) => update({ height: v })} />
                  </div>
                </div>
                <PropertyRow label="Rotation">
                  <NumberInput
                    value={selected.rotation}
                    onChange={(v) => update({ rotation: v })}
                  />
                </PropertyRow>
                <PropertyRow label="Opacity">
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[selected.opacity * 100]}
                      onValueChange={(v: number | readonly number[]) => {
                        const val = typeof v === "number" ? v : v[0];
                        update({ opacity: val / 100 });
                      }}
                      min={0}
                      max={100}
                      step={1}
                      className="flex-1 py-2"
                    />
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(selected.opacity * 100)}%</span>
                  </div>
                </PropertyRow>
              </div>

              <Separator />

              {/* Name */}
              <PropertyRow label="Name">
                <Input
                  className="h-7 text-xs"
                  value={selected.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </PropertyRow>

              <Separator />

              {/* Shadow / Effects */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <SectionHeader>Shadow</SectionHeader>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.shadowEnabled ?? false}
                      onChange={(e) => update({ shadowEnabled: e.target.checked })}
                      className="h-3 w-3 rounded border-border accent-primary"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {selected.shadowEnabled ? "On" : "Off"}
                    </span>
                  </label>
                </div>
                {selected.shadowEnabled && (
                  <>
                    <PropertyRow label="Color">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={selected.shadowColor ?? "#000000"}
                          onChange={(e) => update({ shadowColor: e.target.value })}
                          className="h-7 w-7 rounded border border-border cursor-pointer"
                        />
                        <Input
                          className="h-7 text-xs flex-1"
                          value={selected.shadowColor ?? "#000000"}
                          onChange={(e) => update({ shadowColor: e.target.value })}
                        />
                      </div>
                    </PropertyRow>
                    <PropertyRow label="Blur">
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[selected.shadowBlur ?? 10]}
                          onValueChange={(v: number | readonly number[]) => {
                            const val = typeof v === "number" ? v : v[0];
                            update({ shadowBlur: val });
                          }}
                          min={0}
                          max={100}
                          step={1}
                          className="flex-1 py-2"
                        />
                        <span className="text-[10px] text-muted-foreground w-6 text-right">{selected.shadowBlur ?? 10}</span>
                      </div>
                    </PropertyRow>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">Off X</span>
                        <NumberInput
                          value={selected.shadowOffsetX ?? 0}
                          onChange={(v) => update({ shadowOffsetX: v })}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">Off Y</span>
                        <NumberInput
                          value={selected.shadowOffsetY ?? 4}
                          onChange={(v) => update({ shadowOffsetY: v })}
                        />
                      </div>
                    </div>
                    <PropertyRow label="Opacity">
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[(selected.shadowOpacity ?? 0.5) * 100]}
                          onValueChange={(v: number | readonly number[]) => {
                            const val = typeof v === "number" ? v : v[0];
                            update({ shadowOpacity: val / 100 });
                          }}
                          min={0}
                          max={100}
                          step={1}
                          className="flex-1 py-2"
                        />
                        <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round((selected.shadowOpacity ?? 0.5) * 100)}%</span>
                      </div>
                    </PropertyRow>
                  </>
                )}
              </div>

              <Separator />

              {/* Text Properties */}
              {selected.type === "text" && (
                <div className="space-y-2">
                  <SectionHeader>Text</SectionHeader>
                  <textarea
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                    value={(selected as TextElement).text}
                    onChange={(e) => update({ text: e.target.value } as Partial<TextElement>)}
                  />
                  <PropertyRow label="Font">
                    <Select
                      value={(selected as TextElement).fontFamily}
                      onValueChange={(v: string | null) => {
                        if (v) update({ fontFamily: v } as Partial<TextElement>);
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map((f) => (
                          <SelectItem key={f} value={f}>
                            <span style={{ fontFamily: f }}>{f}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </PropertyRow>
                  <div className="grid grid-cols-2 gap-x-2">
                    <PropertyRow label="Size">
                      <NumberInput
                        value={(selected as TextElement).fontSize}
                        onChange={(v) => update({ fontSize: v } as Partial<TextElement>)}
                      />
                    </PropertyRow>
                    <PropertyRow label="Weight">
                      <Select
                        value={(selected as TextElement).fontWeight}
                        onValueChange={(v: string | null) => {
                          if (v) update({ fontWeight: v } as Partial<TextElement>);
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="bold">Bold</SelectItem>
                          <SelectItem value="100">Thin</SelectItem>
                          <SelectItem value="300">Light</SelectItem>
                          <SelectItem value="500">Medium</SelectItem>
                          <SelectItem value="600">Semibold</SelectItem>
                          <SelectItem value="800">Extrabold</SelectItem>
                          <SelectItem value="900">Black</SelectItem>
                        </SelectContent>
                      </Select>
                    </PropertyRow>
                  </div>
                  <PropertyRow label="Align">
                    <div className="flex gap-1">
                      {(["left", "center", "right"] as const).map((a) => (
                        <Button
                          key={a}
                          variant={
                            (selected as TextElement).align === a ? "secondary" : "ghost"
                          }
                          size="sm"
                          className="h-7 text-xs flex-1"
                          onClick={() => update({ align: a } as Partial<TextElement>)}
                        >
                          {a[0].toUpperCase() + a.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </PropertyRow>
                  <PropertyRow label="Color">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={(selected as TextElement).fill}
                        onChange={(e) =>
                          update({ fill: e.target.value } as Partial<TextElement>)
                        }
                        className="h-7 w-7 rounded border border-border cursor-pointer"
                      />
                      <Input
                        className="h-7 text-xs flex-1"
                        value={(selected as TextElement).fill}
                        onChange={(e) =>
                          update({ fill: e.target.value } as Partial<TextElement>)
                        }
                      />
                    </div>
                  </PropertyRow>
                  <PropertyRow label="Line H">
                    <NumberInput
                      value={(selected as TextElement).lineHeight}
                      step={0.1}
                      onChange={(v) =>
                        update({ lineHeight: v } as Partial<TextElement>)
                      }
                    />
                  </PropertyRow>
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-muted-foreground">Auto-Fit</Label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(selected as TextElement).autoFit ?? false}
                        onChange={(e) => update({ autoFit: e.target.checked } as Partial<TextElement>)}
                        className="h-3 w-3 rounded border-border accent-primary"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {(selected as TextElement).autoFit ? "On" : "Off"}
                      </span>
                    </label>
                  </div>
                  {(selected as TextElement).autoFit && (
                    <p className="text-[10px] text-muted-foreground">
                      Font shrinks to fit container width. Size above is the maximum.
                    </p>
                  )}
                </div>
              )}

              {/* Rectangle Properties */}
              {selected.type === "rectangle" && (
                <div className="space-y-2">
                  <SectionHeader>Rectangle</SectionHeader>
                  <GradientEditor
                    gradient={(selected as RectangleElement).gradient}
                    label="Fill Mode"
                    onChange={(g) => update({ gradient: g || undefined } as Partial<RectangleElement>)}
                  />
                  {!(selected as RectangleElement).gradient && (
                  <PropertyRow label="Fill">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={(selected as RectangleElement).fill || "#000000"}
                        onChange={(e) =>
                          update({ fill: e.target.value } as Partial<RectangleElement>)
                        }
                        className="h-7 w-7 rounded border border-border cursor-pointer"
                      />
                      <Input
                        className="h-7 text-xs flex-1"
                        value={(selected as RectangleElement).fill}
                        onChange={(e) =>
                          update({ fill: e.target.value } as Partial<RectangleElement>)
                        }
                      />
                    </div>
                  </PropertyRow>
                  )}
                  <PropertyRow label="Stroke">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={(selected as RectangleElement).stroke || "#000000"}
                        onChange={(e) =>
                          update({ stroke: e.target.value } as Partial<RectangleElement>)
                        }
                        className="h-7 w-7 rounded border border-border cursor-pointer"
                      />
                      <Input
                        className="h-7 text-xs flex-1"
                        value={(selected as RectangleElement).stroke}
                        onChange={(e) =>
                          update({ stroke: e.target.value } as Partial<RectangleElement>)
                        }
                      />
                    </div>
                  </PropertyRow>
                  <PropertyRow label="Stroke W">
                    <NumberInput
                      value={(selected as RectangleElement).strokeWidth}
                      onChange={(v) =>
                        update({ strokeWidth: v } as Partial<RectangleElement>)
                      }
                    />
                  </PropertyRow>
                  <PropertyRow label="Radius">
                    <NumberInput
                      value={(selected as RectangleElement).cornerRadius}
                      onChange={(v) =>
                        update({ cornerRadius: v } as Partial<RectangleElement>)
                      }
                    />
                  </PropertyRow>
                  <PropertyRow label="Clip Image">
                    <div className="flex items-center gap-1">
                      {(selected as RectangleElement).clipImageSrc ? (
                        <>
                          <span className="text-[10px] text-muted-foreground truncate flex-1">Image set</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-1.5"
                            onClick={() => update({ clipImageSrc: undefined } as Partial<RectangleElement>)}
                          >
                            Remove
                          </Button>
                        </>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs flex-1"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = "image/*";
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              update({ clipImageSrc: reader.result as string } as Partial<RectangleElement>);
                            };
                            reader.readAsDataURL(file);
                          };
                          input.click();
                        }}
                      >
                        {(selected as RectangleElement).clipImageSrc ? "Replace" : "Add Image"}
                      </Button>
                    </div>
                  </PropertyRow>
                </div>
              )}

              {/* Image Properties */}
              {selected.type === "image" && (
                <div className="space-y-2">
                  <SectionHeader>Image</SectionHeader>
                  <p className="text-xs text-muted-foreground">
                    {(selected as ImageElement).name}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          update({ src: reader.result as string } as Partial<ImageElement>);
                        };
                        reader.readAsDataURL(file);
                      };
                      input.click();
                    }}
                  >
                    Replace Image
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
