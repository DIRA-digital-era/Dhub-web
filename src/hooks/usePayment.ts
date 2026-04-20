// Custom hook for payment operations - handles loading states and errors
import { useState } from 'react';
import { momo } from '../utils/payments';
import { PaymentParams, PaymentResult, PaymentState } from '../types';

// WHY THIS HOOK: Separates payment logic from UI, makes it reusable across components
export const usePayment = () => {
  const [state, setState] = useState<PaymentState>({
    loading: false,
    error: null,
    result: null,
  });

  const initiatePayment = async (paymentData: PaymentParams): Promise<PaymentResult> => {
    setState({ loading: true, error: null, result: null });

    try {
      // Call the Momo SDK - this runs in your React Native app
      const paymentResult = await momo.initiatePayment({
        amount: paymentData.amount,
        sender: paymentData.senderPhone,
        receiver: paymentData.receiverPhone,
        description: paymentData.description || 'Payment via app',
        metadata: {
          orderId: paymentData.orderId || `order_${Date.now()}`,
          userId: paymentData.userId,
          // Add any app-specific metadata
          appName: 'YourAppName',
          timestamp: new Date().toISOString(),
        }
      });

      setState({ loading: false, error: null, result: paymentResult });
      return paymentResult;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Payment failed';
      setState({ 
        loading: false, 
        error: errorMessage, 
        result: null 
      });
      throw new Error(errorMessage);
    }
  };

  const resetPayment = () => {
    setState({ loading: false, error: null, result: null });
  };

  return {
    initiatePayment,
    resetPayment,
    ...state
  };
};