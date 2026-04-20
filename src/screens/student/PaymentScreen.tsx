//src/screens/student/PaymentScreen.tsx
import { useRoute } from "@react-navigation/native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from "react-native-qrcode-svg";
import { supabase } from '../../utils/supabaseClient';
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { clearInitiateState, fetchPayments, initiateTransfer, Payment, upsertPayment } from "../../store/paymentsSlice";
import type { RootState } from "../../store/store";

// Fixed mockup data with proper status types
// (Removed MOCK_PAYMENTS and PaymentLog interface as they are now replaced by Redux history)

const PaymentScreen: React.FC = () => {
  const route = useRoute();
  const incoming = route.params as
    | {
      amount: number;
      description: string;
      receiverPhone: string;
      receiverName: string;
      landlordId: string;
      listingId: string;
      bookingId: string;
    }
    | undefined;

  const dispatch = useAppDispatch();
  const user = useAppSelector((state: RootState) => state.auth.user);
  const { initiating, initiateError, fetchingHistory, fetchError } = useAppSelector(
    (state: RootState) => state.payments
  );
  const history = useAppSelector((state: RootState) => state.payments.history);

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
          }
        }
      )
      .subscribe((status) => {
        // console.log("🔗 [PaymentScreen] Subscription status:", status);
      });

    return () => {
      // console.log("♻️ [PaymentScreen] Cleaning up subscription");
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

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

  const handleSendPayment = async (): Promise<void> => {
    console.log("[PaymentScreen] Initiating payment...");
    if (!amount || !receiverPhone || !payerPhone) {
      Alert.alert("Validation Error", "Please fill in all required fields (Amount and Phone numbers)");
      return;
    }

    const amountNumber = parseFloat(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      Alert.alert("Validation Error", "Please enter a valid amount");
      return;
    }

    if (!user?.id) {
      Alert.alert("Session Error", "User session not found. Please log in again.");
      return;
    }

    const idempotencyKey = `dhub-transfer-${Date.now()}`;
    // console.log("this is the content of the incomming object", incoming)
    const result = await dispatch(
      initiateTransfer({
        payerPhone: payerPhone,
        receiverPhone: receiverPhone,
        amount: amount,
        reason: "rent",
        transferType: "Hostel",
        client: {
          name: "Dhub",
          description,
          payer_id: user.id,
          payee_id: incoming?.landlordId || "",
          listing_id: incoming?.listingId || "",
          booking_id: incoming?.bookingId || "",
          idempotency_key: idempotencyKey,
        },
      })
    );

    if (initiateTransfer.fulfilled.match(result)) {
      dispatch(clearInitiateState());
      setActiveTab("history");
      Alert.alert(
        "Payment Initiated 🎉",
        "Your payment has been sent. Please approve the MoMo prompt on your phone to complete the transaction."
      );
    } else {
      const errMsg =
        (result.payload as string) ?? "Payment failed. Please try again.";
      Alert.alert("Payment Error", errMsg);
    }
  };

  const handleViewReceipt = (payment: Payment): void => {
    setSelectedPayment(payment);
    setShowReceiptModal(true);
  };

  const generateQRData = (payment: Payment): string => {
    return JSON.stringify({
      transactionId: payment.transactionId,
      amount: payment.amount,
      sender: payment.sender,
      receiver: payment.receiver,
      date: payment.date,
      status: payment.status,
      description: payment.description,
    });
  };

  const generatePDF = async (payment: Payment): Promise<void> => {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Payment Receipt - ${payment.transactionId}</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                margin: 40px;
                color: #2C3E50;
              }
              .header { 
                text-align: center; 
                color: #D4AF37;
                border-bottom: 2px solid #D4AF37;
                padding-bottom: 20px;
                margin-bottom: 30px;
              }
              .section { 
                margin-bottom: 25px; 
              }
              .section-title {
                color: #D4AF37;
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 15px;
                border-bottom: 1px solid #EAECEF;
                padding-bottom: 5px;
              }
              .row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                padding: 5px 0;
              }
              .label {
                color: #7F8C8D;
                font-weight: 500;
              }
              .value {
                color: #2C3E50;
                font-weight: 600;
                text-align: right;
              }
              .total-row {
                border-top: 2px solid #EAECEF;
                padding-top: 10px;
                margin-top: 10px;
                font-weight: bold;
              }
              .status-${payment.status} {
                color: ${getStatusColor(payment.status)};
                font-weight: bold;
              }
              .footer {
                text-align: center;
                margin-top: 40px;
                color: #7F8C8D;
                font-size: 12px;
                border-top: 1px solid #EAECEF;
                padding-top: 20px;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>DHUB Payment Receipt</h1>
              <p>Transaction ID: ${payment.transactionId}</p>
            </div>
            
            <div class="section">
              <div class="section-title">Transaction Details</div>
              <div class="row">
                <span class="label">Transaction ID:</span>
                <span class="value">${payment.transactionId}</span>
              </div>
              <div class="row">
                <span class="label">Description:</span>
                <span class="value">${payment.description}</span>
              </div>
              <div class="row">
                <span class="label">Date:</span>
                <span class="value">${formatDate(payment.date)}</span>
              </div>
              <div class="row">
                <span class="label">Status:</span>
                <span class="value status-${payment.status}">${getStatusText(payment.status)}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Amount Details</div>
              <div class="row">
                <span class="label">Amount:</span>
                <span class="value">${formatCurrency(payment.amount)}</span>
              </div>
              <div class="row">
                <span class="label">Fee:</span>
                <span class="value">${formatCurrency(payment.fee ?? 0)}</span>
              </div>
              <div class="row total-row">
                <span class="label">Net Amount:</span>
                <span class="value">${formatCurrency(payment.netAmount ?? 0)}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Parties Involved</div>
              <div class="row">
                <span class="label">From:</span>
                <span class="value">${payment.sender}</span>
              </div>
              <div class="row">
                <span class="label">To:</span>
                <span class="value">${payment.receiver}</span>
              </div>
            </div>

            <div class="footer">
              <p>Generated by DHUB App on ${new Date().toLocaleDateString()}</p>
              <p>Scan the QR code to verify this transaction</p>
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Save Payment Receipt",
        });
      } else {
        Alert.alert("Success", `PDF saved to: ${uri}`);
      }
    } catch (error) {
      console.error("PDF generation error:", error);
      Alert.alert("Error", "Failed to generate PDF. Please try again.");
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

  const getStatusColor = (status: string): string => {
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

  const getStatusText = (status: string): string => {
    switch (status) {
      case "completed":
        return "Completed";
      case "pending":
        return "Pending";
      case "failed":
        return "Failed";
      default:
        return status;
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "XOF",
    }).format(amount);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Payments</Text>
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
            Payment History
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
            Send Payment
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === "history" ? (
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
            ) : history.length === 0 ? (
              <Text style={styles.emptyText}>No payment history yet.</Text>
            ) : (
              history.map((payment) => (
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
                      ID: {payment.transactionId}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        ) : (
          <ScrollView style={styles.sendContainer}>
            <Text style={styles.sectionTitle}>Send Payment</Text>

            {/* Payer Phone */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Your MTN MoMo Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="06XX XXX XXX"
                value={payerPhone}
                onChangeText={setPayerPhone}
                keyboardType="phone-pad"
                editable={!initiating}
              />
            </View>

            {/* Amount */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Amount (XAF) *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter amount"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                editable={!initiating}
              />
            </View>

            {/* Receiver Locked */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Receiver *</Text>
              <TextInput
                style={styles.input}
                value={receiverDisplayName || receiverPhone}
                editable={false}
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Payment purpose (optional)"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                editable={!initiating}
              />
            </View>

            {/* Send Button */}
            <TouchableOpacity
              style={[styles.sendButton, initiating && styles.buttonDisabled]}
              onPress={handleSendPayment}
              disabled={initiating}
            >
              {initiating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.sendButtonText}>Send Payment</Text>
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
            <Text style={styles.modalTitle}>Payment Receipt</Text>
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
                  color="#000000"
                  backgroundColor="#FFFFFF"
                />
                <Text style={styles.qrHelpText}>
                  Scan to verify transaction
                </Text>
              </View>

              {/* Receipt Sections */}
              <View style={styles.receiptSection}>
                <Text style={styles.receiptSectionTitle}>
                  Transaction Details
                </Text>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Transaction ID:</Text>
                  <Text style={styles.receiptValue}>
                    {selectedPayment.transactionId}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Description:</Text>
                  <Text style={styles.receiptValue}>
                    {selectedPayment.description}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Date:</Text>
                  <Text style={styles.receiptValue}>
                    {formatDate(selectedPayment.date)}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Status:</Text>
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
                <Text style={styles.receiptSectionTitle}>Amount Details</Text>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Amount:</Text>
                  <Text style={styles.receiptValue}>
                    {formatCurrency(selectedPayment.amount)}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Fee:</Text>
                  <Text style={styles.receiptValue}>
                    {formatCurrency(selectedPayment.fee ?? 0)}
                  </Text>
                </View>

                <View style={[styles.receiptRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Net Amount:</Text>
                  <Text style={styles.totalValue}>
                    {formatCurrency(selectedPayment.netAmount ?? 0)}
                  </Text>
                </View>
              </View>

              <View style={styles.receiptSection}>
                <Text style={styles.receiptSectionTitle}>Parties</Text>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>From:</Text>
                  <Text style={styles.receiptValue}>
                    {selectedPayment.sender}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>To:</Text>
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
                  <Text style={styles.downloadButtonText}>Download PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shareButton}
                  onPress={() => setShowReceiptModal(false)}
                >
                  <Text style={styles.shareButtonText}>Close</Text>
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
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  header: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EAECEF",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#D4AF37",
    textAlign: "center",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EAECEF",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: "#D4AF37",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#7F8C8D",
  },
  activeTabText: {
    color: "#D4AF37",
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
    color: "#2C3E50",
    marginBottom: 20,
  },
  emptyText: {
    textAlign: "center",
    color: "#7F8C8D",
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
    color: "#D4AF37",
    fontWeight: "600",
    fontSize: 14,
  },
  disabledText: {
    color: "#BDC3C7",
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
    color: "#7F8C8D",
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#D4AF37",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: "center",
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  paymentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    color: "#2C3E50",
    flex: 1,
    marginRight: 10,
  },
  paymentAmount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#D4AF37",
  },
  paymentDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  paymentDate: {
    fontSize: 14,
    color: "#7F8C8D",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  paymentFooter: {
    borderTopWidth: 1,
    borderTopColor: "#EAECEF",
    paddingTop: 8,
  },
  transactionId: {
    fontSize: 12,
    color: "#95A5A6",
    fontFamily: "monospace",
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2C3E50",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCDFE4",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: "#2C3E50",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  sendButton: {
    backgroundColor: "#D4AF37",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: "#BDC3C7",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  errorContainer: {
    backgroundColor: "#FDEDED",
    padding: 16,
    borderRadius: 8,
    marginTop: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#E74C3C",
  },
  errorText: {
    color: "#C0392B",
    fontSize: 14,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EAECEF",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2C3E50",
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 24,
    color: "#7F8C8D",
    fontWeight: "bold",
  },
  receiptContent: {
    flex: 1,
    padding: 20,
  },
  qrContainer: {
    alignItems: "center",
    marginBottom: 30,
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  qrHelpText: {
    marginTop: 10,
    fontSize: 14,
    color: "#7F8C8D",
    textAlign: "center",
  },
  receiptSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  receiptSectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2C3E50",
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
    color: "#7F8C8D",
    fontWeight: "500",
  },
  receiptValue: {
    fontSize: 14,
    color: "#2C3E50",
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
    marginLeft: 10,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: "#EAECEF",
    paddingTop: 12,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2C3E50",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#D4AF37",
  },
  receiptActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    marginBottom: 30,
  },
  downloadButton: {
    flex: 1,
    backgroundColor: "#D4AF37",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  downloadButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  shareButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DCDFE4",
  },
  shareButtonText: {
    color: "#2C3E50",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default PaymentScreen;
