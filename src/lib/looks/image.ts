const AI_EDGE = 960;
const AI_QUALITY = 0.72;

export async function readLookImage(file: File, onProgress?: (percent: number) => void): Promise<string> {
  let last = -1;
  const report = (value: number) => {
    const next = Math.max(last, Math.min(100, Math.round(value)));
    if (next === last) return;
    last = next;
    onProgress?.(next);
  };
  report(0);
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a photo (JPG, PNG, or WebP).");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("That file is too large. Try one under 12 MB.");
  }
  const bytes = await readFileBytes(file, (ratio) => report(ratio * 70));
  report(80);
  report(95);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const result = `data:${file.type};base64,${btoa(binary)}`;
  report(100);
  return result;
}

function readFileBytes(file: File, onRatio: (ratio: number) => void): Promise<Uint8Array> {
  if (typeof FileReader === "undefined") {
    return file.arrayBuffer().then((buffer) => {
      onRatio(1);
      return new Uint8Array(buffer);
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onRatio(event.loaded / event.total);
    };
    reader.onload = () => {
      onRatio(1);
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => reject(new Error("Could not read that photo."));
    reader.readAsArrayBuffer(file);
  });
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
