import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Device from 'expo-device'; // ✅ Added missing import
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { sha256 } from 'js-sha256';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';
import DateTimePicker from '../../components/DateTimePicker';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { triggerPushNotifications } from '../../hooks/usePushNotifications';
import { ListingDetails, StudentStackNavigationProp, StudentStackRouteProp } from '../../types';
import { generateBookingPDFHTML } from '../../utils/generateBookingPDF';
import { supabase } from '../../utils/supabaseClient';

const BookingScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<StudentStackNavigationProp>();
  const route = useRoute<StudentStackRouteProp<'BookingScreen'>>();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const { listingId } = route.params;

  const COLORS = useMemo(() => ({
    gold: themeColors.primary,
    goldLight: isDark ? '#2D2510' : '#F5E7C8',
    goldDark: themeColors.primary,
    white: themeColors.card,
    offWhite: isDark ? '#1A1A1A' : '#F8F9FA',
    greyDark: themeColors.text,
    greyMedium: themeColors.textSecondary,
    greyLight: isDark ? '#2A2A2A' : '#ECF0F1',
    border: themeColors.border,
    shadow: '#000000',
    success: themeColors.success,
    danger: themeColors.error,
    yearly: '#8E44AD',
    yearlyLight: isDark ? '#2f1f4a' : '#F5EEF8',
  }), [themeColors, isDark]);

  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [terms, setTerms] = useState('');
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [signatureText, setSignatureText] = useState('');
  const [agreementId, setAgreementId] = useState<string | null>(null);
  const [agreementHash, setAgreementHash] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<Record<string, string | number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showUnverifiedModal, setShowUnverifiedModal] = useState(false);

  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

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
        Alert.alert(t('common.error'), t('booking.not_found'));
      } finally {
        setLoading(false);
      }
    };
    fetchListing();
  }, [listingId]);

  useEffect(() => {
    setDeviceInfo({
      platform: Device.osName || Platform.OS,
      osVersion: Device.osVersion || '',
      modelName: Device.modelName || '',
      manufacturer: Device.manufacturer || '',
      brand: (Device as any).brand || '',
    });
  }, []);

  useEffect(() => {
    if (!signatureAccepted) return;
    setSignatureAccepted(false);
    setAgreementId(null);
    setAgreementHash(null);
    setSignedAt(null);
    setSignatureText('');
    setSignatureError(null);
  }, [startDate, endDate, listing?.price, listing?.terms_marker, terms]);

  const computeTermsVersion = () => {
    if (!listing) return '';
    return listing.terms_marker || sha256(listing.terms_text || 'standard_terms');
  };

  const getContractText = () => {
    if (!listing) return '';
    const landlordName = listing.landlord?.full_name || t('booking.landlord_placeholder');
    const studentName = user?.fullName || t('booking.student_placeholder');
    const start = startDate.toLocaleDateString(t('common.date_locale'), {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    const end = endDate.toLocaleDateString(t('common.date_locale'), {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    const termsVersion = computeTermsVersion() || 'N/A';
    const listingTerms = listing.terms_text?.trim()
      ? `${t('booking.terms_title')}\n\n${listing.terms_text.trim()}`
      : `${t('booking.terms_title')}\n\n${t('booking.default_terms_template')}`;

    const rentAmountText = totals
      ? `${t('listing.fcfa')} ${totals.rentAmount.toLocaleString()}`
      : `${t('listing.fcfa')} ${listing.price?.toLocaleString() || 'TBD'} per month`;
    const cautionFeeText = totals
      ? `${t('listing.fcfa')} ${totals.cautionFee.toLocaleString()}`
      : `${t('listing.fcfa')} ${listing.price?.toLocaleString() || 'TBD'}`;
    const totalText = totals
      ? `${t('listing.fcfa')} ${totals.total.toLocaleString()}`
      : t('booking.no_terms');

    return [
      listingTerms,
      `${t('booking.contract_title')}`,
      `${t('booking.contract_intro', { studentName, landlordName, listingTitle: listing.title })}`,
      `${t('booking.contract_amount', { rentAmount: rentAmountText, cautionFee: cautionFeeText, total: totalText })}`,
      t('booking.contract_escrow'),
      t('booking.contract_enforceability'),
      t('booking.contract_terms_version', { version: termsVersion }),
      t('booking.contract_expiration', { start, end }),
      t('booking.contract_signature_clause'),
    ].join('\n\n');
  };

  const renderContractText = () => {
    if (!listing) return null;

    const landlordName = listing.landlord?.full_name || t('booking.landlord_placeholder');
    const studentName = user?.fullName || t('booking.student_placeholder');
    const rentAmountText = totals
      ? `${t('listing.fcfa')} ${totals.rentAmount.toLocaleString()}`
      : `${t('listing.fcfa')} ${listing.price?.toLocaleString() || 'TBD'} per month`;
    const cautionFeeText = totals
      ? `${t('listing.fcfa')} ${totals.cautionFee.toLocaleString()}`
      : `${t('listing.fcfa')} ${listing.price?.toLocaleString() || 'TBD'}`;
    const totalText = totals
      ? `${t('listing.fcfa')} ${totals.total.toLocaleString()}`
      : t('booking.no_terms');
    const listingTerms = listing.terms_text?.trim()
      ? `${t('booking.terms_title')}

${listing.terms_text.trim()}`
      : `${t('booking.terms_title')}

${t('booking.default_terms_template')}`;

    return (
      <View>
        <Text style={[styles.contractModalTextBold, { fontSize: 18 }]}>{t('booking.contract_title')}</Text>
        <Text style={[styles.contractModalText, { marginTop: 16 }]}>{t('booking.contract_intro', {
          studentName,
          landlordName,
          listingTitle: listing.title,
        })}</Text>
        <Text style={[styles.contractModalText, { marginTop: 16 }]}>{t('booking.contract_amount', {
          rentAmount: rentAmountText,
          cautionFee: cautionFeeText,
          total: totalText,
        })}</Text>
        <Text style={[styles.contractModalText, { marginTop: 16 }]}>{t('booking.contract_escrow')}</Text>
        <Text style={[styles.contractModalText, styles.contractModalTextBold, { marginTop: 16 }]}>
          {t('booking.contract_enforceability')}
        </Text>
        <Text style={[styles.contractModalText, { marginTop: 16 }]}>{t('booking.contract_terms_version', {
          version: computeTermsVersion() || 'N/A',
        })}</Text>
        <Text style={[styles.contractModalText, { marginTop: 16 }]}>{t('booking.contract_expiration', {
          start: startDate.toLocaleDateString(t('common.date_locale'), {
            day: '2-digit', month: 'long', year: 'numeric',
          }),
          end: endDate.toLocaleDateString(t('common.date_locale'), {
            day: '2-digit', month: 'long', year: 'numeric',
          }),
        })}</Text>
        <Text style={[styles.contractModalText, { marginTop: 16 }]}>{t('booking.contract_signature_clause')}</Text>
        <Text style={[styles.contractModalText, { marginTop: 20 }]}>{listingTerms}</Text>
      </View>
    );
  };

  const handleSignAgreement = () => {
    Keyboard.dismiss();

    const trimmedSignature = signatureText.trim();

    if (!trimmedSignature) {
      setSignatureError(t('booking.signature_error'));
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setSignatureError(t('booking.invalid_dates_msg'));
      return;
    }
    if (!listing || !user?.id || !totals) {
      setSignatureError(t('booking.signature_required_msg'));
      return;
    }

    const now = new Date().toISOString();
    const agreementIdValue = (uuid.v4() as string).toUpperCase();
    const payload = {
      agreementId: agreementIdValue,
      studentId: user.id,
      landlordId: listing.landlord?.id || '',
      listingId: listing.id,
      totalAmount: totals.total,
      rentAmount: totals.rentAmount,
      cautionFee: totals.cautionFee,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      termsVersion: computeTermsVersion(),
      signedAt: now,
      signatureText: trimmedSignature,
      deviceInfo,
    };

    setAgreementId(agreementIdValue);
    setAgreementHash(sha256(JSON.stringify(payload)));
    setSignedAt(now);
    setSignatureText(trimmedSignature);
    setSignatureAccepted(true);
    setSignatureError(null);
    setShowSignatureModal(false);
  };

  // ── Compute total amount ─────────────────────────────────────────────────────
  const computeTotal = () => {
    if (!listing) return null;
    const msDiff = endDate.getTime() - startDate.getTime();
    if (msDiff <= 0) return null;

    const priceUnit = (listing as any).price_unit ?? 'per_month';

    if (priceUnit === 'per_night') {
      // Daily billing: calculate number of nights
      const nights = Math.max(1, Math.ceil(msDiff / (1000 * 60 * 60 * 24)));
      const rentAmount = listing.price * nights;
      // Caution fee = 10% of total rent for short/daily stays
      const cautionFee = Math.round(rentAmount * 0.1);
      return { rentAmount, cautionFee, total: rentAmount + cautionFee, durationType: 'daily', nights };
    } else {
      // Monthly billing
      const monthsDiff = Math.max(1, Math.ceil(msDiff / (1000 * 60 * 60 * 24 * 30)));
      const calculatedDurationType = monthsDiff >= 12 ? 'yearly' : 'monthly';

      let rentAmount = listing.price * monthsDiff;
      if (calculatedDurationType === 'yearly') rentAmount = Math.round(rentAmount * 0.9);

      // Caution fee = 1 month of rent (escrow), which is ~10% for yearly
      const cautionFee = listing.price;
      return { rentAmount, cautionFee, total: rentAmount + cautionFee, durationType: calculatedDurationType };
    }
  };

  const totals = computeTotal();

  // ── PDF download – NEW VERSION using helper ──────────────────────────────
const handleDownloadPDF = async () => {
  if (!listing || !totals) return;
  setPdfLoading(true);

  try {
    const html = await generateBookingPDFHTML({
      listing,
      user,
      startDate,
      endDate,
      totals,
      agreementId,
      agreementHash,
      signedAt,
      signatureText,
    });

    if (Platform.OS === 'web') {
      // Use setTimeout to avoid blocking the parent tab
      setTimeout(() => {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          win.print();
        } else {
          Alert.alert('Error', 'Unable to open print dialog. Please allow popups.');
        }
        setPdfLoading(false);
      }, 100);
      return;
    }

    // Native
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: t('booking.download_pdf'),
      });
    } else {
      Alert.alert(t('common.success'), `${t('common.success')}: ${uri}`);
    }
  } catch (err) {
    console.error('[BookingScreen] PDF error:', err);
    Alert.alert(t('common.error'), t('booking.failed'));
  } finally {
    setPdfLoading(false);
  }
};

  // ── Create booking ───────────────────────────────────────────────────────────
  const performBooking = async () => {
    setSubmitting(true);
    try {
      const { total, rentAmount, cautionFee, durationType: currentDurationType } = totals!;
      const termsVersion = computeTermsVersion();

      const bookingPayload = {
        listing_id: listing!.id,
        student_id: user!.id,
        landlord_id: listing!.landlord!.id,
        amount: rentAmount,
        total_amount: total,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        status: 'pending',
        approval_status: 'pending',
        payment_status: 'pending',
        contract_status: 'signed',
        duration_type: currentDurationType,
        caution_fee: cautionFee,
        caution_status: 'held',
        agreement_id: agreementId,
        agreement_hash: agreementHash,
        signature_method: 'typed_name',
        signature_text: signatureText.trim(),
        signed_at: signedAt,
        agreement_device_info: deviceInfo || {},
        terms_version: termsVersion,
        agreed_to_terms: true,
      };

      console.log('[BookingScreen] Inserting booking payload:', JSON.stringify(bookingPayload, null, 2));

      const { data: booking, error } = await supabase
        .from('bookings')
        .insert(bookingPayload)
        .select()
        .single();

      if (error) {
        console.error('[BookingScreen] Insert error:', JSON.stringify(error, null, 2));
        const errorText = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
        const isMissingCautionColumn = error.code === 'PGRST204' ||
          (/column|schema cache|could not find/i.test(errorText) && /caution_fee|caution_status/i.test(errorText));
        if (isMissingCautionColumn) {
          console.warn('[BookingScreen] Retrying without caution columns (migration pending)');
          const fallbackPayload = { ...bookingPayload };
          delete (fallbackPayload as any).caution_fee;
          delete (fallbackPayload as any).caution_status;
          const { data: bookingFallback, error: fallbackError } = await supabase
            .from('bookings')
            .insert(fallbackPayload)
            .select()
            .single();
          if (fallbackError) {
            console.error('[BookingScreen] Fallback insert error:', fallbackError);
            throw fallbackError;
          }
          if (!bookingFallback) throw new Error('Booking was not returned after insert (fallback)');
          console.log('[BookingScreen] Fallback booking created:', bookingFallback.id);
          triggerPushNotifications();
          navigation.navigate('PendingScreen', { bookingId: bookingFallback.id });
          return;
        }
        throw error;
      }

      if (!booking) throw new Error('Booking was not returned after insert.');
      console.log('[BookingScreen] Booking created successfully:', booking.id);
      triggerPushNotifications();
      navigation.navigate('PendingScreen', { bookingId: booking.id });
    } catch (err: any) {
      console.error('[BookingScreen] createBooking error:', err);
      if (err?.code === '23505') {
        const { data: existing } = await supabase
          .from('bookings')
          .select('id')
          .eq('listing_id', listing!.id)
          .eq('student_id', user!.id)
          .in('status', ['pending', 'confirmed'])
          .maybeSingle();
        if (existing) {
          console.log('[BookingScreen] Existing booking found, navigating:', existing.id);
          navigation.replace('PendingScreen', { bookingId: existing.id });
          return;
        }
      }
      const details = err?.message ? `\n\n${err.message}` : '';
      Alert.alert(t('booking.failed'), `${t('booking.failed_msg')}${details}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateBooking = async () => {
    console.log('[BookingScreen] handleCreateBooking called');
    if (!signatureAccepted || !agreementId || !agreementHash) {
      console.warn('[BookingScreen] Missing signature or agreement');
      Alert.alert(t('booking.signature_required_title'), t('booking.signature_required_msg'));
      return;
    }
    if (!listing || !user?.id) {
      console.warn('[BookingScreen] Missing listing or user');
      Alert.alert(t('common.error'), t('booking.not_found'));
      return;
    }
    if (!listing.landlord) {
      console.warn('[BookingScreen] Missing landlord');
      Alert.alert(t('common.error'), t('booking.not_found'));
      return;
    }
    if (!totals) {
      console.warn('[BookingScreen] Missing totals');
      Alert.alert(t('common.error'), t('booking.invalid_dates_msg'));
      return;
    }

    if (!listing.is_verified) {
      console.log('[BookingScreen] Unverified listing, showing modal');
      setShowUnverifiedModal(true);
      return;
    }

    console.log('[BookingScreen] Verified listing, proceeding to create booking');
    await performBooking();
  };

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.white} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingText}>{t('booking.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.greyMedium} />
          <Text style={styles.errorTitle}>{t('booking.not_found')}</Text>
          <TouchableOpacity style={styles.outlineButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={COLORS.gold} />
            <Text style={styles.outlineButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.white} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.greyDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('booking.title')}</Text>
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
              <Text style={styles.priceLabel}>{t('booking.base_price')}</Text>
              <Text style={styles.priceValue}>{t('listing.fcfa')} {listing.price.toLocaleString()}</Text>
            </View>
            {listing.landlord?.full_name && (
              <View style={styles.landlordPill}>
                <Ionicons name="person-outline" size={13} color={COLORS.goldDark} />
                <Text style={styles.landlordPillText}>{listing.landlord.full_name}</Text>
              </View>
            )}
          </View>
        </View>


        {/* ── Date selectors ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="swap-horizontal-outline" size={20} color={COLORS.gold} />
            <Text style={styles.cardTitle}>{t('booking.select_dates')}</Text>
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
              <Text style={styles.dateBlockLabel}>{t('booking.move_in')}</Text>
              <Text style={styles.dateBlockDay}>
                {startDate.toLocaleDateString(t('common.date_locale'), { day: '2-digit', month: 'short' })}
              </Text>
              <Text style={styles.dateBlockYear}>{startDate.getFullYear()}</Text>
              <View style={styles.dateBlockTapHint}>
                <Ionicons name="pencil-outline" size={12} color={COLORS.greyMedium} />
                <Text style={styles.dateBlockTapHintText}>{t('booking.tap_to_change')}</Text>
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
              <Text style={styles.dateBlockLabel}>{t('booking.move_out')}</Text>
              <Text style={styles.dateBlockDay}>
                {endDate.toLocaleDateString(t('common.date_locale'), { day: '2-digit', month: 'short' })}
              </Text>
              <Text style={styles.dateBlockYear}>{endDate.getFullYear()}</Text>
              <View style={styles.dateBlockTapHint}>
                <Ionicons name="pencil-outline" size={12} color={COLORS.greyMedium} />
                <Text style={styles.dateBlockTapHintText}>{t('booking.tap_to_change')}</Text>
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
        {totals !== null && (
          <>
            <View style={styles.totalCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.totalLabel}>{t('booking.estimated_total')}</Text>
                {totals.durationType === 'yearly' && (
                  <Text style={styles.discountNote}>{t('booking.yearly_discount_applied')}</Text>
                )}
                <Text style={{ fontSize: 13, color: COLORS.goldDark, marginTop: 4 }}>
                  Rent: {totals.rentAmount.toLocaleString()} + Escrow: {totals.cautionFee.toLocaleString()}
                </Text>
              </View>
              <Text style={styles.totalAmount}>{t('listing.fcfa')} {totals.total.toLocaleString()}</Text>
            </View>

            <TouchableOpacity
              style={styles.feeInfoButton}
              onPress={() => setShowFeeModal(true)}
              activeOpacity={0.78}
            >
              <View>
                <Text style={styles.feeInfoQuestion}>
                  {t('booking.fee_info_button', {
                    amount: `${t('listing.fcfa')} ${totals.total.toLocaleString()}`,
                  })}
                </Text>
              </View>
              <Ionicons name="information-circle-outline" size={20} color={COLORS.goldDark} />
            </TouchableOpacity>
          </>
        )}

        {/* ── Terms & Conditions ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text-outline" size={20} color={COLORS.gold} />
            <Text style={styles.cardTitle}>{t('booking.terms_title')}</Text>
          </View>

          <ScrollView
            style={styles.termsBox}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.termsText}>
              {terms || t('booking.no_terms')}
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={styles.viewContractButton}
            onPress={() => setShowContractModal(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.viewContractButtonText}>{t('booking.view_agreement')}</Text>
          </TouchableOpacity>

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
                  <Text style={styles.pdfButtonTitle}>{t('booking.download_pdf')}</Text>
                  <Text style={styles.pdfButtonSub}>{t('booking.save_pdf_sub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.gold} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signatureCard}
            onPress={() => setShowSignatureModal(true)}
            activeOpacity={0.85}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.signatureCardTitle}>
                {signatureAccepted ? t('booking.signature_summary_title') : t('booking.sign_agreement')}
              </Text>
              <Text style={styles.signatureCardText}>
                {signatureAccepted
                  ? t('booking.signature_summary_sub', { date: signedAt ? new Date(signedAt).toLocaleString() : '' })
                  : t('booking.signature_prompt')}
              </Text>
            </View>
            <Ionicons
              name={signatureAccepted ? 'checkmark-circle' : 'pencil-outline'}
              size={22}
              color={signatureAccepted ? COLORS.success : COLORS.goldDark}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ─── Modals ────────────────────────────────────────────────────────── */}
      {/* Contract Modal */}
      <Modal
        visible={showContractModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowContractModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDismissArea} onPress={() => setShowContractModal(false)} />
          <View style={styles.contractModalContentWrapper}>
            <View style={styles.contractModalContent}>
              <View style={styles.contractModalHeader}>
                <Text style={styles.contractModalTitle} numberOfLines={2}>
                  {t('booking.contract_view_title')}
                </Text>
                <TouchableOpacity
                  style={styles.modalCloseIcon}
                  onPress={() => setShowContractModal(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color={COLORS.greyDark} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.contractModalScroll}
                contentContainerStyle={styles.contractModalScrollContent}
                showsVerticalScrollIndicator
              >
                {renderContractText()}
              </ScrollView>
              <View style={styles.contractModalFooter}>
                <TouchableOpacity
                  style={[styles.modalCloseButton, styles.modalFooterButton]}
                  onPress={() => setShowContractModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCloseButtonText}>{t('common.close')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fee Info Modal */}
      <Modal
        visible={showFeeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFeeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDismissArea} onPress={() => setShowFeeModal(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t('booking.fee_info_title', {
                amount: `${t('listing.fcfa')} ${totals?.total.toLocaleString()}`,
              })}
            </Text>
            <Text style={styles.modalDescription}>
              {t('booking.fee_info_description', {
                landlordName: listing.landlord?.full_name || t('booking.landlord_placeholder'),
                rentAmount: `${t('listing.fcfa')} ${totals?.rentAmount.toLocaleString()}`,
                cautionFee: `${t('listing.fcfa')} ${totals?.cautionFee.toLocaleString()}`,
              })}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.learnMoreButton}
                onPress={() => {
                  setShowFeeModal(false);
                  navigation.navigate('Legal');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.learnMoreButtonText}>{t('booking.learn_more')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowFeeModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCloseButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Signature Modal */}
      <Modal
        visible={showSignatureModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignatureModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDismissArea} onPress={() => setShowSignatureModal(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 50}
            style={styles.modalContentWrapper}
          >
            <View style={[styles.modalContent, styles.signatureModalContent]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, styles.modalHeaderTitle]} numberOfLines={2}>
                  {signatureAccepted ? t('booking.signature_review_title') : t('booking.signature_prompt_title')}
                </Text>
                <TouchableOpacity
                  style={styles.modalCloseIcon}
                  onPress={() => setShowSignatureModal(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color={COLORS.greyDark} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.signatureModalScroll}
                contentContainerStyle={styles.signatureModalBody}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalDescription}>
                  {signatureAccepted
                    ? t('booking.signature_review_description')
                    : t('booking.signature_description')}
                </Text>

                {!signatureAccepted ? (
                  <>
                    <TextInput
                      style={styles.signatureInput}
                      multiline
                      numberOfLines={3}
                      placeholder={t('booking.signature_placeholder')}
                      value={signatureText}
                      onChangeText={(value) => {
                        setSignatureText(value);
                        if (signatureError) setSignatureError(null);
                      }}
                      placeholderTextColor={COLORS.greyMedium}
                      textAlignVertical="top"
                      returnKeyType="done"
                      blurOnSubmit
                    />
                    {signatureError ? <Text style={styles.signatureError}>{signatureError}</Text> : null}
                  </>
                ) : (
                  <View style={styles.signatureSummary}>
                    <View style={styles.signatureDetailRow}>
                      <Text style={styles.signatureDetailLabel}>{t('booking.agreement_id_label')}</Text>
                      <Text selectable style={styles.signatureDetailValue}>{agreementId}</Text>
                    </View>
                    <View style={styles.signatureDetailRow}>
                      <Text style={styles.signatureDetailLabel}>{t('booking.signed_at_label')}</Text>
                      <Text style={styles.signatureDetailValue}>{signedAt ? new Date(signedAt).toLocaleString() : ''}</Text>
                    </View>
                    <View style={styles.signatureDetailRow}>
                      <Text style={styles.signatureDetailLabel}>{t('booking.signature_method_label')}</Text>
                      <Text style={styles.signatureDetailValue}>{t('booking.signature_method_typed')}</Text>
                    </View>
                    {agreementId ? (
                      <View style={styles.qrContainer}>
                        <QRCode value={`DHUB-AGREEMENT:${agreementId}`} size={112} />
                        <Text style={styles.qrLabel}>{t('booking.qr_code_label')}</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </ScrollView>
              <View style={styles.signatureModalFooter}>
                {!signatureAccepted ? (
                  <>
                    <TouchableOpacity
                      style={[styles.learnMoreButton, styles.signaturePrimaryButton]}
                      onPress={handleSignAgreement}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.learnMoreButtonText}>{t('booking.sign_now')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalCloseButton, styles.signatureSecondaryButton]}
                      onPress={() => setShowSignatureModal(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.modalCloseButtonText}>{t('common.close')}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.modalCloseButton, styles.modalFooterButton]}
                    onPress={() => setShowSignatureModal(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalCloseButtonText}>{t('common.close')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Unverified Listing Modal */}
      <Modal
        visible={showUnverifiedModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUnverifiedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="alert-circle" size={28} color={COLORS.danger} />
              <Text style={[styles.modalTitle, { color: COLORS.danger }]}>
                Unverified Listing
              </Text>
            </View>
            <Text style={styles.modalDescription}>
              This listing has not been physically verified by DHUB. Booking unverified properties carries risks such as:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletItem}>• The property may not match the photos</Text>
              <Text style={styles.bulletItem}>• Amenities could be missing</Text>
              <Text style={styles.bulletItem}>• The landlord may not be legitimate</Text>
              <Text style={styles.bulletItem}>• You may lose your caution fee</Text>
            </View>
            <TouchableOpacity
              style={styles.learnMoreButton}
              onPress={() => {
                setShowUnverifiedModal(false);
                navigation.navigate('Legal');
              }}
            >
              <Text style={styles.learnMoreButtonText}>Learn More</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCloseButton, { flex: 1 }]}
                onPress={() => setShowUnverifiedModal(false)}
              >
                <Text style={styles.modalCloseButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.learnMoreButton, { flex: 1, backgroundColor: COLORS.danger }]}
                onPress={() => {
                  setShowUnverifiedModal(false);
                  performBooking();
                }}
              >
                <Text style={styles.learnMoreButtonText}>Proceed Anyway</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Sticky footer CTA ── */}
      <View style={styles.footer}>
        {totals !== null && (
          <View style={styles.footerAmountRow}>
            <Text style={styles.footerAmountLabel}>{t('booking.total')}</Text>
            <Text style={styles.footerAmountValue}>{t('listing.fcfa')} {totals.total.toLocaleString()}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.bookButton, (!signatureAccepted || submitting) && styles.bookButtonDisabled]}
          onPress={handleCreateBooking}
          disabled={!signatureAccepted || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.white} />
              <Text style={styles.bookButtonText}>{t('booking.confirm')}</Text>
            </>
          )}
        </TouchableOpacity>
        {!signatureAccepted && (
          <Text style={styles.footerHint}>{t('booking.signature_required_hint')}</Text>
        )}
      </View>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const getStyles = (COLORS: any) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
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
  feeInfoButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14, borderRadius: 16,
    backgroundColor: COLORS.offWhite, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 16,
  },
  feeInfoQuestion: {
    flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.greyDark,
    marginRight: 10,
  },

  // Terms box
  termsBox: {
    maxHeight: 200, backgroundColor: COLORS.offWhite,
    padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  termsText: { fontSize: 14, lineHeight: 22, color: COLORS.greyMedium },
  viewContractButton: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.goldLight,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  viewContractButtonText: {
    color: COLORS.goldDark,
    fontSize: 15,
    fontWeight: '700',
  },

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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalDismissArea: StyleSheet.absoluteFillObject,
  contractModalContentWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contractModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    maxHeight: '88%',
    width: '100%',
    maxWidth: 520,
    overflow: 'hidden',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 20,
  },
  contractModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  contractModalTitle: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    color: COLORS.greyDark,
    marginRight: 12,
  },
  contractModalScroll: { flexShrink: 1 },
  contractModalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  contractModalText: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.greyDark,
  },
  contractModalTextBold: {
    fontWeight: '700',
    color: COLORS.greyDark,
  },
  contractModalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 22,
    padding: 20,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 20,
    width: '100%',
    maxWidth: 460,
  },
  signatureModalContent: {
    alignSelf: 'center',
    maxHeight: '88%',
    minHeight: 0,
    justifyContent: 'flex-start',
    overflow: 'hidden',
    padding: 0,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.greyDark, marginBottom: 12 },
  modalHeaderTitle: { flex: 1, marginRight: 12, marginBottom: 0 },
  modalDescription: { fontSize: 14, color: COLORS.greyMedium, lineHeight: 22, marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' },
  learnMoreButton: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  learnMoreButtonText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  modalCloseButton: {
    backgroundColor: COLORS.offWhite,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseButtonText: { color: COLORS.greyDark, fontSize: 14, fontWeight: '600' },
  exitButton: { marginTop: 10 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalCloseIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.offWhite,
  },
  modalContentWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalScrollContent: { flexGrow: 1, justifyContent: 'flex-start', paddingVertical: 18, paddingBottom: 40 },
  signatureModalScroll: { flexShrink: 1 },
  signatureModalBody: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  signatureModalFooter: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  signaturePrimaryButton: { flex: 1, minWidth: 150 },
  signatureSecondaryButton: { flex: 1, minWidth: 120 },
  modalFooterButton: { width: '100%' },
  pdfButtonContent: { flex: 1 },
  pdfButtonTitle: { fontSize: 15, fontWeight: '700', color: COLORS.goldDark },
  pdfButtonSub: { fontSize: 12, color: COLORS.goldDark, marginTop: 2 },
  signatureCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.offWhite, padding: 16,
  },
  signatureCardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.greyDark, marginBottom: 4 },
  signatureCardText: { fontSize: 13, color: COLORS.greyMedium, lineHeight: 20 },
  signatureInput: {
    minHeight: 110, backgroundColor: COLORS.offWhite,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    padding: 16, color: COLORS.greyDark,
    marginBottom: 10,
    fontSize: 15,
    lineHeight: 22,
  },
  signatureError: { color: COLORS.danger, marginBottom: 10, fontSize: 13 },
  signatureSummary: { marginTop: 0 },
  signatureDetailRow: { marginBottom: 10 },
  signatureDetailLabel: { fontSize: 12, color: COLORS.greyMedium, marginBottom: 4 },
  signatureDetailValue: { fontSize: 13, lineHeight: 19, color: COLORS.greyDark, fontWeight: '600' },
  qrContainer: {
    alignItems: 'center', justifyContent: 'center', marginTop: 12,
    padding: 14, borderRadius: 18, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border,
  },
  qrLabel: { marginTop: 10, fontSize: 12, color: COLORS.greyMedium, textAlign: 'center' },

  // bullet list for unverified modal
  bulletList: { marginVertical: 12, paddingLeft: 8 },
  bulletItem: { fontSize: 14, color: COLORS.greyDark, marginBottom: 4, lineHeight: 20 },

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