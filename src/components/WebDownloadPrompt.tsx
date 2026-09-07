// src/components/WebDownloadPrompt.tsx
// Bottom-sheet modal shown in-app on web.
// - When `app_download_enabled` flag is TRUE : shows iOS/Android download buttons
// - When `app_download_enabled` flag is FALSE: shows a "Coming Soon" badge, hides download buttons
// - `onContinue` (Continue on Web) is ALWAYS shown when provided, regardless of flag
// - `blocking=true` hides the drag handle and removes the Continue on Web option

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppDownloadFlag } from '../hooks/useAppDownloadFlag';

interface Props {
  visible: boolean;
  onClose: () => void;
  blocking?: boolean;
  onContinue?: () => void;
}

const ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.dira.dhub';
const IOS_URL = 'https://apps.apple.com/app/idYOUR_APP_ID';

const WebDownloadPrompt: React.FC<Props> = ({
  visible,
  onClose,
  blocking = false,
  onContinue,
}) => {
  const translateY = useRef(new Animated.Value(300)).current;
  const { enabled: appDownloadEnabled } = useAppDownloadFlag();

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 5,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: 300,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !blocking,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 10,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 80) {
          onClose();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
    })
  ).current;

  const openStore = (url: string) => window.open(url, '_blank');

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible}>
      <View style={styles.overlay}>
        <Animated.View
          style={[styles.card, { transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          {!blocking && <View style={styles.dragHandle} />}

          <View style={styles.iconContainer}>
            <Ionicons name="phone-portrait-outline" size={48} color="#D4AF37" />
          </View>
          <Text style={styles.title}>
            {appDownloadEnabled
              ? (blocking ? 'Mobile App Required' : 'Get the Full Experience')
              : '📱 Coming Soon on Mobile'}
          </Text>
          <Text style={styles.subtitle}>
            {appDownloadEnabled
              ? (blocking
                  ? 'Payments are only available on the DHUB mobile app. Download now to complete your booking.'
                  : 'The DHUB mobile app offers seamless booking, real‑time notifications, and secure payments. Download now for the best experience.')
              : 'The DHUB mobile app is coming soon to the App Store and Google Play. Stay tuned for launch!'}
          </Text>

          {/* Download buttons — only shown when flag is ON */}
          {appDownloadEnabled && (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.androidButton]}
                onPress={() => openStore(ANDROID_URL)}
              >
                <Ionicons name="logo-google-playstore" size={20} color="#fff" />
                <Text style={styles.buttonText}>Android</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.iosButton]}
                onPress={() => openStore(IOS_URL)}
              >
                <Ionicons name="logo-apple" size={20} color="#fff" />
                <Text style={styles.buttonText}>iOS</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Coming Soon badge — only shown when flag is OFF */}
          {!appDownloadEnabled && (
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>COMING SOON</Text>
            </View>
          )}

          {/* Continue on Web — ALWAYS shown when onContinue is provided and not blocking */}
          {!blocking && onContinue && (
            <TouchableOpacity style={styles.continueLink} onPress={onContinue}>
              <Text style={styles.continueText}>Continue on Web Anyway</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.closeLink} onPress={onClose}>
            <Text style={styles.closeText}>
              {blocking ? 'Close' : 'Remind Me Later'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 32,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
    marginBottom: 16,
    alignSelf: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F5E7C8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  androidButton: { backgroundColor: '#3DDC84' },
  iosButton: { backgroundColor: '#000' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  comingSoonBadge: {
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 16,
  },
  comingSoonText: {
    color: '#D4AF37',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  continueLink: { paddingVertical: 8 },
  continueText: { color: '#D4AF37', fontSize: 14, fontWeight: '500', textDecorationLine: 'underline' },
  closeLink: { paddingVertical: 8, marginTop: 4 },
  closeText: { color: '#999', fontSize: 14 },
});

export default WebDownloadPrompt;