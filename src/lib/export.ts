import Konva from "konva";
import { useEditorStore } from "./store";
import type { Project } from "./types";

export async function exportAllScreensAsZip(
  stage: Konva.Stage,
  project: Project,
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const store = useEditorStore.getState();
  const originalIndex = store.activeScreenIndex;

  for (let i = 0; i < project.screens.length; i++) {
    store.setActiveScreenIndex(i);
    // Wait for React re-render + Konva draw
    await new Promise((r) => setTimeout(r, 250));
    stage.draw();

    const screen = project.screens[i];
    const blob = await exportStageToPNG(stage, screen.canvasWidth, screen.canvasHeight);
    const safeName = (screen.name || `Screen ${i + 1}`).replace(/[^a-zA-Z0-9_ -]/g, "_");
    zip.file(`${String(i + 1).padStart(2, "0")}_${safeName}.png`, blob);
  }

  // Restore original screen
  store.setActiveScreenIndex(originalIndex);

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, `${project.name || "mockups"}.zip`);
}

export async function exportBannerSegments(
  stage: Konva.Stage,
  segmentWidth: number,
  segmentHeight: number,
  numSegments: number,
  projectName: string,
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // Save state
  const prev = {
    scaleX: stage.scaleX(), scaleY: stage.scaleY(),
    x: stage.x(), y: stage.y(),
    width: stage.width(), height: stage.height(),
  };

  // Reset to 1:1
  stage.scaleX(1);
  stage.scaleY(1);
  stage.x(0);
  stage.y(0);
  stage.width(segmentWidth * numSegments);
  stage.height(segmentHeight);
  stage.draw();

  for (let i = 0; i < numSegments; i++) {
    const dataURL = stage.toDataURL({
      x: i * segmentWidth,
      y: 0,
      width: segmentWidth,
      height: segmentHeight,
      pixelRatio: 1,
      mimeType: "image/png",
    });
    const res = await fetch(dataURL);
    const blob = await res.blob();
    zip.file(`${String(i + 1).padStart(2, "0")}_screenshot.png`, blob);
  }

  // Restore
  stage.scaleX(prev.scaleX);
  stage.scaleY(prev.scaleY);
  stage.x(prev.x);
  stage.y(prev.y);
  stage.width(prev.width);
  stage.height(prev.height);
  stage.draw();

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, `${projectName || "banner"}_screenshots.zip`);
}

export async function exportStageToPNG(
  stage: Konva.Stage,
  width: number,
  height: number
): Promise<Blob> {
  // Save current transform
  const prevScaleX = stage.scaleX();
  const prevScaleY = stage.scaleY();
  const prevX = stage.x();
  const prevY = stage.y();
  const prevWidth = stage.width();
  const prevHeight = stage.height();

  // Reset to 1:1 — stage covers exactly the canvas area
  stage.scaleX(1);
  stage.scaleY(1);
  stage.x(0);
  stage.y(0);
  stage.width(width);
  stage.height(height);
  stage.draw();

  const dataURL = stage.toDataURL({
    x: 0,
    y: 0,
    width,
    height,
    pixelRatio: 1,
    mimeType: "image/png",
  });

  // Restore previous transform
  stage.scaleX(prevScaleX);
  stage.scaleY(prevScaleY);
  stage.x(prevX);
  stage.y(prevY);
  stage.width(prevWidth);
  stage.height(prevHeight);
  stage.draw();

  const res = await fetch(dataURL);
  return res.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
