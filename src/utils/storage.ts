import AsyncStorage from '@react-native-async-storage/async-storage';

// Web-compatible storage adapter for Supabase
const isWeb = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (isWeb) {
      return window.localStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (isWeb) {
      window.localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (isWeb) {
      window.localStorage.removeItem(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  },
};