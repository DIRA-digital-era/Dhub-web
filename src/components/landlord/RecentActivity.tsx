// src/components/landlord/RecentActivity.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { supabase } from '../../utils/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

import { RootNavigationProp } from '../../types'; // import your shared types if needed

import { useNavigation } from '@react-navigation/native';
import { LandlordStackNavigationProp } from '../../types';

interface Props {
  landlordId: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: 'booking_update' | 'rent_reminder' | 'system_announcement' | 'chat_message';
  listing_id?: string | null;
  booking_id?: string | null;
  is_read: boolean;
  created_at: string;
}

const RecentActivity: React.FC<Props> = ({ landlordId }) => {
  const navigation = useNavigation<LandlordStackNavigationProp>();
  const { colors } = useTheme();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!landlordId) return;

    fetchNotifications();
const subscription = supabase
  .channel(`notifications:landlord:${landlordId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `recipient_id=eq.${landlordId}`,
    },
    (payload) => {
      const raw = payload.new as Record<string, any>;

      // Map to NotificationItem
      const newNotif: NotificationItem = {
        id: String(raw.id),
        title: String(raw.title),
        body: String(raw.body),
        type: raw.type as NotificationItem['type'], // safe cast
        listing_id: raw.listing_id ?? null,
        booking_id: raw.booking_id ?? null,
        is_read: Boolean(raw.is_read),
        created_at: String(raw.created_at),
      };

      // Only landlord-relevant types
      if (
        newNotif.type === 'booking_update' ||
        newNotif.type === 'rent_reminder' ||
        newNotif.type === 'system_announcement' ||
        newNotif.type === 'chat_message'
      ) {
        setNotifications((prev) => [newNotif, ...prev]);
      }
    }
  )
  .subscribe();


    return () => {
      supabase.removeChannel(subscription);
    };
  }, [landlordId]);

const fetchNotifications = async () => {
  setLoading(true);
  try {
    const { data, error } = await supabase
      .from('notifications') // no generics here
      .select('*')
      .eq('recipient_id', landlordId)
      .eq('recipient_role', 'landlord')
      .in('type', [
        'booking_update',
        'rent_reminder',
        'system_announcement',
        'chat_message',
      ])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Cast the raw data safely to NotificationItem[]
    const formatted: NotificationItem[] = (data ?? []).map((n: any) => ({
      id: String(n.id),
      title: String(n.title),
      body: String(n.body),
      type: n.type as NotificationItem['type'],
      listing_id: n.listing_id ?? null,
      booking_id: n.booking_id ?? null,
      is_read: Boolean(n.is_read),
      created_at: String(n.created_at),
    }));

    setNotifications(formatted);
  } catch (err) {
    console.error('Failed fetching landlord notifications', err);
  } finally {
    setLoading(false);
  }
};


  const getActivityIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'booking_update':
        return 'calendar-outline';
      case 'rent_reminder':
        return 'time-outline';
      case 'chat_message':
        return 'chatbubble-outline';
      case 'system_announcement':
        return 'notifications-outline';
      default:
        return 'notifications-outline';
    }
  };

  const getActivityColor = (type: NotificationItem['type']) => {
    switch (type) {
      case 'booking_update':
        return '#3B82F6';
      case 'rent_reminder':
        return '#F59E0B';
      case 'chat_message':
        return '#10B981';
      case 'system_announcement':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  const handlePress = async (notif: NotificationItem) => {
    // 1. Mark as read locally and in DB
    if (!notif.is_read) {
      setNotifications(prev => 
        prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n)
      );
      try {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notif.id);
      } catch (err) {
        console.error('Error marking as read from dashboard:', err);
      }
    }

    // 2. Navigate
    if (notif.type === 'booking_update' && notif.booking_id) {
      navigation.navigate('ApprovalScreen', { bookingId: notif.booking_id });
    } else if (notif.type === 'chat_message') {
      // Logic for chat navigation
      navigation.navigate('Tabs', { screen: 'Chat' });
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
      </View>
    );
  }

  if (!landlordId) {
    return (
      <View style={styles.container}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>User not available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
      <ScrollView style={styles.activityList}>
        {notifications.length === 0 ? (
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>No recent activity</Text>
        ) : (
          notifications.map((notif) => (
            <TouchableOpacity
              key={notif.id}
              style={[styles.activityItem, { backgroundColor: colors.card }]}
              onPress={() => handlePress(notif)}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${getActivityColor(notif.type)}20` },
                ]}
              >
                <Ionicons
                  name={getActivityIcon(notif.type)}
                  size={16}
                  color={getActivityColor(notif.type)}
                />
              </View>
              <View style={styles.activityContent}>
                <Text style={[styles.activityMessage, { color: colors.text }]}>{notif.title}</Text>
                <Text style={[styles.activityTime, { color: colors.textSecondary }]}>
                  {new Date(notif.created_at).toLocaleDateString()} •{' '}
                  {new Date(notif.created_at).toLocaleTimeString()}
                </Text>
              </View>
              {!notif.is_read && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  loadingText: { textAlign: 'center', marginVertical: 20 },
  activityList: { maxHeight: 300 },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: { flex: 1 },
  activityMessage: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
  activityTime: { fontSize: 12 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D4AF37' },
});

export default RecentActivity;
