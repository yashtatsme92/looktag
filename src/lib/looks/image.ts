const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.84;
const AI_EDGE = 960;
const AI_QUALITY = 0.72;

export async function readLookImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a photo (JPG, PNG, or WebP).");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("That file is too large. Try one under 12 MB.");
  }
  return bitmapToJpeg(await loadImage(file), MAX_EDGE, JPEG_QUALITY);
}

export async function imageSrcToDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return compressDataUrl(src, AI_EDGE, AI_QUALITY);
  const response = await fetch(src);
  if (!response.ok) throw new Error("Could not read that photo.");
  const blob = await response.blob();
  return bitmapToJpeg(await loadImage(blob), AI_EDGE, AI_QUALITY);
}

async function compressDataUrl(src: string, maxEdge: number, quality: number): Promise<string> {
  const img = await loadUrl(src);
  return bitmapToJpeg(img, maxEdge, quality);
}

function bitmapToJpeg(bitmap: HTMLImageElement, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process that photo.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return loadUrl(URL.createObjectURL(file), true);
}

function loadUrl(url: string, revoke = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      if (revoke) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (revoke) URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo."));
    };
    img.src = url;
  });
}
