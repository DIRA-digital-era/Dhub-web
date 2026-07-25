// src/screens/landlord/PaymentsScreen.tsx
import { useRoute } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Payment } from '../../services/paymentService';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { clearInitiateState, fetchPayments, initiateCollection, initiateVerificationPayment, upsertPayment } from '../../store/paymentsSlice';
import type { RootState } from '../../store/store';
import { LandlordTabRouteProp } from '../../types';
import { supabase } from '../../utils/supabaseClient';

const RECEIVER_NAME = 'DHUB';

const PaymentsScreen: React.FC = () => {
  const dispatch = useAppDispatch();

  // Redux state
  const user = useAppSelector((state: RootState) => state.auth.user);
  const payments = useAppSelector((state: RootState) => state.payments.history);
  const { initiating, initiateError, initiateData, fetchingHistory, fetchError } = useAppSelector(
    (state: RootState) => state.payments
  );

  const route = useRoute<LandlordTabRouteProp<'Payments'>>();
  const routeParams = route.params;
  const isVerificationFlow = routeParams && 'reason' in routeParams && routeParams.reason === 'verification';
  const boostParams = !isVerificationFlow && routeParams && 'planId' in routeParams ? routeParams : undefined;
  const verificationParams = isVerificationFlow ? routeParams : undefined;

  const [activeTab, setActiveTab] = useState<'history' | 'send'>('history');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Clear stale thunk state on mount
  useEffect(() => { dispatch(clearInitiateState()); }, []);

  // FETCH HISTORY & REAL-TIME SYNC
  useEffect(() => {
    if (!user?.id) return;

    dispatch(fetchPayments(user.id));

    const channel = supabase
      .channel(`landlord-payments-${user.id}`)
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
              sender: row.payer_id,
              receiver: row.payee_id,
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
  }, [user?.id]);

  // Prefill if coming from BoostScreen or ListingDetailsScreen (verification)
useEffect(() => {
  if (routeParams && 'reason' in routeParams) {
    setActiveTab('send');
    setAmount(String(routeParams.amount));
    setDescription(routeParams.description);
    return;
  }
  if (boostParams) {
    setActiveTab('send');
    setAmount(boostParams.price.toString());
    setDescription(`Boost Listing: ${boostParams.listingId}`);
  }
}, [boostParams, routeParams]);

  // Success → reset form, switch to history
  useEffect(() => {
    if (!initiateData) return;
    const numAmount = parseFloat(amount);
    setAmount('');
    setDescription('');
    setActiveTab('history');
    dispatch(clearInitiateState());
    Alert.alert(
      'Payment Initiated ',
      `${formatCurrency(numAmount)} sent to ${RECEIVER_NAME}.\nApprove the MoMo prompt on your phone to complete.`,
    );
  }, [initiateData]);

  // Failure → show alert
  useEffect(() => {
    if (!initiateError) return;
    Alert.alert('Payment Failed', initiateError);
    dispatch(clearInitiateState());
  }, [initiateError]);

  // ---------- Payment Handler ----------
  const handleSendPayment = async () => {
    if (!amount) {
      Alert.alert('Validation Error', 'Please enter an amount');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Validation Error', 'Enter a valid amount');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'User account details missing. Please sign in again.');
      return;
    }

    if (verificationParams) {
      let payerPhone = user.momo || user.phone;
      if (!payerPhone) {
        const { data } = await supabase
          .from('users')
          .select('momo, phone')
          .eq('id', user.id)
          .maybeSingle();
        payerPhone = data?.momo || data?.phone || '';
      }

      if (!payerPhone) {
        Alert.alert('Error', 'Add a mobile-money number to your profile before paying.');
        return;
      }

      dispatch(initiateVerificationPayment({
        payerPhone,
        listingId: verificationParams.listingId,
        payerId: user.id,
      }));
      return;
    }

    if (!user.phone) {
      Alert.alert('Error', 'User account details missing. Please sign in again.');
      return;
    }

    const reason = boostParams ? 'boosting' : 'landlord_subscription';
    const planId = boostParams?.planId;
    const tierId = reason === 'landlord_subscription' ? 'tier_monthly' : undefined;

    dispatch(initiateCollection({
      payerPhone: user.phone,
      amount: String(numAmount),
      reason,
      planId,
      tierId,
      client: {
        name: 'Dhub',
        id: `col-${Date.now()}`,
        payer_id: user.id,
        listing_id: boostParams?.listingId ?? '',
        idempotency_key: `dhub-col-${Date.now()}`,
      },
    }));
  };
  const handleViewReceipt = (payment: Payment) => {
    setSelectedPayment(payment);
    setShowReceiptModal(true);
  };

  // ---------- Helpers ----------
  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF' }).format(value);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#27AE60';
      case 'pending': return '#F39C12';
      case 'failed': return '#E74C3C';
      default: return '#7F8C8D';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'pending': return 'Pending';
      case 'failed': return 'Failed';
      default: return status;
    }
  };

  const generateQRData = (payment: Payment) =>
    JSON.stringify({
      transactionId: payment.transactionId,
      amount: payment.amount,
      sender: payment.sender,
      receiver: payment.receiver,
      date: payment.date,
      status: payment.status,
      description: payment.description,
    });

  const generatePDF = async (payment: Payment) => {
    setPdfLoading(true);
    try {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Receipt - ${payment.transactionId}</title>
        <style>
          body{font-family:Arial,sans-serif;margin:40px;color:#2C3E50}
          .header{text-align:center;color:#D4AF37;border-bottom:2px solid #D4AF37;padding-bottom:20px;margin-bottom:30px}
          .section{margin-bottom:25px}
          .section-title{color:#D4AF37;font-size:18px;font-weight:bold;margin-bottom:15px;border-bottom:1px solid #EAECEF;padding-bottom:5px}
          .row{display:flex;justify-content:space-between;margin-bottom:8px;padding:5px 0}
          .label{color:#7F8C8D;font-weight:500}
          .value{color:#2C3E50;font-weight:600;text-align:right}
          .total-row{border-top:2px solid #EAECEF;padding-top:10px;margin-top:10px;font-weight:bold}
          .footer{text-align:center;margin-top:40px;color:#7F8C8D;font-size:12px;border-top:1px solid #EAECEF;padding-top:20px}
        </style></head><body>
        <div class="header"><h1>DHUB Payment Receipt</h1><p>Transaction ID: ${payment.transactionId}</p></div>
        <div class="section">
          <div class="section-title">Transaction Details</div>
          <div class="row"><span class="label">Transaction ID:</span><span class="value">${payment.transactionId}</span></div>
          <div class="row"><span class="label">Description:</span><span class="value">${payment.description}</span></div>
          <div class="row"><span class="label">Date:</span><span class="value">${formatDate(payment.date)}</span></div>
          <div class="row"><span class="label">Status:</span><span class="value">${getStatusText(payment.status)}</span></div>
        </div>
        <div class="section">
          <div class="section-title">Amount Details</div>
          <div class="row"><span class="label">Amount:</span><span class="value">${formatCurrency(payment.amount)}</span></div>
          <div class="row"><span class="label">Fee:</span><span class="value">${formatCurrency(payment.fee || 0)}</span></div>
          <div class="row total-row"><span class="label">Net Amount:</span><span class="value">${formatCurrency(payment.netAmount || 0)}</span></div>
        </div>
        <div class="section">
          <div class="section-title">Parties</div>
          <div class="row"><span class="label">From:</span><span class="value">${payment.sender}</span></div>
          <div class="row"><span class="label">To:</span><span class="value">${RECEIVER_NAME} (${payment.receiver})</span></div>
        </div>
        <div class="footer"><p>Generated by DHUB App on ${new Date().toLocaleDateString()}</p></div>
        </body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save Receipt' });
      } else {
        Alert.alert('Saved', `PDF saved to: ${uri}`);
      }
    } catch {
      Alert.alert('Error', 'Failed to generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  // ---------- Render ----------
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Payments</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            Payment History
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'send' && styles.activeTab]}
          onPress={() => setActiveTab('send')}
        >
          <Text style={[styles.tabText, activeTab === 'send' && styles.activeTabText]}>
            Send Payment
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'history' ? (
        <ScrollView style={styles.historyContainer}>
          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <TouchableOpacity
              onPress={() => user?.id && dispatch(fetchPayments(user.id))}
              disabled={fetchingHistory}
            >
              <Text style={[styles.refreshText, fetchingHistory && styles.disabledText]}>
                {fetchingHistory ? "Refreshing..." : "Refresh"}
              </Text>
            </TouchableOpacity>
          </View>

          {fetchingHistory ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#D4AF37" />
              <Text style={styles.loadingText}>Loading history...</Text>
            </View>
          ) : fetchError ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{fetchError}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => user?.id && dispatch(fetchPayments(user.id))}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : payments.length === 0 ? (
            <Text style={styles.emptyText}>No payment history yet.</Text>
          ) : (
            payments.map((payment: any) => (
              <TouchableOpacity
                key={payment.id}
                style={styles.paymentCard}
                onPress={() => handleViewReceipt(payment)}
              >
                <View style={styles.paymentHeader}>
                  <Text style={styles.paymentDescription}>{payment.description}</Text>
                  <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                </View>
                <View style={styles.paymentDetails}>
                  <Text style={styles.paymentDate}>{formatDate(payment.date)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(payment.status) }]}>
                    <Text style={styles.statusText}>{getStatusText(payment.status)}</Text>
                  </View>
                </View>
                <View style={styles.paymentFooter}>
                  <Text style={styles.transactionId}>ID: {payment.transactionId}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.sendContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Amount (XAF) *</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              editable={!initiating && !verificationParams}
              placeholder="Enter amount"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Receiver</Text>
            <TextInput style={[styles.input, styles.disabledInput]} value={RECEIVER_NAME} editable={false} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea, (boostParams || verificationParams) && styles.disabledInput]}
              value={boostParams ? 'Boost Listing' : description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              editable={!boostParams && !verificationParams && !initiating}
            />
          </View>

          <TouchableOpacity
            style={[styles.sendButton, initiating && styles.buttonDisabled]}
            onPress={handleSendPayment}
            disabled={initiating}
          >
            {initiating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.sendButtonText}>Send Payment</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Receipt Modal */}
      <Modal visible={showReceiptModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Payment Receipt</Text>
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowReceiptModal(false)}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          {selectedPayment && (
            <ScrollView style={styles.receiptContent}>
              <View style={styles.qrContainer}>
                <QRCode value={generateQRData(selectedPayment)} size={200} color="#000" backgroundColor="#fff" />
                <Text style={styles.qrHelpText}>Scan to verify transaction</Text>
              </View>

              <View style={styles.receiptSection}>
                <Text style={styles.receiptSectionTitle}>Transaction Details</Text>
                {[
                  ['Transaction ID', selectedPayment.transactionId],
                  ['Description', selectedPayment.description],
                  ['Date', formatDate(selectedPayment.date)],
                  ['Status', getStatusText(selectedPayment.status)],
                ].map(([label, value]) => (
                  <View key={label} style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>{label}:</Text>
                    <Text style={styles.receiptValue}>{value}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.receiptSection}>
                <Text style={styles.receiptSectionTitle}>Amount Details</Text>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Amount:</Text>
                  <Text style={styles.receiptValue}>{formatCurrency(selectedPayment.amount)}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Fee:</Text>
                  <Text style={styles.receiptValue}>{formatCurrency(selectedPayment.fee || 0)}</Text>
                </View>
                <View style={[styles.receiptRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Net Amount:</Text>
                  <Text style={styles.totalValue}>{formatCurrency(selectedPayment.netAmount || 0)}</Text>
                </View>
              </View>

              <View style={styles.receiptSection}>
                <Text style={styles.receiptSectionTitle}>Parties</Text>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>From:</Text>
                  <Text style={styles.receiptValue}>{selectedPayment.sender}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>To:</Text>
                  <Text style={styles.receiptValue}>{RECEIVER_NAME}</Text>
                </View>
              </View>

              <View style={styles.receiptActions}>
                <TouchableOpacity
                  style={[styles.downloadButton, pdfLoading && styles.buttonDisabled]}
                  onPress={() => generatePDF(selectedPayment)}
                  disabled={pdfLoading}
                >
                  {pdfLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.downloadButtonText}>Download PDF</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeReceiptButton} onPress={() => setShowReceiptModal(false)}>
                  <Text style={styles.closeReceiptText}>Close</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#EAECEF' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#D4AF37', textAlign: 'center' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EAECEF' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  activeTab: { borderBottomWidth: 3, borderBottomColor: '#D4AF37' },
  tabText: { fontSize: 16, fontWeight: '600', color: '#7F8C8D' },
  activeTabText: { color: '#D4AF37' },
  historyContainer: { flex: 1, padding: 20 },
  sendContainer: { flex: 1, padding: 20 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50', marginBottom: 20 },
  emptyText: { textAlign: 'center', color: '#7F8C8D', marginTop: 40, fontSize: 16 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  refreshText: { color: '#D4AF37', fontWeight: '600', fontSize: 14 },
  disabledText: { color: '#BDC3C7' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, fontSize: 16, color: '#7F8C8D' },
  errorContainer: { backgroundColor: '#FDEDED', padding: 16, borderRadius: 8, marginTop: 20, borderLeftWidth: 4, borderLeftColor: '#E74C3C' },
  errorText: { color: '#C0392B', fontSize: 14 },
  retryButton: { marginTop: 16, backgroundColor: '#D4AF37', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, alignSelf: 'center' },
  retryButtonText: { color: '#FFFFFF', fontWeight: 'bold' },
  inputGroup: { marginBottom: 16 },
  disabledInput: { backgroundColor: '#e0e0e0', color: '#7f7f7f' },
  label: { fontSize: 16, fontWeight: '600', color: '#2C3E50', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCDFE4', borderRadius: 8, padding: 12, fontSize: 16, color: '#2C3E50' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  sendButton: { backgroundColor: '#D4AF37', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonDisabled: { opacity: 0.6 },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  paymentCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  paymentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  paymentDescription: { fontSize: 16, fontWeight: '600', color: '#2C3E50', flex: 1, marginRight: 10 },
  paymentAmount: { fontSize: 18, fontWeight: 'bold', color: '#D4AF37' },
  paymentDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  paymentDate: { fontSize: 14, color: '#7F8C8D' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  paymentFooter: { borderTopWidth: 1, borderTopColor: '#EAECEF', paddingTop: 8 },
  transactionId: { fontSize: 12, color: '#95A5A6', fontFamily: 'monospace' },
  modalContainer: { flex: 1, backgroundColor: '#F8F9FA' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#EAECEF' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50' },
  closeButton: { padding: 4 },
  closeButtonText: { fontSize: 24, color: '#7F8C8D', fontWeight: 'bold' },
  receiptContent: { flex: 1, padding: 20 },
  qrContainer: { alignItems: 'center', marginBottom: 20, backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12 },
  qrHelpText: { marginTop: 10, fontSize: 14, color: '#7F8C8D', textAlign: 'center' },
  receiptSection: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16 },
  receiptSectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#D4AF37', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#EAECEF', paddingBottom: 8 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  receiptLabel: { fontSize: 14, color: '#7F8C8D', fontWeight: '500' },
  receiptValue: { fontSize: 14, color: '#2C3E50', fontWeight: '600', flex: 1, textAlign: 'right' },
  totalRow: { borderTopWidth: 2, borderTopColor: '#EAECEF', paddingTop: 10, marginTop: 4 },
  totalLabel: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50' },
  totalValue: { fontSize: 16, fontWeight: 'bold', color: '#D4AF37' },
  receiptActions: { flexDirection: 'row', gap: 12, marginBottom: 30 },
  downloadButton: { flex: 1, backgroundColor: '#D4AF37', padding: 14, borderRadius: 8, alignItems: 'center' },
  downloadButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  closeReceiptButton: { flex: 1, backgroundColor: '#FFFFFF', padding: 14, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#DCDFE4' },
  closeReceiptText: { color: '#2C3E50', fontSize: 14, fontWeight: 'bold' },
});

export default PaymentsScreen;