// App.tsx
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Provider, useSelector } from "react-redux";
import SplashScreen from "./SplashScreen";
import AuthListener from "./src/components/AuthListener";
import { useVersionCheck } from "./src/hooks/useVersionCheck";
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

import { Platform, View, StyleSheet } from "react-native";
import GlobalNotification from "./src/components/GlobalNotification";

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

  const isWebDesktop = Platform.OS === 'web';

  const appContent = (
    <Provider store={store}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AuthListener />
          <GlobalNotification />
          <AppGate />
        </NavigationContainer>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </Provider>
  );

  if (isWebDesktop) {
    return (
      <View style={styles.webContainer}>
        <View style={styles.webContent}>
          {appContent}
        </View>
      </View>
    );
  }

  return <View style={{ flex: 1 }}>{appContent}</View>;
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    backgroundColor: '#f5f7fa',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%'
  },
  webContent: {
    width: '100%',
    maxWidth: 480,
    height: '100%',
    maxHeight: 1000,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)' as any, // Cast to any to avoid strict TS errors on older RN Web
  }
});
