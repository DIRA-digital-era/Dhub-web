import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../utils/supabaseClient';
import { compareVersions } from '../utils/version';

export type UpdateStatus = 'none' | 'optional' | 'mandatory';

interface VersionConfig {
  min_supported_version: string;
  latest_version: string;
  force_update_after: string | null;
}

const STORAGE_KEY_SKIP_VERSION = 'skipped_update_version';
const STORAGE_KEY_VERSION_CONFIG = 'cached_version_config';

/**
 * Custom hook to check for app updates via Supabase and local version info.
 * Includes offline support by caching the last known configuration.
 */
export function useVersionCheck() {
  const [status, setStatus] = useState<UpdateStatus>('none');
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<VersionConfig | null>(null);

  // Get the current app version from Expo constants
  const currentVersion = Constants.expoConfig?.version || '1.0.0';

  useEffect(() => {
    /**
     * Determines update status based on provided config.
     */
    const determineStatus = (data: VersionConfig) => {
      const isNewerAvailable = compareVersions(currentVersion, data.latest_version) < 0;
      const isBelowMin = compareVersions(currentVersion, data.min_supported_version) < 0;
      const isPastDeadline = data.force_update_after && new Date() > new Date(data.force_update_after);

      // console.log('[VersionCheck] Update check completed');

      if (isBelowMin || (isNewerAvailable && isPastDeadline)) {
        setStatus('mandatory');
      } else if (isNewerAvailable) {
        setStatus('optional');
      } else {
        setStatus('none');
      }
    };

    /**
     * Main check logic. Loads from cache first, then attempts network refresh.
     */
    async function performCheck() {
      try {
        setLoading(true);

        // 1. Load from cache first for immediate response
        const cached = await AsyncStorage.getItem(STORAGE_KEY_VERSION_CONFIG);
        if (cached) {
          try {
            const cachedData = JSON.parse(cached) as VersionConfig;
            if (cachedData && cachedData.latest_version) {
              console.log('[VersionCheck] Loaded from cache');
              setConfig(cachedData);
              determineStatus(cachedData);
            }
          } catch (e) {
            console.error('[VersionCheck] Cache corruption detected:', e);
            await AsyncStorage.removeItem(STORAGE_KEY_VERSION_CONFIG);
          }
        }

        // 2. Check network status
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
          console.log('[VersionCheck] Offline. Using cached values only.');
          setLoading(false);
          return;
        }

        // 3. Attempt network fetch
        console.log('[VersionCheck] Online. Fetching latest config...');
        const { data, error } = await supabase
          .from('app_config')
          .select('min_supported_version, latest_version, force_update_after')
          .single();

        if (error) {
          console.error('[VersionCheck] Fetch error:', error);
          // If we have no cache and fetch fails, we stay at 'none' or 'loading'
        } else if (data) {
          console.log('[VersionCheck] Fetched latest config');
          
          // Update state and cache
          setConfig(data);
          determineStatus(data);
          await AsyncStorage.setItem(STORAGE_KEY_VERSION_CONFIG, JSON.stringify(data));
        }
      } catch (err) {
        console.error('[VersionCheck] Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    }

    performCheck();
  }, [currentVersion]);

  /**
   * Called when user chooses to skip an optional update.
   */
  const skipUpdate = async () => {
    console.log('[VersionCheck] User skipped update for this session.');
    setStatus('none');
  };

  const updateUrl = Platform.OS === 'ios' 
    ? 'https://apps.apple.com/app/idYOUR_APP_ID' 
    : 'market://details?id=YOUR_PACKAGE_NAME';

  return { 
    status, 
    loading, 
    updateUrl, 
    skipUpdate, 
    currentVersion, 
    latestVersion: config?.latest_version, 
    minSupported: config?.min_supported_version,
    forceUpdateAfter: config?.force_update_after 
  };
}
