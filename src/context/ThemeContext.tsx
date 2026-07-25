import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/theme';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextProps {
  mode: ThemeMode;
  isDark: boolean;
  colors: typeof Colors.light;
  setThemeMode: (mode: ThemeMode) => void;
  isThemeLoaded: boolean;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

const THEME_STORAGE_KEY = '@dhub_theme_mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');
  const [isDark, setIsDark] = useState(systemColorScheme === 'dark');
  const [isThemeLoaded, setIsThemeLoaded] = useState(false);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
          setMode(storedTheme as ThemeMode);
        }
      } catch (error) {
        console.error('Failed to load theme preference', error);
      } finally {
        setIsThemeLoaded(true);
      }
    };
    loadTheme();
  }, []);

  const handleSetThemeMode = async (newMode: ThemeMode) => {
    setMode(newMode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
    } catch (error) {
      console.error('Failed to save theme preference', error);
    }
  };

  useEffect(() => {
    if (mode === 'system') {
      setIsDark(systemColorScheme === 'dark');
    } else {
      setIsDark(mode === 'dark');
    }
  }, [mode, systemColorScheme]);

  const colors = isDark ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider value={{ mode, isDark, colors, setThemeMode: handleSetThemeMode, isThemeLoaded }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

