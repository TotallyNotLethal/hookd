export class ImageConversionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImageConversionError';
  }
}

export interface PreparedImage {
  file: File;
  originalFile: File;
  converted: boolean;
}

const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);

const DEFAULT_OUTPUT_TYPE = 'image/jpeg';
const DEFAULT_QUALITY = 0.92;

function deriveConvertedName(originalFile: File, outputExtension: string): string {
  const originalName = typeof originalFile.name === 'string' ? originalFile.name.trim() : '';
  if (!originalName) {
    return `converted.${outputExtension}`;
  }

  const withoutExtension = originalName.replace(/\.[^./\\]+$/u, '');
  return `${withoutExtension}.${outputExtension}`;
}

function isHeicFile(file: File): boolean {
  const mimeType = typeof file.type === 'string' ? file.type.toLowerCase() : '';
  if (mimeType && HEIC_MIME_TYPES.has(mimeType)) {
    return true;
  }

  const name = typeof file.name === 'string' ? file.name.toLowerCase() : '';
  return name.endsWith('.heic') || name.endsWith('.heif');
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }

  return new Promise((resolve, reject) => {
    const htmlCanvas = canvas as HTMLCanvasElement;
    htmlCanvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new ImageConversionError('Failed to convert image to blob.'));
        }
      },
      type,
      quality,
    );
  });
}

type DrawableSource = ImageBitmap | HTMLImageElement;

interface DrawableResource {
  source: DrawableSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function loadViaCreateImageBitmap(file: File): Promise<DrawableResource | null> {
  if (typeof createImageBitmap !== 'function') {
    return null;
  }

  try {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => {
        try {
          bitmap.close();
        } catch (error) {
          console.warn('Unable to release ImageBitmap resources', error);
        }
      },
    };
  } catch (error) {
    console.warn('createImageBitmap failed to decode HEIC. Falling back to HTMLImageElement.', error);
    return null;
  }
}

async function loadViaImageElement(file: File): Promise<DrawableResource> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.decoding = 'async';
      element.onload = () => resolve(element);
      element.onerror = (event) => {
        reject(event instanceof Error ? event : new Error('Failed to load image.'));
      };
      element.src = objectUrl;
    });

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => {
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw new ImageConversionError('Unable to read HEIC image. Please try another photo.', { cause: error });
  }
}

async function loadDrawableResource(file: File): Promise<DrawableResource> {
  const bitmapResource = await loadViaCreateImageBitmap(file);
  if (bitmapResource) {
    return bitmapResource;
  }

  return loadViaImageElement(file);
}

async function convertHeicFile(file: File): Promise<PreparedImage> {
  const resource = await loadDrawableResource(file);

  const { width, height } = resource;
  if (!width || !height) {
    resource.cleanup();
    throw new ImageConversionError('Unable to read HEIC image dimensions.');
  }

  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
  } else {
    const htmlCanvas = document.createElement('canvas');
    htmlCanvas.width = width;
    htmlCanvas.height = height;
    canvas = htmlCanvas;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    resource.cleanup();
    throw new ImageConversionError('Unable to access drawing context for HEIC conversion.');
  }

  try {
    context.drawImage(resource.source, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, DEFAULT_OUTPUT_TYPE, DEFAULT_QUALITY);
    const extension = DEFAULT_OUTPUT_TYPE.split('/')[1] ?? 'jpg';
    const convertedFile = new File([blob], deriveConvertedName(file, extension), {
      type: blob.type || DEFAULT_OUTPUT_TYPE,
      lastModified: file.lastModified,
    });

    return {
      file: convertedFile,
      originalFile: file,
      converted: true,
    };
  } finally {
    resource.cleanup();
  }
}

export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  if (isHeicFile(file)) {
    return convertHeicFile(file);
  }

  return {
    file,
    originalFile: file,
    converted: false,
  };
}
