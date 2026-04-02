/**
 * Realistic device frame drawing engine.
 * Renders iPhone, iPad, and Mac bezels using Konva Canvas2D sceneFunc.
 */

import type { DeviceFrameColor } from "./types";

/* ─── Color Palettes ─── */

export interface FrameColorPalette {
  body: string;
  bodyGradientEnd: string;
  bezel: string;
  screenBorder: string;
  sideButton: string;
  camera: string;
  cameraRing: string;
  highlight: string;
  speakerDot: string;
}

const PALETTES: Record<DeviceFrameColor, FrameColorPalette> = {
  black: {
    body: "#2C2C2E",
    bodyGradientEnd: "#1C1C1E",
    bezel: "#0D0D0D",
    screenBorder: "#000000",
    sideButton: "#3A3A3C",
    camera: "#1C1C1E",
    cameraRing: "#48484A",
    highlight: "rgba(255,255,255,0.12)",
    speakerDot: "#2C2C2E",
  },
  silver: {
    body: "#E8E8ED",
    bodyGradientEnd: "#D1D1D6",
    bezel: "#C7C7CC",
    screenBorder: "#1C1C1E",
    sideButton: "#AEAEB2",
    camera: "#636366",
    cameraRing: "#AEAEB2",
    highlight: "rgba(255,255,255,0.45)",
    speakerDot: "#C7C7CC",
  },
};

export function getPalette(color: DeviceFrameColor = "black"): FrameColorPalette {
  return PALETTES[color] ?? PALETTES.black;
}

/* ─── Geometry Helpers ─── */

export interface FrameGeometry {
  // Outer body
  bodyX: number;
  bodyY: number;
  bodyW: number;
  bodyH: number;
  cornerOuter: number;
  // Screen area
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
  cornerInner: number;
  // Bezel thickness
  bezel: number;
  // Category
  category: "iphone" | "ipad" | "mac";
  isLandscape: boolean;
  shorter: number;
}

export function getFrameGeometry(
  width: number,
  height: number,
  category: "iphone" | "ipad" | "mac",
): FrameGeometry {
  const shorter = Math.min(width, height);
  const isLandscape = width > height;

  let bezelRatio: number;
  let cornerRatio: number;

  switch (category) {
    case "iphone":
      bezelRatio = 0.028;
      cornerRatio = 0.11;
      break;
    case "ipad":
      bezelRatio = 0.022;
      cornerRatio = 0.045;
      break;
    case "mac":
      bezelRatio = 0.018;
      cornerRatio = 0.025;
      break;
  }

  const bezel = shorter * bezelRatio;
  const cornerOuter = shorter * cornerRatio;
  const cornerInner = cornerOuter * 0.8;

  // Mac has a chin at the bottom
  const chinExtra = category === "mac" ? shorter * 0.025 : 0;

  return {
    bodyX: 0,
    bodyY: 0,
    bodyW: width,
    bodyH: height,
    cornerOuter,
    screenX: bezel,
    screenY: bezel,
    screenW: width - bezel * 2,
    screenH: height - bezel * 2 - chinExtra,
    cornerInner,
    bezel,
    category,
    isLandscape,
    shorter,
  };
}

/* ─── Rounded Rect Path Helper ─── */

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/* ─── iPhone Frame Drawing ─── */

export function drawIPhoneFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: DeviceFrameColor = "black",
) {
  const p = getPalette(color);
  const geo = getFrameGeometry(width, height, "iphone");
  const { shorter, bezel, isLandscape } = geo;

  // --- Body with gradient ---
  const bodyGrad = ctx.createLinearGradient(0, 0, 0, height);
  bodyGrad.addColorStop(0, p.body);
  bodyGrad.addColorStop(1, p.bodyGradientEnd);

  roundedRect(ctx, 0, 0, width, height, geo.cornerOuter);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // --- Subtle highlight at top edge ---
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(geo.cornerOuter + bezel, 1);
  ctx.lineTo(width - geo.cornerOuter - bezel, 1);
  ctx.strokeStyle = p.highlight;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // --- Screen border (thin dark inset) ---
  roundedRect(
    ctx,
    geo.screenX - 1,
    geo.screenY - 1,
    geo.screenW + 2,
    geo.screenH + 2,
    geo.cornerInner + 1,
  );
  ctx.strokeStyle = p.screenBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- Side buttons ---
  if (!isLandscape) {
    // Volume buttons (left side)
    const volBtnW = shorter * 0.006;
    const volBtnH = shorter * 0.04;
    const volBtnX = -volBtnW;
    const volBtnGap = shorter * 0.015;

    // Action button (left, higher up)
    const actionY = height * 0.15;
    const actionH = shorter * 0.02;
    ctx.fillStyle = p.sideButton;
    roundedRect(ctx, volBtnX, actionY, volBtnW, actionH, volBtnW / 2);
    ctx.fill();

    // Volume up
    const volUpY = height * 0.22;
    ctx.fillStyle = p.sideButton;
    roundedRect(ctx, volBtnX, volUpY, volBtnW, volBtnH, volBtnW / 2);
    ctx.fill();

    // Volume down
    const volDownY = volUpY + volBtnH + volBtnGap;
    roundedRect(ctx, volBtnX, volDownY, volBtnW, volBtnH, volBtnW / 2);
    ctx.fill();

    // Power button (right side)
    const pwrBtnX = width;
    const pwrBtnH = shorter * 0.055;
    const pwrBtnY = height * 0.22;
    roundedRect(ctx, pwrBtnX, pwrBtnY, volBtnW, pwrBtnH, volBtnW / 2);
    ctx.fill();
  } else {
    // Landscape: buttons on top/bottom
    const btnH = shorter * 0.006;
    const btnW = shorter * 0.04;

    // Action (top, left area)
    ctx.fillStyle = p.sideButton;
    roundedRect(ctx, width * 0.15, -btnH, shorter * 0.02, btnH, btnH / 2);
    ctx.fill();

    // Volume up (top)
    roundedRect(ctx, width * 0.22, -btnH, btnW, btnH, btnH / 2);
    ctx.fill();

    // Volume down (top)
    roundedRect(ctx, width * 0.22 + btnW + shorter * 0.015, -btnH, btnW, btnH, btnH / 2);
    ctx.fill();

    // Power (bottom)
    roundedRect(ctx, width * 0.22, height, shorter * 0.055, btnH, btnH / 2);
    ctx.fill();
  }

  // --- Dynamic Island ---
  if (!isLandscape) {
    const diW = width * 0.28;
    const diH = shorter * 0.024;
    const diX = (width - diW) / 2;
    const diY = bezel + geo.screenH * 0.012;
    const diR = diH / 2;

    roundedRect(ctx, diX, diY, diW, diH, diR);
    ctx.fillStyle = "#000000";
    ctx.fill();

    // Camera lens in the Dynamic Island
    const camR = diH * 0.25;
    const camX = diX + diW * 0.72;
    const camY = diY + diH / 2;
    ctx.beginPath();
    ctx.arc(camX, camY, camR, 0, Math.PI * 2);
    ctx.fillStyle = p.camera;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(camX, camY, camR + 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = p.cameraRing;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // --- Speaker grille (bottom, portrait only) ---
  if (!isLandscape) {
    const grillY = height - bezel * 0.55;
    const grillDotR = shorter * 0.002;
    const grillSpacing = shorter * 0.012;
    const grillCount = 6;
    const grillStartX = width * 0.5 - ((grillCount - 1) * grillSpacing) / 2;

    ctx.fillStyle = p.speakerDot;
    for (let i = 0; i < grillCount; i++) {
      ctx.beginPath();
      ctx.arc(grillStartX + i * grillSpacing, grillY, grillDotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* ─── iPad Frame Drawing ─── */

export function drawIPadFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: DeviceFrameColor = "black",
) {
  const p = getPalette(color);
  const geo = getFrameGeometry(width, height, "ipad");
  const { shorter, bezel, isLandscape } = geo;

  // --- Body with gradient ---
  const bodyGrad = ctx.createLinearGradient(0, 0, 0, height);
  bodyGrad.addColorStop(0, p.body);
  bodyGrad.addColorStop(1, p.bodyGradientEnd);

  roundedRect(ctx, 0, 0, width, height, geo.cornerOuter);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // --- Highlight at top ---
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(geo.cornerOuter + bezel, 1);
  ctx.lineTo(width - geo.cornerOuter - bezel, 1);
  ctx.strokeStyle = p.highlight;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // --- Screen border ---
  roundedRect(
    ctx,
    geo.screenX - 1,
    geo.screenY - 1,
    geo.screenW + 2,
    geo.screenH + 2,
    geo.cornerInner + 1,
  );
  ctx.strokeStyle = p.screenBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- Front camera ---
  const camR = shorter * 0.004;
  let camX: number, camY: number;

  if (isLandscape) {
    // Camera on the long left edge, centered vertically
    camX = bezel * 0.45;
    camY = height / 2;
  } else {
    // Camera on the top edge, centered horizontally
    camX = width / 2;
    camY = bezel * 0.45;
  }

  // Camera dot
  ctx.beginPath();
  ctx.arc(camX, camY, camR, 0, Math.PI * 2);
  ctx.fillStyle = p.camera;
  ctx.fill();

  // Camera ring
  ctx.beginPath();
  ctx.arc(camX, camY, camR + 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = p.cameraRing;
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/* ─── Mac Frame Drawing ─── */

export function drawMacFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: DeviceFrameColor = "black",
) {
  const p = getPalette(color);
  const shorter = Math.min(width, height);

  const bezel = shorter * 0.018;
  const chin = shorter * 0.035;
  const cornerOuter = shorter * 0.025;
  const cornerInner = cornerOuter * 0.7;
  const screenW = width - bezel * 2;
  const screenH = height - bezel - chin;

  // --- Body with subtle gradient ---
  const bodyGrad = ctx.createLinearGradient(0, 0, 0, height);
  bodyGrad.addColorStop(0, p.body);
  bodyGrad.addColorStop(0.92, p.body);
  bodyGrad.addColorStop(1, p.bodyGradientEnd);

  roundedRect(ctx, 0, 0, width, height, cornerOuter);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // --- Outer edge stroke (subtle depth) ---
  roundedRect(ctx, 0, 0, width, height, cornerOuter);
  ctx.strokeStyle = color === "black" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- Highlight at top edge ---
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cornerOuter + bezel, 1);
  ctx.lineTo(width - cornerOuter - bezel, 1);
  ctx.strokeStyle = p.highlight;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // --- Screen border ---
  roundedRect(
    ctx,
    bezel - 1,
    bezel - 1,
    screenW + 2,
    screenH + 2,
    cornerInner + 1,
  );
  ctx.strokeStyle = p.screenBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- Camera (top center, in bezel) ---
  const camR = shorter * 0.003;
  const camX = width / 2;
  const camY = bezel * 0.45;

  ctx.beginPath();
  ctx.arc(camX, camY, camR, 0, Math.PI * 2);
  ctx.fillStyle = p.camera;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(camX, camY, camR + 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = p.cameraRing;
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // --- Chin separator line ---
  const chinLineY = height - chin;
  ctx.beginPath();
  ctx.moveTo(bezel, chinLineY);
  ctx.lineTo(width - bezel, chinLineY);
  ctx.strokeStyle = color === "black" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // --- Chin hinge notch (small centered indent) ---
  const notchW = width * 0.12;
  const notchH = shorter * 0.003;
  const notchX = (width - notchW) / 2;
  const notchY = height - chin / 2 - notchH / 2;
  const notchR = notchH / 2;

  roundedRect(ctx, notchX, notchY, notchW, notchH, notchR);
  ctx.fillStyle = color === "black" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  ctx.fill();
}

/* ─── Unified Drawing Function ─── */

export function drawDeviceFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  category: "iphone" | "ipad" | "mac",
  color: DeviceFrameColor = "black",
) {
  ctx.save();
  switch (category) {
    case "iphone":
      drawIPhoneFrame(ctx, width, height, color);
      break;
    case "ipad":
      drawIPadFrame(ctx, width, height, color);
      break;
    case "mac":
      drawMacFrame(ctx, width, height, color);
      break;
  }
  ctx.restore();
}

/* ─── Get Screen Area (for clipping screenshots) ─── */

export interface ScreenArea {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
}

export function getScreenArea(
  elWidth: number,
  elHeight: number,
  category: "iphone" | "ipad" | "mac",
): ScreenArea {
  if (category === "mac") {
    const shorter = Math.min(elWidth, elHeight);
    const bezel = shorter * 0.018;
    const chin = shorter * 0.035;
    const cornerInner = shorter * 0.025 * 0.7;
    return {
      x: bezel,
      y: bezel,
      width: elWidth - bezel * 2,
      height: elHeight - bezel - chin,
      cornerRadius: cornerInner,
    };
  }

  const geo = getFrameGeometry(elWidth, elHeight, category);
  return {
    x: geo.screenX,
    y: geo.screenY,
    width: geo.screenW,
    height: geo.screenH,
    cornerRadius: geo.cornerInner,
  };
}
