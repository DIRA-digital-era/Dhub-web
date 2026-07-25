// src/screens/landlord/BookingsScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../utils/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { NetworkDisconnectedScreen } from '../../components/NetworkDisconnectedScreen';

const BookingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { colors: themeColors, isDark } = useTheme();

  const colors = React.useMemo(() => ({
    background: themeColors.background,
    card: themeColors.card,
    border: themeColors.border,
    primary: themeColors.primary,
    text: themeColors.text,
    textSecondary: themeColors.textSecondary,
    pendingBg: isDark ? '#F59E0B20' : '#FFF3CD',
    confirmedBg: isDark ? '#10B98120' : '#D4EDDA',
    cancelledBg: isDark ? '#EF444420' : '#F8D7DA',
    success: '#10B981',
    error: themeColors.error,
  }), [themeColors, isDark]);

  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    if (user) fetchBookings();
  }, [user]);

  const fetchBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      // Clean up any expired/stale bookings before fetching
      await supabase.rpc('clean_expired_bookings');

      // Fetch bookings for this landlord's listings
      const { data: listings, error: listingsError } = await supabase
        .from('listings')
        .select('id')
        .eq('landlord_id', user?.id);

      if (listingsError) throw listingsError;

      const listingIds = listings?.map(l => l.id) || [];
      if (listingIds.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          *,
          listings!inner(title, price),
          students:student_id (full_name, email)
        `)
        .in('listing_id', listingIds)
        .order('created_at', { ascending: false });

      if (bookingsError) throw bookingsError;
      setBookings(bookingsData || []);
    } catch (err: any) {
      console.error('Error fetching bookings:', err);
      setError(err.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  // handleStatusUpdate removed – now using ApprovalScreen

  if (error && bookings.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bookings</Text>
          <View style={{ width: 24 }} />
        </View>
        <NetworkDisconnectedScreen onRefresh={fetchBookings} refreshing={loading} fullScreen={false} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bookings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchBookings}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {loading && bookings.length === 0 ? (
          <Text style={styles.loadingText}>Loading bookings...</Text>
        ) : bookings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyStateText}>No bookings yet</Text>
            <Text style={styles.emptyStateSubtext}>
              When students book your properties, they'll appear here
            </Text>
          </View>
        ) : (
          bookings.map(booking => (
            <TouchableOpacity 
              key={booking.id} 
              style={styles.bookingCard}
              onPress={() => (navigation as any).navigate('ApprovalScreen', { bookingId: booking.id })}
            >
              <View style={styles.bookingHeader}>
                <Text style={styles.propertyName}>
                  {booking.listings?.title}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    booking.status === 'confirmed' && styles.confirmed,
                    booking.status === 'pending' && styles.pending,
                    booking.status === 'cancelled' && styles.cancelled,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {(booking.approval_status === 'approved' && booking.status === 'pending')
                      ? 'PENDING PAYMENT'
                      : booking.status?.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.studentInfo}>
                {booking.students?.full_name} • {booking.students?.email}
              </Text>

              <View style={styles.bookingDates}>
                <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                <Text style={styles.dateText}>
                  {new Date(booking.start_date).toLocaleDateString()} -{' '}
                  {new Date(booking.end_date).toLocaleDateString()}
                </Text>
              </View>

              <Text style={styles.priceText}>
                {booking.amount || booking.listings?.price} FCFA
              </Text>

              {booking.status === 'pending' && (
                <Text style={{ color: colors.primary, marginTop: 12, textAlign: 'center', fontWeight: 'bold' }}>
                  Tap to Review Request
                </Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
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
  content: { flex: 1, padding: 20 },
  loadingText: { color: colors.textSecondary, textAlign: 'center', marginTop: 20 },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyStateText: { color: colors.text, fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptyStateSubtext: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  bookingCard: { backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  bookingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  propertyName: { color: colors.text, fontSize: 16, fontWeight: 'bold', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  pending: { backgroundColor: colors.pendingBg },
  confirmed: { backgroundColor: colors.confirmedBg },
  cancelled: { backgroundColor: colors.cancelledBg },
  statusText: { fontSize: 12, fontWeight: '600', color: colors.text },
  studentInfo: { color: colors.textSecondary, fontSize: 14, marginBottom: 8 },
  bookingDates: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  dateText: { color: colors.text, fontSize: 14 },
  priceText: { color: colors.primary, fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  actionButtons: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  acceptBtn: { backgroundColor: colors.success },
  declineBtn: { backgroundColor: colors.error },
  acceptBtnText: { color: colors.background, fontWeight: '600' },
  declineBtnText: { color: colors.background, fontWeight: '600' },
});

export default BookingsScreen;
