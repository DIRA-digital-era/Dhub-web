// Momo SDK configuration - runs in your React Native app, NOT backend
import { MomoSDK } from 'momo-escrow-sdk';

// WHY THIS FILE: Centralizes payment configuration so you can change
// providers/credentials in one place without breaking your app

// IMPORTANT: Use MTN sandbox credentials first for testing
// Get these from https://momodeveloper.mtn.com
export const momo = new MomoSDK({
  provider: 'mtn' as const, // TypeScript literal type
  providerConfig: {
    baseUrl: 'https://sandbox.momodeveloper.mtn.com', // Sandbox URL
    apiKey: 'YOUR_MTN_SUBSCRIPTION_KEY', // From MTN developer portal
    apiUser: 'YOUR_MTN_API_USER', // From MTN developer portal  
    apiSecret: 'YOUR_MTN_API_SECRET', // From MTN developer portal
  },
  escrowAccount: '46733123453', // MTN sandbox test number
  feePercent: 2.5,
});

// MTN Sandbox test numbers (provided by MTN for testing)
export const TEST_PHONE_NUMBERS = {
  sender: '46733123453', // Test payer number
  receiver: '46733123454', // Test payee number
} as const;