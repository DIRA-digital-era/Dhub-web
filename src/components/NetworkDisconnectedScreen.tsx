import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';

interface NetworkDisconnectedScreenProps {
  onRefresh: () => void;
  refreshing: boolean;
  fullScreen?: boolean;
}

export const NetworkDisconnectedScreen = ({ onRefresh, refreshing, fullScreen = true }: NetworkDisconnectedScreenProps) => {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();

  const COLORS = React.useMemo(() => ({
    gold: colors.primary,
    white: colors.background,
    background: colors.background,
    offWhite: colors.card,
    greyDark: colors.text,
    greyMedium: colors.textSecondary,
  }), [colors, isDark]);

  const styles = React.useMemo(() => getStyles(COLORS), [COLORS]);

  const openNetworkSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('App-Prefs:root=WIFI');
    } else {
      Linking.sendIntent('android.settings.WIFI_SETTINGS');
    }
  };

  const content = (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[COLORS.gold]}
          tintColor={COLORS.gold}
        />
      }
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="cloud-offline-outline" size={80} color={COLORS.greyMedium} />
        </View>
        
        <Text style={styles.title}>No Internet Connection</Text>
        <Text style={styles.subtitle}>
          Please check your network settings and try again. Pull down to refresh.
        </Text>

        <TouchableOpacity style={styles.primaryButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color={COLORS.white} />
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={openNetworkSettings}>
          <Ionicons name="settings-outline" size={20} color={COLORS.gold} />
          <Text style={styles.secondaryButtonText}>Open Network Settings</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (!fullScreen) {
    return <View style={styles.container}>{content}</View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      {content}
    </SafeAreaView>
  );
};

const getStyles = (COLORS: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.offWhite,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.greyDark,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.greyMedium,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gold,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    marginBottom: 16,
    gap: 8,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    gap: 8,
  },
  secondaryButtonText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '600',
  },
});
