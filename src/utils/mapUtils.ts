// src/utils/mapUtils.ts
import { Platform } from 'react-native';

export function getUrlTileTemplate(): string {
  // Example: Use OpenStreetMap tile server, or your own tile server
  // You can replace with MapTiler or another tile provider
  return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
}

// If you have local tiles stored (e.g /documents/tiles/{z}/{x}/{y}.png), you can set path here
export function getLocalTilePathTemplate(): string | null {
  // null means no local tiles
  // Example pathTemplate: '/storage/emulated/0/tiles/{z}/{x}/{y}.png' for Android
  return null;
}
