import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  Linking,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { supabase } from '../../utils/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { AppNotification } from '../../types';
import { useTheme } from '../../context/ThemeContext';

import { useTranslation } from 'react-i18next';

const NotificationsScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const userRole = user?.role || 'student'; // Fallback to student
  
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const { colors: themeColors, isDark } = useTheme();
  const colors = React.useMemo(() => ({
    background: themeColors.background,
    card: themeColors.card,
    border: themeColors.border,
    primary: themeColors.primary,
    text: themeColors.text,
    textSecondary: themeColors.textSecondary,
    modalBg: isDark ? '#1E1E1E' : '#FFFFFF',
    modalBodyBg: isDark ? '#2A2A2A' : '#F8F9FA',
    modalTitle: isDark ? '#FFFFFF' : '#1A1A1A',
  }), [themeColors, isDark]);
  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    // Set up Realtime listener
    const channel = supabase
      .channel(`notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new as AppNotification;
            setNotifications((prev) => [newNotif, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as AppNotification;
            setNotifications((prev) => 
              prev.map((n) => (n.id === updated.id ? updated : n))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const markAsRead = async (id: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleClearAll = async () => {
    if (!user || notifications.length === 0) return;
    
    Alert.alert(
      t('notifications.clear_all_confirm_title'),
      t('notifications.clear_all_confirm_msg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { 
          text: t('common.success'), // "Yes" or similar
          onPress: async () => {
            try {
              await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('recipient_id', user.id)
                .eq('is_read', false);
              
              setNotifications((prev) => prev.map(n => ({ ...n, is_read: true })));
            } catch (err) {
              console.error('Error clearing notifications:', err);
            }
          } 
        }
      ]
    );
  };

  const handleNotificationPress = (notification: AppNotification) => {
    setSelectedNotification(notification);
    setModalVisible(true);
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
  };

  const handleAction = () => {
    if (!selectedNotification) return;
    setModalVisible(false);

    const type = selectedNotification.type;
    const bId = selectedNotification.booking_id;
    const lId = selectedNotification.listing_id;
    const isPaymentNotification = typeof type === 'string' && type.toLowerCase().includes('payment');

    if (userRole === 'landlord' && isPaymentNotification) {
      navigation.navigate('Tabs', { screen: 'Payments' });
    } else if ((type === 'booking_update' || type === 'rent_reminder') && bId) {
      if (userRole === 'landlord') {
        navigation.navigate('ApprovalScreen', { bookingId: bId });
      } else {
        navigation.navigate('BookingDetails', { bookingId: bId });
      }
    } else if (type === 'chat_message') {
      const threadId = selectedNotification.data?.threadId;
      const targetStack = userRole === 'landlord' ? 'LandlordStack' : 'StudentStack';
      const targetTabs = userRole === 'landlord' ? 'LandlordTabs' : 'StudentTabs';
      
      navigation.navigate(targetStack, {
        screen: targetTabs,
        params: { screen: 'Chat', params: { threadId } }
      });
    } else if (lId) {
      navigation.navigate('ListingDetails', { listingId: lId });
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'booking_update': return 'calendar-outline';
      case 'rent_reminder': return 'time-outline';
      case 'chat_message': return 'chatbubble-outline';
      case 'system_announcement': return 'notifications-outline';
      default: return 'notifications-outline';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'booking_update': return '#3B82F6';
      case 'rent_reminder': return '#F59E0B';
      case 'chat_message': return '#10B981';
      default: return '#6B7280';
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMins < 60) return t('common.mins_ago', { count: diffInMins });
    if (diffInHours < 24) return t('common.hours_ago', { count: diffInHours });
    if (diffInDays < 7) return t('common.days_ago', { count: diffInDays });
    return date.toLocaleDateString(t('common.date_locale'));
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
        <TouchableOpacity onPress={handleClearAll}>
          <Text style={styles.clearText}>{t('notifications.clear_all')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyText}>{t('notifications.empty')}</Text>
          </View>
        ) : (
          notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              style={[
                styles.notificationCard,
                !notification.is_read && styles.unreadCard,
              ]}
              onPress={() => handleNotificationPress(notification)}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${getNotificationColor(notification.type)}20` },
                ]}
              >
                <Ionicons
                  name={getNotificationIcon(notification.type)}
                  size={20}
                  color={getNotificationColor(notification.type)}
                />
              </View>

              <View style={styles.notificationContent}>
                <Text style={styles.notificationTitle}>{notification.title}</Text>
                <Text style={styles.notificationMessage} numberOfLines={2}>{notification.body}</Text>
                <Text style={styles.notificationTime}>{formatTime(notification.created_at)}</Text>
              </View>

              {!notification.is_read && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {selectedNotification && (
        <Modal
          visible={modalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={[
                  styles.modalIcon, 
                  { backgroundColor: `${getNotificationColor(selectedNotification.type)}20` }
                ]}>
                  <Ionicons 
                    name={getNotificationIcon(selectedNotification.type)} 
                    size={24} 
                    color={getNotificationColor(selectedNotification.type)} 
                  />
                </View>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.modalTitle}>{selectedNotification.title}</Text>
              <Text style={styles.modalTime}>{new Date(selectedNotification.created_at).toLocaleString(t('common.date_locale'))}</Text>
              
              <View style={styles.modalBody}>
                <Markdown
                  style={{
                    body: { color: colors.modalTitle, fontSize: 16, lineHeight: 24 },
                    link: { color: colors.primary, textDecorationLine: 'underline', fontWeight: 'bold' },
                  }}
                  onLinkPress={(url) => {
                    Linking.openURL(url);
                    return true;
                  }}
                >
                  {selectedNotification.body}
                </Markdown>
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity 
                  style={[styles.actionButton, { backgroundColor: getNotificationColor(selectedNotification.type) }]}
                  onPress={handleAction}
                >
                  <Text style={styles.actionButtonText}>
                    {selectedNotification.type === 'booking_update' || selectedNotification.type.toLowerCase().includes('payment') ? t('notifications.view_details') :
                     selectedNotification.type === 'chat_message' ? t('notifications.reply_now') : t('notifications.dismiss')}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: 'bold' },
  clearText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  content: { flex: 1, padding: 20 },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
  },
  unreadCard: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  iconContainer: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  notificationContent: { flex: 1 },
  notificationTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  notificationMessage: { color: colors.textSecondary, fontSize: 14, marginBottom: 4, lineHeight: 20 },
  notificationTime: { color: colors.textSecondary, fontSize: 12 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.primary, marginLeft: 8, marginTop: 8,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalContent: {
    width: '100%', backgroundColor: colors.modalBg, borderRadius: 24, padding: 24,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modalIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { color: colors.modalTitle, fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  modalTime: { color: colors.textSecondary, fontSize: 13, marginBottom: 20 },
  modalBody: { backgroundColor: colors.modalBodyBg, padding: 16, borderRadius: 12, marginBottom: 24 },
  modalFooter: { gap: 12 },
  actionButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16, gap: 8,
  },
  actionButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, height: 400, justifyContent: 'center', alignItems: 'center', opacity: 0.5 },
  emptyText: { color: colors.text, fontSize: 16, marginTop: 16, fontWeight: '500' },
});

export default NotificationsScreen;
