// src/screens/landlord/ApprovalScreen.tsx
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { LandlordStackNavigationProp, LandlordStackParamList } from '../../types';
import { supabase } from '../../utils/supabaseClient';
import { triggerPushNotifications } from '../../hooks/usePushNotifications';

type ApprovalScreenRouteProp = RouteProp<LandlordStackParamList, 'ApprovalScreen'>;

const DISPUTE_AGENT_FEE = 5000;

const ApprovalScreen: React.FC = () => {
  const navigation = useNavigation<LandlordStackNavigationProp>();
  const route = useRoute<ApprovalScreenRouteProp>();
  const { bookingId } = route.params;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [booking, setBooking] = useState<any>(null);

  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');

  const [tenantProfile, setTenantProfile] = useState<any>(null);
  const [tenantRating, setTenantRating] = useState<{ avg: number; count: number } | null>(null);
  const [tenantReviewsVisible, setTenantReviewsVisible] = useState(false);
  const [tenantReviews, setTenantReviews] = useState<any[]>([]);

  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

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
          listings!inner(title, price, city, address, cite_id),
          students:student_id (full_name, email, phone)
        `)
        .eq('id', bookingId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        Alert.alert('Not Found', 'This booking no longer exists or you do not have permission to view it.');
        navigation.goBack();
        return;
      }
      setBooking(data);

      // Fetch tenant profile (profession, age)
      const { data: profile } = await supabase
        .from('student_profiles')
        .select('age, profession')
        .eq('user_id', data.student_id)
        .single();
      if (profile) setTenantProfile(profile);

      // Fetch average rating and reviews for the tenant
      const { data: ratings } = await supabase
        .from('student_ratings')
        .select('rating, review, created_at')
        .eq('student_id', data.student_id);

      if (ratings && ratings.length > 0) {
        const sum = ratings.reduce((acc, curr) => acc + curr.rating, 0);
        setTenantRating({ avg: sum / ratings.length, count: ratings.length });
        setTenantReviews(ratings);
      }
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
        const { error } = await supabase.rpc('set_booking_approval', {
          p_booking_id: bookingId,
          p_status: 'approved',
        });

        if (error) throw error;

        // Auto-add tenant to cite_members if listing belongs to a cite
        if (booking.listings?.cite_id) {
          await supabase.from('cite_members').insert({
            cite_id: booking.listings.cite_id,
            tenant_id: booking.student_id,
          });
        }

        Alert.alert('Approved ✓', 'Booking approved! The tenant can now proceed to payment.');
      } else {
        const { error } = await supabase.rpc('set_booking_approval', {
          p_booking_id: bookingId,
          p_status: 'rejected',
        });

        if (error) throw error;
        Alert.alert('Declined', 'Booking was declined.');
      }
      triggerPushNotifications();
      navigation.goBack();
    } catch (err) {
      console.error('[ApprovalScreen] Action error:', err);
      Alert.alert('Error', 'Failed to update booking.');
    } finally {
      setUpdating(false);
    }
  };

  // ─── Option B: Automated Escrow Deduction ────────────────────────────────
  const handleDisputeCaution = () => {
    const currentEscrow = booking.caution_fee || 0;
    const netAfterFee = Math.max(0, currentEscrow - DISPUTE_AGENT_FEE);

    if (currentEscrow < DISPUTE_AGENT_FEE) {
      Alert.alert(
        'Insufficient Escrow',
        `The remaining escrow balance (${currentEscrow.toLocaleString()} FCFA) is below the 5,000 FCFA agent fee required. A dispute cannot be filed.`
      );
      return;
    }

    Alert.alert(
      '⚠️  File Formal Dispute',
      [
        'Initiating a formal dispute will lock XAF 5,000 from the caution pool to cover the cost of a DHUB physical audit. The party found at fault will bear this cost.\n',
        `Current Escrow Balance:   ${currentEscrow.toLocaleString()} FCFA`,
        `Agent Fee (auto-locked):  - 5,000 FCFA`,
        `Net balance after audit:  ${netAfterFee.toLocaleString()} FCFA`,
        '\nA DHUB field agent will be dispatched to physically inspect the property. The audit outcome determines who keeps the net balance.',
      ].join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Dispute',
          style: 'destructive',
          onPress: async () => {
            setUpdating(true);
            try {
              const { error } = await supabase.from('bookings').update({
                caution_status: 'disputed',
                caution_fee: netAfterFee,
                dispute_initiator_id: user?.id,
                dispute_locked_funds: DISPUTE_AGENT_FEE,
              }).eq('id', bookingId);
              if (error) throw error;
              Alert.alert(
                'Dispute Filed ✓',
                `5,000 FCFA is now locked as the DHUB Agent Credit. The net escrow of ${netAfterFee.toLocaleString()} FCFA is frozen pending the field audit.`
              );
              triggerPushNotifications();
              fetchBookingDetails();
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to file dispute. The new columns may need to be migrated first.');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleApproveRefund = () => {
    Alert.alert(
      'Approve Refund',
      'Are you sure there are no damages? This will release the full escrow balance back to the tenant.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve — No Damages',
          onPress: async () => {
            setUpdating(true);
            try {
              const { error } = await supabase.from('bookings').update({
                caution_status: 'refunded',
              }).eq('id', bookingId);
              if (error) throw error;
              Alert.alert('Refund Approved ✓', 'The caution escrow has been released to the tenant.');
              triggerPushNotifications();
              fetchBookingDetails();
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to approve refund.');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  // ─── Landlord Override: Terminate Lease ──────────────────────────────────
  const handleTerminateLease = () => {
    Alert.alert(
      '🛑 Terminate Lease',
      'This will immediately end this tenancy. The tenant\'s "Extend Stay" button will be disabled and both parties will be moved into the Move-Out Handshake. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Terminate Lease',
          style: 'destructive',
          onPress: async () => {
            setUpdating(true);
            try {
              const { error } = await supabase.rpc('terminate_lease', {
                p_booking_id: bookingId
              });

              if (error) throw error;

              Alert.alert(
                'Lease Terminated',
                'The tenancy has ended. Please complete the Move-Out Handshake to finalize the caution refund.'
              );
              triggerPushNotifications();
              fetchBookingDetails();
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to terminate lease.');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const submitRating = async () => {
    setUpdating(true);
    try {
      const { error } = await supabase.from('student_ratings').insert({
        booking_id: bookingId,
        student_id: booking.student_id,
        landlord_id: user?.id,
        rating,
        review,
      });
      if (error) throw error;
      Alert.alert('Rating Submitted ✓', 'Severe low ratings may result in automatic tenant account review.');
      setRatingModalVisible(false);
    } catch (err: any) {
      if (err.code === '23505') {
        Alert.alert('Already Rated', 'You have already submitted a rating for this tenant for this booking.');
        setRatingModalVisible(false);
      } else {
        Alert.alert('Error', 'Failed to submit rating.');
      }
    } finally {
      setUpdating(false);
    }
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading || !booking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ─── Rent time remaining ──────────────────────────────────────────────────
  let rentTimeRemaining = '';
  if (booking.status === 'confirmed') {
    const msLeft = new Date(booking.end_date).getTime() - Date.now();
    if (msLeft > 0) {
      const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
      rentTimeRemaining = daysLeft >= 30 ? `${Math.floor(daysLeft / 30)} Months left` : `${daysLeft} Days left`;
    } else {
      rentTimeRemaining = 'Expired';
    }
  }

  // ─── Caution status label ─────────────────────────────────────────────────
  const cautionStatusLabel: Record<string, string> = {
    held: 'Held in Escrow',
    refund_pending: 'Tenant Requesting Refund',
    refund_queued: '⏳ Refund Processing (72hrs)',
    refund_paused: '⚠️ Refund Paused — Contact Support',
    disputed: '🔒 Under Dispute — Agent Dispatched',
    refunded: '✓ Refunded to Tenant',
    claimed: '✓ Released to Landlord',
    forfeited_bypass: 'Forfeited',
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review Booking</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* ── Listing Info ────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Listing</Text>
          <Text style={styles.label}>Title: <Text style={styles.value}>{booking.listings?.title}</Text></Text>
          <Text style={styles.label}>Location: <Text style={styles.value}>{booking.listings?.city}, {booking.listings?.address}</Text></Text>
          <Text style={styles.label}>Base Price: <Text style={styles.value}>{booking.listings?.price?.toLocaleString()} FCFA</Text></Text>
        </View>

        {/* ── Tenant Info ──────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tenant Information</Text>
          <Text style={styles.label}>Name: <Text style={styles.value}>{booking.students?.full_name}</Text></Text>
          <Text style={styles.label}>Email: <Text style={styles.value}>{booking.students?.email}</Text></Text>
          <Text style={styles.label}>Phone: <Text style={styles.value}>{booking.students?.phone || 'N/A'}</Text></Text>
          <Text style={styles.label}>Profession/Level: <Text style={styles.value}>{tenantProfile?.profession || 'N/A'}</Text></Text>
          <Text style={styles.label}>Age: <Text style={styles.value}>{tenantProfile?.age || 'N/A'}</Text></Text>
          <TouchableOpacity onPress={() => tenantReviews.length > 0 && setTenantReviewsVisible(true)}>
            <Text style={styles.label}>
              Rating:{' '}
              <Text style={[styles.value, tenantReviews.length > 0 && { color: colors.primary, textDecorationLine: 'underline' }]}>
                {tenantRating
                  ? `${tenantRating.avg.toFixed(1)} ★  (${tenantRating.count} reviews) — Tap to read`
                  : 'No ratings yet'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Booking Details ──────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Booking Details</Text>
          <Text style={styles.label}>Start Date: <Text style={styles.value}>{new Date(booking.start_date).toDateString()}</Text></Text>
          <Text style={styles.label}>End Date: <Text style={styles.value}>{new Date(booking.end_date).toDateString()}</Text></Text>
          <Text style={styles.label}>Duration Type: <Text style={styles.value}>{booking.duration_type || 'N/A'}</Text></Text>
          <Text style={styles.label}>Total Amount: <Text style={styles.value}>{(booking.amount || booking.total_amount || 0).toLocaleString()} FCFA</Text></Text>

          {/* Caution Escrow Breakdown */}
          {booking.caution_fee > 0 && (
            <View style={[styles.escrowBox, booking.caution_status === 'disputed' && styles.escrowBoxDisputed]}>
              <Text style={styles.escrowTitle}>Caution Escrow</Text>
              <Text style={[styles.escrowStatus, booking.caution_status === 'disputed' && { color: '#E67E22' }]}>
                {cautionStatusLabel[booking.caution_status] || booking.caution_status}
              </Text>
              <Text style={styles.label}>
                Net Frozen Balance:{' '}
                <Text style={styles.value}>{booking.caution_fee.toLocaleString()} FCFA</Text>
              </Text>
              {booking.caution_status === 'disputed' && booking.dispute_locked_funds > 0 && (
                <Text style={[styles.label, { color: colors.textSecondary, fontSize: 12 }]}>
                  + {booking.dispute_locked_funds.toLocaleString()} FCFA locked as DHUB Agent Credit
                </Text>
              )}
            </View>
          )}

          {/* Rent Time Remaining */}
          {rentTimeRemaining ? (
            <View style={[styles.timeBadge]}>
              <Text style={[styles.label, { color: colors.primary, fontWeight: 'bold' }]}>
                ⏱  Time on Rent: {rentTimeRemaining}
              </Text>
            </View>
          ) : null}

          {/* Status */}
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>
              Platform State:{' '}
              <Text style={{ color: colors.primary, fontWeight: '600' }}>
                {booking.approval_status === 'approved' && booking.status === 'pending'
                  ? 'PENDING PAYMENT'
                  : booking.status?.toUpperCase()}
              </Text>
            </Text>
            <Text style={styles.label}>
              Landlord Decision:{' '}
              <Text style={{ color: colors.textSecondary }}>
                {booking.approval_status?.toUpperCase() || 'PENDING'}
              </Text>
            </Text>
          </View>
        </View>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        {booking.approval_status === 'pending' || !booking.approval_status ? (
          <View style={styles.actionContainer}>
            <TouchableOpacity style={[styles.btn, styles.approveBtn]} onPress={() => handleAction(true)} disabled={updating}>
              {updating ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Approve Booking ✓</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.declineBtn]} onPress={() => handleAction(false)} disabled={updating}>
              <Text style={styles.btnText}>Decline / Ignore</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.statusMsg}>
              This booking has already been {booking.approval_status}.
            </Text>

            {booking.status === 'confirmed' && (
              <View style={styles.actionContainer}>

                {/* Caution: Held — Landlord can dispute */}
                {booking.caution_status === 'held' && (
                  <TouchableOpacity style={[styles.btn, styles.disputeBtn]} onPress={handleDisputeCaution} disabled={updating}>
                    {updating ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Dispute Caution Escrow</Text>}
                  </TouchableOpacity>
                )}

                {/* Caution: Tenant requesting refund — Landlord approves or disputes */}
                {booking.caution_status === 'refund_pending' && (
                  <View style={{ gap: 10, width: '100%', marginBottom: 12 }}>
                    <View style={styles.alertBanner}>
                      <Text style={styles.alertBannerText}>⚠️  Tenant requested Escrow Refund</Text>
                    </View>
                    <TouchableOpacity style={[styles.btn, { backgroundColor: '#27AE60' }]} onPress={handleApproveRefund} disabled={updating}>
                      <Text style={styles.btnText}>Approve Refund (No Damages)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btn, styles.disputeBtn]} onPress={handleDisputeCaution} disabled={updating}>
                      <Text style={styles.btnText}>Dispute Damages</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Caution: Already disputed — info banner */}
                {booking.caution_status === 'disputed' && (
                  <View style={[styles.alertBanner, { backgroundColor: '#E67E2220', borderColor: '#E67E22' }]}>
                    <Text style={[styles.alertBannerText, { color: '#E67E22' }]}>
                      🔒 Dispute Active — A DHUB agent has been dispatched. The net escrow of {booking.caution_fee?.toLocaleString()} FCFA is frozen.
                    </Text>
                  </View>
                )}

                {/* Caution: Refund queued — show 72hr processing message */}
                {booking.caution_status === 'refund_queued' && (
                  <View style={[styles.alertBanner, { backgroundColor: '#2980B920', borderColor: '#2980B9' }]}>
                    <Text style={[styles.alertBannerText, { color: '#2980B9' }]}>
                      ⏳ Refund Queued — The tenant's caution refund (97%) is being processed. It will be disbursed within 72 hours.
                    </Text>
                  </View>
                )}

                {/* Caution: Refund paused by admin — contact support */}
                {booking.caution_status === 'refund_paused' && (
                  <View style={[styles.alertBanner, { backgroundColor: '#C0392B20', borderColor: '#C0392B' }]}>
                    <Text style={[styles.alertBannerText, { color: '#C0392B' }]}>
                      🚫 Refund Paused — This caution refund has been placed on hold by DHUB. Please contact support at support@dhubcmr.com for assistance.
                    </Text>
                  </View>
                )}

                {/* Rate Tenant */}
                <TouchableOpacity style={[styles.btn, styles.rateBtn]} onPress={() => setRatingModalVisible(true)} disabled={updating}>
                  <Text style={styles.btnText}>★  Rate Tenant</Text>
                </TouchableOpacity>

                {/* Landlord Move-In Confirmation */}
                {booking.payment_status === 'completed' && !booking.landlord_confirmation && (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: '#27AE60' }]}
                    onPress={async () => {
                      setUpdating(true);
                      try {
                        const { error } = await supabase.rpc('confirm_handshake_side', {
                          p_booking_id: bookingId,
                          p_role: 'landlord'
                        });
                        if (error) throw error;
                        Alert.alert('Confirmed ✓', 'You have confirmed the tenant has moved in.');
                        triggerPushNotifications();
                        fetchBookingDetails();
                      } catch (err: any) {
                        console.error(err);
                        Alert.alert('Error', err.message || 'Failed to confirm move-in.');
                      } finally {
                        setUpdating(false);
                      }
                    }}
                    disabled={updating}
                  >
                    {updating ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Tenant Has Moved In ✓</Text>}
                  </TouchableOpacity>
                )}

                {booking.landlord_confirmation && (
                  <View style={[styles.btn, { backgroundColor: isDark ? '#1A2E1A' : '#ECF0F1' }]}>
                    <Text style={{ color: '#27AE60', fontWeight: 'bold' }}>✓ Move-In Confirmed by You</Text>
                  </View>
                )}

                {/* Terminate Lease Override */}
                {booking.contract_status !== 'terminated' && booking.contract_status !== 'expired' && (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#C0392B', marginTop: 12 }]}
                    onPress={handleTerminateLease}
                    disabled={updating}
                  >
                    {updating ? <ActivityIndicator color="#C0392B" /> : <Text style={[styles.btnText, { color: '#C0392B' }]}>🛑 Terminate Lease</Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Rate Tenant Modal ─────────────────────────────────────────────── */}
      <Modal visible={ratingModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setRatingModalVisible(false)}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalWrapper}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rate Tenant</Text>
            <Text style={styles.modalSub}>Rate your experience with this tenant (1–5 stars)</Text>
            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity key={star} onPress={() => setRating(star)}>
                  <Text style={[styles.star, star <= rating ? styles.starActive : {}]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.reviewInput}
              placeholder="Leave a review (optional)"
              placeholderTextColor={colors.textSecondary}
              value={review}
              onChangeText={setReview}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setRatingModalVisible(false)} style={styles.modalBtnCancel}>
                <Text style={{ color: colors.text, fontWeight: 'bold' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitRating} style={styles.modalBtnSubmit}>
                {updating ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Submit</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Tenant Reviews Modal ──────────────────────────────────────────── */}
      <Modal visible={tenantReviewsVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setTenantReviewsVisible(false)}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <View style={[styles.modalWrapper, { justifyContent: 'flex-end', padding: 0 }]}>
          <View style={[styles.modalContent, { maxHeight: '80%', width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>Tenant Reviews</Text>
              <TouchableOpacity onPress={() => setTenantReviewsVisible(false)}>
                <Text style={{ color: colors.primary, fontWeight: 'bold' }}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {tenantReviews.map((rev, idx) => (
                <View key={idx} style={{ padding: 12, backgroundColor: colors.background, borderRadius: 8, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: 'bold', color: colors.text }}>
                      {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {new Date(rev.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  {rev.review
                    ? <Text style={{ marginTop: 8, color: colors.text, fontStyle: 'italic' }}>"{rev.review}"</Text>
                    : <Text style={{ marginTop: 8, color: colors.textSecondary }}>No written feedback.</Text>
                  }
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButtonText: { color: colors.primary, fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { color: colors.primary, fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  label: { color: colors.textSecondary, fontSize: 14, marginBottom: 6 },
  value: { color: colors.text, fontWeight: '500' },
  escrowBox: { marginTop: 10, padding: 12, backgroundColor: colors.background, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  escrowBoxDisputed: { borderColor: '#E67E22', backgroundColor: isDark ? '#2A1800' : '#FFF3E0' },
  escrowTitle: { color: colors.text, fontWeight: 'bold', marginBottom: 4 },
  escrowStatus: { color: colors.primary, fontWeight: '600', marginBottom: 6 },
  timeBadge: { marginTop: 12, padding: 8, backgroundColor: colors.primary + '20', borderRadius: 8 },
  actionContainer: { marginTop: 10, gap: 12 },
  btn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  approveBtn: { backgroundColor: colors.success },
  declineBtn: { backgroundColor: colors.error },
  disputeBtn: { backgroundColor: '#E67E22' },
  rateBtn: { backgroundColor: colors.secondary || colors.primary },
  btnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  statusMsg: { color: colors.textSecondary, textAlign: 'center', marginTop: 20, fontStyle: 'italic', marginBottom: 10 },
  alertBanner: { padding: 12, backgroundColor: isDark ? '#2A1A00' : '#FFF3CD', borderRadius: 8, borderWidth: 1, borderColor: '#F39C12' },
  alertBannerText: { color: '#E67E22', fontWeight: '600', textAlign: 'center' },
  modalOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.overlay },
  modalWrapper: { flex: 1, justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.card, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.primary, fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  modalSub: { color: colors.textSecondary, fontSize: 14, marginBottom: 20 },
  starsContainer: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 20 },
  star: { fontSize: 40, color: colors.border },
  starActive: { color: colors.primary },
  reviewInput: { backgroundColor: colors.background, color: colors.text, padding: 12, borderRadius: 8, height: 100, textAlignVertical: 'top', marginBottom: 20, borderWidth: 1, borderColor: colors.border },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtnCancel: { flex: 1, padding: 14, backgroundColor: colors.background, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  modalBtnSubmit: { flex: 1, padding: 14, backgroundColor: colors.success, borderRadius: 8, alignItems: 'center' },
});

export default ApprovalScreen;
