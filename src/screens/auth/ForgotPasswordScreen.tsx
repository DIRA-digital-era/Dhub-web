// src/screens/auth/ForgotPasswordScreen.tsx

import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ButtonPrimary from '../../components/ButtonPrimary';
import { supabase } from '../../utils/supabaseClient';
import { AuthStackParamList } from '../../types';
import { normalizePhone } from '../../utils/authHelpers';
import { sendOtp } from '../../utils/otp';

type NavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'ForgotPassword'
>;
type RouteProps = RouteProp<AuthStackParamList, 'ForgotPassword'>;

const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();

  const [identifier, setIdentifier] = useState(
    route.params?.email || route.params?.phone || ''
  );
  const [loading, setLoading] = useState(false);

  const handleIdentifierChange = (text: string) => {
    if (text.includes('@')) {
      setIdentifier(text);
      return;
    }
    setIdentifier(text.replace(/\D/g, '').slice(0, 9));
  };

  const handleEmailReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: 'yourapp://reset-password' }
    );

    if (error) throw new Error(error.message);
  };

  const handlePhoneReset = async (rawPhone: string) => {
    const phone = normalizePhone(rawPhone);

    if (!phone || !phone.startsWith('+237') || phone.length !== 13) {
      throw new Error('Please enter a valid Cameroon phone number.');
    }

    const result = await sendOtp(phone);
    if (!result.success) throw new Error(result.message);

    navigation.navigate('ResetPassword', {
      phone,
      mode: 'reset',
    });
  };

  const handleResetPassword = async () => {
    Keyboard.dismiss();

    if (!identifier.trim()) {
      Alert.alert('Error', 'Please enter your email or phone number.');
      return;
    }

    setLoading(true);

    try {
      const isEmail = /\S+@\S+\.\S+/.test(identifier);

      if (isEmail) {
        await handleEmailReset(identifier);
        Alert.alert(
          'Check Your Email',
          'Password reset instructions have been sent.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        await handlePhoneReset(identifier);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email or phone number to reset your password.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email or Phone Number"
            value={identifier}
            onChangeText={handleIdentifierChange}
            autoCapitalize="none"
            editable={!loading}
          />

          <ButtonPrimary
            title={loading ? 'Sending...' : 'Send Reset Instructions'}
            onPress={handleResetPassword}
            disabled={loading}
          />

          {loading && (
            <ActivityIndicator
              size="large"
              color="#B8860B"
              style={{ marginTop: 16 }}
            />
          )}

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            disabled={loading}
          >
            <Text style={styles.backText}>Back to Sign In</Text>
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    color: '#B8860B',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  backButton: { marginTop: 20, alignItems: 'center' },
  backText: { color: '#B8860B', fontWeight: '600', fontSize: 16 },
});

export default ForgotPasswordScreen;
