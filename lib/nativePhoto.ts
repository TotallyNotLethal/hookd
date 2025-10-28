'use client';

import { Capacitor } from '@capacitor/core';
import {
  Camera,
  CameraResultType,
  CameraSource,
  type CameraPhoto,
  type GalleryPhoto,
} from '@capacitor/camera';

export type NativePhotoSource = 'camera' | 'gallery';
export type NativePhotoErrorReason = 'permission' | 'unknown';

export class NativePhotoError extends Error {
  public readonly reason: NativePhotoErrorReason;
  public readonly cause?: unknown;

  constructor(message: string, reason: NativePhotoErrorReason, options?: { cause?: unknown }) {
    super(message);
    this.name = 'NativePhotoError';
    this.reason = reason;
    this.cause = options?.cause;
  }
}

export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

const getErrorCode = (error: unknown): string | undefined => {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return undefined;
};

const isUserCancelledError = (error: unknown): boolean => {
  const code = getErrorCode(error);
  if (code === 'ERROR_USER_CANCELLED' || code === 'USER_CANCELLED') {
    return true;
  }
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : undefined;
  return typeof message === 'string' && /cancel/i.test(message);
};

const isPermissionError = (error: unknown): boolean => {
  const code = getErrorCode(error);
  if (code === 'PERMISSION_DENIED' || code === 'NO_CAMERA_ACCESS') {
    return true;
  }
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : undefined;
  return typeof message === 'string' && /permission/i.test(message);
};

const photoLikeToFile = async (
  photo: Pick<CameraPhoto, 'webPath' | 'path' | 'format'> | Pick<GalleryPhoto, 'webPath' | 'path' | 'format'>,
): Promise<File> => {
  if (!photo.webPath) {
    throw new NativePhotoError('Unable to resolve photo path.', 'unknown');
  }

  const response = await fetch(photo.webPath);
  if (!response.ok) {
    throw new NativePhotoError('Unable to read captured photo data.', 'unknown');
  }

  const blob = await response.blob();
  const nameFromPath = photo.path?.split('/').pop();
  const extension = photo.format ? `.${photo.format.toLowerCase()}` : '';
  const fallbackName = `photo-${Date.now()}${extension}`;
  const fileName = nameFromPath && nameFromPath.trim().length > 0 ? nameFromPath : fallbackName;

  return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
};

export const requestNativePhotoFile = async (
  source: NativePhotoSource,
): Promise<File | null> => {
  if (!isNativePlatform()) {
    return null;
  }

  try {
    if (source === 'camera') {
      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        quality: 90,
        correctOrientation: true,
        saveToGallery: false,
      });
      if (!photo) {
        return null;
      }
      return photoLikeToFile(photo);
    }

    const result = await Camera.pickImages({
      limit: 1,
      quality: 90,
      presentationStyle: 'popover',
    });
    const [photo] = result.photos ?? [];
    if (!photo) {
      return null;
    }
    return photoLikeToFile(photo);
  } catch (error) {
    if (isUserCancelledError(error)) {
      return null;
    }
    if (isPermissionError(error)) {
      throw new NativePhotoError('Native photo permissions were denied.', 'permission', {
        cause: error instanceof Error ? error : undefined,
      });
    }
    throw new NativePhotoError('Native photo request failed.', 'unknown', {
      cause: error instanceof Error ? error : undefined,
    });
  }
};
