// src/screens/common/LegalScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LegalScreen: React.FC = () => {
  const navigation = useNavigation();

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#D4AF37" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Terms & Privacy</Text>
          <View style={styles.rightSpacer} />
        </View>
        <iframe
          src="https://dhubcmr.netlify.app/terms"
          style={{ flex: 1, border: 'none', width: '100%', height: '100%' }}
          title="Terms and Privacy"
        />
      </SafeAreaView>
    );
  }

  // Native: use react-native-webview if needed, or fallback to the iframe approach
  // Since you're focused on web, we can keep the web version only.
  // If you want to support native, you can import WebView from 'react-native-webview'.
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#D4AF37" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Terms & Privacy</Text>
        <View style={styles.rightSpacer} />
      </View>
      <iframe
        src="https://dhubcmr.netlify.app/terms"
        style={{ flex: 1, border: 'none', width: '100%', height: '100%' }}
        title="Terms and Privacy"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { marginLeft: 6, fontSize: 16, color: '#D4AF37', fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  rightSpacer: { width: 60 },
});

export default LegalScreen;