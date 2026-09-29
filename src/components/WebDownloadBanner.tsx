import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import WebDownloadPrompt from './WebDownloadPrompt';
import { useAppDownloadFlag } from '../hooks/useAppDownloadFlag';

const BANNER_KEY = 'dhub_web_banner_dismissed';

const WebDownloadBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const { loading } = useAppDownloadFlag(); // Just use loading to wait until flag resolves

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

  if (!visible || loading) return null;

  return (
    <WebDownloadPrompt
      visible={visible}
      onClose={handleDismiss}
      blocking={false}
      onContinue={handleDismiss}
    />
  );
};

export default WebDownloadBanner;

