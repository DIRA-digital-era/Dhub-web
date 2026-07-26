// src/screens/student/PendingScreen.tsx

import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useTheme } from '../../context/ThemeContext';
import { StudentStackNavigationProp, StudentStackRouteProp } from '../../types';
import { supabase } from '../../utils/supabaseClient';

const PendingScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<StudentStackNavigationProp>();
  const route = useRoute<StudentStackRouteProp<'PendingScreen'>>();
  const { bookingId } = route.params;
  const { colors: themeColors, isDark } = useTheme();

  const COLORS = useMemo(() => ({
    gold: themeColors.primary,
    goldLight: isDark ? '#2D2510' : '#F5E7C8',
    goldDark: themeColors.primary,
    white: themeColors.card,
    card: themeColors.card,
    background: themeColors.background,
    offWhite: isDark ? '#1A1A1A' : '#F8F9FA',
    greyDark: themeColors.text,
    greyMedium: themeColors.textSecondary,
    greyLight: isDark ? '#2A2A2A' : '#ECF0F1',
    border: themeColors.border,
    shadow: '#000000',
    success: themeColors.success,
    successLight: isDark ? '#163b1f' : '#EAFAF1',
    warning: '#F39C12',
    warningLight: isDark ? '#4b2d00' : '#FEF9E7',
    danger: themeColors.error,
    dangerLight: isDark ? '#4b1d1d' : '#FDEAEA',
    pending: '#8E44AD',
    pendingLight: isDark ? '#2f1f4a' : '#F5EEF8',
  }), [themeColors, isDark]);

  const { styles, timelineStyles, detailStyles } = useMemo(
    () => getStyles(COLORS),
    [COLORS]
  );

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<any>(null);
  const [canPay, setCanPay] = useState(false);
  const [paid, setPaid] = useState(false);

  // ── Fetch initial booking ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select(`
            *,
            landlord:users!bookings_landlord_id_fkey(full_name, phone),
            listing:listings(title, city, price)
          `)
          .eq('id', bookingId)
          .single();

        if (error || !data) {
          Alert.alert(t('common.error'), t('booking.not_found'));
          goHome(); // ✅ go home on error
          return;
        }

        setBooking(data);

        if (data.approval_status === 'rejected' || data.status === 'cancelled') {
          Alert.alert(t('booking.declined_title'), t('booking.declined_msg'));
          goHome();
          return;
        }

        setCanPay(data.approval_status === 'approved');
        setPaid(data.payment_status === 'completed');
      } catch (err) {
        console.error('[PendingScreen] fetch error:', err);
        Alert.alert(t('common.error'), t('booking.failed_msg'));
        goHome();
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId]);

  // ── Realtime listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('booking_realtime_' + bookingId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bookingId}`,
        },
        (payload: any) => {
          const updated = payload.new;
          setBooking((prev: any) => ({ ...prev, ...updated }));

          if (updated.approval_status === 'rejected' || updated.status === 'cancelled') {
            Alert.alert(t('booking.declined_title'), t('booking.declined_msg'));
            goHome();
          }

          if (updated.approval_status === 'approved') setCanPay(true);
          if (updated.payment_status === 'completed') setPaid(true);
        }
      )
      .subscribe(); // ✅ .on() before .subscribe()

    return () => { supabase.removeChannel(channel); };
  }, [bookingId]);

  // ── Navigate to payment ────────────────────────────────────────────────────
  const handleProceedToPayment = () => {
    if (!canPay) {
      Alert.alert(t('booking.not_approved_title'), t('booking.not_approved_msg'));
      return;
    }
    const caution = booking.caution_fee ?? 0;
    const initialPaymentAmount = caution + 5000;

    navigation.navigate('Payments', {
      listingId: booking.listing_id,
      bookingId: booking.id,
      amount: initialPaymentAmount,
      description: `Initial Deposit (Caution + 5K Service Fee) for ${booking.listing?.title || "Property"}`,
      receiverPhone: booking.landlord?.phone ?? '',
      receiverName: booking.landlord?.full_name ?? '',
      landlordId: booking.landlord_id,
      paymentType: 'initial',
      listingType: booking.listing?.listing_type || 'Apartment',
    } as any);
  };

  // ── Go to Home – reset stack ─────────────────────────────────────────────
  const goHome = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'StudentTabs', params: { screen: 'Home' } }],
    });
  };

  // ── Derived helpers ────────────────────────────────────────────────────────
  const getApprovalStep = () => {
    if (paid) return 3;
    if (canPay) return 2;
    return 1;
  };

  const formatAmount = (val: any) => {
    const n = Number(val);
    return isNaN(n) ? String(val) : `${t('listing.fcfa')} ${n.toLocaleString(t('common.date_locale'))}`;
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.card} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingText}>{t('booking.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.greyMedium} />
          <Text style={styles.errorTitle}>{t('booking.not_found')}</Text>
          <TouchableOpacity style={styles.outlineButton} onPress={goHome}>
            <Ionicons name="home-outline" size={18} color={COLORS.gold} />
            <Text style={styles.outlineButtonText}>{t('common.home')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const step = getApprovalStep();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.card} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.greyDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('booking.pending_title')}</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={goHome}>
          <Ionicons name="home-outline" size={24} color={COLORS.greyDark} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Hero banner ── */}
        <View style={styles.heroBanner}>
          <View style={styles.heroIconWrapper}>
            {paid ? (
              <Ionicons name="checkmark-circle" size={52} color={COLORS.success} />
            ) : canPay ? (
              <Ionicons name="cash-outline" size={52} color={COLORS.gold} />
            ) : (
              <Ionicons name="time-outline" size={52} color={COLORS.pending} />
            )}
          </View>
          <Text style={styles.heroTitle}>
            {paid
              ? t('booking.hero_payment_complete')
              : canPay
              ? t('booking.hero_ready_to_pay')
              : t('booking.hero_awaiting_approval')}
          </Text>
          <Text style={styles.heroSubtitle}>
            {paid
              ? t('booking.hero_payment_complete_sub')
              : canPay
              ? t('booking.hero_ready_to_pay_sub')
              : t('booking.hero_awaiting_approval_sub')}
          </Text>
        </View>

        {/* ── Progress timeline ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="git-merge-outline" size={20} color={COLORS.gold} />
            <Text style={styles.cardTitle}>{t('booking.progress')}</Text>
          </View>

          <TimelineStep
            step={1}
            currentStep={step}
            icon="send-outline"
            label={t('booking.step_request_sent')}
            sublabel={t('booking.step_request_sent_sub')}
            colors={COLORS}
            timelineStyles={timelineStyles}
          />
          <TimelineStep
            step={2}
            currentStep={step}
            icon="checkmark-circle-outline"
            label={t('booking.step_approved')}
            sublabel={t('booking.step_approved_sub')}
            colors={COLORS}
            timelineStyles={timelineStyles}
          />
          <TimelineStep
            step={3}
            currentStep={step}
            icon="home-outline"
            label={t('booking.step_confirmed')}
            sublabel={t('booking.step_confirmed_sub')}
            isLast
            colors={COLORS}
            timelineStyles={timelineStyles}
          />
        </View>

        {/* ── Booking details card ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text-outline" size={20} color={COLORS.gold} />
            <Text style={styles.cardTitle}>{t('booking.key_details')}</Text>
          </View>

          {booking.listing?.title && (
            <DetailRow
              icon="home-outline"
              label={t('booking.property')}
              value={booking.listing.title}
              colors={COLORS}
              detailStyles={detailStyles}
            />
          )}
          {booking.listing?.city && (
            <DetailRow
              icon="location-outline"
              label={t('listing.city')}
              value={booking.listing.city}
              colors={COLORS}
              detailStyles={detailStyles}
            />
          )}
          {booking.duration_type && (
            <DetailRow
              icon="calendar-outline"
              label={t('booking.duration_type')}
              value={t(`booking.${booking.duration_type}`)}
              colors={COLORS}
              detailStyles={detailStyles}
            />
          )}
          <DetailRow
            icon="cash-outline"
            label={t('booking.amount_due')}
            value={formatAmount(booking.total_amount ?? booking.amount)}
            valueStyle={styles.amountValue}
            colors={COLORS}
            detailStyles={detailStyles}
          />
          {booking.rent_amount !== undefined && booking.caution_fee !== undefined && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16, backgroundColor: COLORS.offWhite }}>
              <Text style={{ fontSize: 12, color: COLORS.greyMedium }}>
                Rent: {formatAmount(booking.rent_amount)} + Escrow/Caution: {formatAmount(booking.caution_fee)}
              </Text>
            </View>
          )}
          <DetailRow
            icon="shield-checkmark-outline"
            label={t('booking.booking_status')}
            value={t(`booking.${booking.status}`)}
            badge
            badgeColor={booking.status === 'confirmed' ? COLORS.success : COLORS.warning}
            colors={COLORS}
            detailStyles={detailStyles}
          />
          <DetailRow
            icon="person-circle-outline"
            label={t('booking.approval')}
            value={t(`booking.${booking.approval_status || 'pending'}`)}
            badge
            badgeColor={
              booking.approval_status === 'approved'
                ? COLORS.success
                : booking.approval_status === 'rejected'
                ? COLORS.danger
                : COLORS.pending
            }
            isLast
            colors={COLORS}
            detailStyles={detailStyles}
          />
        </View>

        {/* ── Landlord info card ── */}
        {booking.landlord?.full_name && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="person-outline" size={20} color={COLORS.gold} />
              <Text style={styles.cardTitle}>{t('listing.landlord')}</Text>
            </View>
            <View style={styles.landlordRow}>
              <View style={styles.landlordAvatar}>
                <Text style={styles.landlordInitials}>
                  {booking.landlord.full_name
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </Text>
              </View>
              <View style={styles.landlordInfo}>
                <Text style={styles.landlordName}>{booking.landlord.full_name}</Text>
                <Text style={styles.landlordSub}>{t('listing.responds_within')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.greyLight} />
            </View>
          </View>
        )}

        {/* ── Wait notice (when pending) ── */}
        {!canPay && !paid && (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={22} color={COLORS.pending} />
            <Text style={styles.infoBoxText}>
              {t('booking.wait_notice')}
            </Text>
          </View>
        )}

        {/* ── Success notice (paid) ── */}
        {paid && (
          <View style={[styles.infoBox, styles.successBox]}>
            <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.success} />
            <Text style={[styles.infoBoxText, styles.successBoxText]}>
              {t('booking.success_notice')}
            </Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ── Bottom action ── */}
      {canPay && !paid && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.payButton}
            onPress={handleProceedToPayment}
            activeOpacity={0.85}
          >
            <Ionicons name="card-outline" size={22} color={COLORS.white} />
            <Text style={styles.payButtonText}>{t('booking.proceed_to_payment')}</Text>
            <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.footerNote}>
            {t('booking.total')}: {formatAmount(booking.total_amount ?? booking.amount)}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
};

// ─── Sub-components ────────────────────────────────────────────────────────────

const TimelineStep = ({
  step,
  currentStep,
  icon,
  label,
  sublabel,
  isLast = false,
  colors,
  timelineStyles,
}: {
  step: number;
  currentStep: number;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sublabel: string;
  isLast?: boolean;
  colors: any;
  timelineStyles: any;
}) => {
  const done = currentStep >= step;
  const active = currentStep === step;

  return (
    <View style={timelineStyles.row}>
      <View style={timelineStyles.dotColumn}>
        <View
          style={[
            timelineStyles.dot,
            done && timelineStyles.dotDone,
            active && timelineStyles.dotActive,
          ]}
        >
          {done ? (
            <Ionicons name={step === currentStep && !isLast ? icon : 'checkmark'} size={16} color={colors.white} />
          ) : (
            <Ionicons name={icon} size={14} color={colors.greyMedium} />
          )}
        </View>
        {!isLast && (
          <View style={[timelineStyles.connector, done && timelineStyles.connectorDone]} />
        )}
      </View>
      <View style={timelineStyles.labelColumn}>
        <Text style={[timelineStyles.label, done && timelineStyles.labelDone]}>{label}</Text>
        <Text style={timelineStyles.sublabel}>{sublabel}</Text>
      </View>
    </View>
  );
};

const DetailRow = ({
  icon,
  label,
  value,
  valueStyle,
  badge = false,
  badgeColor,
  isLast = false,
  colors,
  detailStyles,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  valueStyle?: any;
  badge?: boolean;
  badgeColor?: string;
  isLast?: boolean;
  colors: any;
  detailStyles: any;
}) => (
  <View style={[detailStyles.row, !isLast && detailStyles.rowBorder]}>
    <View style={detailStyles.iconBox}>
      <Ionicons name={icon} size={16} color={colors.gold} />
    </View>
    <Text style={detailStyles.label}>{label}</Text>
    {badge ? (
      <View style={[detailStyles.badge, { backgroundColor: badgeColor }]}>
        <Text style={detailStyles.badgeText}>{value}</Text>
      </View>
    ) : (
      <Text style={[detailStyles.value, valueStyle]}>{value}</Text>
    )}
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const getStyles = (COLORS: any) => ({
  styles: StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLORS.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    loadingText: { marginTop: 14, fontSize: 16, color: COLORS.greyMedium },
    errorTitle: {
      fontSize: 20, fontWeight: '600', color: COLORS.greyDark,
      marginTop: 16, marginBottom: 24,
    },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    headerTitle: {
      fontSize: 18, fontWeight: '600', color: COLORS.greyDark, textAlign: 'center',
    },
    headerBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: COLORS.offWhite, justifyContent: 'center', alignItems: 'center',
    },
    scrollContent: { paddingBottom: 24 },
    heroBanner: {
      alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24,
      backgroundColor: COLORS.card,
      borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    heroIconWrapper: {
      width: 96, height: 96, borderRadius: 48,
      backgroundColor: COLORS.offWhite,
      justifyContent: 'center', alignItems: 'center',
      marginBottom: 16,
      shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06, shadowRadius: 12, elevation: 4,
    },
    heroTitle: {
      fontSize: 22, fontWeight: '700', color: COLORS.greyDark,
      marginBottom: 8, textAlign: 'center',
    },
    heroSubtitle: {
      fontSize: 14, color: COLORS.greyMedium, textAlign: 'center', lineHeight: 20,
      paddingHorizontal: 8,
    },
    card: {
      marginHorizontal: 16, marginTop: 16,
      backgroundColor: COLORS.card, borderRadius: 20, padding: 20,
      borderWidth: 1, borderColor: COLORS.border,
      shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
    },
    cardHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
    },
    cardTitle: { fontSize: 16, fontWeight: '600', color: COLORS.greyDark },
    landlordRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    landlordAvatar: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: COLORS.goldLight,
      justifyContent: 'center', alignItems: 'center',
    },
    landlordInitials: { fontSize: 18, fontWeight: '700', color: COLORS.goldDark },
    landlordInfo: { flex: 1 },
    landlordName: { fontSize: 16, fontWeight: '600', color: COLORS.greyDark, marginBottom: 2 },
    landlordSub: { fontSize: 13, color: COLORS.greyMedium },
    infoBox: {
      marginHorizontal: 16, marginTop: 16,
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      backgroundColor: COLORS.pendingLight, borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: '#D7BDE2',
    },
    infoBoxText: {
      flex: 1, fontSize: 14, color: COLORS.pending, lineHeight: 20,
    },
    successBox: {
      backgroundColor: COLORS.successLight, borderColor: '#A9DFBF',
    },
    successBoxText: { color: COLORS.success },
    amountValue: {
      fontSize: 16, fontWeight: '700', color: COLORS.gold,
    },
    footer: {
      backgroundColor: COLORS.card, paddingHorizontal: 20, paddingVertical: 16,
      borderTopWidth: 1, borderTopColor: COLORS.border,
      shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.05, shadowRadius: 8, elevation: 10,
    },
    payButton: {
      backgroundColor: COLORS.gold, borderRadius: 16, paddingVertical: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      shadowColor: COLORS.gold, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
    },
    payButtonText: { color: COLORS.white, fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
    footerNote: {
      textAlign: 'center', marginTop: 8, fontSize: 13, color: COLORS.greyMedium,
    },
    outlineButton: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 24, paddingVertical: 12,
      borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.gold,
    },
    outlineButtonText: { color: COLORS.gold, fontSize: 15, fontWeight: '600' },
    bottomSpacer: { height: 16 },
  }),
  timelineStyles: StyleSheet.create({
    row: { flexDirection: 'row', gap: 14, minHeight: 56 },
    dotColumn: { alignItems: 'center', width: 32 },
    dot: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: COLORS.greyLight, borderWidth: 2, borderColor: COLORS.border,
      justifyContent: 'center', alignItems: 'center',
    },
    dotDone: { backgroundColor: COLORS.gold, borderColor: COLORS.goldDark },
    dotActive: {
      backgroundColor: COLORS.pending, borderColor: COLORS.pending,
      shadowColor: COLORS.pending, shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
    },
    connector: { flex: 1, width: 2, backgroundColor: COLORS.border, marginVertical: 4 },
    connectorDone: { backgroundColor: COLORS.gold },
    labelColumn: { flex: 1, paddingTop: 4, paddingBottom: 16 },
    label: { fontSize: 15, fontWeight: '600', color: COLORS.greyMedium, marginBottom: 2 },
    labelDone: { color: COLORS.greyDark },
    sublabel: { fontSize: 13, color: COLORS.greyMedium },
  }),
  detailStyles: StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
    iconBox: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: COLORS.goldLight,
      justifyContent: 'center', alignItems: 'center',
    },
    label: { flex: 1, fontSize: 14, color: COLORS.greyMedium },
    value: { fontSize: 14, fontWeight: '600', color: COLORS.greyDark, maxWidth: '50%', textAlign: 'right' },
    badge: {
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    },
    badgeText: { color: COLORS.white, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  }),
});

export default PendingScreen;