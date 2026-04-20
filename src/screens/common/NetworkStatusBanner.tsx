// src/common/networkstatus/NetworkStatusBanner.tsx

import { MaterialIcons } from '@expo/vector-icons';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View
} from 'react-native';

// ── Connection quality levels ──────────────────────────────────────────────
type ConnectionStatus =
  | 'good'
  | 'poor'
  | 'offline';

interface BannerConfig {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  bg: string;
  textColor: string;
  visible: boolean;
}

const CONFIG: Record<ConnectionStatus, BannerConfig> = {
  good: {
    label: 'Good connection',
    icon: 'check-circle',
    bg: '#27ae60',
    textColor: '#fff',
    visible: false,
  },
  poor: {
    label: 'Poor connection — content may load slowly',
    icon: 'warning',
    bg: '#f39c12',
    textColor: '#fff',
    visible: true,
  },
  offline: {
    label: 'No internet connection',
    icon: 'wifi-off',
    bg: '#c0392b',
    textColor: '#fff',
    visible: true,
  },
};

// ── Derive quality from NetInfo state ─────────────────────────────────────
function deriveStatus(state: NetInfoState): ConnectionStatus {
  if (!state.isConnected || state.isConnected === false) return 'offline';
  if (!state.isInternetReachable && state.isInternetReachable !== null) {
    return 'offline';
  }

  const type = state.type;
  const details = state.details as any;

  if (type === 'cellular') {
    const gen = details?.cellularGeneration as string | null;
    if (gen === '2g' || gen === null) return 'poor';
    if (gen === '3g') return 'poor';
  }

  if (type === 'wifi') {
    if (details?.isConnectionExpensive) return 'poor';
  }

  if (type === 'none' || type === 'unknown') return 'offline';

  return 'good';
}

// ── Component ──────────────────────────────────────────────────────────────
interface NetworkStatusBannerProps {
  showGoodBriefly?: boolean;
}

const NetworkStatusBanner: React.FC<NetworkStatusBannerProps> = ({
  showGoodBriefly = true,
}) => {
  const [status, setStatus] = useState<ConnectionStatus>('good');
  const [showBanner, setShowBanner] = useState(false);
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animateBanner = (show: boolean) => {
    Animated.timing(slideAnim, {
      toValue: show ? 0 : -60,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleStatusChange = (newStatus: ConnectionStatus) => {
    setStatus(newStatus);

    const cfg = CONFIG[newStatus];

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (cfg.visible) {
      setShowBanner(true);
      animateBanner(true);
    } else if (showGoodBriefly) {
      setShowBanner(true);
      animateBanner(true);
      hideTimerRef.current = setTimeout(() => {
        animateBanner(false);
        setTimeout(() => setShowBanner(false), 310);
      }, 2500);
    } else {
      animateBanner(false);
      setTimeout(() => setShowBanner(false), 310);
    }
  };

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const newStatus = deriveStatus(state);
      handleStatusChange(newStatus);
    });

    NetInfo.fetch().then((state) => {
      handleStatusChange(deriveStatus(state));
    });

    return () => {
      unsubscribe();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!showBanner) return null;

  const cfg = CONFIG[status];

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor: cfg.bg, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.row}>
        <MaterialIcons
          name={cfg.icon}
          size={18}
          color={cfg.textColor}
          style={styles.icon}
        />
        <Text style={[styles.bannerText, { color: cfg.textColor }]}>
          {cfg.label}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 6,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default NetworkStatusBanner;