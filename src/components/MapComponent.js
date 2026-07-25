import React from 'react';
import MapView from 'react-native-web-maps';

const MapComponent = () => {
  return (
    <MapView
      style={{ flex: 1, height: 300, width: 300 }}
      latitude={37.78825}
      longitude={-122.4324}
      zoom={13}
    />
  );
};

export default MapComponent;