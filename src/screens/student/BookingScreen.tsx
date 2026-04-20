// src/screens/student/BookingScreen.tsx
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import Checkbox from 'expo-checkbox';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../utils/supabaseClient';
import { ListingDetails, StudentStackNavigationProp, StudentStackRouteProp } from '../../types';

// ─── Design tokens ────────────────────────────────────────────────────────────
const COLORS = {
  gold: '#D4AF37',
  goldLight: '#F5E7C8',
  goldDark: '#B8960C',
  white: '#FFFFFF',
  offWhite: '#F8F9FA',
  greyDark: '#2C3E50',
  greyMedium: '#7F8C8D',
  greyLight: '#ECF0F1',
  border: '#E9ECEF',
  shadow: '#000000',
  success: '#27AE60',
  danger: '#E74C3C',
  yearly: '#8E44AD',
  yearlyLight: '#F5EEF8',
};

// ─── Component ────────────────────────────────────────────────────────────────
const BookingScreen: React.FC = () => {
  const navigation = useNavigation<StudentStackNavigationProp>();
  const route = useRoute<StudentStackRouteProp<'BookingScreen'>>();
  const { user } = useAuth();
  const { listingId } = route.params;

  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [terms, setTerms] = useState('');
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [durationType, setDurationType] = useState<'monthly' | 'yearly' | null>(null);

  // ── Fetch listing ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchListing = async () => {
      try {
        const { data, error } = await supabase
          .from('listings')
          .select(`
            *,
            landlord:users(id, full_name, phone, email)
          `)
          .eq('id', listingId)
          .single();

        if (error || !data) throw error;

        setListing(data as ListingDetails);
        setTerms(data.terms_text || '');
      } catch (err) {
        console.error('[BookingScreen] fetchListing error:', err);
        Alert.alert('Error', 'Failed to load listing');
      } finally {
        setLoading(false);
      }
    };
    fetchListing();
  }, [listingId]);

  // ── Compute total amount ─────────────────────────────────────────────────────
  const computeTotal = () => {
    if (!listing || !durationType) return null;
    const msDiff = endDate.getTime() - startDate.getTime();
    if (msDiff <= 0) return null;
    const monthsDiff = Math.max(1, Math.ceil(msDiff / (1000 * 60 * 60 * 24 * 30)));
    if (durationType === 'monthly') return listing.price * monthsDiff;
    return Math.round(listing.price * monthsDiff * 0.9); // 10% yearly discount
  };

  const totalAmount = computeTotal();

  // ── PDF download ─────────────────────────────────────────────────────────────
  const handleDownloadPDF = async () => {
    if (!listing) return;
    setPdfLoading(true);
    try {
      const html = `
        <html><body style="font-family:sans-serif;padding:24px">
          <h1 style="color:#D4AF37">Booking Terms</h1>
          <h2>${listing.title}</h2>
          <p>${terms}</p>
          <p>Agreed by <strong>${user?.fullName}</strong> on ${new Date().toLocaleString()} — DHUB as third-party witness.</p>
        </body></html>
      `;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Download Booking Terms' });
      } else {
        Alert.alert('PDF Saved', `File saved to: ${uri}`);
      }
    } catch (err) {
      console.error('[BookingScreen] PDF error:', err);
      Alert.alert('Error', 'Failed to generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Create booking ───────────────────────────────────────────────────────────
  const handleCreateBooking = async () => {
    if (!agree) {
      Alert.alert('Agreement Required', 'Please read and accept the terms & conditions first.');
      return;
    }
    if (!listing || !user?.id) return;
    if (!listing.landlord) {
      Alert.alert('Error', 'Landlord information is not available.');
      return;
    }
    if (!durationType) {
      Alert.alert('Select Duration', 'Please choose a duration type (Monthly or Yearly).');
      return;
    }
    const msDiff = endDate.getTime() - startDate.getTime();
    if (msDiff <= 0) {
      Alert.alert('Invalid Dates', 'The end date must be after the start date.');
      return;
    }

    const monthsDiff = Math.max(1, Math.ceil(msDiff / (1000 * 60 * 60 * 24 * 30)));
    let amount = listing.price * monthsDiff;
    if (durationType === 'yearly') amount = Math.round(amount * 0.9);

    setSubmitting(true);
    try {
      const { data: booking, error } = await supabase
        .from('bookings')
        .insert({
          listing_id: listing.id,
          student_id: user.id,
          landlord_id: listing.landlord.id,
          amount,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          status: 'pending',
          payment_status: 'pending',
          duration_type: durationType,
        })
        .select()
        .single();

      if (error) throw error;

      navigation.navigate('PendingScreen', { bookingId: booking.id });
    } catch (err: any) {
      if (err?.code === '23505') {
        const { data: existing } = await supabase
          .from('bookings')
          .select('id')
          .eq('listing_id', listing.id)
          .eq('student_id', user.id)
          .in('status', ['pending', 'approved'])
          .maybeSingle();

        if (existing) {
          navigation.replace('PendingScreen', { bookingId: existing.id });
          return;
        }
      }
      Alert.alert('Booking Failed', 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingText}>Loading property details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.greyMedium} />
          <Text style={styles.errorTitle}>Listing not found</Text>
          <TouchableOpacity style={styles.outlineButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={COLORS.gold} />
            <Text style={styles.outlineButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.greyDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book Property</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Property summary card ── */}
        <View style={styles.propertyCard}>
          <View style={styles.propertyCardTop}>
            <View style={styles.propertyIcon}>
              <Ionicons name="home" size={28} color={COLORS.gold} />
            </View>
            <View style={styles.propertyInfo}>
              <Text style={styles.propertyTitle} numberOfLines={2}>{listing.title}</Text>
              {listing.city && (
                <View style={styles.propertyMeta}>
                  <Ionicons name="location-outline" size={13} color={COLORS.greyMedium} />
                  <Text style={styles.propertyMetaText}>{listing.city}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.propertyDivider} />
          <View style={styles.propertyFooter}>
            <View>
              <Text style={styles.priceLabel}>Base price / month</Text>
              <Text style={styles.priceValue}>FCFA {listing.price.toLocaleString()}</Text>
            </View>
            {listing.landlord?.full_name && (
              <View style={styles.landlordPill}>
                <Ionicons name="person-outline" size={13} color={COLORS.goldDark} />
                <Text style={styles.landlordPillText}>{listing.landlord.full_name}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Duration type selector ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.gold} />
            <Text style={styles.cardTitle}>Duration Type</Text>
          </View>

          <View style={styles.durationRow}>
            <TouchableOpacity
              style={[styles.durationPill, durationType === 'monthly' && styles.durationPillActive]}
              onPress={() => setDurationType('monthly')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={durationType === 'monthly' ? COLORS.white : COLORS.greyMedium}
              />
              <Text style={[styles.durationPillText, durationType === 'monthly' && styles.durationPillTextActive]}>
                Monthly
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.durationPill,
                durationType === 'yearly' && styles.durationPillActive,
                durationType === 'yearly' && styles.durationPillYearly,
              ]}
              onPress={() => setDurationType('yearly')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="star-outline"
                size={18}
                color={durationType === 'yearly' ? COLORS.white : COLORS.greyMedium}
              />
              <View>
                <Text style={[styles.durationPillText, durationType === 'yearly' && styles.durationPillTextActive]}>
                  Yearly
                </Text>
                <Text style={[styles.durationDiscount, durationType === 'yearly' && styles.durationDiscountActive]}>
                  10% off
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Date selectors ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="swap-horizontal-outline" size={20} color={COLORS.gold} />
            <Text style={styles.cardTitle}>Select Dates</Text>
          </View>

          <View style={styles.dateRow}>
            {/* Start Date block */}
            <TouchableOpacity
              style={styles.dateBlock}
              onPress={() => setShowStartPicker(true)}
              activeOpacity={0.75}
            >
              <View style={styles.dateBlockIconWrap}>
                <Ionicons name="log-in-outline" size={22} color={COLORS.gold} />
              </View>
              <Text style={styles.dateBlockLabel}>Move-in Date</Text>
              <Text style={styles.dateBlockDay}>
                {startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </Text>
              <Text style={styles.dateBlockYear}>{startDate.getFullYear()}</Text>
              <View style={styles.dateBlockTapHint}>
                <Ionicons name="pencil-outline" size={12} color={COLORS.greyMedium} />
                <Text style={styles.dateBlockTapHintText}>Tap to change</Text>
              </View>
            </TouchableOpacity>

            {/* Arrow */}
            <View style={styles.dateArrow}>
              <Ionicons name="arrow-forward" size={20} color={COLORS.greyLight} />
            </View>

            {/* End Date block */}
            <TouchableOpacity
              style={styles.dateBlock}
              onPress={() => setShowEndPicker(true)}
              activeOpacity={0.75}
            >
              <View style={styles.dateBlockIconWrap}>
                <Ionicons name="log-out-outline" size={22} color={COLORS.gold} />
              </View>
              <Text style={styles.dateBlockLabel}>Move-out Date</Text>
              <Text style={styles.dateBlockDay}>
                {endDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </Text>
              <Text style={styles.dateBlockYear}>{endDate.getFullYear()}</Text>
              <View style={styles.dateBlockTapHint}>
                <Ionicons name="pencil-outline" size={12} color={COLORS.greyMedium} />
                <Text style={styles.dateBlockTapHintText}>Tap to change</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Date pickers (native) */}
        {showStartPicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display="default"
            minimumDate={new Date()}
            onChange={(_, date) => {
              setShowStartPicker(false);
              if (date) setStartDate(date);
            }}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display="default"
            minimumDate={startDate}
            onChange={(_, date) => {
              setShowEndPicker(false);
              if (date) setEndDate(date);
            }}
          />
        )}

        {/* ── Estimated total ── */}
        {totalAmount !== null && (
          <View style={styles.totalCard}>
            <View>
              <Text style={styles.totalLabel}>Estimated Total</Text>
              {durationType === 'yearly' && (
                <Text style={styles.discountNote}>Includes 10% yearly discount</Text>
              )}
            </View>
            <Text style={styles.totalAmount}>FCFA {totalAmount.toLocaleString()}</Text>
          </View>
        )}

        {/* ── Terms & Conditions ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text-outline" size={20} color={COLORS.gold} />
            <Text style={styles.cardTitle}>Terms &amp; Conditions</Text>
          </View>

          <ScrollView
            style={styles.termsBox}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.termsText}>
              {terms || 'No specific terms have been provided for this listing. Standard rental agreement terms apply.'}
            </Text>
          </ScrollView>

          {/* ── Download PDF button ── */}
          <TouchableOpacity
            style={[styles.pdfButton, pdfLoading && styles.pdfButtonLoading]}
            onPress={handleDownloadPDF}
            disabled={pdfLoading}
            activeOpacity={0.8}
          >
            {pdfLoading ? (
              <ActivityIndicator color={COLORS.gold} />
            ) : (
              <>
                <View style={styles.pdfIconCircle}>
                  <Ionicons name="download-outline" size={22} color={COLORS.white} />
                </View>
                <View style={styles.pdfButtonContent}>
                  <Text style={styles.pdfButtonTitle}>Download Booking Agreement</Text>
                  <Text style={styles.pdfButtonSub}>Save a copy of the terms as PDF</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.gold} />
              </>
            )}
          </TouchableOpacity>

          {/* Checkbox */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setAgree(!agree)}
            activeOpacity={0.7}
          >
            <Checkbox
              value={agree}
              onValueChange={setAgree}
              color={agree ? COLORS.gold : COLORS.greyLight}
              style={styles.checkbox}
            />
            <Text style={styles.checkboxLabel}>
              I have read and agree to the terms &amp; conditions
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ── Sticky footer CTA ── */}
      <View style={styles.footer}>
        {totalAmount !== null && (
          <View style={styles.footerAmountRow}>
            <Text style={styles.footerAmountLabel}>Total</Text>
            <Text style={styles.footerAmountValue}>FCFA {totalAmount.toLocaleString()}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.bookButton, (!agree || submitting) && styles.bookButtonDisabled]}
          onPress={handleCreateBooking}
          disabled={!agree || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.white} />
              <Text style={styles.bookButtonText}>Confirm Booking Request</Text>
            </>
          )}
        </TouchableOpacity>
        {!agree && (
          <Text style={styles.footerHint}>Accept the terms above to continue</Text>
        )}
      </View>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.white },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 14, fontSize: 16, color: COLORS.greyMedium },
  errorTitle: {
    fontSize: 20, fontWeight: '600', color: COLORS.greyDark,
    marginTop: 16, marginBottom: 24,
  },
  outlineButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.gold,
  },
  outlineButtonText: { color: COLORS.gold, fontSize: 15, fontWeight: '600' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.greyDark },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.offWhite, justifyContent: 'center', alignItems: 'center',
  },

  // Scroll
  scrollContent: { padding: 16, paddingBottom: 24 },

  // Property card
  propertyCard: {
    backgroundColor: COLORS.white, borderRadius: 20, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    overflow: 'hidden',
  },
  propertyCardTop: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 20,
  },
  propertyIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: COLORS.goldLight,
    justifyContent: 'center', alignItems: 'center',
  },
  propertyInfo: { flex: 1, paddingTop: 2 },
  propertyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.greyDark, marginBottom: 6 },
  propertyMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  propertyMetaText: { fontSize: 13, color: COLORS.greyMedium },
  propertyDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 20 },
  propertyFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingTop: 14,
  },
  priceLabel: { fontSize: 12, color: COLORS.greyMedium, marginBottom: 2 },
  priceValue: { fontSize: 20, fontWeight: '700', color: COLORS.gold },
  landlordPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: COLORS.goldLight, borderRadius: 20,
  },
  landlordPillText: { fontSize: 12, fontWeight: '600', color: COLORS.goldDark },

  // Generic card
  card: {
    backgroundColor: COLORS.white, borderRadius: 20, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: COLORS.greyDark },

  // Duration pills
  durationRow: { flexDirection: 'row', gap: 12 },
  durationPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.offWhite,
  },
  durationPillActive: {
    backgroundColor: COLORS.gold, borderColor: COLORS.goldDark,
  },
  durationPillYearly: { backgroundColor: COLORS.yearly, borderColor: COLORS.yearly },
  durationPillText: { fontSize: 15, fontWeight: '600', color: COLORS.greyMedium },
  durationPillTextActive: { color: COLORS.white },
  durationDiscount: { fontSize: 11, color: COLORS.greyMedium, textAlign: 'center' },
  durationDiscountActive: { color: 'rgba(255,255,255,0.85)' },

  // Date picker — card blocks
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBlock: {
    flex: 1, alignItems: 'center', paddingVertical: 18, paddingHorizontal: 10,
    backgroundColor: COLORS.offWhite, borderRadius: 16,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  dateBlockIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.goldLight,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 10,
  },
  dateBlockLabel: {
    fontSize: 11, fontWeight: '600', color: COLORS.greyMedium,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  dateBlockDay: {
    fontSize: 22, fontWeight: '800', color: COLORS.greyDark, lineHeight: 26,
  },
  dateBlockYear: {
    fontSize: 13, color: COLORS.greyMedium, marginTop: 2, marginBottom: 10,
  },
  dateBlockTapHint: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  dateBlockTapHintText: { fontSize: 11, color: COLORS.greyMedium },
  dateArrow: { alignItems: 'center', justifyContent: 'center', paddingTop: 4 },

  // Estimated total banner
  totalCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.goldLight, borderRadius: 16, padding: 18,
    marginBottom: 16, borderWidth: 1, borderColor: '#E8D57E',
  },
  totalLabel: { fontSize: 14, color: COLORS.goldDark, fontWeight: '600', marginBottom: 2 },
  discountNote: { fontSize: 12, color: COLORS.goldDark },
  totalAmount: { fontSize: 22, fontWeight: '800', color: COLORS.goldDark },

  // Terms box
  termsBox: {
    maxHeight: 200, backgroundColor: COLORS.offWhite,
    padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  termsText: { fontSize: 14, lineHeight: 22, color: COLORS.greyMedium },

  // PDF button — full width prominent
  pdfButton: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16, paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.gold,
    backgroundColor: COLORS.goldLight, marginBottom: 16,
  },
  pdfButtonLoading: { justifyContent: 'center' },
  pdfIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.gold,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  pdfButtonContent: { flex: 1 },
  pdfButtonTitle: { fontSize: 15, fontWeight: '700', color: COLORS.goldDark },
  pdfButtonSub: { fontSize: 12, color: COLORS.goldDark, marginTop: 2 },

  // Checkbox
  checkboxRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  checkbox: { marginTop: 2 },
  checkboxLabel: { flex: 1, fontSize: 14, color: COLORS.greyDark, lineHeight: 20 },

  // Footer
  footer: {
    backgroundColor: COLORS.white, paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 12,
  },
  footerAmountRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  footerAmountLabel: { fontSize: 14, color: COLORS.greyMedium },
  footerAmountValue: { fontSize: 18, fontWeight: '700', color: COLORS.gold },
  bookButton: {
    backgroundColor: COLORS.gold, borderRadius: 16, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: COLORS.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  bookButtonDisabled: { opacity: 0.55, shadowOpacity: 0 },
  bookButtonText: { color: COLORS.white, fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  footerHint: { textAlign: 'center', marginTop: 8, fontSize: 13, color: COLORS.greyMedium },

  bottomSpacer: { height: 8 },
});

export default BookingScreen;