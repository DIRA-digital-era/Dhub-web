// src/utils/upload.web.ts
// Web‑specific upload using native File API and headers matching the Worker.

import { MEDIA_BASE_URL } from '../config/media';
import { MediaItem, MediaType } from '../types';

/**
 * Convert a uri (data URL, blob URL, or regular URL) to a Blob.
 */
async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to fetch blob: ${response.status}`);
  }
  return response.blob();
}

/**
 * Upload a file using headers (X-File-Name, X-Listing-Id) – matching the Worker.
 */
async function uploadFile(
  blob: Blob,
  fileName: string,
  listingId: string,
  mimeType: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${MEDIA_BASE_URL}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      'X-File-Name': fileName,
      'X-Listing-Id': listingId,
    },
    body: blob,
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.url;
}

export const uploadListingMedia = async (
  uri: string,
  fileName: string,
  type: MediaType,
  listingId: string,
  thumbUri?: string,
  mimeType?: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<MediaItem> => {
  // 1. Convert uri to Blob
  const blob = await uriToBlob(uri);
  const mime = mimeType || blob.type || 'application/octet-stream';

  // 2. Validate file size
  const MAX_IMAGE = 10 * 1024 * 1024;   // 10 MB
  const MAX_VIDEO = 500 * 1024 * 1024;  // 500 MB

  if (type === 'image' && blob.size > MAX_IMAGE) {
    throw new Error('Image too large (max 10MB)');
  }
  if (type === 'video' && blob.size > MAX_VIDEO) {
    throw new Error('Video too large (max 500MB)');
  }

  // 3. Upload the main file
  const url = await uploadFile(blob, fileName, listingId, mime, signal);
  onProgress?.(0.8);

  // 4. Upload thumbnail for videos
  let thumbUrl = url;
  if (type === 'video' && thumbUri) {
    try {
      const thumbBlob = await uriToBlob(thumbUri);
      const thumbMime = 'image/jpeg';
      const thumbName = `${Date.now()}_thumb.jpg`;
      thumbUrl = await uploadFile(thumbBlob, thumbName, listingId, thumbMime, signal);
    } catch (err) {
      console.warn('[upload.web] Thumbnail upload failed, using video URL', err);
    }
  }

  onProgress?.(1);

  return { url, thumbUrl, type };
};

// Abort function – no checkpoint on web; fetch with AbortSignal handles cancellation.
export const abortUpload = async (_uri: string): Promise<void> => {
  // No-op on web
  console.log('[upload.web] abortUpload called – no-op on web');
};