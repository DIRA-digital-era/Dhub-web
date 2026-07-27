// src/components/MapView.web.tsx
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

// Load Google Maps Script
let googleMapsPromise: Promise<void> | null = null;
const loadGoogleMapsScript = (apiKey: string): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).google && (window as any).google.maps) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
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
  scrollEnabled?: boolean;   // map to gestureHandling
  zoomEnabled?: boolean;     // map to gestureHandling
  rotateEnabled?: boolean;   // map to gestureHandling
  pitchEnabled?: boolean;    // map to gestureHandling
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
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID || 
                 process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS;// fallback

  useEffect(() => {
    let isMounted = true;
    loadGoogleMapsScript(apiKey).then(() => {
      if (!isMounted || !mapRef.current) return;
      const center = region || initialRegion;
      if (!center) return;

      // Determine gesture handling
      const gestureHandling = (!scrollEnabled && !zoomEnabled && !rotateEnabled && !pitchEnabled)
        ? 'none'
        : 'auto';

      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: center.latitude, lng: center.longitude },
        zoom: 10,
        mapTypeId: mapType === 'satellite' ? 'satellite' : mapType === 'hybrid' ? 'hybrid' : mapType === 'terrain' ? 'terrain' : 'roadmap',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: gestureHandling,
        zoomControl: zoomEnabled,
        rotateControl: rotateEnabled,
        tilt: pitchEnabled ? 45 : 0,
      });

      setMapInstance(map);

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

    return () => { isMounted = false; };
  }, [apiKey, region, initialRegion, mapType, scrollEnabled, zoomEnabled, rotateEnabled, pitchEnabled]);

  // Update map center when region prop changes
  useEffect(() => {
    if (mapInstance && region) {
      mapInstance.panTo({ lat: region.latitude, lng: region.longitude });
    }
  }, [mapInstance, region]);

  return (
    <View style={[styles.container, style]}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
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
      icon: pinColor === 'gold' ? 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png' : undefined,
    });
    if (onPress) marker.addListener('click', onPress);
    if (onDragEnd) {
      marker.addListener('dragend', (e: any) => {
        if (e.latLng) {
          onDragEnd({ nativeEvent: { coordinate: { latitude: e.latLng.lat(), longitude: e.latLng.lng() } } });
        }
      });
    }
    return () => { marker.setMap(null); };
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
    const path = coordinates.map(c => ({ lat: c.latitude, lng: c.longitude }));
    const polyline = new window.google.maps.Polyline({
      path: path,
      strokeColor: strokeColor,
      strokeWeight: strokeWidth,
      map: map,
    });
    return () => { polyline.setMap(null); };
  }, [map, coordinates, strokeColor, strokeWidth]);
  return null;
};

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', height: '100%' },
});

export default MapView;