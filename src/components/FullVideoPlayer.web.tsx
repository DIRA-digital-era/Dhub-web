// src/components/FullVideoPlayer.web.tsx
import { Ionicons } from '@expo/vector-icons';
import React from 'react';

interface FullVideoPlayerProps {
  url: string;
  onClose: () => void;
  processingStatus?: 'processing' | 'ready' | 'failed';
}

const FullVideoPlayer: React.FC<FullVideoPlayerProps> = ({ url, onClose, processingStatus }) => {
  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: '#000',
    zIndex: 9999,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  };

  const closeBtnStyle: React.CSSProperties = {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 30,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: 28,
  };

  const videoStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    objectFit: 'contain',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.75)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    zIndex: 20,
  };

  const titleStyle: React.CSSProperties = {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  };

  const subStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    textAlign: 'center',
    paddingLeft: 32,
    paddingRight: 32,
  };

  if (processingStatus === 'processing') {
    return (
      <div style={containerStyle}>
        <button style={closeBtnStyle} onClick={onClose}>
          <Ionicons name="close" size={32} color="#fff" />
        </button>
        <div style={overlayStyle}>
          <Ionicons name="hourglass-outline" size={52} color="#D4AF37" />
          <span style={titleStyle}>Video Optimizing…</span>
          <span style={subStyle}>Please check back in a few minutes.</span>
        </div>
      </div>
    );
  }

  if (processingStatus === 'failed') {
    return (
      <div style={containerStyle}>
        <button style={closeBtnStyle} onClick={onClose}>
          <Ionicons name="close" size={32} color="#fff" />
        </button>
        <div style={overlayStyle}>
          <Ionicons name="alert-circle-outline" size={52} color="rgba(255,80,80,0.8)" />
          <span style={titleStyle}>Processing Failed</span>
          <span style={subStyle}>Please re-upload the video.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <button style={closeBtnStyle} onClick={onClose}>
        <Ionicons name="close" size={32} color="#fff" />
      </button>
      <video
        src={url}
        controls
        playsInline
        webkit-playsinline
        style={videoStyle}
        autoPlay
        muted={false}
      />
    </div>
  );
};

export default FullVideoPlayer;