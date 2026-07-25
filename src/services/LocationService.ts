import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '../utils/supabaseClient';

const GEO_AUDIT_TASK = 'GEO_AUDIT_BACKGROUND_TASK';

// Define the background task
TaskManager.defineTask(GEO_AUDIT_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[LocationService] Background task error:', error);
    return;
  }
  if (data) {
    const { locations } = data as any;
    const location = locations[0];
    if (location) {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          // Log coordinates to geo_audit_logs
          await supabase.from('geo_audit_logs').insert({
            user_id: userData.user.id,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            method: 'background',
            notes: 'Caution Refund Geo-Audit Ping'
          });
        }
      } catch (err) {
        console.error('[LocationService] Failed to log location:', err);
      }
    }
  }
});

export const LocationService = {
  /**
   * Starts high-frequency background location tracking for 72-hour audits.
   * Prompts user for foreground and background permissions.
   */
  startGeoAudit: async () => {
    try {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        console.warn('[LocationService] Foreground permission denied');
        return false;
      }
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        console.warn('[LocationService] Background permission denied');
        return false;
      }

      await Location.startLocationUpdatesAsync(GEO_AUDIT_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 15 * 60 * 1000, // Ping every 15 minutes
        distanceInterval: 100, // Or every 100 meters
        deferredUpdatesInterval: 15 * 60 * 1000,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'DHUB Security Audit',
          notificationBody: 'Verifying booking cancellation location data...',
        },
      });
      console.log('[LocationService] Geo-Audit started successfully.');
      return true;
    } catch (err) {
      console.error('[LocationService] Error starting audit:', err);
      return false;
    }
  },

  /**
   * Stops the background tracking.
   */
  stopGeoAudit: async () => {
    try {
      const hasTask = await TaskManager.isTaskRegisteredAsync(GEO_AUDIT_TASK);
      if (hasTask) {
        await Location.stopLocationUpdatesAsync(GEO_AUDIT_TASK);
        console.log('[LocationService] Geo-Audit stopped.');
      }
    } catch (err) {
      console.error('[LocationService] Error stopping audit:', err);
    }
  }
};
