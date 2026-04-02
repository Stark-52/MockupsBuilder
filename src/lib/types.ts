export type ElementType = "text" | "image" | "rectangle" | "device-frame";

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

export type CanvasElement =
  | TextElement
  | ImageElement
  | RectangleElement
  | DeviceFrameElement;

export interface Screen {
  id: string;
  name: string;
  deviceTarget: string;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundGradient?: GradientConfig;
  elements: CanvasElement[];
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
  | Omit<DeviceFrameElement, "id">;

export interface Template {
  id: string;
  name: string;
  description: string;
  deviceTarget: string;
  backgroundColor: string;
  backgroundGradient?: GradientConfig;
  elements: CanvasElementWithoutId[];
}
