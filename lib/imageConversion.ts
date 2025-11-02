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

async function convertHeicFile(file: File): Promise<PreparedImage> {
  if (typeof createImageBitmap !== 'function') {
    throw new ImageConversionError(
      'This browser does not support HEIC conversion. Please convert the photo to JPEG or PNG and try again.',
    );
  }

  const bitmap = await createImageBitmap(file).catch((error) => {
    throw new ImageConversionError('Unable to read HEIC image. Please try another photo.', { cause: error });
  });

  try {
    const width = bitmap.width;
    const height = bitmap.height;
    if (!width || !height) {
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
      throw new ImageConversionError('Unable to access drawing context for HEIC conversion.');
    }

    context.drawImage(bitmap, 0, 0, width, height);
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
    bitmap.close();
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
