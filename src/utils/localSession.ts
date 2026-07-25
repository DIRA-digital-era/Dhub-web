// src/lib/localSession.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

const LOCAL_SESSION_KEY = 'localSession';

export async function createLocalSession(
  user: any,
  supabaseTokens?: { access_token: string; refresh_token: string }
) {
  if (!user) {
    // clear session if null
    await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
    return null;
  }

  const sessionObj = {
    ...user,
    localToken: uuid.v4() as string, //  React Native compatible UUID
    supabaseTokens: supabaseTokens || null,
    timestamp: Date.now(),
  };

  await AsyncStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sessionObj));
  return sessionObj;
}

export async function getLocalSession() {
  const raw = await AsyncStorage.getItem(LOCAL_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearLocalSession() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToKeep = ['appLanguage', 'cached_version_config'];
    const keysToRemove = allKeys.filter((key) => !keysToKeep.includes(key));
    
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
    console.log('[clearLocalSession] Wiped all user-specific cache keys:', keysToRemove);
  } catch (err) {
    console.warn('[clearLocalSession] Failed to clear all keys, falling back', err);
    await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
  }
}
