// src/utils/upload.ts
import { MEDIA_BASE_URL } from '../config/media';
import { MediaItem, MediaType } from '../types';

/**
 * Upload a single file buffer to R2 via Worker.
 * Returns the Worker's response JSON (expects { url, thumbUrl? }).
 */
async function uploadBuffer(
  buffer: ArrayBuffer,
  mimeType: string,
  fileName: string,
  listingId: string,
) {
  const res = await fetch(`${MEDIA_BASE_URL}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
      "X-File-Name": fileName,
      "X-Listing-Id": listingId,
    },
    body: buffer,
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

/**
 * Upload a listing media item (image or video) to Cloudflare R2 via Worker.
 */
export const uploadListingMedia = async (
  uri: string,
  fileName: string,
  type: MediaType,
  listingId: string,
  thumbUri?: string,
  mimeType?: string,
): Promise<MediaItem> => {
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const mainResponse = await fetch(uri);

  if (!mainResponse.ok) {
    throw new Error("Failed to fetch media file");
  }

  const mainBuffer = await mainResponse.arrayBuffer();

  const MAX_IMAGE = 10 * 1024 * 1024;
  const MAX_VIDEO = 100 * 1024 * 1024;

  if (
    (type === "image" && mainBuffer.byteLength > MAX_IMAGE) ||
    (type === "video" && mainBuffer.byteLength > MAX_VIDEO)
  ) {
    throw new Error("File too large");
  }

  const mime = mimeType || mainResponse.headers.get("content-type") || "application/octet-stream";

  const { url } = await uploadBuffer(
    mainBuffer,
    mime,
    fileName,
    listingId
  );

  let thumbUrl = url;

  if (type === "video" && thumbUri) {
    try {
      const thumbRes = await fetch(thumbUri);
      if (thumbRes.ok) {
        const thumbBuffer = await thumbRes.arrayBuffer();

        const result = await uploadBuffer(
          thumbBuffer,
          "image/jpeg",
          `${uniqueName}_thumb.jpg`,
          listingId
        );

        thumbUrl = result.url;
      }
    } catch {}
  }

  return { url, thumbUrl, type };
};