import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform, Alert, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../utils/supabaseClient';
import { navigationRef } from '../navigation/navigationRef';

const PUSH_DENIED_TIMESTAMP_KEY = 'push_denied_timestamp';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const usePushNotifications = (userId?: string) => {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Check when the app comes to foreground, just in case permissions changed in Settings
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (userId) {
          checkAndRegisterPushNotifications();
          triggerPushNotifications(); // Flush pending push notifications
        }
      }
      appState.current = nextAppState;
    });

    // Initial check
    if (userId) checkAndRegisterPushNotifications();

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('[usePushNotifications] Notification tapped!', data);
      void handleNotificationTap(data);
    });

    // Also handle notifications received while app is in foreground
    const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      console.log('[usePushNotifications] Foreground notification received:', data);
    });

    return () => {
      subscription.remove();
      if (responseListener.current) {
        responseListener.current.remove();
      }
      foregroundSub.remove();
    };
  }, [userId]);

  const handleNotificationTap = async (data: any) => {
    if (!navigationRef.isReady()) return;
    const type = data?.type;
    const bookingId = data?.bookingId;
    const listingId = data?.listingId;
    const isPaymentNotification = typeof type === 'string' && type.toLowerCase().includes('payment');

    // New push payloads include recipientRole. Look up the current user as a
    // fallback so older notifications still open the correct navigator.
    let role = data?.recipientRole;
    if (!role) {
      const { data: authData } = await supabase.auth.getUser();
      role = authData.user?.user_metadata?.role;
    }

    try {
      if (role === 'landlord') {
        if ((type === 'booking_update' || type === 'rent_reminder') && bookingId) {
          navigationRef.navigate('LandlordStack', {
            screen: 'ApprovalScreen',
            params: { bookingId },
          } as any);
        } else if (isPaymentNotification) {
          navigationRef.navigate('LandlordStack', {
            screen: 'Tabs',
            params: { screen: 'Payments' },
          } as any);
        } else if (listingId) {
          navigationRef.navigate('LandlordStack', {
            screen: 'ListingDetails',
            params: { listingId },
          } as any);
        }
      } else if (type === 'booking_update' && bookingId) {
        navigationRef.navigate('StudentStack', {
          screen: 'BookingDetails',
          params: { bookingId },
        } as any);
      } else if (type === 'favorite_available' && listingId) {
        navigationRef.navigate('StudentStack', {
          screen: 'ListingDetails',
          params: { listingId },
        } as any);
      } else if (type === 'chat_message') {
        navigationRef.navigate('StudentStack', {
          screen: 'StudentTabs',
          params: { screen: 'Chat' },
        } as any);
      } else if (type === 'system_announcement' && listingId) {
        navigationRef.navigate('StudentStack', {
          screen: 'ListingDetails',
          params: { listingId },
        } as any);
      }
    } catch (e) {
      console.warn('[usePushNotifications] Navigation on tap failed:', e);
    }
  };

  const checkAndRegisterPushNotifications = async () => {
    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return;
    }

    try {
      const existingPerm = await Notifications.getPermissionsAsync();
      const existingStatus = existingPerm.status;
      let finalStatus = existingStatus;

      // If user hasn't granted or denied yet (undetermined)
      if (existingStatus !== 'granted') {
        const lastDeniedStr = await AsyncStorage.getItem(PUSH_DENIED_TIMESTAMP_KEY);
        const lastDenied = lastDeniedStr ? parseInt(lastDeniedStr, 10) : 0;
        const now = Date.now();

        // Only prompt if they never denied, or if it's been more than 4 days
        if (existingStatus === 'undetermined' || (now - lastDenied > ONE_DAY_MS)) {
          // Attempt to request via OS
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;

          if (status !== 'granted') {
            await AsyncStorage.setItem(PUSH_DENIED_TIMESTAMP_KEY, now.toString());
            
            // If they explicitly denied, we can prompt them to go to settings
            Alert.alert(
              'Enable Notifications',
              'You previously denied notifications. To stay updated on your rent, bookings, and messages, please enable them in your device settings.',
              [
                { text: 'Not Now', style: 'cancel' },
                { text: 'Go to Settings', onPress: () => Linking.openSettings() }
              ]
            );
          }
        }
      }

      if (finalStatus !== 'granted') {
        return;
      }

      // Permissions granted, get the token!
      const projectId = 'b406baf7-e618-4034-ad00-faee3417387f'; // Add EXPO Project ID here if necessary. Usually expo-notifications handles it via app.json
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;
      console.log('[usePushNotifications] Expo Push Token generated safely.');
      setExpoPushToken(token);

      // Save token to Supabase Auth metadata for the logged-in user
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const currentMetadata = session.user.user_metadata || {};
        if (currentMetadata.expo_push_token !== token) {
          const { error } = await supabase.auth.updateUser({
            data: { expo_push_token: token }
          });
          if (error) {
            console.error('[usePushNotifications] Failed to save push token to auth:', error.message);
          } else {
            console.log('[usePushNotifications] Token successfully saved to user metadata!');
          }
        }
      }

      if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
    } catch (e: any) {
      console.warn('[usePushNotifications] Registration failed:', e.message);
    }
  };

  return { expoPushToken };
};

export const triggerPushNotifications = async () => {
  try {
    const { error } = await supabase.functions.invoke('send-push-notification');
    if (error) console.error('[triggerPushNotifications] Failed to invoke edge function:', error);
  } catch (e) {
    console.warn('[triggerPushNotifications] Error:', e);
  }
};
