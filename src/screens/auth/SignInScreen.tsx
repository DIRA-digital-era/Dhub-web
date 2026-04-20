// src/screens/auth/SignInScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { useDispatch } from 'react-redux';

import ButtonPrimary from '../../components/ButtonPrimary';
import type { AppDispatch } from '../../store/store';
import { AuthStackParamList } from '../../types';
import { normalizePhone } from '../../utils/authHelpers';
import { loginWithPhone, loginWithGoogle, SimpleUserProfile } from '../../utils/login';
import { setUser } from '../../store/authSlice';
import { User } from '../../store/authSlice';

type SignInScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;

const SignInScreen: React.FC = () => {
  const navigation = useNavigation<SignInScreenNavigationProp>();
  const dispatch = useDispatch<AppDispatch>();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const sanitizePhone = (text: string) => text.replace(/\D/g, '').slice(0, 9);
  const handleIdentifierChange = (text: string) => {
    setIdentifier(text);
    setErrorMessage('');
  };


const mapToReduxUser = (u: SimpleUserProfile): User => ({
  id: u.id,
  fullName: u.fullName || '',
  email: u.email || '',
  role: (u.role || 'student') as 'student' | 'landlord' | 'admin',
  phone: u.phone || '', 
  token: '', 
  refreshToken: ''
});


  const handleSignIn = async () => {
    Keyboard.dismiss();
    setErrorMessage('');

    if (!identifier.trim() || !password.trim()) {
      setErrorMessage('Please enter your phone number and password.');
      return;
    }

    setLoading(true);

    try {
      const digits = sanitizePhone(identifier);
      const normalized = normalizePhone(digits);
      if (!normalized || !normalized.startsWith('+237') || normalized.length !== 13) {
        setErrorMessage('Please enter a valid Cameroon phone number (9 digits).');
        setLoading(false);
        return;
      }
      console.log('[SignInScreen] Attempting phone login...');
      const result = await loginWithPhone(normalized, password);
      const user = result.user;

      // Map to Redux
      const reduxUser = mapToReduxUser(user);
      dispatch(setUser(reduxUser));

      // Success - no message needed or can show success briefly
    } catch (err: any) {
      console.error('[SignInScreen] Sign-in error:', err.message);
      setErrorMessage(err.message || 'Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      await loginWithGoogle();
      // AuthListener will handle the session and navigation
    } catch (err: any) {
       console.error('[SignInScreen] Google Sign-in error:', err.message);
       if (err.message === 'ACCOUNT_NOT_FOUND') {
         setErrorMessage('Account not found. Please use the Sign Up screen first.');
       } else {
         setErrorMessage(err.message || 'Could not complete Google sign-in.');
       }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setErrorMessage('');
    if (!identifier.trim()) {
      setErrorMessage('Please enter your email or phone number first.');
      return;
    }

    const isEmail = /\S+@\S+\.\S+/.test(identifier);
    if (isEmail) {
      navigation.navigate('ForgotPassword', { email: identifier.trim() });
    } else {
      const digits = sanitizePhone(identifier);
      const normalized = normalizePhone(digits);
      if (!normalized || !normalized.startsWith('+237') || normalized.length !== 13) {
        setErrorMessage('Please enter a valid Cameroon phone number.');
        return;
      }
      navigation.navigate('ForgotPassword', { phone: normalized });
    }
  };


  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          <View style={styles.formContainer}>
            <View style={styles.phoneInputContainer}>
              <View style={styles.phonePrefix}><Text style={styles.phonePrefixText}>+237</Text></View>
              <TextInput
                placeholder="Phone Number (e.g. 6xxxxxxxx)"
                style={styles.phoneInput}
                placeholderTextColor="#999"
                value={identifier}
                onChangeText={handleIdentifierChange}
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="tel"
                editable={!loading}
                maxLength={9}
              />
            </View>

            <View style={styles.passwordContainer}>
              <TextInput
                placeholder="Password"
                style={styles.passwordInput}
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
                textContentType="password"
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
                style={styles.eyeButton}
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#666" />
              </TouchableOpacity>
            </View>

            <ButtonPrimary
              title={loading ? 'Signing In...' : 'Sign In'}
              onPress={handleSignIn}
              disabled={loading}
            />

            <View style={styles.dividerContainer}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              disabled={loading}
            >
              <Ionicons name="logo-google" size={20} color="#333" />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            {loading && <ActivityIndicator size="large" color="#B8860B" style={styles.loader} />}

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <View style={styles.linksContainer}>
              <TouchableOpacity onPress={handleForgotPassword} disabled={loading}>
                <Text style={styles.linkText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => navigation.navigate('SignUp')}
              disabled={loading}
              style={styles.signUpContainer}
            >
              <Text style={styles.switchText}>
                Don't have an account? <Text style={styles.link}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  formContainer: { width: '100%' },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: '#B8860B' },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 40 },
  phoneInputContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fafafa' },
  phonePrefix: { paddingHorizontal: 16, paddingVertical: 16, backgroundColor: '#e9ecef', borderRightWidth: 1, borderRightColor: '#ddd' },
  phonePrefixText: { fontSize: 16, fontWeight: '600', color: '#333' },
  phoneInput: { flex: 1, padding: 16, fontSize: 16, color: '#333' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, marginBottom: 24, backgroundColor: '#fafafa' },
  passwordInput: { flex: 1, padding: 16, fontSize: 16, color: '#333' },
  eyeButton: { padding: 16 },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  divider: { flex: 1, height: 1, backgroundColor: '#eee' },
  dividerText: { marginHorizontal: 16, color: '#999', fontSize: 14, fontWeight: '600' },
  googleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff' },
  googleButtonText: { marginLeft: 12, fontSize: 16, fontWeight: '600', color: '#333' },
  loader: { marginTop: 16 },
  linksContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  linkText: { color: '#B8860B', fontWeight: '600', fontSize: 14 },
  signUpContainer: { marginTop: 24 },
  switchText: { textAlign: 'center', fontSize: 15, color: '#666' },
  link: { color: '#B8860B', fontWeight: '600' },
  errorText: { color: '#FF3B30', textAlign: 'center', marginTop: 16, fontSize: 14, fontWeight: '500' }
});

export default SignInScreen;
