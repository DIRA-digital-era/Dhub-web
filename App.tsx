// App.tsx
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Provider, useSelector } from "react-redux";
import SplashScreen from "./SplashScreen";
import AuthListener from "./src/components/AuthListener";
import GlobalNotification from "./src/components/GlobalNotification";
import WebDownloadBanner from './src/components/WebDownloadBanner';
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { usePushNotifications } from "./src/hooks/usePushNotifications";
import { useVersionCheck } from "./src/hooks/useVersionCheck";
import "./src/i18n";
import { navigationRef } from "./src/navigation/navigationRef";
import RootNavigator from "./src/navigation/RootNavigator";
import UpdateRequiredScreen from "./src/screens/common/UpdateRequiredScreen";
import store, { RootState } from "./src/store/store";

/**
 * ✅ This component blocks the app until Supabase session
 * is fully hydrated into Redux.
 */
function AppGate() {
  const isHydrated = useSelector(
    (state: RootState) => state.auth.isHydrated
  );
  const user = useSelector((state: RootState) => state.auth.user);

  // Global Push Notification handler
  usePushNotifications(user?.id);

  const {
    status,
    loading: versionLoading,
    updateUrl,
    skipUpdate,
    forceUpdateAfter,
    currentVersion,
    latestVersion,
    minSupported
  } = useVersionCheck();

  if (!isHydrated || versionLoading) {
    return <SplashScreen />;
  }

  if (status !== 'none') {
    return (
      <UpdateRequiredScreen
        status={status as 'optional' | 'mandatory'}
        currentVersion={currentVersion}
        latestVersion={latestVersion}
        minSupported={minSupported}
        updateUrl={updateUrl}
        forceUpdateAfter={forceUpdateAfter}
        onSkip={skipUpdate}
      />
    );
  }

  return <RootNavigator />;
}

WebBrowser.maybeCompleteAuthSession();

function ThemedApp() {
  const { colors, isDark } = useTheme();

  const baseTheme = isDark ? DarkTheme : DefaultTheme;
  
  const navigationTheme = {
    ...baseTheme,
    dark: isDark,
    colors: {
      ...baseTheme.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      notification: colors.error,
    },
  };

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef} theme={navigationTheme}>
        <AuthListener />
        <GlobalNotification />
        <AppGate />
      </NavigationContainer>
      <StatusBar style={isDark ? "light" : "dark"} />
      <WebDownloadBanner />
    </SafeAreaProvider>
  );
}

export default function App() {
  React.useEffect(() => {
    console.log("[App] Initializing Dhub...");
    console.log("[App] ENV STATUS:", {
      SUPABASE_URL: !!process.env.EXPO_PUBLIC_SUPABASE_URL,
      SUPABASE_KEY: !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      API_URL: !!process.env.EXPO_PUBLIC_API_URL,
      PAYMENT_URL: !!process.env.DIRA_PAYMENT_URL,
    });

    if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
      console.error("[App] CRITICAL: EXPO_PUBLIC_SUPABASE_URL is missing!");
    }
  }, []);

  return (
    <Provider store={store}>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </Provider>
  );
}
