// src/screens/common/DownloadAppScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  onClose?: () => void;
}

const ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.dira.dhub';
const IOS_URL = 'https://apps.apple.com/app/idYOUR_APP_ID';

const DownloadAppScreen: React.FC<Props> = ({ onClose }) => {
  const openStore = (url: string) => window.open(url, '_blank');

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="phone-portrait-outline" size={64} color="#D4AF37" />
        </View>
        <Text style={styles.title}>Mobile App Required</Text>
        <Text style={styles.subtitle}>
          Payments and full booking management are only available on the DHUB mobile app.
          Download now to complete your transaction.
        </Text>
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
        {onClose && (
          <TouchableOpacity style={styles.closeLink} onPress={onClose}>
            <Text style={styles.closeText}>Go Back</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    maxWidth: 400,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F5E7C8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  androidButton: { backgroundColor: '#3DDC84' },
  iosButton: { backgroundColor: '#000' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  closeLink: { paddingVertical: 8 },
  closeText: { color: '#D4AF37', fontSize: 16, fontWeight: '500' },
});

export default DownloadAppScreen;