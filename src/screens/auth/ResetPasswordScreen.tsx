// src/screens/auth/ResetPasswordScreen.tsx

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Keyboard,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ButtonPrimary from '../../components/ButtonPrimary';
import { AuthStackParamList } from '../../types';
import { sendOtp, verifyOtp } from '../../utils/otp';

type NavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'ResetPassword'
>;
type RouteProps = RouteProp<AuthStackParamList, 'ResetPassword'>;

interface Params {
  phone: string;
  mode: 'reset';
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const ResetPasswordScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { phone } = route.params as Params;

  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resendDisabled, setResendDisabled] = useState(true);
  const [timer, setTimer] = useState(60);
  const [resetting, setResetting] = useState(false);

  const inputsRef = useRef<Array<TextInput | null>>(Array(6).fill(null));

  useEffect(() => {
    if (!resendDisabled) return;

    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setResendDisabled(false);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [resendDisabled]);

  const handleResetPassword = async () => {
    if (otp.length !== 6) {
      Alert.alert('Error', 'Enter the 6-digit OTP.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    setResetting(true);
    Keyboard.dismiss();

    try {
      const otpResult = await verifyOtp(phone, otp);
      if (!otpResult.success) throw new Error(otpResult.message);

      const res = await fetch(`${API_BASE_URL}/api/auth/password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, newPassword }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      Alert.alert('Success', 'Password reset successfully.', [
        { text: 'OK', onPress: () => navigation.navigate('SignIn') },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Reset failed.');
    } finally {
      setResetting(false);
    }
  };

  const handleResend = async () => {
    if (resendDisabled) return;

    setResendDisabled(true);
    setTimer(60);

    const result = await sendOtp(phone);
    if (!result.success) {
      Alert.alert('Error', result.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter the OTP sent to {phone}
          </Text>

          <View style={styles.otpContainer}>
            {Array.from({ length: 6 }).map((_, i) => (
              <TextInput
                key={i}
                ref={el => void (inputsRef.current[i] = el)}
                style={styles.otpInput}
                value={otp[i] || ''}
                keyboardType="number-pad"
                maxLength={1}
                onChangeText={v => {
                  const arr = otp.split('');
                  arr[i] = v;
                  setOtp(arr.join(''));
                  if (v && i < 5) inputsRef.current[i + 1]?.focus();
                }}
              />
            ))}
          </View>

          <TouchableOpacity onPress={handleResend} disabled={resendDisabled}>
            <Text style={styles.resendText}>
              {resendDisabled ? `Resend in ${timer}s` : 'Resend OTP'}
            </Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="New Password"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <ButtonPrimary
            title={resetting ? 'Resetting...' : 'Reset Password'}
            onPress={handleResetPassword}
            disabled={resetting}
          />

          {resetting && (
            <View style={styles.overlay}>
              <ActivityIndicator size="large" color="#B8860B" />
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#B8860B' },
  subtitle: { color: '#666', marginBottom: 24 },
  otpContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  otpInput: {
    width: 48,
    height: 60,
    borderWidth: 1,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 20,
  },
  resendText: { color: '#B8860B', marginVertical: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ResetPasswordScreen;
