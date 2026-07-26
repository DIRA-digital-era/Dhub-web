// src/utils/upload.ts
//
// Multipart upload strategy for DHUB:
//  - Images < 10MB  → simple POST /upload (single shot, fast)
//  - Videos > 10MB  → 3-step multipart: /upload/start → /upload/part → /upload/complete
//  - Chunk size: 8MB (above S3 5MB minimum, fewer round trips on poor network)
//  - Per-chunk retry: 3 attempts with exponential backoff (1s → 2s → 4s)
//  - Resume: checkpoint is saved to AsyncStorage keyed by the local file URI
//            so if the app closes or network dies, the next call resumes mid-upload.
//
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { MEDIA_BASE_URL } from '../config/media';
import { MediaItem, MediaType } from '../types';

const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB
const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000];

// ── Types ──────────────────────────────────────────────────────────────────

interface UploadedPart {
  partNumber: number;
  etag: string;
}

interface UploadCheckpoint {
  uploadId: string;
  key: string;
  completedParts: UploadedPart[];
  listingId: string;
  fileName: string;
  mimeType: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function checkpointKey(uri: string): string {
  return `dhub_upload_checkpoint_${uri}`;
}

async function saveCheckpoint(uri: string, cp: UploadCheckpoint): Promise<void> {
  await AsyncStorage.setItem(checkpointKey(uri), JSON.stringify(cp));
}

async function loadCheckpoint(uri: string): Promise<UploadCheckpoint | null> {
  try {
    const raw = await AsyncStorage.getItem(checkpointKey(uri));
    return raw ? (JSON.parse(raw) as UploadCheckpoint) : null;
  } catch {
    return null;
  }
}

async function clearCheckpoint(uri: string): Promise<void> {
  await AsyncStorage.removeItem(checkpointKey(uri));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// Upload one 8MB chunk with retry and exponential backoff
async function uploadPartWithRetry(
  key: string,
  uploadId: string,
  partNumber: number,
  chunkBase64: string,
  attempt = 0
): Promise<UploadedPart> {
  try {
    // Convert base64 chunk → ArrayBuffer for the PUT body
    const binaryStr = atob(chunkBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const res = await fetch(`${MEDIA_BASE_URL}/upload/part`, {
      method: 'PUT',
      headers: {
        'X-R2-Key': key,
        'X-Upload-Id': uploadId,
        'X-Part-Number': String(partNumber),
        'Content-Type': 'application/octet-stream',
      },
      body: bytes.buffer,
    });

    if (!res.ok) {
      throw new Error(`Part ${partNumber} server error: ${res.status}`);
    }

    const result = await res.json() as { partNumber: number; etag: string };
    return { partNumber: result.partNumber, etag: result.etag };
  } catch (err: any) {
    if (attempt < MAX_RETRIES - 1) {
      console.warn(`[upload] Part ${partNumber} failed (attempt ${attempt + 1}), retrying...`, err.message);
      await sleep(BACKOFF_MS[attempt] ?? 4000);
      return uploadPartWithRetry(key, uploadId, partNumber, chunkBase64, attempt + 1);
    }
    throw new Error(`Part ${partNumber} failed after ${MAX_RETRIES} attempts: ${err.message}`);
  }
}

// ── Simple upload for images (< 10MB) ─────────────────────────────────────

async function simpleUpload(
  uri: string,
  fileName: string,
  mimeType: string,
  listingId: string
): Promise<string> {
  const task = FileSystem.createUploadTask(
    `${MEDIA_BASE_URL}/upload`,
    uri,
    {
      httpMethod: 'POST',
      uploadType: 0, // FileSystemUploadType.BINARY_CONTENT
      headers: {
        'Content-Type': mimeType,
        'X-File-Name': fileName,
        'X-Listing-Id': listingId,
      },
    }
  );

  const response = await task.uploadAsync();
  if (!response || response.status !== 200) {
    throw new Error(response?.body || 'Simple upload failed');
  }
  return (JSON.parse(response.body) as { url: string }).url;
}

// ── Multipart upload for videos ────────────────────────────────────────────

async function multipartUploadVideo(
  uri: string,
  fileName: string,
  mimeType: string,
  listingId: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) throw new Error('File does not exist');
  const totalSize = fileInfo.size || 0;
  const totalParts = Math.ceil(totalSize / CHUNK_SIZE);

  // ── Resume or start fresh ──
  let checkpoint = await loadCheckpoint(uri);
  let uploadId: string;
  let key: string;
  let completedParts: UploadedPart[];

  if (checkpoint && checkpoint.listingId === listingId) {
    // Resume from saved state
    console.log(`[upload] Resuming upload from part ${checkpoint.completedParts.length + 1}/${totalParts}`);
    uploadId = checkpoint.uploadId;
    key = checkpoint.key;
    completedParts = checkpoint.completedParts;
  } else {
    // Start a new multipart session
    const startRes = await fetch(`${MEDIA_BASE_URL}/upload/start`, {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'X-File-Name': fileName,
        'X-Listing-Id': listingId,
      },
    });
    if (!startRes.ok) {
      throw new Error(`Failed to start upload: ${await startRes.text()}`);
    }
    const startData = await startRes.json() as { uploadId: string; key: string };
    uploadId = startData.uploadId;
    key = startData.key;
    completedParts = [];

    checkpoint = { uploadId, key, completedParts, listingId, fileName, mimeType };
    await saveCheckpoint(uri, checkpoint);
  }

  // ── Upload parts sequentially (safe for poor networks) ──
  const alreadyUploadedNums = new Set(completedParts.map((p) => p.partNumber));

  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    if (alreadyUploadedNums.has(partNumber)) {
      // This part was already uploaded in a previous session — skip it
      onProgress && onProgress(partNumber / totalParts);
      continue;
    }

    const offset = (partNumber - 1) * CHUNK_SIZE;
    const length = Math.min(CHUNK_SIZE, totalSize - offset);

    // Read 8MB slice as base64
    const chunkBase64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64' as any, // EncodingType.Base64
      position: offset,
      length,
    });

    if (signal?.aborted) {
      console.log(`[upload] Upload aborted by user before part ${partNumber}`);
      throw new Error('Upload aborted');
    }

    const uploadedPart = await uploadPartWithRetry(key, uploadId, partNumber, chunkBase64);
    completedParts.push(uploadedPart);

    // Persist progress after every successful part
    checkpoint.completedParts = completedParts;
    await saveCheckpoint(uri, checkpoint);

    onProgress && onProgress(partNumber / totalParts);
    console.log(`[upload] Part ${partNumber}/${totalParts} done ✓`);
  }

  // ── Complete the multipart upload ──
  const completeRes = await fetch(`${MEDIA_BASE_URL}/upload/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-R2-Key': key,
      'X-Upload-Id': uploadId,
      'X-Listing-Id': listingId,
    },
    body: JSON.stringify({ parts: completedParts }),
  });

  if (!completeRes.ok) {
    throw new Error(`Failed to complete upload: ${await completeRes.text()}`);
  }

  const completeData = await completeRes.json() as { url: string };

  // Clear resume checkpoint on success
  await clearCheckpoint(uri);

  return completeData.url;
}

// ── Public API ──────────────────────────────────────────────────────────────

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
  const mime = mimeType || 'application/octet-stream';

  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) throw new Error('File does not exist');

  const fileSize = fileInfo.size || 0;
  const MAX_IMAGE = 10 * 1024 * 1024;   // 10 MB
  const MAX_VIDEO = 500 * 1024 * 1024;  // 500 MB

  if (type === 'image' && fileSize > MAX_IMAGE) throw new Error('Image too large (max 10MB)');
  if (type === 'video' && fileSize > MAX_VIDEO) throw new Error('Video too large (max 500MB)');

  let url: string;

  if (type === 'video' && fileSize > MAX_IMAGE) {
    // Large video → multipart
    url = await multipartUploadVideo(uri, fileName, mime, listingId, onProgress, signal);
  } else {
    // Image or tiny video → simple upload
    url = await simpleUpload(uri, fileName, mime, listingId);
    onProgress && onProgress(1);
  }

  // Upload thumbnail for videos (always simple — thumbnails are small JPEGs)
  let thumbUrl = url;
  if (type === 'video' && thumbUri) {
    try {
      const thumbMime = 'image/jpeg';
      const thumbName = `${Date.now()}_thumb.jpg`;
      thumbUrl = await simpleUpload(thumbUri, thumbName, thumbMime, listingId);
    } catch (err) {
      console.warn('[upload] Thumbnail upload failed, using video URL as fallback', err);
    }
  }

  return { url, thumbUrl, type };
};

// Abort an in-progress multipart upload (e.g. if the user cancels)
export const abortUpload = async (uri: string): Promise<void> => {
  const checkpoint = await loadCheckpoint(uri);
  if (!checkpoint) return;

  try {
    await fetch(`${MEDIA_BASE_URL}/upload/abort`, {
      method: 'DELETE',
      headers: {
        'X-R2-Key': checkpoint.key,
        'X-Upload-Id': checkpoint.uploadId,
      },
    });
  } catch (err) {
    console.warn('[upload] Abort request failed (may already be expired):', err);
  } finally {
    await clearCheckpoint(uri);
  }
};