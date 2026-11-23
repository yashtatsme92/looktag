const MAX_EDGE = 2048;
const MAX_DATA_URL_BYTES = 3 * 1024 * 1024;
const JPEG_QUALITIES = [0.85, 0.8, 0.7, 0.6];
const JPEG_DATA_URL_PREFIX = "data:image/jpeg;base64,";

/**
 * Decode a client photo with its embedded orientation and return a JPEG data URL
 * strictly smaller than 3 MiB. Falls back to an HTML image if bitmap decoding
 * is unavailable (for example, HEIC in Safari). Rejects on processing failure.
 */
export async function compressLookPhoto(photo: Blob): Promise<string> {
  const image = await decodePhoto(photo);
  try {
    if (
      !Number.isFinite(image.width) ||
      !Number.isFinite(image.height) ||
      image.width <= 0 ||
      image.height <= 0
    ) {
      throw new Error("Could not process that photo: invalid image dimensions.");
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    let width = Math.max(1, Math.round(image.width * scale));
    let height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");

    while (true) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not process that photo: canvas is unavailable.");
      context.drawImage(image.source, 0, 0, width, height);

      for (const quality of JPEG_QUALITIES) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (
          !dataUrl.startsWith(JPEG_DATA_URL_PREFIX) ||
          dataUrl.length === JPEG_DATA_URL_PREFIX.length
        ) {
          throw new Error("Could not encode that photo as JPEG.");
        }
        // JPEG data URLs are ASCII, so their string length is their byte length.
        if (dataUrl.length < MAX_DATA_URL_BYTES) return dataUrl;
      }

      if (width === 1 && height === 1) {
        throw new Error("Could not compress that photo below 3 MiB.");
      }
      width = Math.max(1, Math.floor(width / 2));
      height = Math.max(1, Math.floor(height / 2));
    }
  } finally {
    image.close();
  }
}

async function decodePhoto(photo: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  try {
    const bitmap = await createImageBitmap(photo, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    // HTML images apply embedded orientation when decoded and drawn to canvas.
    let url: string | undefined;
    try {
      const objectUrl = URL.createObjectURL(photo);
      url = objectUrl;
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not decode that photo."));
        image.src = objectUrl;
      });
      return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => {},
      };
    } catch (error) {
      throw new Error("Could not decode that photo.", { cause: error });
    } finally {
      if (url !== undefined) URL.revokeObjectURL(url);
    }
  }
}
