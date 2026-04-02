import Konva from "konva";

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
