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

const FullVideoPlayer: React.FC<FullVideoPlayerProps> = ({ url, onClose, processingStatus }) => {
  const [playerStatus, setPlayerStatus] = useState<'loading' | 'playing' | 'error'>('loading');
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => {
      retryCountRef.current = 0;
      setPlayerStatus('playing');
      video.play().catch(() => {});
    };

    const handleWaiting = () => setPlayerStatus('loading');
    const handlePlaying = () => setPlayerStatus('playing');
    
    const handleError = () => {
      if (retryCountRef.current < MAX_AUTO_RETRIES) {
        const delay = BACKOFF[retryCountRef.current] ?? 6000;
        retryCountRef.current += 1;
        setPlayerStatus('loading');
        retryTimerRef.current = setTimeout(() => {
          video.load();
        }, delay);
      } else {
        setPlayerStatus('error');
      }
    };

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
    };
  }, [url]);

  const handleManualRetry = () => {
    retryCountRef.current = 0;
    setPlayerStatus('loading');
    if (videoRef.current) {
      videoRef.current.load();
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={onClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="close" size={32} color="#fff" />
      </TouchableOpacity>

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

      {processingStatus === 'processing' && (
        <View style={styles.processingBadge}>
          <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.processingBadgeText}>Optimizing for performance…</Text>
        </View>
      )}

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