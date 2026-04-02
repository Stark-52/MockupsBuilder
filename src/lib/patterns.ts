/**
 * Background pattern generators.
 * Each pattern produces an SVG data URL sized to the canvas.
 * Added as Image elements so they're fully editable (move, resize, opacity).
 */

export interface BackgroundPattern {
  id: string;
  name: string;
  category: "waves" | "lines" | "dots" | "geometric";
  generate: (w: number, h: number) => string;
}

function encode(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
}

// ── Helpers ──────────────────────────────────────────────────────

function wavePath(w: number, y: number, h: number, amp: number, opacity: number): string {
  return `<path d="M0,${y} C${w * 0.167},${y - amp} ${w * 0.333},${y + amp} ${w * 0.5},${y} C${w * 0.667},${y - amp} ${w * 0.833},${y + amp} ${w},${y} L${w},${h} L0,${h} Z" fill="white" fill-opacity="${opacity}"/>`;
}

function line(x1: number, y1: number, x2: number, y2: number, sw: number, opacity: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="white" stroke-width="${sw}" stroke-opacity="${opacity}"/>`;
}

function circle(cx: number, cy: number, r: number, opacity: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" fill-opacity="${opacity}"/>`;
}

// ── Patterns ─────────────────────────────────────────────────────

export const BACKGROUND_PATTERNS: BackgroundPattern[] = [
  // ── Waves ──────────────────────────────────────────────────────
  {
    id: "waves-bottom",
    name: "Waves Bottom",
    category: "waves",
    generate: (w, h) => encode(`
      <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        ${wavePath(w, h * 0.70, h, h * 0.04, 0.08)}
        ${wavePath(w, h * 0.76, h, h * 0.035, 0.05)}
        ${wavePath(w, h * 0.82, h, h * 0.03, 0.03)}
      </svg>
    `),
  },
  {
    id: "waves-top",
    name: "Waves Top",
    category: "waves",
    generate: (w, h) => encode(`
      <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,${h * 0.30} C${w * 0.167},${h * 0.26} ${w * 0.333},${h * 0.34} ${w * 0.5},${h * 0.30} C${w * 0.667},${h * 0.26} ${w * 0.833},${h * 0.34} ${w},${h * 0.30} L${w},0 L0,0 Z" fill="white" fill-opacity="0.08"/>
        <path d="M0,${h * 0.24} C${w * 0.167},${h * 0.20} ${w * 0.333},${h * 0.28} ${w * 0.5},${h * 0.24} C${w * 0.667},${h * 0.20} ${w * 0.833},${h * 0.28} ${w},${h * 0.24} L${w},0 L0,0 Z" fill="white" fill-opacity="0.05"/>
        <path d="M0,${h * 0.18} C${w * 0.167},${h * 0.14} ${w * 0.333},${h * 0.22} ${w * 0.5},${h * 0.18} C${w * 0.667},${h * 0.14} ${w * 0.833},${h * 0.22} ${w},${h * 0.18} L${w},0 L0,0 Z" fill="white" fill-opacity="0.03"/>
      </svg>
    `),
  },
  {
    id: "waves-full",
    name: "Waves Full",
    category: "waves",
    generate: (w, h) => {
      const layers = [0.15, 0.30, 0.45, 0.60, 0.75, 0.90].map((ratio, i) => {
        const y = h * ratio;
        const amp = h * 0.03;
        const opacity = 0.03 + (i % 2) * 0.02;
        return `<path d="M0,${y} C${w * 0.25},${y - amp} ${w * 0.5},${y + amp} ${w * 0.75},${y} C${w * 0.85},${y - amp * 0.5} ${w * 0.95},${y + amp * 0.5} ${w},${y}" stroke="white" stroke-width="2" fill="none" stroke-opacity="${opacity}"/>`;
      }).join("\n");
      return encode(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${layers}</svg>`);
    },
  },
  {
    id: "flowing-curves",
    name: "Flowing Curves",
    category: "waves",
    generate: (w, h) => {
      const curves = [];
      for (let i = 0; i < 8; i++) {
        const y = h * (0.1 + i * 0.1);
        const amp = h * 0.06 * (1 + Math.sin(i * 0.7) * 0.5);
        const xOff = w * 0.1 * Math.sin(i * 1.2);
        curves.push(`<path d="M${-w * 0.1},${y} Q${w * 0.25 + xOff},${y - amp} ${w * 0.5},${y} Q${w * 0.75 - xOff},${y + amp} ${w * 1.1},${y}" stroke="white" stroke-width="1.5" fill="none" stroke-opacity="${0.04 + i * 0.005}"/>`);
      }
      return encode(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${curves.join("\n")}</svg>`);
    },
  },

  // ── Lines ──────────────────────────────────────────────────────
  {
    id: "diagonal-lines",
    name: "Diagonal Lines",
    category: "lines",
    generate: (w, h) => {
      const lines = [];
      const gap = Math.max(w, h) * 0.06;
      const total = Math.ceil((w + h) / gap);
      for (let i = 0; i < total; i++) {
        const x = -h + i * gap;
        lines.push(line(x, h, x + h, 0, 1, 0.06));
      }
      return encode(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${lines.join("\n")}</svg>`);
    },
  },
  {
    id: "cross-hatch",
    name: "Cross Hatch",
    category: "lines",
    generate: (w, h) => {
      const lines = [];
      const gap = Math.max(w, h) * 0.08;
      const total = Math.ceil((w + h) / gap);
      for (let i = 0; i < total; i++) {
        const x = -h + i * gap;
        lines.push(line(x, h, x + h, 0, 1, 0.04));
        lines.push(line(x + h, h, x, 0, 1, 0.04));
      }
      return encode(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${lines.join("\n")}</svg>`);
    },
  },
  {
    id: "horizontal-lines",
    name: "Horizontal Lines",
    category: "lines",
    generate: (w, h) => {
      const lines = [];
      const gap = h * 0.03;
      for (let y = gap; y < h; y += gap) {
        lines.push(line(0, y, w, y, 1, 0.04));
      }
      return encode(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${lines.join("\n")}</svg>`);
    },
  },
  {
    id: "vertical-lines",
    name: "Vertical Lines",
    category: "lines",
    generate: (w, h) => {
      const lines = [];
      const gap = w * 0.04;
      for (let x = gap; x < w; x += gap) {
        lines.push(line(x, 0, x, h, 1, 0.04));
      }
      return encode(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${lines.join("\n")}</svg>`);
    },
  },

  // ── Dots ───────────────────────────────────────────────────────
  {
    id: "dots-grid",
    name: "Dot Grid",
    category: "dots",
    generate: (w, h) => {
      const dots = [];
      const gap = Math.min(w, h) * 0.04;
      for (let x = gap; x < w; x += gap) {
        for (let y = gap; y < h; y += gap) {
          dots.push(circle(x, y, 3, 0.08));
        }
      }
      return encode(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${dots.join("\n")}</svg>`);
    },
  },
  {
    id: "dots-scattered",
    name: "Scattered Dots",
    category: "dots",
    generate: (w, h) => {
      const dots = [];
      // Seeded pseudo-random for consistency
      let seed = 42;
      const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 120; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const r = 2 + rand() * 6;
        dots.push(circle(x, y, r, 0.03 + rand() * 0.06));
      }
      return encode(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${dots.join("\n")}</svg>`);
    },
  },

  // ── Geometric ──────────────────────────────────────────────────
  {
    id: "concentric-circles",
    name: "Concentric Circles",
    category: "geometric",
    generate: (w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.max(w, h) * 0.6;
      const circles = [];
      const gap = maxR * 0.08;
      for (let r = gap; r <= maxR; r += gap) {
        circles.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="white" stroke-width="1" stroke-opacity="${0.04}"/>`);
      }
      return encode(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${circles.join("\n")}</svg>`);
    },
  },
  {
    id: "grid",
    name: "Grid",
    category: "geometric",
    generate: (w, h) => {
      const lines = [];
      const gapX = w * 0.04;
      const gapY = h * 0.025;
      for (let x = gapX; x < w; x += gapX) {
        lines.push(line(x, 0, x, h, 1, 0.04));
      }
      for (let y = gapY; y < h; y += gapY) {
        lines.push(line(0, y, w, y, 1, 0.04));
      }
      return encode(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${lines.join("\n")}</svg>`);
    },
  },
  {
    id: "topographic",
    name: "Topographic",
    category: "geometric",
    generate: (w, h) => {
      const paths = [];
      const cx = w * 0.4;
      const cy = h * 0.45;
      for (let i = 1; i <= 12; i++) {
        const r = i * Math.min(w, h) * 0.04;
        const wobble = r * 0.15;
        // Create slightly irregular ellipses
        const rx = r + Math.sin(i * 1.3) * wobble;
        const ry = r * 0.8 + Math.cos(i * 0.9) * wobble;
        paths.push(`<ellipse cx="${cx + Math.sin(i) * wobble}" cy="${cy + Math.cos(i) * wobble}" rx="${rx}" ry="${ry}" fill="none" stroke="white" stroke-width="1" stroke-opacity="0.05" transform="rotate(${i * 5}, ${cx}, ${cy})"/>`);
      }
      return encode(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${paths.join("\n")}</svg>`);
    },
  },
  {
    id: "diamond-grid",
    name: "Diamond Grid",
    category: "geometric",
    generate: (w, h) => {
      const lines = [];
      const gap = Math.min(w, h) * 0.06;
      const totalW = Math.ceil(w / gap) + 2;
      const totalH = Math.ceil(h / gap) + 2;
      for (let i = -totalH; i < totalW + totalH; i++) {
        const x1 = i * gap;
        lines.push(line(x1, 0, x1 - h, h, 0.5, 0.05));
        lines.push(line(x1, 0, x1 + h, h, 0.5, 0.05));
      }
      return encode(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${lines.join("\n")}</svg>`);
    },
  },
];
