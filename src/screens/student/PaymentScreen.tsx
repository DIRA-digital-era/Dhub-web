//src/screens/student/PaymentScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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


import { useTranslation } from "react-i18next";

// ──────────────────────────────────────────────────────────────────────
// SECURITY NOTE: All financial mutations (booking status, payment status)
// are handled exclusively by the backend (dhubpayment-main) via webhooks.
// This screen is a READ-ONLY observer. Real-time listeners update the UI.
// ──────────────────────────────────────────────────────────────────────

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
  // Replace the incoming type definition with this:
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
      reason?: 'rent' | 'boosting' | 'landlord_subscription' | 'verification';
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

  const [activeTab, setActiveTab] = useState<"history" | "send">("history");
  const [amount, setAmount] = useState<string>("");
  const [payerPhone, setPayerPhone] = useState<string>(""); // manual student phone
  const [receiverPhone, setReceiverPhone] = useState<string>(""); // real hidden value
  const [receiverDisplayName, setReceiverDisplayName] = useState<string>(""); // safe visible value
  const [description, setDescription] = useState<string>("");
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(
    null,
  );
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  // Server-authoritative mode is always active; no feature flag check needed from client.
  const paymentModeLoaded = true;
  const useBackendPayment = true;

  // FETCH HISTORY & REAL-TIME SYNC
  useEffect(() => {
    // console.log("🔍 [PaymentScreen] Auth User identified");

    if (!user?.id) {
      console.warn("⚠️ [PaymentScreen] No user ID found, skipping fetch");
      return;
    }

    // 1. Initial Fetch
    // console.log("🔄 [PaymentScreen] Triggering fetchPayments");
    dispatch(fetchPayments(user.id));

    // 2. Real-time Subscription
    // console.log("📡 [PaymentScreen] Setting up real-time subscription");
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
          // console.log("✨ [PaymentScreen] Real-time payment update received");
          const row = payload.new as any;
          if (row) {
            const mapped: Payment = {
              id: row.id,
              transactionId: row.transaction_ref || row.id,
              amount: parseFloat(row.amount),
              sender: row.payer_id,
              receiver: row.payee_id,
              status: row.status as any,
              date: row.created_at,
              description: row.currency ? `${row.currency} Payment` : "Payment",
            };
            dispatch(upsertPayment(mapped));

            // The backend webhook is the sole authority for updating booking/payment status.
            // We only reflect the server's state change in the local Redux store here.
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Feature flag is always server-authoritative (backend enforces it).
  // No client-side fetch needed.

  // AUTO-APPLY PREFILLS WHEN COMING FROM BOOKING
  useEffect(() => {
    if (incoming) {
      setActiveTab("send");

      if (incoming.amount) {
        setAmount(String(incoming.amount));
      }

      if (incoming.description) {
              setDescription(incoming.description);
            }

            if (incoming.receiverPhone) {
              setReceiverPhone(incoming.receiverPhone); // still needed for payment
            }

            if (incoming.receiverName) {
              setReceiverDisplayName(incoming.receiverName); // privacy-protected
            }
          }
        }, [incoming]);

        // PREFILL PAYER PHONE FROM USER PROFILE (MoMo number)
        useEffect(() => {
          const fetchUserMomo = async () => {
            if (!user?.id) return;
            // Don't overwrite if the user already typed something
            if (payerPhone) return;

            try {
              const { data, error } = await supabase
                .from('users')
                .select('momo, phone')
                .eq('id', user.id)
                .maybeSingle();

              if (error) {
                console.warn('[PaymentScreen] Could not fetch MoMo number:', error.message);
                return;
              }

              if (data?.momo) {
                setPayerPhone(data.momo);
              } else if (data?.phone) {
                // Fallback to phone if momo not set
                setPayerPhone(data.phone);
              }
            } catch (err) {
              console.warn('[PaymentScreen] Error fetching MoMo number:', err);
            }
          };

          fetchUserMomo();
        }, [user?.id]);

  const handleSendPayment = async (): Promise<void> => {
    console.log("[PaymentScreen] Initiating payment via backend...");

    if (!payerPhone) {
      Alert.alert(t('payment.validation_error'), t('payment.validation_msg'));
      return;
    }

    if (!user?.id) {
      Alert.alert(t('payment.session_error'), t('payment.session_msg'));
      return;
    }

    // ── BOOKING PAYMENT (initial, rent_completion, renewal) ─────────────
    // If the screen was opened from a booking context, route via the
    // server-authoritative booking-intents endpoint. The backend calculates
    // the exact amount (including the 5,000 XAF processing fee) from the
    // booking record — the client never controls the amount.
    if (incoming?.bookingId && incoming?.paymentType) {
      // Deterministic key: same booking + paymentType always produces the same key.
      // This guarantees that 3G retries / accidental double-taps never produce a second MoMo charge.
      const idempotencyKey = `dhub-booking-${incoming.bookingId}-${incoming.paymentType}`;
      const result = await dispatch(
        initiateBookingPayment({
          bookingId: incoming.bookingId,
          payerPhone,
          paymentKind: incoming.paymentType === 'renewal' ? 'rent_completion' : incoming.paymentType,
          idempotencyKey,
        })
      );

      if (initiateBookingPayment.fulfilled.match(result)) {
        // Payment intent created. Backend will confirm via webhook.
        // The real-time Supabase listener will update the UI when the
        // payment status transitions to SUCCESSFUL.
        dispatch(clearInitiateState());
        setActiveTab('history');
        Alert.alert(
          t('payment.initiate_success_title'),
          'Your MoMo prompt has been sent. Please approve it on your phone to complete the payment.'
        );
      } else {
        const errMsg = (result.payload as string) ?? t('payment.payment_error');
        Alert.alert(t('payment.payment_error'), errMsg);
      }
      return;
    }

    // ── GENERIC TRANSFER (boost or direct send from the 'send' tab) ─────
    // For non-booking payments (e.g., boosts), use the transfer endpoint.
    // The amount is entered manually by the user for generic transfers.
    // ── GENERIC TRANSFER (boost or direct send from the 'send' tab) ─────
    const amountNumber = parseFloat(amount);
    if (!amount || isNaN(amountNumber) || amountNumber <= 0) {
      Alert.alert(t('payment.validation_error'), t('payment.amount_error'));
      return;
    }
    if (!receiverPhone) {
      Alert.alert(t('payment.validation_error'), t('payment.validation_msg'));
      return;
    }

    // 1. DYNAMIC TRANSFER TYPE
    const transferType = incoming?.listingType;
    if (!transferType) {
      Alert.alert(t('payment.validation_error'), 'Listing type is required to determine the correct fee.');
      return;
    }

    // 2. DYNAMIC PAYMENT REASON
    const paymentReason: 'rent' | 'boosting' | 'landlord_subscription' | 'verification' =
      incoming?.reason || (incoming?.bookingId ? 'rent' : 'rent'); // Default to rent if it's a student sending money

    const idempotencyKey = `dhub-transfer-${user.id}-${receiverPhone}-${amountNumber}`;

    const result = await dispatch(
      initiateTransfer({
        payerPhone,
        receiverPhone,
        amount,
        reason: paymentReason,      // ✅ Dynamic: 'rent', 'boosting', or 'landlord_subscription'
        transferType: transferType,  // ✅ Dynamic: 'Apartment', 'Hostel', 'Hotel', etc.
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
    // Generate a secure verification URL pointing to the DHUB Netlify site
    // This allows landlords to easily verify the authenticity of the receipt
    // without needing the DHUB app installed.
    return `https://dhubcmr.netlify.app/verify.html?tx=${payment.id}`;
  };

  const generatePDF = async (payment: Payment): Promise<void> => {
    try {
      const qrData = encodeURIComponent(generateQRData(payment));
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qrData}`;

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${t('payment.receipt_title')} - ${payment.transactionId}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; color: #2C3E50; }
              .header { text-align: center; color: #D4AF37; border-bottom: 2px solid #D4AF37; padding-bottom: 20px; margin-bottom: 30px; }
              .section { margin-bottom: 25px; }
              .section-title { color: #D4AF37; font-size: 18px; font-weight: bold; margin-bottom: 15px; border-bottom: 1px solid #EAECEF; padding-bottom: 5px; }
              .row { display: flex; justify-content: space-between; margin-bottom: 8px; padding: 5px 0; }
              .label { color: #7F8C8D; font-weight: 500; }
              .value { color: #2C3E50; font-weight: 600; text-align: right; }
              .total-row { border-top: 2px solid #EAECEF; padding-top: 10px; margin-top: 10px; font-weight: bold; }
              .status-${payment.status} { color: ${getStatusColor(payment.status as any)}; font-weight: bold; }
              .footer { text-align: center; margin-top: 40px; color: #7F8C8D; font-size: 12px; border-top: 1px solid #EAECEF; padding-top: 20px; }
              .qr-container { text-align: center; margin-top: 20px; }
              .qr-image { width: 150px; height: 150px; border: 1px solid #EAECEF; padding: 10px; border-radius: 8px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>DHUB ${t('payment.receipt_title')}</h1>
              <p>${t('payment.transaction_id')}: ${payment.transactionId}</p>
            </div>
            
            <div class="section">
              <div class="section-title">${t('payment.transaction_details')}</div>
              <div class="row">
                <span class="label">${t('payment.transaction_id')}:</span>
                <span class="value">${payment.transactionId}</span>
              </div>
              <div class="row">
                <span class="label">${t('payment.description_label')}:</span>
                <span class="value">${payment.description}</span>
              </div>
              <div class="row">
                <span class="label">${t('payment.date')}:</span>
                <span class="value">${formatDate(payment.date)}</span>
              </div>
              <div class="row">
                <span class="label">${t('payment.status')}:</span>
                <span class="value status-${payment.status}">${getStatusText(payment.status as any)}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">${t('payment.amount_details')}</div>
              <div class="row">
                <span class="label">${t('payment.amount')}:</span>
                <span class="value">${formatCurrency(payment.amount)}</span>
              </div>
              <div class="row">
                <span class="label">Rent Processing Fee:</span>
                <span class="value">${formatCurrency(payment.fee ?? 0)}</span>
              </div>
              <div class="row total-row">
                <span class="label">${t('payment.net_amount')}:</span>
                <span class="value">${formatCurrency(payment.netAmount ?? 0)}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">${t('payment.parties_title')}</div>
              <div class="row">
                <span class="label">${t('payment.from')}:</span>
                <span class="value">${payment.sender}</span>
              </div>
              <div class="row">
                <span class="label">${t('payment.to')}:</span>
                <span class="value">${payment.receiver}</span>
              </div>
            </div>

            <div class="qr-container">
              <img src="${qrImageUrl}" class="qr-image" />
              <p style="font-size: 10px; color: #7F8C8D; margin-top: 5px;">${t('payment.qr_verify')}</p>
            </div>

            <div class="footer">
              <p>${t('common.generated_by')} DHUB App ${t('common.on')} ${new Date().toLocaleDateString()}</p>
              <p>&copy; ${new Date().getFullYear()} DIRA Digital Era. All rights reserved.</p>
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: t('payment.download_pdf'),
        });
      } else {
        Alert.alert(t('common.success'), `${t('common.success')}: ${uri}`);
      }
    } catch (error) {
      console.error("PDF generation error:", error);
      Alert.alert(t('common.error'), t('payment.payment_error'));
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
          <ScrollView style={styles.sendContainer}>
            <Text style={styles.sectionTitle}>{t('payment.send_tab')}</Text>

            {/* Payer Phone */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('payment.momo_number_label')}</Text>
              <TextInput
                              style={styles.input}
                              placeholder={t('payment.momo_placeholder')}
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
                style={styles.input}
                placeholder={t('payment.amount_placeholder')}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                editable={!initiating && !incoming?.amount}
              />
            </View>

            {/* Receiver Locked */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('payment.receiver_label')}</Text>
              <TextInput
                style={styles.input}
                value={receiverDisplayName || receiverPhone}
                editable={false}
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('payment.description_label')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={t('payment.description_placeholder')}
                value={description}
                onChangeText={setDescription}
                                multiline
                  numberOfLines={3}
                  editable={!initiating && !incoming?.description}
                />
              </View>

            {paymentModeLoaded ? (
              <Text style={styles.paymentModeText}>
                {useBackendPayment
                  ? 'Feature flag ON: backend payment API will be used.'
                  : 'Feature flag OFF: dialing MoMo USSD code.'}
              </Text>
            ) : (
              <Text style={styles.paymentModeText}>
                Loading payment mode…
              </Text>
            )}

            {/* Send Button */}
            <TouchableOpacity
              style={[styles.sendButton, (initiating || !paymentModeLoaded) && styles.buttonDisabled]}
              onPress={handleSendPayment}
              disabled={initiating || !paymentModeLoaded}
            >
              {initiating ? (
                <ActivityIndicator color={COLORS.onPrimary} />
              ) : (
                <Text style={styles.sendButtonText}>{t('payment.send_button')}</Text>
              )}
            </TouchableOpacity>

            {/* Error */}
            {initiateError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{initiateError}</Text>
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
              <Text style={styles.closeButtonText}>×</Text>
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
                  onPress={() => generatePDF(selectedPayment)}
                >
                  <Text style={styles.downloadButtonText}>{t('payment.download_pdf')}</Text>
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
    textArea: {
      minHeight: 80,
      textAlignVertical: "top",
    },
    sendButton: {
      backgroundColor: COLORS.primary,
      padding: 16,
      borderRadius: 8,
      alignItems: "center",
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
    },
    errorText: {
      color: COLORS.danger,
      fontSize: 14,
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
