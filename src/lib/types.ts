export type ElementType = "text" | "image" | "rectangle" | "device-frame" | "circle" | "line" | "star" | "icon";

export interface GradientStop {
  offset: number;
  color: string;
}

export interface GradientConfig {
  type: "linear" | "radial";
  angle: number;
  stops: GradientStop[];
}

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  name: string;
  // Shadow
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  // Blur
  blurEnabled?: boolean;
  blurRadius?: number;
  // Flip
  flipX?: boolean;
  flipY?: boolean;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  fontWeight: string;
  fill: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  autoFit?: boolean;
  /** Text stroke/outline */
  strokeColor?: string;
  strokeWidth?: number;
  /** Gradient fill for text */
  gradientFill?: GradientConfig;
  /** Translations keyed by locale code. Fallback: `text` field. */
  translations?: Record<string, string>;
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string; // data URL or blob URL
}

export interface RectangleElement extends BaseElement {
  type: "rectangle";
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  clipImageSrc?: string;
  gradient?: GradientConfig;
}

export interface DeviceFrameElement extends BaseElement {
  type: "device-frame";
  deviceId: string;
  screenshotSrc: string | null;
}

export interface CircleElement extends BaseElement {
  type: "circle";
  fill: string;
  stroke: string;
  strokeWidth: number;
  gradient?: GradientConfig;
}

export interface LineElement extends BaseElement {
  type: "line";
  stroke: string;
  strokeWidth: number;
  /** Line end style */
  lineEnd: "none" | "arrow" | "dot";
  /** Line start style */
  lineStart: "none" | "arrow" | "dot";
  /** Dashed line */
  dash?: number[];
}

export interface StarElement extends BaseElement {
  type: "star";
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** Number of outer points */
  numPoints: number;
  /** Inner radius ratio (0–1, relative to outer radius) */
  innerRadiusRatio: number;
  gradient?: GradientConfig;
}

export interface IconElement extends BaseElement {
  type: "icon";
  /** SVG path data or lucide icon name */
  iconName: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export type CanvasElement =
  | TextElement
  | ImageElement
  | RectangleElement
  | DeviceFrameElement
  | CircleElement
  | LineElement
  | StarElement
  | IconElement;

export interface Screen {
  id: string;
  name: string;
  deviceTarget: string;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundGradient?: GradientConfig;
  elements: CanvasElement[];
  /** Banner mode: number of segments (>1 = banner, canvas width = device width × segments) */
  bannerSegments?: number;
  /** Base device width for one segment (set when entering banner mode) */
  bannerBaseWidth?: number;
}

export interface Project {
  id: string;
  name: string;
  /** @deprecated use screens[].deviceTarget */
  deviceTarget: string;
  /** @deprecated use screens[].canvasWidth */
  canvasWidth: number;
  /** @deprecated use screens[].canvasHeight */
  canvasHeight: number;
  /** @deprecated use screens[].backgroundColor */
  backgroundColor: string;
  /** @deprecated use screens[].elements */
  elements: CanvasElement[];
  screens: Screen[];
  activeScreenIndex: number;
  /** Available locales (e.g. ["en", "de", "fr", "ar"]) */
  locales?: string[];
  activeLocale?: string;
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeviceConfig {
  id: string;
  name: string;
  category: "iphone" | "ipad" | "mac";
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
}

export type CanvasElementWithoutId =
  | Omit<TextElement, "id">
  | Omit<ImageElement, "id">
  | Omit<RectangleElement, "id">
  | Omit<DeviceFrameElement, "id">
  | Omit<CircleElement, "id">
  | Omit<LineElement, "id">
  | Omit<StarElement, "id">
  | Omit<IconElement, "id">;

export type ExportFormat = "png" | "jpeg";

export interface ExportPreset {
  id: string;
  name: string;
  format: ExportFormat;
  quality: number; // 0–1, relevant for jpeg
  screens: "all" | "current" | number[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  deviceTarget: string;
  backgroundColor: string;
  backgroundGradient?: GradientConfig;
  elements: CanvasElementWithoutId[];
}
