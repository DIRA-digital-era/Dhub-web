// src/services/paymentService.ts
export interface PaymentPayload {
  payerPhone: string;
  receiverPhone: string;
  amount: number;
  transferType: 'mtn_momo' | 'orange_money' | 'card'; // adjust to your providers
  booking_id: string;
  listing_id: string;
}

export interface PaymentResponse {
  success: boolean;
  message?: string;
  data?: any;
}

export const makePayment = async (
  payload: PaymentPayload
): Promise<PaymentResponse> => {
  // Basic validation (don’t trust frontend state blindly)
  if (!payload.booking_id || !payload.listing_id) {
    throw new Error('Missing booking_id or listing_id');
  }

  if (!payload.amount || payload.amount <= 0) {
    throw new Error('Invalid payment amount');
  }

  try {
    console.log(' Sending payment request:', payload);

    const response = await fetch(
      'https://dhubpayment.onrender.com/api/payments/transfer',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload), //  flat payload
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Payment failed:', data);
      throw new Error(data?.message || 'Payment request failed');
    }

    console.log('✅ Payment success response:', data);

    return {
      success: true,
      data,
    };
  } catch (error: any) {
    console.error(' Payment error:', error.message);

    return {
      success: false,
      message: error.message,
    };
  }
};