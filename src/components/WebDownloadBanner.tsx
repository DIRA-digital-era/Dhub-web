// src/components/WebDownloadBanner.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const BANNER_KEY = 'dhub_web_banner_dismissed';

const ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.dira.dhub';
const IOS_URL = 'https://apps.apple.com/app/idYOUR_APP_ID';

const WebDownloadBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const dismissed = localStorage.getItem(BANNER_KEY);
    if (!dismissed) {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(BANNER_KEY, 'true');
    setVisible(false);
  };

  const openStore = (url: string) => window.open(url, '_blank');

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        padding: '12px 16px',
        borderTop: '1px solid #eee',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 999,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <Ionicons name="phone-portrait-outline" size={24} color="#D4AF37" />
        <span style={{ fontSize: 13, color: '#333', flex: 1 }}>
          Get the DHUB app for seamless booking and payments
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          style={{
            backgroundColor: '#D4AF37',
            padding: '6px 16px',
            borderRadius: 20,
            border: 'none',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
          onClick={() => openStore(ANDROID_URL)}
        >
          Download
        </button>
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
          }}
          onClick={handleDismiss}
        >
          <Ionicons name="close" size={20} color="#999" />
        </button>
      </div>
    </div>
  );
};

export default WebDownloadBanner;