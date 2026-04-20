// src/screens/landlord/ApprovalScreen.tsx
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../utils/supabaseClient';
import { LandlordStackNavigationProp, LandlordStackParamList } from '../../types';

type ApprovalScreenRouteProp = RouteProp<LandlordStackParamList, 'ApprovalScreen'>;

const ApprovalScreen: React.FC = () => {
  const navigation = useNavigation<LandlordStackNavigationProp>();
  const route = useRoute<ApprovalScreenRouteProp>();
  const { bookingId } = route.params;

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [booking, setBooking] = useState<any>(null);

  useEffect(() => {
    fetchBookingDetails();
  }, [bookingId]);

  const fetchBookingDetails = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          listings!inner(title, price, city, address),
          students:student_id (full_name, email, phone)
        `)
        .eq('id', bookingId)
        .single();

      if (error || !data) throw error;
      setBooking(data);
    } catch (err) {
      console.error('[ApprovalScreen] Error fetching booking:', err);
      Alert.alert('Error', 'Failed to load booking details.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (isApprove: boolean) => {
    setUpdating(true);
    try {
      if (isApprove) {
        const { error } = await supabase.from('bookings').update({
          approval_status: 'approved',
          status: 'confirmed'
        }).eq('id', bookingId);

        if (error) throw error;
        Alert.alert('Success', 'Booking approved successfully! The student can now proceed to payment.');
      } else {
        const { error } = await supabase.from('bookings').update({
          approval_status: 'rejected',
          status: 'cancelled'
        }).eq('id', bookingId);

        if (error) throw error;
        Alert.alert('Rejected', 'Booking was rejected.');
      }
      navigation.goBack();
    } catch (err) {
      console.error('[ApprovalScreen] Action error:', err);
      Alert.alert('Error', 'Failed to update booking.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading || !booking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review Booking</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Listing Information</Text>
          <Text style={styles.label}>Title: <Text style={styles.value}>{booking.listings?.title}</Text></Text>
          <Text style={styles.label}>Location: <Text style={styles.value}>{booking.listings?.city}, {booking.listings?.address}</Text></Text>
          <Text style={styles.label}>Base Price: <Text style={styles.value}>{booking.listings?.price} FCFA</Text></Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Student Information</Text>
          <Text style={styles.label}>Name: <Text style={styles.value}>{booking.students?.full_name}</Text></Text>
          <Text style={styles.label}>Email: <Text style={styles.value}>{booking.students?.email}</Text></Text>
          <Text style={styles.label}>Phone: <Text style={styles.value}>{booking.students?.phone || 'N/A'}</Text></Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Booking Details</Text>
          <Text style={styles.label}>Start Date: <Text style={styles.value}>{new Date(booking.start_date).toDateString()}</Text></Text>
          <Text style={styles.label}>End Date: <Text style={styles.value}>{new Date(booking.end_date).toDateString()}</Text></Text>
          <Text style={styles.label}>Duration Type: <Text style={styles.value}>{booking.duration_type || 'N/A'}</Text></Text>
          <Text style={styles.label}>Total Amount: <Text style={styles.value}>{booking.amount || booking.total_amount} FCFA</Text></Text>

          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Status: <Text style={{ color: '#D4AF37' }}>{booking.status?.toUpperCase()}</Text></Text>
            <Text style={styles.label}>Approval: <Text style={{ color: '#aaa' }}>{booking.approval_status?.toUpperCase() || 'PENDING'}</Text></Text>
          </View>
        </View>

        {booking.approval_status === 'pending' || !booking.approval_status ? (
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={[styles.btn, styles.approveBtn]}
              onPress={() => handleAction(true)}
              disabled={updating}
            >
              {updating ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Approve Booking</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.declineBtn]}
              onPress={() => handleAction(false)}
              disabled={updating}
            >
              <Text style={styles.btnText}>Decline/Ignore</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.statusMsg}>
            This booking has already been {booking.approval_status}.
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

export default ApprovalScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1A1A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#2A2A2A' },
  backButtonText: { color: '#D4AF37', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: '#2A2A2A', padding: 16, borderRadius: 12, marginBottom: 16 },
  sectionTitle: { color: '#D4AF37', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  label: { color: '#aaa', fontSize: 14, marginBottom: 6 },
  value: { color: '#fff', fontWeight: '500' },
  actionContainer: { marginTop: 10, gap: 12 },
  btn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  approveBtn: { backgroundColor: '#10B981' },
  declineBtn: { backgroundColor: '#EF4444' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  statusMsg: { color: '#aaa', textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
});
