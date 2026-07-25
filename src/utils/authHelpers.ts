// Helper functions for unified auth system
//src/utils/authHelpers.ts
export const generatePhoneEmail = (phone: string): string => {
  const cleanPhone = phone.replace(/\D/g, '');
  return `phone_${cleanPhone}@yourapp.com`;
};

export const isPhoneEmail = (email: string): boolean => {
  return email.startsWith('phone_') && email.endsWith('@yourapp.com');
};

export const extractPhoneFromEmail = (email: string): string | null => {
  if (!isPhoneEmail(email)) return null;
  const match = email.match(/^phone_(\d+)@yourapp\.com$/);
  return match ? `+${match[1]}` : null;
};

export const normalizePhone = (input: string): string => {
  const digits = input.replace(/\D/g, '');
  
  if (digits.startsWith('0') && digits.length === 9) {
    return `+237${digits.slice(1)}`;
  }
  
  if (digits.length === 9) {
    return `+237${digits}`;
  }
  
  if (digits.length > 9) {
    return `+${digits}`;
  }
  
  return input;
};