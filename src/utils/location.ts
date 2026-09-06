// src/utils/location.ts
import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type LatLng = { latitude: number; longitude: number };

/** Try to get low-accuracy location via the browser Geolocation API (fast, no strict permission) */
function getBrowserLocation(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  });
}

export async function requestLocationPermission(): Promise<LatLng | null> {
  try {
    if (Platform.OS === 'web') {
      // On web, try browser Geolocation API directly (low accuracy = fast, no iOS gate issues)
      const loc = await getBrowserLocation();
      return loc; // null means blocked; callers handle fallback
    }

    // Native (iOS/Android)
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return null;
    }

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch (err) {
    console.warn('Error requesting location', err);
    return null;
  }
}
