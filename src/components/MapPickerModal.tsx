// src/components/MapPickerModal.tsx
import polyline from '@mapbox/polyline'; // decode Google Directions polyline
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import MapView, { MapType, Marker, Polyline, Region } from 'react-native-maps';
import { LatLng, requestLocationPermission } from '../utils/location';

interface MapPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onLocationSelected: (coords: LatLng) => void;
  readOnly?: boolean;              // true for students
  initialLocation?: LatLng;        // listing location
  disableInteraction?: boolean;    // disables dragging/scrolling
}

const GOOGLE_API_KEY = Platform.OS === 'ios'
  ? 'AIzaSyCsoZGBWKi6YE1EDkkz2G3suRA2orqhGQA'
  : 'AIzaSyAyARtsl2_R9zn_payaszS6Qj3Yhws9KD8';

const MapPickerModal: React.FC<MapPickerModalProps> = ({
  visible,
  onClose,
  onLocationSelected,
  readOnly = false,
  initialLocation,
  disableInteraction = false,
}) => {
  const [region, setRegion] = useState<Region | null>(null);
  const [markerCoords, setMarkerCoords] = useState<LatLng | null>(initialLocation ?? null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [loading, setLoading] = useState(false);
  const [mapType, setMapType] = useState<MapType>('standard');
  const routeInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get user location
  const loadUserLocation = useCallback(async () => {
    setLoading(true);
    const loc = await requestLocationPermission();
    if (loc) {
      setUserLocation(loc);
      if (!initialLocation) setMarkerCoords(loc); // fallback for landlords
      setRegion({
        latitude: loc.latitude,
        longitude: loc.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } else {
      Alert.alert('Permission Denied', 'Cannot access location. Please enable GPS.');
      onClose();
    }
    setLoading(false);
  }, [onClose, initialLocation]);

  useEffect(() => {
    if (visible) loadUserLocation();
  }, [visible, loadUserLocation]);

  // Fetch Google Directions route
  const fetchRoute = useCallback(async () => {
    if (!userLocation || !markerCoords) return;
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${userLocation.latitude},${userLocation.longitude}&destination=${markerCoords.latitude},${markerCoords.longitude}&key=${GOOGLE_API_KEY}&mode=driving`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.routes?.length) {
        const points = polyline.decode(data.routes[0].overview_polyline.points);
        const coords: LatLng[] = points.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
        setRouteCoords(coords);
      }
    } catch (err) {
      console.log('Route fetch error', err);
    }
  }, [userLocation, markerCoords]);

  // Update route periodically for "live" effect
    useEffect(() => {
      if (visible && readOnly && userLocation && markerCoords) {
        fetchRoute();
        routeInterval.current = setInterval(fetchRoute, 15000);
      }
      return () => {
        if (routeInterval.current !== null) {
          clearInterval(routeInterval.current as unknown as number);
        }
      };
    }, [visible, readOnly, userLocation, markerCoords, fetchRoute]);

    // Drag marker (landlords only)
  const handleDragEnd = (e: { nativeEvent: { coordinate: LatLng } }) => {
    if (!readOnly && !disableInteraction) setMarkerCoords(e.nativeEvent.coordinate);
  };

  // Done button for landlords
  const handleDone = () => {
    if (!markerCoords) {
      Alert.alert('No location selected', 'Tap on the map.');
      return;
    }
    onLocationSelected(markerCoords);
  };

  // Toggle map type
  const toggleMapType = () => {
    const types: MapType[] = ['standard', 'satellite', 'hybrid'];
    setMapType(types[(types.indexOf(mapType) + 1) % types.length]);
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
              initialRegion={region}
              region={region}
              mapType={mapType}
              showsUserLocation
              showsMyLocationButton={false}
              scrollEnabled={true}
              zoomEnabled={true ? true : false}
              rotateEnabled={!disableInteraction}
              pitchEnabled={!disableInteraction}
              onPress={(e: { nativeEvent: { coordinate: LatLng } }) => {
                              if (!readOnly && !disableInteraction) setMarkerCoords(e.nativeEvent.coordinate);
                            }}
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

            {/* Coordinates box */}
            {markerCoords && (
              <View style={styles.coordBox}>
                <Text style={styles.coordText}>
                  Lat: {markerCoords.latitude.toFixed(6)}, Lon: {markerCoords.longitude.toFixed(6)}
                </Text>
              </View>
            )}

            {/* Buttons */}
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
