// src/utils/location.ts
import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';

export type LatLng = { latitude: number; longitude: number };

export async function requestLocationPermission(): Promise<LatLng | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
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
    Alert.alert('Error', 'Could not fetch location. Try again.');
    return null;
  }
}
