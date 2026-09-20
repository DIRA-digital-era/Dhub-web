// src/screens/student/PaymentScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from "../../context/ThemeContext";
import { Payment } from '../../services/paymentService';
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { clearInitiateState, fetchPayments, initiateBookingPayment, initiateTransfer, upsertPayment } from '../../store/paymentsSlice';
import type { RootState } from "../../store/store";
import { supabase } from '../../utils/supabaseClient';
import DownloadAppScreen from '../common/DownloadAppScreen';

// ─── SECURITY NOTE ─────────────────────────────────────────────────────────────
// All financial mutations (booking status, payment status)
// are handled exclusively by the backend (dhubpayment-main) via webhooks.
// This screen is a READ-ONLY observer. Real-time listeners update the UI.
// ───────────────────────────────────────────────────────────────────────────────

const normalizePaymentStatus = (status?: string | null): 'completed' | 'pending' | 'failed' => {
  if (!status) return 'pending';
  const normalized = status.toLowerCase();
  if (['completed', 'successful', 'success'].includes(normalized)) return 'completed';
  if (['failed', 'error', 'cancelled', 'rejected', 'declined', 'expired', 'timeout'].includes(normalized)) return 'failed';
  return 'pending';
};

const PaymentScreen: React.FC = () => {
  const { t } = useTranslation();
  const route = useRoute();
  const incoming = route.params as
    | {
      amount?: number;
      description?: string;
      receiverPhone?: string;
      receiverName?: string;
      landlordId?: string;
      listingId?: string;
      bookingId?: string;
      listingType?: string; // e.g. 'Hostel', 'Apartment', 'Hotel', 'Studio'
      reason?: 'rent' | 'boosting' | 'landlord_subscription';
      paymentType?: 'initial' | 'rent_completion' | 'renewal';
    }
    | undefined;

  const navigation = useNavigation();

  const dispatch = useAppDispatch();
  const user = useAppSelector((state: RootState) => state.auth.user);
  const { initiating, initiateError, fetchingHistory, fetchError } = useAppSelector(
    (state: RootState) => state.payments
  );
  const history = useAppSelector((state: RootState) => state.payments.history);
  const { colors: themeColors, isDark } = useTheme();

  const COLORS = useMemo(
    () => ({
      background: themeColors.background,
      surface: themeColors.card,
      border: themeColors.border,
      text: themeColors.text,
      textSecondary: themeColors.textSecondary,
      primary: themeColors.primary,
      primaryLight: isDark ? '#2D2510' : '#F5E7C8',
      success: themeColors.success,
      danger: themeColors.error,
      dangerLight: isDark ? '#4b1d1d' : '#FDEAEA',
      warning: '#F39C12',
      muted: isDark ? '#A0A0A0' : '#7F8C8D',
      shadow: '#000000',
      onPrimary: '#FFFFFF',
    }),
    [themeColors, isDark]
  );

  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  // FEATURE FLAG STATE
  const [checkingFlag, setCheckingFlag] = useState(true);
  const [webPaymentEnabled, setWebPaymentEnabled] = useState(false);
  const [downloadLinks, setDownloadLinks] = useState<{ ios?: string, android?: string }>({});

  const [activeTab, setActiveTab] = useState<"history" | "send">("history");
  const [amount, setAmount] = useState<string>("");
  const [payerPhone, setPayerPhone] = useState<string>("");
  const [receiverPhone, setReceiverPhone] = useState<string>("");
  const [receiverDisplayName, setReceiverDisplayName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const paymentModeLoaded = true;

  useEffect(() => {
    const fetchFlag = async () => {
      try {
        const { data, error } = await supabase
          .from('feature_flags')
          .select('*')
          .eq('key', 'allow_payment_via_web_app')
          .maybeSingle();

        console.log('🚩 [FeatureFlag] data:', JSON.stringify(data), '| error:', JSON.stringify(error));

        if (error) {
          console.error("Error fetching feature flag:", error);
          setWebPaymentEnabled(false);
        } else if (data) {
          console.log('🚩 [FeatureFlag] enabled:', data.enabled, '| value:', data.value);
          setWebPaymentEnabled(!!data.enabled);
          try {
            if (data.value) {
              const links = JSON.parse(data.value);
              setDownloadLinks(links);
            }
          } catch (e) {
            console.error("Error parsing feature flag value JSON:", e);
          }
        } else {
          // Flag row doesn't exist — default disabled
          console.warn('🚩 [FeatureFlag] Row not found — defaulting to disabled');
          setWebPaymentEnabled(false);
        }
      } catch (err) {
        console.error("Unexpected error fetching flag:", err);
      } finally {
        setCheckingFlag(false);
      }
    };
    fetchFlag();
  }, []);

  // FETCH HISTORY & REAL-TIME SYNC
  useEffect(() => {
    if (!user?.id) return;
    dispatch(fetchPayments(user.id));

    const channel = supabase
      .channel(`student-payments-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
          filter: `payer_id=eq.${user.id}`,
        },
        (payload: any) => {
          const row = payload.new as any;
          if (row) {
            const mapped: Payment = {
              id: row.id,
              transactionId: row.transaction_ref || row.id,
              amount: parseFloat(row.amount),
              sender: row.payer_id === user?.id ? "You" : row.payer_phone || row.payer_id,
              receiver: row.receiver_phone || "Landlord/Dhub",
              status: row.status as any,
              date: row.created_at,
              description: row.currency ? `${row.currency} Payment` : "Payment",
            };
            dispatch(upsertPayment(mapped));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, dispatch]);

  // AUTO-APPLY PREFILLS WHEN COMING FROM BOOKING
  useEffect(() => {
    if (!payerPhone && user) {
      if (user.momo) {
        setPayerPhone(user.momo);
      } else if (user.phone) {
        setPayerPhone(user.phone);
      }
    }

    if (incoming) {
      setActiveTab("send");
      if (incoming.amount) setAmount(String(incoming.amount));
      if (incoming.description) setDescription(incoming.description);
      if (incoming.receiverPhone) setReceiverPhone(incoming.receiverPhone);
      if (incoming.receiverName) setReceiverDisplayName(incoming.receiverName);
    }
  }, [incoming, user]);

  const handleSendPayment = async (): Promise<void> => {
    if (!payerPhone) {
      Alert.alert(t('payment.validation_error'), t('payment.validation_msg'));
      return;
    }
    if (!user?.id) {
      Alert.alert(t('payment.session_error'), t('payment.session_msg'));
      return;
    }

    if (incoming?.bookingId && incoming?.paymentType) {
      const idempotencyKey = `dhub-booking-${incoming.bookingId}-${incoming.paymentType}`;
      const result = await dispatch(
        initiateBookingPayment({
          bookingId: incoming.bookingId,
          payerPhone,
          paymentKind: incoming.paymentType, // backend handles 'initial' | 'rent_completion' | 'renewal' natively
          idempotencyKey,
        })
      );

      if (initiateBookingPayment.fulfilled.match(result)) {
        dispatch(clearInitiateState());
        setActiveTab('history');
        const alreadyProcessing = (result.payload as any)?.already_processing;
        if (alreadyProcessing) {
          Alert.alert(
            'Payment In Progress',
            'Your payment is already being processed. Please check your phone for the MoMo prompt, or wait a moment and check your payment history.'
          );
        } else {
          Alert.alert(
            t('payment.initiate_success_title'),
            'A payment request has been sent to your phone. Open your MoMo app and approve it to complete the payment.'
          );
        }
      } else {
        const errMsg = (result.payload as string) ?? t('payment.payment_error');
        Alert.alert(t('payment.payment_error'), errMsg);
      }
      return;
    }

    const amountNumber = parseFloat(amount);
    if (!amount || isNaN(amountNumber) || amountNumber <= 0) {
      Alert.alert(t('payment.validation_error'), t('payment.amount_error'));
      return;
    }
    if (!receiverPhone) {
      Alert.alert(t('payment.validation_error'), t('payment.validation_msg'));
      return;
    }

    const transferType = incoming?.listingType;
    if (!transferType) {
      Alert.alert(t('payment.validation_error'), 'Listing type is required to determine the correct fee.');
      return;
    }

    const paymentReason = incoming?.reason || (incoming?.bookingId ? 'rent' : 'rent');
    const idempotencyKey = `dhub-transfer-${user.id}-${receiverPhone}-${amountNumber}`;

    const result = await dispatch(
      initiateTransfer({
        payerPhone,
        receiverPhone,
        amount,
        reason: paymentReason,
        transferType: transferType,
        client: {
          name: 'Dhub',
          description,
          payer_id: user.id,
          payee_id: incoming?.landlordId || '',
          listing_id: incoming?.listingId || '',
          booking_id: incoming?.bookingId || '',
          idempotency_key: idempotencyKey,
        },
      })
    );

    if (initiateTransfer.fulfilled.match(result)) {
      dispatch(clearInitiateState());
      setActiveTab('history');
      Alert.alert(
        t('payment.initiate_success_title'),
        t('payment.initiate_success_msg')
      );
    } else {
      const errMsg = (result.payload as string) ?? t('payment.payment_error');
      Alert.alert(t('payment.payment_error'), errMsg);
    }
  };

  const handleViewReceipt = (payment: Payment): void => {
    setSelectedPayment(payment);
    setShowReceiptModal(true);
  };

  const generateQRData = (payment: Payment): string => {
    return `https://dhubcmr.netlify.app/verify.html?tx=${payment.id}`;
  };

  const handleDownloadPdf = () => {
    if (Platform.OS === 'web') {
      window.print();
    } else {
      Alert.alert("Print", "Printing is handled natively on web.");
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status: "completed" | "pending" | "failed" | string): string => {
    switch (status) {
      case "completed":
        return "#27AE60";
      case "pending":
        return "#F39C12";
      case "failed":
        return "#E74C3C";
      default:
        return "#7F8C8D";
    }
  };

  const getStatusText = (status: "completed" | "pending" | "failed" | string): string => {
    switch (status) {
      case "completed":
        return t('payment.statuses.completed');
      case "pending":
        return t('payment.statuses.pending');
      case "failed":
        return t('payment.statuses.failed');
      default:
        return status;
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "XAF",
    }).format(amount);
  };

  if (checkingFlag) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // FEATURE FLAG REDIRECT GUARD
  if (!webPaymentEnabled) {
    return (
      <DownloadAppScreen
        onClose={() => navigation.goBack()}
        iosLink={downloadLinks.ios}
        androidLink={downloadLinks.android}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.surface} />
      {/* Header */}
      <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('payment.title')}</Text>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "history" && styles.activeTab]}
          onPress={() => setActiveTab("history")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "history" && styles.activeTabText,
            ]}
          >
            {t('payment.history_tab')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "send" && styles.activeTab]}
          onPress={() => setActiveTab("send")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "send" && styles.activeTabText,
            ]}
          >
            {t('payment.send_tab')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === "history" ? (
          <ScrollView style={styles.historyContainer}>
            <View style={styles.historyHeader}>
              <Text style={styles.sectionTitle}>{t('payment.recent_transactions')}</Text>
              <TouchableOpacity
                onPress={() => user?.id && dispatch(fetchPayments(user.id))}
                disabled={fetchingHistory}
              >
                <Text style={[styles.refreshText, fetchingHistory && styles.disabledText]}>
                  {fetchingHistory ? t('payment.refreshing') : t('payment.refresh')}
                </Text>
              </TouchableOpacity>
            </View>

            {fetchingHistory ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>{t('payment.loading_history')}</Text>
              </View>
            ) : fetchError ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{fetchError}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => user?.id && dispatch(fetchPayments(user.id))}
                >
                  <Text style={styles.retryButtonText}>{t('payment.retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : history.length === 0 ? (
              <Text style={styles.emptyText}>{t('payment.no_history')}</Text>
            ) : (
              history.map((payment: Payment) => (
                <TouchableOpacity
                  key={payment.id}
                  style={styles.paymentCard}
                  onPress={() => handleViewReceipt(payment)}
                >
                  <View style={styles.paymentHeader}>
                    <Text style={styles.paymentDescription}>
                      {payment.description}
                    </Text>
                    <Text style={styles.paymentAmount}>
                      {formatCurrency(payment.amount)}
                    </Text>
                  </View>

                  <View style={styles.paymentDetails}>
                    <Text style={styles.paymentDate}>
                      {formatDate(payment.date)}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(payment.status) },
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {getStatusText(payment.status)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.paymentFooter}>
                    <Text style={styles.transactionId}>
                      {t('payment.transaction_id')}: {payment.transactionId}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        ) : (
          <ScrollView style={styles.sendContainer} contentContainerStyle={{ paddingBottom: 40 }}>

            {/* ── BOOKING CONTEXT: show a clean payment summary card ── */}
            {incoming?.bookingId ? (
              <>
                {/* Payment Type Badge */}
                <View style={styles.paymentTypeBadge}>
                  <Ionicons
                    name={
                      incoming.paymentType === 'initial' ? 'home-outline' :
                        incoming.paymentType === 'rent_completion' ? 'checkmark-circle-outline' :
                          'refresh-circle-outline'
                    }
                    size={20}
                    color={COLORS.primary}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.paymentTypeBadgeText}>
                    {incoming.paymentType === 'initial' && 'Initial Booking Payment'}
                    {incoming.paymentType === 'rent_completion' && 'Rent Completion Payment'}
                    {incoming.paymentType === 'renewal' && 'Lease Renewal Fee'}
                  </Text>
                </View>

                {/* Summary Card */}
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>{incoming.description}</Text>

                  <View style={styles.summaryDivider} />

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{t('screens.payment.amount')}</Text>
                    <Text style={styles.summaryAmount}>
                      {formatCurrency(incoming.amount ?? 0)}
                    </Text>
                  </View>

                  {incoming.receiverName ? (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{t('screens.payment.payable_to')}</Text>
                      <Text style={styles.summaryValue}>{incoming.receiverName}</Text>
                    </View>
                  ) : null}

                  {incoming.paymentType === 'initial' && (
                    <View style={styles.summaryNote}>
                      <Ionicons name="lock-open-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.summaryNoteText}>{t('screens.payment.this_is_the')}<Text style={{ fontWeight: '700' }}>{t('screens.payment.initial_deposit')}</Text>: your caution fee (held in escrow) + XAF 5,000 service fee.{"\n\n"}Once payment is confirmed by MoMo, the property's exact map location and landlord contact will be unlocked. You can then visit the property and choose to complete your rent or request a caution refund.
                      </Text>
                    </View>
                  )}
                  {incoming.paymentType === 'rent_completion' && (
                    <View style={styles.summaryNote}>
                      <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.summaryNoteText}>{t('screens.payment.this_is_your')}<Text style={{ fontWeight: '700' }}>{t('screens.payment.remaining_rent_balance')}</Text>{t('screens.payment.after_your_initial_deposi')}</Text>
                    </View>
                  )}
                  {incoming.paymentType === 'renewal' && (
                    <View style={styles.summaryNote}>
                      <Ionicons name="refresh-circle-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.summaryNoteText}>
                        A <Text style={{ fontWeight: '700' }}>{t('screens.payment.xaf_5_000_lease_renewal_f')}</Text>. Once confirmed, your lease end date will be extended and you can continue your stay.
                      </Text>
                    </View>
                  )}
                </View>

                {/* MoMo Phone Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('screens.payment.your_momo_phone_number')}</Text>
                  <TextInput
                    style={[styles.input, initiating && styles.inputDisabled]}
                    placeholder="e.g. 237XXXXXXXXX"
                    placeholderTextColor={COLORS.textSecondary}
                    value={payerPhone}
                    onChangeText={setPayerPhone}
                    keyboardType="phone-pad"
                    editable={!initiating}
                    autoCorrect={false}
                  />
                  <Text style={styles.inputHint}>{t('screens.payment.enter_the_momo_number_tha')}</Text>
                </View>

                {/* Pay Button */}
                <TouchableOpacity
                  style={[styles.sendButton, (initiating || !payerPhone) && styles.buttonDisabled]}
                  onPress={handleSendPayment}
                  disabled={initiating || !payerPhone}
                >
                  {initiating ? (
                    <ActivityIndicator color={COLORS.onPrimary} />
                  ) : (
                    <>
                      <Ionicons name="phone-portrait-outline" size={20} color={COLORS.onPrimary} style={{ marginRight: 8 }} />
                      <Text style={styles.sendButtonText}>
                        Pay Rent Processing fee {formatCurrency(incoming.amount ?? 0)}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {initiating && (
                  <Text style={styles.initiatingHint}>{t('screens.payment.a_payment_prompt_has_been')}</Text>
                )}
              </>
            ) : (
              /* ── GENERIC FREE-FORM TRANSFER (no booking context) ── */
              <>
                <Text style={styles.sectionTitle}>{t('payment.send_tab')}</Text>

                {/* Payer Phone */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('payment.momo_number_label')}</Text>
                  <TextInput
                    style={[styles.input, initiating && styles.inputDisabled]}
                    placeholder={t('payment.momo_placeholder')}
                    placeholderTextColor={COLORS.textSecondary}
                    value={payerPhone}
                    onChangeText={setPayerPhone}
                    keyboardType="phone-pad"
                    editable={!initiating}
                  />
                </View>

                {/* Amount */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('payment.amount_label')}</Text>
                  <TextInput
                    style={[styles.input, (initiating || !!incoming?.amount) && styles.inputDisabled]}
                    placeholder={t('payment.amount_placeholder')}
                    placeholderTextColor={COLORS.textSecondary}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    editable={!initiating && !incoming?.amount}
                  />
                </View>

                {/* Receiver */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('payment.receiver_label')}</Text>
                  <TextInput
                    style={[styles.input, styles.inputDisabled]}
                    value={receiverDisplayName || receiverPhone}
                    editable={false}
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>

                {/* Description */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('payment.description_label')}</Text>
                  <TextInput
                    style={[styles.input, styles.textArea, (initiating || !!incoming?.description) && styles.inputDisabled]}
                    placeholder={t('payment.description_placeholder')}
                    placeholderTextColor={COLORS.textSecondary}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={3}
                    editable={!initiating && !incoming?.description}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.sendButton, initiating && styles.buttonDisabled]}
                  onPress={handleSendPayment}
                  disabled={initiating}
                >
                  {initiating ? (
                    <ActivityIndicator color={COLORS.onPrimary} />
                  ) : (
                    <Text style={styles.sendButtonText}>{t('payment.send_button')}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Error display */}
            {initiateError && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.danger} style={{ marginRight: 8 }} />
                <Text style={[styles.errorText, { flex: 1 }]}>{initiateError}</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Receipt Modal */}
      <Modal
        visible={showReceiptModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('payment.receipt_title')}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowReceiptModal(false)}
            >
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {selectedPayment && (
            <ScrollView style={styles.receiptContent}>
              {/* QR */}
              <View style={styles.qrContainer}>
                <QRCode
                  value={generateQRData(selectedPayment)}
                  size={200}
                  color={COLORS.text}
                  backgroundColor={COLORS.surface}
                />
                <Text style={styles.qrHelpText}>
                  {t('payment.qr_verify')}
                </Text>
              </View>

              {/* Receipt Sections */}
              <View style={styles.receiptSection}>
                <Text style={styles.receiptSectionTitle}>
                  {t('payment.transaction_details')}
                </Text>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>{t('payment.transaction_id')}:</Text>
                  <Text style={styles.receiptValue}>
                    {selectedPayment.transactionId}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>{t('payment.description_label')}:</Text>
                  <Text style={styles.receiptValue}>
                    {selectedPayment.description}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>{t('payment.date')}:</Text>
                  <Text style={styles.receiptValue}>
                    {formatDate(selectedPayment.date)}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>{t('payment.status')}:</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: getStatusColor(selectedPayment.status),
                      },
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {getStatusText(selectedPayment.status)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.receiptSection}>
                <Text style={styles.receiptSectionTitle}>{t('payment.amount_details')}</Text>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>{t('payment.amount')}:</Text>
                  <Text style={styles.receiptValue}>
                    {formatCurrency(selectedPayment.amount)}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Processing Fee:</Text>
                  <Text style={styles.receiptValue}>
                    {formatCurrency(selectedPayment.fee ?? 0)}
                  </Text>
                </View>

                <View style={[styles.receiptRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>{t('payment.net_amount')}:</Text>
                  <Text style={styles.totalValue}>
                    {formatCurrency(selectedPayment.netAmount ?? 0)}
                  </Text>
                </View>
              </View>

              <View style={styles.receiptSection}>
                <Text style={styles.receiptSectionTitle}>{t('payment.parties_title')}</Text>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>{t('payment.from')}:</Text>
                  <Text style={styles.receiptValue}>
                    {selectedPayment.sender}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>{t('payment.to')}:</Text>
                  <Text style={styles.receiptValue}>
                    {selectedPayment.receiver}
                  </Text>
                </View>
              </View>

              <View style={styles.receiptActions}>
                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={handleDownloadPdf}
                >
                  <Text style={styles.downloadButtonText}>{t('screens.payment.print_pdf')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shareButton}
                  onPress={() => setShowReceiptModal(false)}
                >
                  <Text style={styles.shareButtonText}>{t('payment.close')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const getStyles = (COLORS: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    header: {
      backgroundColor: COLORS.surface,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: COLORS.primary,
      textAlign: "center",
    },
    tabContainer: {
      flexDirection: "row",
      backgroundColor: COLORS.surface,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 16,
      alignItems: "center",
    },
    activeTab: {
      borderBottomWidth: 3,
      borderBottomColor: COLORS.primary,
    },
    tabText: {
      fontSize: 16,
      fontWeight: "600",
      color: COLORS.textSecondary,
    },
    activeTabText: {
      color: COLORS.primary,
    },
    content: {
      flex: 1,
    },
    historyContainer: {
      flex: 1,
      padding: 20,
    },
    sendContainer: {
      flex: 1,
      padding: 20,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: COLORS.text,
      marginBottom: 20,
    },
    emptyText: {
      textAlign: "center",
      color: COLORS.textSecondary,
      marginTop: 40,
      fontSize: 16,
    },
    historyHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    refreshText: {
      color: COLORS.primary,
      fontWeight: "600",
      fontSize: 14,
    },
    disabledText: {
      color: COLORS.border,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 40,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: COLORS.textSecondary,
    },
    retryButton: {
      marginTop: 16,
      backgroundColor: COLORS.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
      alignSelf: "center",
    },
    retryButtonText: {
      color: COLORS.onPrimary,
      fontWeight: "bold",
    },
    paymentCard: {
      backgroundColor: COLORS.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    paymentHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 8,
    },
    paymentDescription: {
      fontSize: 16,
      fontWeight: "600",
      color: COLORS.text,
      flex: 1,
      marginRight: 10,
    },
    paymentAmount: {
      fontSize: 18,
      fontWeight: "bold",
      color: COLORS.primary,
    },
    paymentDetails: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    paymentDate: {
      fontSize: 14,
      color: COLORS.textSecondary,
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusText: {
      fontSize: 12,
      fontWeight: "600",
      color: COLORS.onPrimary,
    },
    paymentFooter: {
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
      paddingTop: 8,
    },
    transactionId: {
      fontSize: 12,
      color: COLORS.textSecondary,
      fontFamily: "monospace",
    },
    inputGroup: {
      marginBottom: 20,
    },
    paymentModeText: {
      color: COLORS.muted,
      fontSize: 14,
      marginBottom: 12,
      lineHeight: 20,
    },
    label: {
      fontSize: 16,
      fontWeight: "600",
      color: COLORS.text,
      marginBottom: 8,
    },
    input: {
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 8,
      padding: 16,
      fontSize: 16,
      color: COLORS.text,
    },
    inputDisabled: {
      backgroundColor: COLORS.background, // fallback that respects dark mode
      color: COLORS.textSecondary,
      opacity: 0.7,
    },
    textArea: {
      minHeight: 80,
      textAlignVertical: "top",
    },
    sendButton: {
      backgroundColor: COLORS.primary,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      marginTop: 10,
    },
    buttonDisabled: {
      backgroundColor: COLORS.border,
    },
    sendButtonText: {
      color: COLORS.onPrimary,
      fontSize: 16,
      fontWeight: "bold",
    },
    errorContainer: {
      backgroundColor: COLORS.dangerLight,
      padding: 16,
      borderRadius: 8,
      marginTop: 20,
      borderLeftWidth: 4,
      borderLeftColor: COLORS.danger,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    errorText: {
      color: COLORS.danger,
      fontSize: 14,
    },
    // ── Booking Payment Summary Styles ──────────────────────────
    paymentTypeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.primaryLight,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
      alignSelf: 'flex-start',
      marginBottom: 16,
    },
    paymentTypeBadgeText: {
      color: COLORS.primary,
      fontWeight: '700',
      fontSize: 14,
    },
    summaryCard: {
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: 20,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: COLORS.border,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    summaryTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: COLORS.text,
      marginBottom: 16,
      lineHeight: 24,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: COLORS.border,
      marginBottom: 16,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    summaryLabel: {
      fontSize: 14,
      color: COLORS.textSecondary,
      fontWeight: '500',
    },
    summaryValue: {
      fontSize: 14,
      color: COLORS.text,
      fontWeight: '600',
      textAlign: 'right',
      flex: 1,
      marginLeft: 10,
    },
    summaryAmount: {
      fontSize: 22,
      fontWeight: '800',
      color: COLORS.primary,
    },
    summaryNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: COLORS.primaryLight,
      borderRadius: 8,
      padding: 12,
      marginTop: 12,
      gap: 8,
    },
    summaryNoteText: {
      flex: 1,
      fontSize: 13,
      color: COLORS.text,
      lineHeight: 18,
    },
    inputHint: {
      fontSize: 12,
      color: COLORS.textSecondary,
      marginTop: 6,
    },
    initiatingHint: {
      textAlign: 'center',
      color: COLORS.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 16,
      paddingHorizontal: 12,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: COLORS.surface,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: COLORS.text,
    },
    closeButton: {
      padding: 4,
    },
    closeButtonText: {
      fontSize: 24,
      color: COLORS.textSecondary,
      fontWeight: "bold",
    },
    receiptContent: {
      flex: 1,
      padding: 20,
    },
    qrContainer: {
      alignItems: "center",
      marginBottom: 30,
      backgroundColor: COLORS.surface,
      padding: 20,
      borderRadius: 12,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    qrHelpText: {
      marginTop: 10,
      fontSize: 14,
      color: COLORS.textSecondary,
      textAlign: "center",
    },
    receiptSection: {
      backgroundColor: COLORS.surface,
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    receiptSectionTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: COLORS.text,
      marginBottom: 16,
    },
    receiptRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    receiptLabel: {
      fontSize: 14,
      color: COLORS.textSecondary,
      fontWeight: "500",
    },
    receiptValue: {
      fontSize: 14,
      color: COLORS.text,
      fontWeight: "600",
      textAlign: "right",
      flex: 1,
      marginLeft: 10,
    },
    totalRow: {
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
      paddingTop: 12,
      marginTop: 4,
    },
    totalLabel: {
      fontSize: 16,
      fontWeight: "bold",
      color: COLORS.text,
    },
    totalValue: {
      fontSize: 18,
      fontWeight: "bold",
      color: COLORS.primary,
    },
    receiptActions: {
      flexDirection: "row",
      gap: 12,
      marginTop: 20,
      marginBottom: 30,
    },
    downloadButton: {
      flex: 1,
      backgroundColor: COLORS.primary,
      padding: 16,
      borderRadius: 8,
      alignItems: "center",
    },
    downloadButtonText: {
      color: COLORS.onPrimary,
      fontSize: 16,
      fontWeight: "bold",
    },
    shareButton: {
      flex: 1,
      backgroundColor: COLORS.surface,
      padding: 16,
      borderRadius: 8,
      alignItems: "center",
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    shareButtonText: {
      color: COLORS.text,
      fontSize: 16,
      fontWeight: "600",
    },
  });

export default PaymentScreen;