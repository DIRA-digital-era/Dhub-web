import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

// Safely load Google Maps JS API with loading=async
let googleMapsPromise: Promise<void> | null = null;
const loadGoogleMapsScript = (apiKey: string): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).google && (window as any).google.maps) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
  return googleMapsPromise;
};

const MapContext = createContext<any>(null);

interface MapViewProps {
  region?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  initialRegion?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  liteMode?: boolean;
  mapType?: 'standard' | 'satellite' | 'hybrid' | 'terrain';
  customMapStyle?: any[];
  children?: React.ReactNode;
  style?: any;
  showsUserLocation?: boolean;
  followsUserLocation?: boolean;
  onPress?: (e: any) => void;
  onRegionChangeComplete?: (region: any) => void;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
}

export const MapView: React.FC<MapViewProps> = ({
  region,
  initialRegion,
  mapType = 'standard',
  children,
  style,
  onRegionChangeComplete,
  onPress,
  scrollEnabled = true,
  zoomEnabled = true,
  rotateEnabled = true,
  pitchEnabled = true,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const isMapInitialized = useRef(false);
  const apiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_WEB ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS;

  useEffect(() => {
    let isMounted = true;

    loadGoogleMapsScript(apiKey).then(() => {
      // Defensive initialization gate: check component mount state,
      // DOM Element validity, and initialization locks.
      if (!isMounted || !mapRef.current || !(mapRef.current instanceof Element) || isMapInitialized.current) {
        return;
      }

      const center = region || initialRegion;
      if (!center) return;

      isMapInitialized.current = true;

      const gestureHandling =
        !scrollEnabled && !zoomEnabled && !rotateEnabled && !pitchEnabled
          ? 'none'
          : 'greedy';

      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: center.latitude, lng: center.longitude },
        zoom: 10,
        mapTypeId:
          mapType === 'satellite'
            ? 'satellite'
            : mapType === 'hybrid'
              ? 'hybrid'
              : mapType === 'terrain'
                ? 'terrain'
                : 'roadmap',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: gestureHandling,
        zoomControl: zoomEnabled,
        rotateControl: rotateEnabled,
        tilt: 0,
      });

      if (isMounted) {
        setMapInstance(map);
      }

      if (onPress) {
        map.addListener('click', (e: any) => {
          if (e.latLng) {
            onPress({ nativeEvent: { coordinate: { latitude: e.latLng.lat(), longitude: e.latLng.lng() } } });
          }
        });
      }

      if (onRegionChangeComplete) {
        map.addListener('idle', () => {
          const newCenter = map.getCenter();
          if (newCenter) {
            onRegionChangeComplete({
              latitude: newCenter.lat(),
              longitude: newCenter.lng(),
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            });
          }
        });
      }
    });

    return () => {
      isMounted = false;
      isMapInitialized.current = false;
    };
  }, [apiKey]);

  // Dynamically update map type
  useEffect(() => {
    if (mapInstance && mapType) {
      const googleMapType =
        mapType === 'satellite'
          ? 'satellite'
          : mapType === 'hybrid'
            ? 'hybrid'
            : mapType === 'terrain'
              ? 'terrain'
              : 'roadmap';
      mapInstance.setMapTypeId(googleMapType);
    }
  }, [mapInstance, mapType]);

  // Dynamically update map center
  useEffect(() => {
    if (mapInstance && region) {
      mapInstance.panTo({ lat: region.latitude, lng: region.longitude });
    }
  }, [mapInstance, region]);

  return (
    <View style={[styles.container, style]} pointerEvents="auto">
      <div ref={mapRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />
      <MapContext.Provider value={mapInstance}>
        {mapInstance && children}
      </MapContext.Provider>
    </View>
  );
};

export const Marker: React.FC<{
  coordinate: { latitude: number; longitude: number };
  title?: string;
  description?: string;
  pinColor?: string;
  onPress?: () => void;
  draggable?: boolean;
  onDragEnd?: (e: any) => void;
}> = ({ coordinate, title, pinColor = 'red', onPress, onDragEnd, draggable }) => {
  const map = useContext(MapContext);
  useEffect(() => {
    if (!map) return;
    const marker = new window.google.maps.Marker({
      position: { lat: coordinate.latitude, lng: coordinate.longitude },
      map: map,
      title: title,
      draggable: draggable || false,
      // Fixed mixed content error by enforcing HTTPS
      icon: pinColor === 'gold' ? 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png' : undefined,
    });
    if (onPress) marker.addListener('click', onPress);
    if (onDragEnd) {
      marker.addListener('dragend', (e: any) => {
        if (e.latLng) {
          onDragEnd({ nativeEvent: { coordinate: { latitude: e.latLng.lat(), longitude: e.latLng.lng() } } });
        }
      });
    }
    return () => {
      marker.setMap(null);
    };
  }, [map, coordinate.latitude, coordinate.longitude, title, pinColor, draggable]);
  return null;
};

export const Polyline: React.FC<{
  coordinates: { latitude: number; longitude: number }[];
  strokeColor?: string;
  strokeWidth?: number;
}> = ({ coordinates, strokeColor = '#000', strokeWidth = 2 }) => {
  const map = useContext(MapContext);
  useEffect(() => {
    if (!map || coordinates.length === 0) return;
    const path = coordinates.map((c) => ({ lat: c.latitude, lng: c.longitude }));
    const polyline = new window.google.maps.Polyline({
      path: path,
      strokeColor: strokeColor,
      strokeWeight: strokeWidth,
      map: map,
    });
    return () => {
      polyline.setMap(null);
    };
  }, [map, coordinates, strokeColor, strokeWidth]);
  return null;
};

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', height: '100%' },
});

export default MapView;