"use client";

import { useRef, useCallback } from "react";

const MAX_RECENT = 12;
const STORAGE_KEY = "mockups-builder-recent-colors";

const PRESET_COLORS = [
  "#000000", "#ffffff", "#f44336", "#e91e63", "#9c27b0", "#673ab7",
  "#3f51b5", "#2196f3", "#03a9f4", "#00bcd4", "#009688", "#4caf50",
  "#8bc34a", "#cddc39", "#ffeb3b", "#ffc107", "#ff9800", "#ff5722",
];

function getRecentColors(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentColor(color: string) {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentColors().filter((c) => c.toLowerCase() !== color.toLowerCase());
    recent.unshift(color);
    if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
  } catch {
    // ignore
  }
}

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const recentColors = getRecentColors();

  const handleChange = useCallback(
    (color: string) => {
      onChange(color);
      addRecentColor(color);
    },
    [onChange]
  );

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === "") {
              onChange(v);
            }
          }}
          onBlur={() => addRecentColor(value)}
          className="flex-1 h-8 rounded-md border border-border bg-background px-2 text-xs font-mono"
          placeholder="#000000"
        />
      </div>
      {/* Preset colors */}
      <div className="flex flex-wrap gap-1">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            className="w-4 h-4 rounded-sm border border-border/50 cursor-pointer hover:scale-125 transition-transform"
            style={{ backgroundColor: c }}
            title={c}
            onClick={() => handleChange(c)}
          />
        ))}
      </div>
      {/* Recent colors */}
      {recentColors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[9px] text-muted-foreground w-full">Recent</span>
          {recentColors.map((c, i) => (
            <button
              key={`${c}-${i}`}
              className="w-4 h-4 rounded-sm border border-border/50 cursor-pointer hover:scale-125 transition-transform"
              style={{ backgroundColor: c }}
              title={c}
              onClick={() => handleChange(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
