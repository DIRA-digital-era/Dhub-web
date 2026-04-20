// src/services/userCache.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';

const USER_PROFILES_KEY = 'userProfiles';

export async function saveUserProfile(user: User) {
  const raw = await AsyncStorage.getItem(USER_PROFILES_KEY);
  const profiles: Record<string, User> = raw ? JSON.parse(raw) : {};
  profiles[user.id] = user;
  await AsyncStorage.setItem(USER_PROFILES_KEY, JSON.stringify(profiles));
}

export async function getUserProfile(userId: string): Promise<User | undefined> {
  const raw = await AsyncStorage.getItem(USER_PROFILES_KEY);
  const profiles: Record<string, User> = raw ? JSON.parse(raw) : {};
  return profiles[userId];
}
