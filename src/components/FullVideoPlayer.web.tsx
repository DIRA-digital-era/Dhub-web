// src/components/FullVideoPlayer.web.tsx
// Web-specific video player using native HTML5 video for maximum compatibility.
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const MAX_AUTO_RETRIES = 3;
const BACKOFF = [1500, 3000, 6000];

interface FullVideoPlayerProps {
  url: string;
  onClose: () => void;
  processingStatus?: 'processing' | 'ready' | 'failed';
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostic helper — maps MediaError codes to human-readable strings
// ─────────────────────────────────────────────────────────────────────────────
function describeMediaError(err: MediaError | null): string {
  if (!err) return 'No MediaError object';
  const codes: Record<number, string> = {
    1: 'MEDIA_ERR_ABORTED – fetch aborted by user',
    2: 'MEDIA_ERR_NETWORK – network error while fetching',
    3: 'MEDIA_ERR_DECODE – decoding failed (codec/container issue)',
    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED – src not supported (404, bad MIME, CORS)',
  };
  return codes[err.code] ?? `Unknown code ${err.code}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight probe: fetch the URL with a Range header before handing it to
// the <video> tag. This lets us distinguish:
//   • 200 (no Range support) → worker bug
//   • 206 (correct)          → worker is fine, browser may still fail
//   • 403/404/5xx            → backend / R2 key issue
//   • Network error          → CORS or DNS issue
// ─────────────────────────────────────────────────────────────────────────────
async function probeVideoUrl(url: string): Promise<void> {
  console.group(`%c[VideoProbe] Pre-flight check → ${url}`, 'color: #D4AF37; font-weight: bold;');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
    });
    const ct = res.headers.get('content-type') ?? 'unknown';
    const cl = res.headers.get('content-length') ?? 'unknown';
    const cr = res.headers.get('content-range') ?? 'none';
    const ar = res.headers.get('accept-ranges') ?? 'none';
    const cc = res.headers.get('cache-control') ?? 'none';

    const statusLabel = res.status === 206
      ? '✅ 206 Partial Content (correct)'
      : res.status === 200
        ? '⚠️  200 OK — Worker returned full body, no Range support (WILL cause playback issues on some browsers)'
        : `❌ ${res.status} ${res.statusText}`;

    console.log('Status      :', statusLabel);
    console.log('Content-Type:', ct);
    console.log('Content-Length:', cl);
    console.log('Content-Range:', cr);
    console.log('Accept-Ranges:', ar);
    console.log('Cache-Control:', cc);
    console.log('All response headers:', Object.fromEntries(res.headers.entries()));

    if (res.status >= 400) {
      const body = await res.text().catch(() => '(could not read body)');
      console.error('❌ Error body:', body);
    }
  } catch (netErr: any) {
    console.error('❌ Network/CORS error — fetch itself failed. This means:');
    console.error('   • CORS is blocking the request, OR');
    console.error('   • The Worker URL is unreachable (DNS / firewall), OR');
    console.error('   • The URL is completely wrong');
    console.error('   Raw error:', netErr?.message ?? netErr);
  }
  console.groupEnd();
}

const FullVideoPlayer: React.FC<FullVideoPlayerProps> = ({ url, onClose, processingStatus }) => {
  const [playerStatus, setPlayerStatus] = useState<'loading' | 'playing' | 'error'>('loading');
  const [errorDetail, setErrorDetail] = useState<string>('');
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Run pre-flight probe once on mount (or when URL changes)
  useEffect(() => {
    if (processingStatus === 'processing' || processingStatus === 'failed') return;
    console.group('%c[VideoPlayer] Mounting — full diagnostic run', 'color: #D4AF37; font-weight: bold; font-size: 14px;');
    console.log('URL received by player :', url);
    console.log('processingStatus       :', processingStatus);
    console.log('User Agent             :', navigator.userAgent);
    console.log('Online                 :', navigator.onLine);
    probeVideoUrl(url).then(() => console.groupEnd());
    return () => {
      console.log('[VideoPlayer] Unmounting');
    };
  }, [url, processingStatus]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => {
      console.log('[VideoPlayer] ✅ canplay — video is ready, calling play()');
      retryCountRef.current = 0;
      setPlayerStatus('playing');
      setErrorDetail('');
      video.play().catch((e) => console.warn('[VideoPlayer] play() rejected:', e));
    };

    const handleLoadStart = () => console.log('[VideoPlayer] loadstart — browser started fetching src');
    const handleLoadedMetadata = () => {
      console.log('[VideoPlayer] loadedmetadata — duration:', video.duration, 's | videoWidth:', video.videoWidth, '| videoHeight:', video.videoHeight);
    };
    const handleProgress = () => {
      const b = video.buffered;
      if (b.length > 0) {
        console.log(`[VideoPlayer] progress — buffered 0-${b.end(b.length - 1).toFixed(1)}s of ${video.duration?.toFixed(1) ?? '?'}s`);
      }
    };
    const handleWaiting = () => {
      console.warn('[VideoPlayer] waiting — browser is stalling (buffer empty)');
      setPlayerStatus('loading');
    };
    const handlePlaying = () => {
      console.log('[VideoPlayer] ▶ playing');
      setPlayerStatus('playing');
    };
    const handleStalled = () => console.warn('[VideoPlayer] stalled — network stopped delivering data');
    const handleSuspend = () => console.log('[VideoPlayer] suspend — browser stopped downloading');
    const handleAbort = () => console.warn('[VideoPlayer] abort — src fetch aborted');

    const handleError = () => {
      const me = video.error;
      const desc = describeMediaError(me);
      const detail = `code=${me?.code ?? 'null'} | ${desc}`;
      console.group('%c[VideoPlayer] ❌ ERROR event', 'color: red; font-weight: bold;');
      console.error('MediaError description :', desc);
      console.error('video.src              :', video.src);
      console.error('video.networkState     :', video.networkState, '(1=IDLE, 2=LOADING, 3=NO_SRC)');
      console.error('video.readyState       :', video.readyState, '(0=HAVE_NOTHING, 1=HAVE_METADATA, 4=HAVE_ENOUGH)');
      console.error('video.currentSrc       :', video.currentSrc);
      console.groupEnd();

      setErrorDetail(detail);

      if (retryCountRef.current < MAX_AUTO_RETRIES) {
        const delay = BACKOFF[retryCountRef.current] ?? 6000;
        retryCountRef.current += 1;
        console.log(`[VideoPlayer] Auto-retry ${retryCountRef.current}/${MAX_AUTO_RETRIES} in ${delay}ms`);
        setPlayerStatus('loading');
        retryTimerRef.current = setTimeout(() => {
          console.log('[VideoPlayer] Calling video.load() for retry');
          video.load();
        }, delay);
      } else {
        console.error('[VideoPlayer] ❌ Max retries reached. Showing error screen.');
        setPlayerStatus('error');
      }
    };

    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('suspend', handleSuspend);
    video.addEventListener('abort', handleAbort);
    video.addEventListener('error', handleError);

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('stalled', handleStalled);
      video.removeEventListener('suspend', handleSuspend);
      video.removeEventListener('abort', handleAbort);
      video.removeEventListener('error', handleError);
    };
  }, [url]);

  const handleManualRetry = () => {
    console.log('[VideoPlayer] Manual retry triggered');
    retryCountRef.current = 0;
    setPlayerStatus('loading');
    setErrorDetail('');
    if (videoRef.current) {
      probeVideoUrl(url).then(() => {
        videoRef.current?.load();
      });
    }
  };

  // ── Block playback while FFmpeg is still processing / has failed ─────────
  if (processingStatus === 'processing') {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={32} color="#fff" />
        </TouchableOpacity>
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text style={[styles.errorTitle, { color: '#D4AF37' }]}>Video Optimizing…</Text>
          <Text style={styles.errorSubtitle}>
            This video is still being processed for playback.{'\n'}Please check back in a few minutes.
          </Text>
        </View>
      </View>
    );
  }

  if (processingStatus === 'failed') {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={32} color="#fff" />
        </TouchableOpacity>
        <View style={styles.overlay}>
          <Ionicons name="alert-circle-outline" size={52} color="rgba(255,80,80,0.8)" />
          <Text style={styles.errorTitle}>Processing Failed</Text>
          <Text style={styles.errorSubtitle}>This video could not be optimized. Please re-upload.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={onClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="close" size={32} color="#fff" />
      </TouchableOpacity>

      {/* @ts-ignore */}
      <video
        ref={videoRef}
        src={url}
        style={{
          width: screenWidth,
          height: screenHeight,
          backgroundColor: '#000',
        }}
        controls
        playsInline
      />



      {playerStatus === 'loading' && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.overlayText}>
            {retryCountRef.current > 0
              ? `Retrying… (${retryCountRef.current}/${MAX_AUTO_RETRIES})`
              : 'Loading video…'}
          </Text>
        </View>
      )}

      {playerStatus === 'error' && (
        <View style={styles.overlay}>
          <Ionicons name="wifi-outline" size={52} color="rgba(255,255,255,0.7)" />
          <Text style={styles.errorTitle}>Could not load video</Text>
          <Text style={styles.errorSubtitle}>Check your connection and try again</Text>
          {!!errorDetail && (
            <Text style={[styles.errorSubtitle, { fontSize: 11, marginTop: 4, opacity: 0.6 }]}>
              {errorDetail}
            </Text>
          )}
          <TouchableOpacity style={styles.retryBtn} onPress={handleManualRetry}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 40,
    right: 20,
    zIndex: 30,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    zIndex: 20,
  },
  processingBadge: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    backgroundColor: 'rgba(212, 175, 55, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 40,
  },
  processingBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  overlayText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 12,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  errorSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default FullVideoPlayer;