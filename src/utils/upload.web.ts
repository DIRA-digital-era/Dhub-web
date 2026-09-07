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

async function uploadFile(
  blob: Blob,
  fileName: string,
  listingId: string,
  mimeType: string,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.url);
        } catch (e) {
          reject(new Error('Failed to parse response'));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new DOMException('Upload aborted', 'AbortError')));

    xhr.open('POST', `${MEDIA_BASE_URL}/upload`);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.setRequestHeader('X-File-Name', fileName);
    xhr.setRequestHeader('X-Listing-Id', listingId);

    xhr.send(blob);
  });
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
  const url = await uploadFile(blob, fileName, listingId, mime, signal, (p) => {
    // Map the main file upload to 0 - 80%
    onProgress?.(p * 0.8);
  });
  
  // Set progress to 85% while we handle thumbnail
  onProgress?.(0.85);

  // 4. Upload thumbnail for videos
  let thumbUrl = url;
  if (type === 'video' && thumbUri) {
    try {
      const thumbBlob = await uriToBlob(thumbUri);
      const thumbMime = 'image/jpeg';
      const thumbName = `${Date.now()}_thumb.jpg`;
      thumbUrl = await uploadFile(thumbBlob, thumbName, listingId, thumbMime, signal, (p) => {
        // Map thumbnail upload to 85% - 100%
        onProgress?.(0.85 + (p * 0.15));
      });
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