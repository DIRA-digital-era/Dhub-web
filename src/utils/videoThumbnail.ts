import { Platform } from 'react-native';

/**
 * Generates a thumbnail URI from a video file.
 *
 * - On Web: uses an off-screen <video> + <canvas> to capture a frame at `timeMs` ms.
 * - On Native: delegates to expo-video-thumbnails (which only compiles on native builds).
 *
 * @param uri     Local file URI or object URL of the video.
 * @param timeMs  Seek position in milliseconds (default: 1000ms = 1 second).
 * @returns       A data-URI (web) or local file URI (native) of the thumbnail image.
 */
export async function generateVideoThumbnail(
  uri: string,
  timeMs: number = 1000,
): Promise<string> {
  if (Platform.OS === 'web') {
    return generateWebThumbnail(uri, timeMs);
  }

  // Native path — dynamically imported so the module is never bundled for web
  const VideoThumbnails = await import('expo-video-thumbnails');
  const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, {
    time: timeMs,
  });
  return thumbUri;
}

/**
 * Web-only thumbnail generator.
 * Creates a hidden <video> element, seeks to the target time, then
 * paints the current frame onto a <canvas> and exports it as a JPEG data-URI.
 */
function generateWebThumbnail(uri: string, timeMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(video);

    const cleanup = () => {
      video.src = '';
      video.load();
      if (video.parentNode) video.parentNode.removeChild(video);
    };

    const capture = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUri = canvas.toDataURL('image/jpeg', 0.8);
        cleanup();
        resolve(dataUri);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.addEventListener('seeked', capture, { once: true });

    video.addEventListener('error', (e) => {
      cleanup();
      reject(new Error(`Video load error: ${video.error?.message ?? e.type}`));
    }, { once: true });

    video.addEventListener('loadedmetadata', () => {
      // Clamp seek time to the actual video duration
      const seekSec = Math.min(timeMs / 1000, video.duration - 0.1);
      video.currentTime = seekSec > 0 ? seekSec : 0;
    }, { once: true });

    video.src = uri;
    video.load();
  });
}
