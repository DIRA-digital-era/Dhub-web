// src/screens/auth/VerifyOtpScreen.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import ButtonPrimary from '../../components/ButtonPrimary';
import { AuthStackParamList, RootStackParamList } from '../../types';
import { sendOtp as sendOtpHelper, verifyOtp as verifyOtpHelper } from '../../utils/otp';
import { supabase } from '../../utils/supabaseClient';

type VerifyOtpScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AuthStack'>;
type VerifyOtpScreenRouteProp = RouteProp<AuthStackParamList, 'VerifyOtp'>;

interface VerifyOtpParams {
  fullName?: string;
  email?: string;
  whatsappNumber: string;
  mobileMoney?: string;
  password?: string;
  role?: 'student' | 'landlord';
  age?: string;
  address?: string;
  language?: 'en' | 'fr' | 'pcm';
  mode?: 'signup' | 'login';
}

const VerifyOtpScreen: React.FC = () => {
  const navigation = useNavigation<VerifyOtpScreenNavigationProp>();
  const route = useRoute<VerifyOtpScreenRouteProp>();
  const {
    fullName,
    email,
    whatsappNumber,
    mobileMoney,
    password,
    role,
    age,
    address,
    language: routeLang,
    mode = 'signup'
  } = route.params as VerifyOtpParams;

  const [otp, setOtp] = useState('');
  const [resendDisabled, setResendDisabled] = useState(true);
  const [timer, setTimer] = useState(60);
  const [verifying, setVerifying] = useState(false);
  const [language, setLanguage] = useState<'en' | 'fr' | 'pcm'>('en');
  const inputsRef = useRef<Array<TextInput | null>>(Array(6).fill(null));

  // ------------------- Effects -------------------

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendDisabled) {
      interval = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setResendDisabled(false);
            return 60;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => interval && clearInterval(interval);
  }, [resendDisabled]);

  useEffect(() => {
    loadLanguage();
  }, [routeLang]);

  useEffect(() => {
    if (otp.length === 6 && !verifying) {
      handleVerifyOtp();
    }
  }, [otp]);

  // ------------------- Handlers -------------------

  const loadLanguage = async () => {
    try {
      if (routeLang === 'en' || routeLang === 'fr' || routeLang === 'pcm') {
        setLanguage(routeLang);
      } else {
        const storedLang = await AsyncStorage.getItem('appLanguage');
        if (storedLang === 'en' || storedLang === 'fr' || storedLang === 'pcm') {
          setLanguage(storedLang);
        }
      }
    } catch (error) {
      console.log('Error loading language:', error);
    }
  };

  const handleChange = (value: string, index: number) => {
    if (!/^\d?$/.test(value)) return;
    const otpArray = otp.split('');
    otpArray[index] = value;
    setOtp(otpArray.join(''));
    if (value && index < 5) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (otp[index]) {
        const otpArray = otp.split('');
        otpArray[index] = '';
        setOtp(otpArray.join(''));
      } else if (index > 0) inputsRef.current[index - 1]?.focus();
    }
  };

  const handleSignupAfterOtp = async () => {
    if (!fullName || !password || !role) {
      throw new Error('Missing required signup data');
    }

    // Signup via backend
    const signupResponse = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/signup/phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: whatsappNumber,
        password: password,
        fullName: fullName.trim(),
        role: role,
        age: age,
        address: address,
        mobileMoney: mobileMoney,
        language: language,
        email: email?.trim() || null,
      }),
    });
    const signupResult = await signupResponse.json();
    if (!signupResult.success) throw new Error(signupResult.message);

    // Login immediately to get session
    const loginResponse = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: whatsappNumber, password: password }),
    });
    const loginResult = await loginResponse.json();
    if (!loginResult.success) throw new Error('Account created but login failed');

    // Persist user info locally
    await AsyncStorage.setItem('isLoggedIn', 'true');
    await AsyncStorage.setItem('userRole', loginResult.user.role);
    await AsyncStorage.setItem('userInfo', JSON.stringify(loginResult.user));

    if (loginResult.session) await supabase.auth.setSession(loginResult.session);

    return loginResult.user.role;
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6) return;
    setVerifying(true);
    Keyboard.dismiss();

    try {
      const result = await verifyOtpHelper(whatsappNumber, otp); // ✅ Use otp.ts helper
      if (!result.success) {
        Alert.alert('Verification Failed', result.message);
        setOtp('');
        inputsRef.current[0]?.focus();
        setVerifying(false);
        return;
      }

      let userRole: string;
      if (mode === 'signup') {
        userRole = await handleSignupAfterOtp();
        Alert.alert('Success!', 'Your account has been created successfully!');
      } else {
        throw new Error('Login mode not supported in this flow');
      }

      navigateToApp(userRole);
    } catch (err: any) {
      console.error('Verification error:', err);
      Alert.alert('Error', err.message || 'Something went wrong. Please try again.');
      setVerifying(false);
    }
  };

  const navigateToApp = (userRole: string) => {
    navigation.reset({
      index: 0,
      routes: [
        { name: userRole === 'student' ? 'StudentStack' : 'LandlordStack' }
      ],
    });
  };

  const handleResend = async () => {
    if (resendDisabled) return;
    setResendDisabled(true);
    setTimer(60);
    try {
      const result = await sendOtpHelper(whatsappNumber); // ✅ Use otp.ts helper
      if (!result.success) Alert.alert('Error', result.message || 'Failed to resend OTP');
      else Alert.alert('OTP Sent', 'A new code has been sent to your WhatsApp.');
    } catch (err) {
      console.error('Resend OTP error:', err);
      Alert.alert('Error', 'Failed to resend OTP. Please try again.');
    }
  };

  const handleBack = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'AuthStack' }],
    });
  };

  const handleBackToSignup = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'AuthStack' }],
    });
  };

  // ------------------- UI -------------------
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.container}>
          <Text style={styles.title}>Verify WhatsApp OTP</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to {whatsappNumber}
          </Text>

          <View style={styles.otpContainer}>
            {Array.from({ length: 6 }).map((_, index) => (
              <TextInput
                key={index}
                ref={el => void (inputsRef.current[index] = el)}
                style={[styles.otpInput, otp[index] && styles.otpInputFilled]}
                value={otp[index] || ''}
                onChangeText={val => handleChange(val, index)}
                onKeyPress={e => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={1}
                textAlign="center"
                placeholder="-"
                placeholderTextColor="#999"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                editable={!verifying}
                selectTextOnFocus
              />
            ))}
          </View>

          <TouchableOpacity
            onPress={handleResend}
            disabled={resendDisabled || verifying}
            style={styles.resendButton}
          >
            <Text style={[styles.resendText, (resendDisabled || verifying) && styles.resendTextDisabled]}>
              {resendDisabled ? `Resend in ${timer}s` : 'Resend OTP'}
            </Text>
          </TouchableOpacity>

          <ButtonPrimary
            title="Back to Sign In"
            onPress={handleBack}
            style={{ marginTop: 20 }}
            disabled={verifying}
            variant="outline"
          />

          {mode === 'signup' && (
            <ButtonPrimary
              title="Back to Sign Up"
              onPress={handleBackToSignup}
              style={{ marginTop: 12 }}
              disabled={verifying}
              variant="outline"
            />
          )}

          {verifying && (
            <View style={styles.verifyingOverlay}>
              <ActivityIndicator size="large" color="#B8860B" />
              <Text style={styles.verifyingText}>
                {mode === 'signup' ? 'Creating your account...' : 'Logging you in...'}
              </Text>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

// --- Styles remain unchanged ---
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#B8860B', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 40, textAlign: 'center', lineHeight: 22 },
  otpContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', maxWidth: 300, marginBottom: 24 },
  otpInput: { width: 50, height: 60, borderWidth: 2, borderColor: '#E5E5E5', borderRadius: 12, fontSize: 24, color: '#333', backgroundColor: '#fafafa', fontWeight: '600' },
  otpInputFilled: { borderColor: '#B8860B', backgroundColor: '#fff' },
  resendButton: { marginVertical: 8 },
  resendText: { color: '#B8860B', fontWeight: '600', fontSize: 16 },
  resendTextDisabled: { color: '#999' },
  verifyingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.95)', justifyContent: 'center', alignItems: 'center' },
  verifyingText: { marginTop: 16, fontSize: 16, color: '#B8860B', fontWeight: '600' },
});

export default VerifyOtpScreen;
