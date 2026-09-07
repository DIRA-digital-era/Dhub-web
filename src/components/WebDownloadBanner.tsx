// src/components/WebDownloadBanner.tsx
// Bottom-of-screen banner shown on web.
// - When `app_download_enabled` flag is TRUE : shows download buttons for iOS + Android
// - When `app_download_enabled` flag is FALSE: shows a "Coming Soon" message — no download buttons
// - "Continue on Web" / dismiss is always available

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAppDownloadFlag } from '../hooks/useAppDownloadFlag';

const BANNER_KEY = 'dhub_web_banner_dismissed';

const ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.dira.dhub';
const IOS_URL = 'https://apps.apple.com/app/idYOUR_APP_ID';

const WebDownloadBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const { enabled: appDownloadEnabled, loading } = useAppDownloadFlag();

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

  // Don't render on native, or if dismissed, or while flag is loading
  if (!visible || loading) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#13131a',
        borderTop: '1px solid rgba(212,175,55,0.2)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 999,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
        padding: '10px 16px',
        gap: 12,
      }}
    >
      {/* Left: icon + text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <Ionicons name="phone-portrait-outline" size={22} color="#D4AF37" />
        <span style={{ fontSize: 13, color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {appDownloadEnabled
            ? 'Get the DHUB app for seamless booking & payments'
            : '📱 DHUB App — Coming Soon'}
        </span>
      </div>

      {/* Right: action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {appDownloadEnabled ? (
          <>
            <button
              style={{
                backgroundColor: '#D4AF37',
                padding: '6px 14px',
                borderRadius: 20,
                border: 'none',
                color: '#000',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
              onClick={() => openStore(ANDROID_URL)}
            >
              Android
            </button>
            <button
              style={{
                backgroundColor: '#fff',
                padding: '6px 14px',
                borderRadius: 20,
                border: 'none',
                color: '#000',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
              onClick={() => openStore(IOS_URL)}
            >
              iOS
            </button>
          </>
        ) : (
          <span
            style={{
              fontSize: 11,
              color: '#D4AF37',
              fontWeight: 600,
              background: 'rgba(212,175,55,0.12)',
              border: '1px solid rgba(212,175,55,0.25)',
              borderRadius: 20,
              padding: '4px 12px',
              letterSpacing: '0.05em',
            }}
          >
            COMING SOON
          </span>
        )}

        {/* Dismiss */}
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1 }}
          onClick={handleDismiss}
          aria-label="Dismiss banner"
        >
          <Ionicons name="close" size={18} color="#666" />
        </button>
      </div>
    </div>
  );
};

export default WebDownloadBanner;