import Konva from "konva";
import { useEditorStore } from "./store";
import type { Project } from "./types";

/** Hide UI overlays (segment dividers, etc.) before export */
function hideOverlays(stage: Konva.Stage) {
  stage.find(".overlays").forEach((n) => n.hide());
}
function showOverlays(stage: Konva.Stage) {
  stage.find(".overlays").forEach((n) => n.show());
}

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

  // Hide overlays and reset to 1:1
  hideOverlays(stage);
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
  showOverlays(stage);
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

/**
 * Export all locales — for each locale, switch active locale, then export
 * all screens (or banner segments) into folders: en/01.png, de/01.png, etc.
 */
export async function exportAllLocales(
  stage: Konva.Stage,
  project: Project,
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const store = useEditorStore.getState();
  const locales = project.locales ?? ["default"];
  const origLocale = store.activeLocale;
  const origScreenIdx = store.activeScreenIndex;

  for (const locale of locales) {
    store.setActiveLocale(locale);
    const folder = zip.folder(locale)!;

    // Check if banner mode on current screen
    const screen = store.getActiveScreen();
    if (screen?.bannerSegments && screen.bannerSegments > 1 && screen.bannerBaseWidth) {
      // Banner: export segments
      await new Promise((r) => setTimeout(r, 200));
      stage.draw();

      hideOverlays(stage);
      const prev = { scaleX: stage.scaleX(), scaleY: stage.scaleY(), x: stage.x(), y: stage.y(), width: stage.width(), height: stage.height() };
      stage.scaleX(1); stage.scaleY(1); stage.x(0); stage.y(0);
      stage.width(screen.bannerBaseWidth * screen.bannerSegments);
      stage.height(screen.canvasHeight);
      stage.draw();

      for (let i = 0; i < screen.bannerSegments; i++) {
        const dataURL = stage.toDataURL({ x: i * screen.bannerBaseWidth, y: 0, width: screen.bannerBaseWidth, height: screen.canvasHeight, pixelRatio: 1, mimeType: "image/png" });
        const res = await fetch(dataURL);
        folder.file(`${String(i + 1).padStart(2, "0")}.png`, await res.blob());
      }

      showOverlays(stage);
      stage.scaleX(prev.scaleX); stage.scaleY(prev.scaleY); stage.x(prev.x); stage.y(prev.y);
      stage.width(prev.width); stage.height(prev.height); stage.draw();
    } else {
      // Normal: export each screen
      for (let i = 0; i < project.screens.length; i++) {
        store.setActiveScreenIndex(i);
        await new Promise((r) => setTimeout(r, 250));
        stage.draw();
        const s = project.screens[i];
        const blob = await exportStageToPNG(stage, s.canvasWidth, s.canvasHeight);
        const name = (s.name || `Screen ${i + 1}`).replace(/[^a-zA-Z0-9_ -]/g, "_");
        folder.file(`${String(i + 1).padStart(2, "0")}_${name}.png`, blob);
      }
    }
  }

  // Restore
  store.setActiveLocale(origLocale);
  store.setActiveScreenIndex(origScreenIdx);

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, `${project.name || "mockups"}_all_locales.zip`);
}

export async function exportStageToPNG(
  stage: Konva.Stage,
  width: number,
  height: number
): Promise<Blob> {
  hideOverlays(stage);

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

  // Restore
  showOverlays(stage);
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
