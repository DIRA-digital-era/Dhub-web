import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

/**
 * ============================================================
 * Google Maps Web Loader
 * ============================================================
 *
 * IMPORTANT:
 * We intentionally use Google's callback mechanism together
 * with loading=async.
 *
 * Google documents that loading=async means the script's
 * load event does NOT guarantee that the Maps API is ready.
 *
 * After the API bootstrap is ready, we explicitly import the
 * libraries we need with google.maps.importLibrary().
 */

let googleMapsPromise: Promise<void> | null = null;

const loadGoogleMapsScript = (apiKey: string): Promise<void> => {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (!apiKey?.trim()) {
    return Promise.reject(
      new Error('Google Maps API key is not configured for the web build.')
    );
  }

  /*
   * If another part of the application already loaded the API,
   * do not inject another script.
   */
  if (
    window.google?.maps &&
    typeof window.google.maps.importLibrary === 'function'
  ) {
    return Promise.resolve();
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise<void>((resolve, reject) => {
    const callbackName = `__dhubGoogleMapsCallback_${Date.now()}`;

    const cleanup = () => {
      try {
        delete (window as any)[callbackName];
      } catch {
        (window as any)[callbackName] = undefined;
      }
    };

    /*
     * Check again in case another component injected the script
     * between the checks above and this Promise execution.
     */
    if (
      window.google?.maps &&
      typeof window.google.maps.importLibrary === 'function'
    ) {
      cleanup();
      resolve();
      return;
    }

    (window as any)[callbackName] = () => {
      cleanup();

      if (
        window.google?.maps &&
        typeof window.google.maps.importLibrary === 'function'
      ) {
        resolve();
      } else {
        googleMapsPromise = null;
        reject(
          new Error(
            'Google Maps loaded, but the Maps JavaScript API is unavailable.'
          )
        );
      }
    };

    const script = document.createElement('script');

    script.src =
      `https://maps.googleapis.com/maps/api/js` +
      `?key=${encodeURIComponent(apiKey)}` +
      `&loading=async` +
      `&callback=${encodeURIComponent(callbackName)}` +
      `&v=weekly`;

    script.async = true;
    script.defer = true;

    script.onerror = () => {
      cleanup();
      googleMapsPromise = null;
      reject(
        new Error(
          'Google Maps JavaScript API failed to load. Check the API key, billing, API restrictions, domain restrictions, and network connection.'
        )
      );
    };

    document.head.appendChild(script);
  });

  return googleMapsPromise;
};

/**
 * ============================================================
 * Types
 * ============================================================
 */

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MapLatLng {
  latitude: number;
  longitude: number;
}

export type MapType =
  | 'standard'
  | 'satellite'
  | 'hybrid'
  | 'terrain';

export interface MarkerProps {
  coordinate: MapLatLng;
  title?: string;
  description?: string;
  pinColor?: string;
  onPress?: () => void;
  draggable?: boolean;
  onDragEnd?: (event: {
    nativeEvent: {
      coordinate: MapLatLng;
    };
  }) => void;
}

export interface PolylineProps {
  coordinates: MapLatLng[];
  strokeColor?: string;
  strokeWidth?: number;
}

/**
 * ============================================================
 * Map Context
 * ============================================================
 */

interface MapContextValue {
  map: any | null;
  infoWindow: any | null;
}

const MapContext = createContext<MapContextValue>({
  map: null,
  infoWindow: null,
});

/**
 * ============================================================
 * MapView
 * ============================================================
 */

interface MapViewProps {
  region?: MapRegion;
  initialRegion?: MapRegion;

  liteMode?: boolean;

  mapType?: MapType;

  customMapStyle?: any[];

  children?: React.ReactNode;

  style?: any;

  showsUserLocation?: boolean;

  followsUserLocation?: boolean;

  onPress?: (event: {
    nativeEvent: {
      coordinate: MapLatLng;
    };
  }) => void;

  onRegionChangeComplete?: (region: MapRegion) => void;

  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
}

export const MapView: React.FC<MapViewProps> = ({
  region,
  initialRegion,
  mapType = 'standard',
  customMapStyle,
  children,
  style,
  showsUserLocation = false,
  followsUserLocation = false,
  onRegionChangeComplete,
  onPress,
  scrollEnabled = true,
  zoomEnabled = true,
  rotateEnabled = true,
  pitchEnabled = true,
}) => {
  const mapRef = useRef<HTMLDivElement | null>(null);

  const [mapInstance, setMapInstance] = useState<any>(null);
  const [infoWindow, setInfoWindow] = useState<any>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isMapInitialized = useRef(false);

  /*
   * Keep the latest callbacks without forcing the map itself
   * to be recreated whenever the parent renders.
   */
  const onPressRef = useRef(onPress);
  const onRegionChangeCompleteRef =
    useRef(onRegionChangeComplete);

  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    onRegionChangeCompleteRef.current =
      onRegionChangeComplete;
  }, [onRegionChangeComplete]);

  /*
   * WEB ONLY.
   *
   * Android/iOS keys must not be used as a fallback for the
   * browser. The browser needs the browser-restricted key.
   */
  const apiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_WEB;

  /**
   * ==========================================================
   * Initialize Google Maps
   * ==========================================================
   */

  useEffect(() => {
    let isMounted = true;

    const initializeMap = async () => {
      setIsLoading(true);
      setLoadError(null);

      if (!apiKey?.trim()) {
        if (isMounted) {
          setLoadError(
            'Google Maps web API key is not configured.'
          );
          setIsLoading(false);
        }
        return;
      }

      try {
        await loadGoogleMapsScript(apiKey);

        if (!isMounted || !mapRef.current) {
          return;
        }

        if (isMapInitialized.current) {
          return;
        }

        /*
         * Explicitly request the Maps library.
         *
         * This is the important fix for:
         *
         * window.google.maps.Map is not a constructor
         */
        const mapsLibrary =
          await window.google.maps.importLibrary('maps');

        const MapConstructor =
          (mapsLibrary as any).Map;

        const InfoWindowConstructor =
          (mapsLibrary as any).InfoWindow;

        if (typeof MapConstructor !== 'function') {
          throw new Error(
            'Google Maps loaded, but the Map constructor is unavailable.'
          );
        }

        /*
         * IMPORTANT:
         * There is intentionally NO arbitrary geographic fallback.
         *
         * MapView must receive region or initialRegion.
         */
        const center = region ?? initialRegion;

        if (!center) {
          throw new Error(
            'MapView requires either region or initialRegion.'
          );
        }

        isMapInitialized.current = true;

        const gestureHandling =
          !scrollEnabled &&
            !zoomEnabled &&
            !rotateEnabled &&
            !pitchEnabled
            ? 'none'
            : 'greedy';

        const mapOptions: any = {
          center: {
            lat: center.latitude,
            lng: center.longitude,
          },

          zoom: regionToZoom(center),

          mapTypeId: getGoogleMapType(mapType),

          mapTypeControl: false,

          streetViewControl: false,

          fullscreenControl: false,

          gestureHandling,

          zoomControl: zoomEnabled,

          rotateControl: rotateEnabled,

          tilt: pitchEnabled ? undefined : 0,
        };

        /*
         * Only apply custom styling when supplied.
         */
        if (
          Array.isArray(customMapStyle) &&
          customMapStyle.length > 0
        ) {
          mapOptions.styles = customMapStyle;
        }

        const map = new MapConstructor(
          mapRef.current,
          mapOptions
        );

        const windowInstance =
          typeof InfoWindowConstructor === 'function'
            ? new InfoWindowConstructor()
            : null;

        /**
         * Map click listener.
         */
        const clickListener = map.addListener(
          'click',
          (event: any) => {
            const latLng = event?.latLng;

            if (!latLng) {
              return;
            }

            const coordinate = {
              latitude: latLng.lat(),
              longitude: latLng.lng(),
            };

            onPressRef.current?.({
              nativeEvent: {
                coordinate,
              },
            });
          }
        );

        /**
         * Map idle listener.
         *
         * This reports the current center to the React Native
         * compatibility layer.
         */
        const idleListener = map.addListener(
          'idle',
          () => {
            const currentCenter = map.getCenter();

            if (!currentCenter) {
              return;
            }

            const currentZoom =
              map.getZoom?.() ?? 12;

            onRegionChangeCompleteRef.current?.({
              latitude: currentCenter.lat(),
              longitude: currentCenter.lng(),
              ...zoomToRegionDelta(currentZoom),
            });
          }
        );

        if (isMounted) {
          setMapInstance(map);
          setInfoWindow(windowInstance);
          setIsLoading(false);
        }

        return () => {
          clickListener?.remove?.();
          idleListener?.remove?.();

          windowInstance?.close?.();

          /*
           * Google Maps does not require an explicit map
           * destructor. Removing listeners and releasing the
           * React reference is sufficient here.
           */
        };
      } catch (error) {
        console.error(
          '[MapView.web] Google Maps initialization failed:',
          error
        );

        isMapInitialized.current = false;

        if (isMounted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Google Maps could not be initialized.'
          );

          setIsLoading(false);
        }
      }
    };

    let cleanup: (() => void) | undefined;

    void initializeMap().then((result) => {
      cleanup = result;
    });

    return () => {
      isMounted = false;
      isMapInitialized.current = false;
      cleanup?.();
    };
  }, [apiKey]);

  /**
   * ==========================================================
   * Update map type
   * ==========================================================
   */

  useEffect(() => {
    if (!mapInstance) {
      return;
    }

    mapInstance.setMapTypeId(
      getGoogleMapType(mapType)
    );
  }, [mapInstance, mapType]);

  /**
   * ==========================================================
   * Update custom styling
   * ==========================================================
   */

  useEffect(() => {
    if (!mapInstance) {
      return;
    }

    mapInstance.setOptions({
      styles:
        Array.isArray(customMapStyle) &&
          customMapStyle.length > 0
          ? customMapStyle
          : undefined,
    });
  }, [mapInstance, customMapStyle]);

  /**
   * ==========================================================
   * Update map center
   * ==========================================================
   *
   * We only react to an externally controlled region.
   *
   * initialRegion is used only during initialization.
   */

  useEffect(() => {
    if (!mapInstance || !region) {
      return;
    }

    const currentCenter = mapInstance.getCenter();

    const sameCenter =
      currentCenter &&
      Math.abs(currentCenter.lat() - region.latitude) <
      0.000001 &&
      Math.abs(currentCenter.lng() - region.longitude) <
      0.000001;

    if (!sameCenter) {
      mapInstance.panTo({
        lat: region.latitude,
        lng: region.longitude,
      });

      const zoom = regionToZoom(region);

      if (
        Number.isFinite(zoom) &&
        mapInstance.getZoom?.() !== zoom
      ) {
        mapInstance.setZoom(zoom);
      }
    }
  }, [mapInstance, region]);

  /**
   * ==========================================================
   * Browser user location
   * ==========================================================
   *
   * This supports showsUserLocation on web.
   *
   * The actual MapPickerModal already obtains location through
   * requestLocationPermission(), so this is primarily a
   * compatibility implementation for other MapView consumers.
   */

  useEffect(() => {
    if (
      !mapInstance ||
      !showsUserLocation ||
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      return;
    }

    let cancelled = false;
    let userMarker: any = null;

    const showLocation = async () => {
      try {
        const { AdvancedMarkerElement, PinElement } =
          (await window.google.maps.importLibrary(
            'marker'
          )) as any;

        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (cancelled) {
              return;
            }

            const coordinate = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };

            const pin = new PinElement({
              background: '#4285F4',
              borderColor: '#ffffff',
              glyphColor: '#ffffff',
              scale: 0.8,
            });

            userMarker = new AdvancedMarkerElement({
              map: mapInstance,
              position: coordinate,
              content: pin.element,
              title: 'Your location',
            });

            if (followsUserLocation) {
              mapInstance.panTo(coordinate);
            }
          },
          (error) => {
            console.warn(
              '[MapView.web] Browser location unavailable:',
              error.message
            );
          },
          {
            enableHighAccuracy: true,
            maximumAge: 30000,
            timeout: 10000,
          }
        );
      } catch (error) {
        console.warn(
          '[MapView.web] Unable to create user location marker:',
          error
        );
      }
    };

    void showLocation();

    return () => {
      cancelled = true;

      if (userMarker) {
        userMarker.map = null;
      }
    };
  }, [
    mapInstance,
    showsUserLocation,
    followsUserLocation,
  ]);

  /**
   * ==========================================================
   * Loading state
   * ==========================================================
   */

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          style,
          styles.center,
        ]}
      >
        <ActivityIndicator
          size="large"
          color="#D4AF37"
        />

        <Text style={styles.loadingText}>
          Loading map...
        </Text>
      </View>
    );
  }

  /**
   * ==========================================================
   * Error state
   * ==========================================================
   */

  if (loadError) {
    return (
      <View
        style={[
          styles.container,
          style,
          styles.center,
        ]}
      >
        <Text style={styles.errorTitle}>
          Map Unavailable
        </Text>

        <Text style={styles.errorText}>
          {loadError}
        </Text>
      </View>
    );
  }

  /**
   * ==========================================================
   * Render
   * ==========================================================
   */

  return (
    <View
      style={styles.container}
      pointerEvents="auto"
    >
      <div
        ref={mapRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 200,
          touchAction: 'none',
        }}
      />

      <MapContext.Provider
        value={{
          map: mapInstance,
          infoWindow,
        }}
      >
        {mapInstance && children}
      </MapContext.Provider>
    </View>
  );
};

/**
 * ============================================================
 * Marker
 * ============================================================
 *
 * Uses Google's current AdvancedMarkerElement API.
 *
 * Advanced markers require the marker library and a map ID.
 *
 * DEMO_MAP_ID is supported by Google for testing.
 * Replace it with the DHUB production map ID when one is
 * created in Google Cloud.
 */

export const Marker: React.FC<MarkerProps> = ({
  coordinate,
  title,
  description,
  pinColor = '#EA4335',
  onPress,
  onDragEnd,
  draggable = false,
}) => {
  const { map, infoWindow } =
    useContext(MapContext);

  const onPressRef = useRef(onPress);
  const onDragEndRef = useRef(onDragEnd);

  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    onDragEndRef.current = onDragEnd;
  }, [onDragEnd]);

  useEffect(() => {
    if (!map) {
      return;
    }

    let marker: any = null;
    let dragListener: any = null;
    let clickListener: any = null;

    const createMarker = async () => {
      try {
        const {
          AdvancedMarkerElement,
          PinElement,
        } = (await window.google.maps.importLibrary(
          'marker'
        )) as any;

        /*
         * PinElement gives us a real configurable Google Maps
         * pin instead of the old external image URL.
         */
        const pin = new PinElement({
          background: pinColor,
          borderColor: '#ffffff',
          glyphColor: '#ffffff',
        });

        marker = new AdvancedMarkerElement({
          map,
          position: {
            lat: coordinate.latitude,
            lng: coordinate.longitude,
          },
          title: title || undefined,
          content: pin.element,
          gmpDraggable: draggable,
        });

        /**
         * Click:
         *
         * 1. Run the consumer's onPress callback.
         * 2. Display description through Google InfoWindow.
         */
        clickListener = marker.addListener(
          'click',
          () => {
            onPressRef.current?.();

            if (
              infoWindow &&
              (title || description)
            ) {
              const content = document.createElement(
                'div'
              );

              content.style.maxWidth = '280px';
              content.style.fontFamily =
                'Arial, sans-serif';

              if (title) {
                const titleElement =
                  document.createElement('div');

                titleElement.textContent = title;

                titleElement.style.fontWeight = '700';
                titleElement.style.fontSize = '15px';
                titleElement.style.marginBottom =
                  description ? '6px' : '0';

                content.appendChild(titleElement);
              }

              if (description) {
                const descriptionElement =
                  document.createElement('div');

                descriptionElement.textContent =
                  description;

                descriptionElement.style.fontSize =
                  '13px';

                descriptionElement.style.lineHeight =
                  '18px';

                descriptionElement.style.color =
                  '#555';

                content.appendChild(
                  descriptionElement
                );
              }

              infoWindow.setContent(content);

              infoWindow.open({
                map,
                anchor: marker,
              });
            }
          }
        );

        /**
         * AdvancedMarkerElement emits dragend when draggable.
         */
        if (draggable) {
          dragListener = marker.addListener(
            'dragend',
            () => {
              const position =
                marker?.position;

              if (!position) {
                return;
              }

              const latitude =
                typeof position.lat === 'function'
                  ? position.lat()
                  : position.lat;

              const longitude =
                typeof position.lng === 'function'
                  ? position.lng()
                  : position.lng;

              if (
                typeof latitude !== 'number' ||
                typeof longitude !== 'number'
              ) {
                return;
              }

              onDragEndRef.current?.({
                nativeEvent: {
                  coordinate: {
                    latitude,
                    longitude,
                  },
                },
              });
            }
          );
        }
      } catch (error) {
        console.error(
          '[Marker.web] Failed to create marker:',
          error
        );
      }
    };

    void createMarker();

    return () => {
      clickListener?.remove?.();
      dragListener?.remove?.();

      if (marker) {
        marker.map = null;
      }
    };
  }, [
    map,
    infoWindow,
    coordinate.latitude,
    coordinate.longitude,
    title,
    description,
    pinColor,
    draggable,
  ]);

  return null;
};

/**
 * ============================================================
 * Polyline
 * ============================================================
 */

export const Polyline: React.FC<
  PolylineProps
> = ({
  coordinates,
  strokeColor = '#000000',
  strokeWidth = 2,
}) => {
    const { map } = useContext(MapContext);

    useEffect(() => {
      if (
        !map ||
        !coordinates ||
        coordinates.length === 0
      ) {
        return;
      }

      let polyline: any = null;

      const createPolyline = async () => {
        try {
          const { Polyline: GooglePolyline } =
            (await window.google.maps.importLibrary(
              'maps'
            )) as any;

          const path = coordinates.map(
            (coordinate) => ({
              lat: coordinate.latitude,
              lng: coordinate.longitude,
            })
          );

          polyline = new GooglePolyline({
            path,
            geodesic: true,
            strokeColor,
            strokeOpacity: 1,
            strokeWeight: strokeWidth,
            map,
          });
        } catch (error) {
          console.error(
            '[Polyline.web] Failed to create polyline:',
            error
          );
        }
      };

      void createPolyline();

      return () => {
        if (polyline) {
          polyline.setMap(null);
        }
      };
    }, [
      map,
      coordinates,
      strokeColor,
      strokeWidth,
    ]);

    return null;
  };

/**
 * ============================================================
 * Helpers
 * ============================================================
 */

function getGoogleMapType(
  mapType: MapType
): string {
  switch (mapType) {
    case 'satellite':
      return 'satellite';

    case 'hybrid':
      return 'hybrid';

    case 'terrain':
      return 'terrain';

    case 'standard':
    default:
      return 'roadmap';
  }
}

/**
 * Approximate React Native region -> Google Maps zoom.
 *
 * This avoids hardcoding zoom=10 for every DHUB map.
 */
function regionToZoom(
  region: MapRegion
): number {
  const delta = Math.max(
    region.latitudeDelta,
    region.longitudeDelta,
    0.0001
  );

  const zoom =
    Math.log2(360 / delta);

  return Math.max(
    2,
    Math.min(21, Math.round(zoom))
  );
}

/**
 * Approximate Google Maps zoom -> RN region deltas.
 */
function zoomToRegionDelta(
  zoom: number
): {
  latitudeDelta: number;
  longitudeDelta: number;
} {
  const delta =
    360 / Math.pow(2, zoom);

  return {
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

/**
 * ============================================================
 * Styles
 * ============================================================
 */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },

  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F8F9FA',
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#7F8C8D',
  },

  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },

  errorText: {
    maxWidth: 420,
    fontSize: 13,
    lineHeight: 19,
    color: '#7F8C8D',
    textAlign: 'center',
  },
});

export default MapView;