// src/components/MapPickerModal.web.tsx
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LatLng, requestLocationPermission } from '../utils/location';
import MapView, { Marker, Polyline } from './MapView.web';

interface MapPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onLocationSelected: (coords: LatLng) => void;
  readOnly?: boolean;
  initialLocation?: LatLng;
  disableInteraction?: boolean;
}

const MapPickerModal: React.FC<MapPickerModalProps> = ({
  visible,
  onClose,
  onLocationSelected,
  readOnly = false,
  initialLocation,
  disableInteraction = false,
}) => {
  const [region, setRegion] = useState({
    latitude: initialLocation?.latitude || 3.8480,
    longitude: initialLocation?.longitude || 11.5021,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [markerCoords, setMarkerCoords] = useState<LatLng | null>(initialLocation ?? null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [routeCoords] = useState<LatLng[]>([]);
  const [loading, setLoading] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'hybrid'>('standard');

  useEffect(() => {
    if (visible) {
      setLoading(true);
      requestLocationPermission().then(loc => {
        if (loc) {
          setUserLocation(loc);
          if (!initialLocation) {
            setMarkerCoords(loc);
            setRegion({
              latitude: loc.latitude,
              longitude: loc.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            });
          }
        } else {
          Alert.alert('Permission Denied', 'Cannot access location. Please enable GPS.');
          onClose();
        }
        setLoading(false);
      });
    }
  }, [visible]);

  const handleDragEnd = (e: any) => {
    if (!readOnly && !disableInteraction) {
      const coord = e.nativeEvent.coordinate;
      setMarkerCoords(coord);
    }
  };

  const handleDone = () => {
    if (!markerCoords) {
      Alert.alert('No location selected', 'Tap on the map.');
      return;
    }
    onLocationSelected(markerCoords);
  };

  const toggleMapType = () => {
    const types: ('standard' | 'satellite' | 'hybrid')[] = ['standard', 'satellite', 'hybrid'];
    const current = types.indexOf(mapType);
    setMapType(types[(current + 1) % types.length]);
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        {loading || !region ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#D4AF37" />
            <Text style={styles.loadingText}>Loading map...</Text>
          </View>
        ) : (
          <>
            <MapView
              style={styles.map}
              region={region}
              mapType={mapType}
              showsUserLocation
              scrollEnabled={!disableInteraction}
              zoomEnabled={!disableInteraction}
              rotateEnabled={!disableInteraction}
              pitchEnabled={!disableInteraction}
              onPress={(e: any) => {
                if (!readOnly && !disableInteraction && e.nativeEvent?.coordinate) {
                  setMarkerCoords(e.nativeEvent.coordinate);
                }
              }}
              onRegionChangeComplete={(newRegion: any) => setRegion(newRegion)}
            >
              {markerCoords && (
                <Marker
                  coordinate={markerCoords}
                  draggable={!readOnly && !disableInteraction}
                  onDragEnd={handleDragEnd}
                  title="Listing Location"
                  pinColor={readOnly ? 'gold' : 'red'}
                />
              )}
              {userLocation && readOnly && routeCoords.length > 0 && (
                <Polyline
                  coordinates={routeCoords}
                  strokeColor="gold"
                  strokeWidth={4}
                />
              )}
            </MapView>

            {markerCoords && (
              <View style={styles.coordBox}>
                <Text style={styles.coordText}>
                  Lat: {markerCoords.latitude.toFixed(6)}, Lon: {markerCoords.longitude.toFixed(6)}
                </Text>
              </View>
            )}

            <View style={styles.buttons}>
              <TouchableOpacity style={styles.button} onPress={onClose}>
                <Text style={styles.buttonText}>Close</Text>
              </TouchableOpacity>

              {!readOnly && !disableInteraction && (
                <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={handleDone}>
                  <Text style={[styles.buttonText, { color: '#1A1A1A' }]}>Done</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={[styles.button, styles.mapTypeButton]} onPress={toggleMapType}>
                <Text style={styles.buttonText}>{mapType.toUpperCase()}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16 },
  coordBox: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    alignSelf: 'center',
    backgroundColor: '#fff9e6',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  coordText: { color: '#1A1A1A', fontWeight: '600' },
  buttons: {
    position: 'absolute',
    bottom: 20,
    left: 10,
    right: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  button: {
    backgroundColor: '#2A2A2A',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 4,
  },
  confirmButton: { backgroundColor: '#D4AF37' },
  mapTypeButton: { backgroundColor: '#0066cc' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

export default MapPickerModal;