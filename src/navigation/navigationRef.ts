// src/navigation/navigationRef.ts
// Global navigation ref used outside of React component tree (e.g., in hooks & push handlers)
import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
