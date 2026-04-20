// src/screens/landlord/BookingsScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../utils/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';

const BookingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchBookings();
  }, [user]);

  const fetchBookings = async () => {
    setLoading(true);
    try {
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
    } catch (err) {
      console.error('Error fetching bookings:', err);
      Alert.alert('Error', 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  // handleStatusUpdate removed – now using ApprovalScreen

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#D4AF37" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bookings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {loading ? (
          <Text style={styles.loadingText}>Loading bookings...</Text>
        ) : bookings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#666" />
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
                    {booking.status?.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.studentInfo}>
                {booking.students?.full_name} • {booking.students?.email}
              </Text>

              <View style={styles.bookingDates}>
                <Ionicons name="calendar-outline" size={16} color="#D4AF37" />
                <Text style={styles.dateText}>
                  {new Date(booking.start_date).toLocaleDateString()} -{' '}
                  {new Date(booking.end_date).toLocaleDateString()}
                </Text>
              </View>

              <Text style={styles.priceText}>
                {booking.amount || booking.listings?.price} FCFA
              </Text>

              {booking.status === 'pending' && (
                <Text style={{ color: '#D4AF37', marginTop: 12, textAlign: 'center', fontWeight: 'bold' }}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#2A2A2A',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1, padding: 20 },
  loadingText: { color: '#999', textAlign: 'center', marginTop: 20 },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyStateText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptyStateSubtext: { color: '#999', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  bookingCard: { backgroundColor: '#2A2A2A', padding: 16, borderRadius: 12, marginBottom: 12 },
  bookingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  propertyName: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  pending: { backgroundColor: '#F59E0B20' },
  confirmed: { backgroundColor: '#10B98120' },
  cancelled: { backgroundColor: '#EF444420' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
  studentInfo: { color: '#999', fontSize: 14, marginBottom: 8 },
  bookingDates: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  dateText: { color: '#FFFFFF', fontSize: 14 },
  priceText: { color: '#D4AF37', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  actionButtons: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  acceptBtn: { backgroundColor: '#10B981' },
  declineBtn: { backgroundColor: '#EF4444' },
  acceptBtnText: { color: '#FFFFFF', fontWeight: '600' },
  declineBtnText: { color: '#FFFFFF', fontWeight: '600' },
});

export default BookingsScreen;
