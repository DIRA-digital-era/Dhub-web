import { showAlert } from './/alert';
// src/utils/location.ts
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

export type LatLng = { latitude: number; longitude: number };

export async function requestLocationPermission(): Promise<LatLng | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      showAlert(
        'Location Permission Needed',
        'Please allow access to your location to pick a point on the map.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ]
      );
      return null;
    }

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch (err) {
    console.error('Error requesting location', err);
    showAlert('Error', 'Could not fetch location. Try again.');
    return null;
  }
}
