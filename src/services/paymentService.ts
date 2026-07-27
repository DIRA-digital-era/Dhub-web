// src/services/paymentService.ts

import { supabase } from "../utils/supabaseClient";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_DIRA_PAYMENT_URL ;

export interface Payment {
  id: string;

  transactionId: string;

  amount: number;

  sender: string;

  receiver: string;

  status: "pending" | "completed" | "failed";

  date: string;

  description: string;

  fee?: number;

  netAmount?: number;
}

export interface InitiateTransferArgs {
  payerPhone: string;

  receiverPhone: string;

  amount?: string;

  reason: string;

  transferType: string;

  planId?: string;

  tierId?: string;

  client: {
    name: string;

    description: string;

    payer_id: string;

    payee_id: string;

    listing_id: string;

    booking_id: string;

    idempotency_key: string;
  };
}

export interface InitiateCollectionArgs {
  payerPhone: string;

  amount?: string;

  reason: string;

  planId?: string;

  tierId?: string;

  client: {
    name: string;

    id: string;

    payer_id: string;

    listing_id: string;

    idempotency_key: string;
  };
}

export interface InitiateBookingPaymentArgs {
  bookingId: string;

  payerPhone: string;

  paymentKind: "initial" | "rent_completion" | "renewal";

  idempotencyKey: string;
}

export interface InitiateVerificationPaymentArgs {
  payerPhone: string;

  listingId: string;

  payerId: string;
}

/**

 * Retrieves the active Supabase session and constructs standard Auth headers.

 */

const getAuthHeaders = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    console.error("🔒 [PaymentService] Auth Error: No active session found.");

    throw new Error("Your session has expired. Please sign in again.");
  }

  return {
    "Content-Type": "application/json",

    Authorization: `Bearer ${session.access_token}`,
  };
};

export const paymentService = {
  async initiateCollection(args: InitiateCollectionArgs) {
    console.info(
      "💸 [PaymentService] Initiating Collection:",
      args.client.idempotency_key,
    );

    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/api/payments/collection`, {
      method: "POST",

      headers,

      body: JSON.stringify(args),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("❌ [PaymentService] Collection Failed:", body);

      throw new Error(
        body?.message ||
          body?.error ||
          `Request failed with status ${response.status}`,
      );
    }

    console.info("✅ [PaymentService] Collection Success:", body);

    return body;
  },

  async initiateTransfer(args: InitiateTransferArgs) {
    console.info(
      "💸 [PaymentService] Initiating Transfer:",
      args.client.idempotency_key,
    );

    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/api/payments/transfer`, {
      method: "POST",

      headers,

      body: JSON.stringify(args),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("❌ [PaymentService] Transfer Failed:", body);

      throw new Error(
        body?.message ||
          body?.error ||
          `Request failed with status ${response.status}`,
      );
    }

    console.info("✅ [PaymentService] Transfer Success:", body);

    return body;
  },

  async initiateBookingPayment(args: InitiateBookingPaymentArgs) {
    console.info(
      "💸 [PaymentService] Initiating Booking Payment for:",
      args.bookingId,
    );

    const headers = await getAuthHeaders();

    const response = await fetch(
      `${API_BASE_URL}/api/payments/booking-intents`,
      {
        method: "POST",

        headers,

        body: JSON.stringify(args),
      },
    );

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("❌ [PaymentService] Booking Payment Failed:", body);

      throw new Error(body?.error || "Unable to start payment.");
    }

    console.info("✅ [PaymentService] Booking Payment Success:", body.data);

    return body.data;
  },

  async initiateVerificationPayment(args: InitiateVerificationPaymentArgs) {
    console.info(
      "💸 [PaymentService] Initiating Verification Payment for listing:",
      args.listingId,
    );

    const headers = await getAuthHeaders();

    const response = await fetch(
      `${API_BASE_URL}/api/payments/verification-intent`,
      {
        method: "POST",

        headers,

        body: JSON.stringify(args),
      },
    );

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("❌ [PaymentService] Verification Payment Failed:", body);

      throw new Error(body?.error || "Unable to start verification payment.");
    }

    console.info(
      "✅ [PaymentService] Verification Payment Success:",
      body.data,
    );

    return body.data;
  },

  async fetchPayments(userId: string): Promise<Payment[]> {
    console.info(`🔄 [PaymentService] Fetching history for user: ${userId}`);

    const { data, error } = await supabase

      .from("payments")

      .select("*")

      .eq("payer_id", userId)

      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ [PaymentService] Supabase Fetch Error:", error);

      throw new Error(error.message || "Failed to fetch payment history");
    }

    console.info(
      `✅ [PaymentService] Fetched ${data?.length || 0} payment records.`,
    );

    return (data || []).map((row: any) => ({
      id: row.id,

      transactionId: row.transaction_ref || row.id,

      amount: parseFloat(row.amount),

      sender: row.payer_id,

      receiver: row.payee_id,

      status: row.status as any,

      date: row.created_at,

      description: row.currency ? `${row.currency} Payment` : "Payment",

      fee: row.fee ? parseFloat(row.fee) : 0,

      netAmount: row.net_amount
        ? parseFloat(row.net_amount)
        : parseFloat(row.amount),
    }));
  },
};
