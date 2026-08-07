/**
 * usePaymentSuccessNotifier
 *
 * Mount this once in the landlord tab navigator (or Dashboard) to get
 * instant in-app pop-ups whenever the backend confirms a payment.
 *
 * Flow:
 *   Fapshi webhook → payment.service.ts handleWebhook
 *     → inserts notifications row in Supabase
 *       → Supabase Realtime pushes INSERT to this hook
 *         → Alert.alert + optional navigation
 *
 * No Edge Function or server function is required.
 * The payment backend writes directly to Supabase, and Supabase Realtime
 * delivers it to this hook in real time.
 */
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from './useAuth';
import { triggerPushNotifications } from './usePushNotifications';

type NavigationRef = { navigate: (...args: any[]) => void } | null;

export function usePaymentSuccessNotifier(navigationRef: NavigationRef) {
  const { user } = useAuth();
  // Keep a ref so the channel callback always has the latest nav reference
  const navRef = useRef(navigationRef);
  useEffect(() => { navRef.current = navigationRef; }, [navigationRef]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`payment_notifs_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          const notif = payload.new as {
            id: string;
            type: string;
            title: string;
            body: string;
            listing_id?: string | null;
            booking_id?: string | null;
          };

          // Only pop for payment-related notifications
          if (notif.type !== 'payment_success') return;

          // Flush push notifications queue (marks as sent via edge function)
          triggerPushNotifications().catch(() => {});

          const nav = navRef.current;

          Alert.alert(
            notif.title,
            notif.body,
            [
              { text: 'OK', style: 'cancel' },
              {
                text: 'View',
                onPress: () => {
                  if (!nav) return;

                  if (notif.booking_id) {
                    // Student booking payment → deep-link to BookingDetails
                    nav.navigate('BookingDetails' as any, { bookingId: notif.booking_id });
                  } else if (notif.listing_id) {
                    // Boost or verification → go to manage listings
                    nav.navigate('ManageListings' as never);
                  } else {
                    // Subscription or generic → open Payments tab
                    nav.navigate('Tabs' as any, { screen: 'Payments' });
                  }
                },
              },
            ],
            { cancelable: true }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);
}
