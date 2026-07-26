// src/utils/upload.ts
import { Platform } from 'react-native';

let uploadImpl: any;

if (Platform.OS === 'web') {
  // Use the web implementation
  uploadImpl = require('./upload.web');
} else {
  // Use the native implementation
  uploadImpl = require('./upload.native');
}

export const uploadListingMedia = uploadImpl.uploadListingMedia;
export const abortUpload = uploadImpl.abortUpload;