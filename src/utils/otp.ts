 // src/utils/otp.ts

const BACKEND_URL = process.env.EXPO_PUBLIC_API_URL  || 'http://localhost:3000';

/**
 * Send OTP to user's WhatsApp number
 */
export const sendOtp = async (
  phone: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

    const result = await res.json().catch(() => null);

    if (!res.ok || !result?.success) {
      return {
        success: false,
        message: result?.message || `Request failed with status ${res.status}`
      };
    }

    return {
      success: true,
      message: result.message || 'OTP sent successfully'
    };
  } catch (err: any) {
    console.error('[sendOtp] Error:', err.message || err);

    if (err.message?.includes('Network request failed')) {
      return { success: false, message: 'Network error. Please check your connection.' };
    }

    return { success: false, message: 'Failed to send OTP. Please try again.' };
  }
};

/**
 * Verify OTP through backend endpoint
 */
export const verifyOtp = async (
  phone: string,
  otp: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code: otp }),
    });

    const result = await res.json().catch(() => null);

    if (!res.ok || !result?.success) {
      return {
        success: false,
        message: result?.message || `Request failed with status ${res.status}`
      };
    }

    return {
      success: true,
      message: result.message || 'OTP verified successfully'
    };
  } catch (err: any) {
    console.error('[verifyOtp] Error:', err.message || err);

    if (err.message?.includes('Network request failed')) {
      return { success: false, message: 'Network error. Please check your connection.' };
    }

    return { success: false, message: 'Verification failed. Please try again.' };
  }
};
