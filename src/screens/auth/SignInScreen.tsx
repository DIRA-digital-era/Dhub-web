// src/screens/auth/SignInScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback, // ✅ Fixed: added missing import
  View
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';

import * as Linking from 'expo-linking';
import ButtonPrimary from '../../components/ButtonPrimary';
import { DiraBranding } from '../../components/DiraBranding';
import { LanguageSelector } from '../../components/LanguageSelector';
import { useTheme } from '../../context/ThemeContext';
import type { AppDispatch } from '../../store/store';
import { AuthStackParamList } from '../../types';
import { normalizePhone } from '../../utils/authHelpers';
import { loginWithEmail, loginWithGoogle, loginWithPhone } from '../../utils/login';
import { supabase } from '../../utils/supabaseClient';

type SignInScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;

const SignInScreen: React.FC = () => {
  const navigation = useNavigation<SignInScreenNavigationProp>();
  const dispatch = useDispatch<AppDispatch>();
  const { error: globalError } = useSelector((state: any) => state.auth);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>('phone');

  const { colors: themeColors, isDark } = useTheme();

  const colors = React.useMemo(() => ({
    background: themeColors.background,
    card: themeColors.card,
    border: themeColors.border,
    primary: themeColors.primary,
    text: themeColors.text,
    textSecondary: themeColors.textSecondary,
    inputBg: isDark ? '#2A2A2A' : '#fafafa',
    footerBg: isDark ? '#1A1A1A' : '#fcfaf2',
    error: themeColors.error,
  }), [themeColors, isDark]);

  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // Clear local loading if global error occurs
  React.useEffect(() => {
    if (globalError && loading) {
      setLoading(false);
      setErrorMessage(globalError);
    }
  }, [globalError, loading]);

  const sanitizePhone = (text: string) => text.replace(/\D/g, '').slice(0, 9);
  const handleIdentifierChange = (text: string) => {
    setIdentifier(text);
    setErrorMessage('');
  };

  const handleSignIn = async () => {
    console.log('[SignInScreen] Sign In button pressed. Method:', loginMethod);
    Keyboard.dismiss();
    setErrorMessage('');

    if (!identifier.trim() || !password.trim()) {
      setErrorMessage(`Please enter your ${loginMethod} and password.`);
      return;
    }

    setLoading(true);

    try {
      if (loginMethod === 'phone') {
        const digits = sanitizePhone(identifier);
        const normalized = normalizePhone(digits);
        if (!normalized || !normalized.startsWith('+237') || normalized.length !== 13) {
          setErrorMessage('Please enter a valid Cameroon phone number (9 digits).');
          setLoading(false);
          return;
        }
        console.log('[SignInScreen] Attempting phone login...');
        await loginWithPhone(normalized, password);
      } else {
        const isEmail = /\S+@\S+\.\S+/.test(identifier.trim());
        if (!isEmail) {
          setErrorMessage('Please enter a valid email address.');
          setLoading(false);
          return;
        }
        console.log('[SignInScreen] Attempting email login...');
        await loginWithEmail(identifier.trim(), password);
      }
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

  const handleMagicLink = async () => {
    if (!identifier.trim() || !/\S+@\S+\.\S+/.test(identifier.trim())) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const redirectUrl = Platform.OS === 'web' 
        ? `${window.location.origin}/auth/callback`
        : Linking.createURL('auth/callback');
      
      const { error } = await supabase.auth.signInWithOtp({
        email: identifier.trim(),
        options: {
          emailRedirectTo: redirectUrl,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      
      navigation.navigate('EmailVerification', { 
        email: identifier.trim(), 
        mode: 'signup' 
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not send Magic Link.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!identifier.trim() || !/\S+@\S+\.\S+/.test(identifier.trim())) {
      setErrorMessage('Please enter your email to reset your password.');
      return;
    }
    
    setLoading(true);
    setErrorMessage('');
    try {
      const resetRedirectUrl = Platform.OS === 'web' 
        ? `${window.location.origin}/auth/callback`
        : Linking.createURL('auth/callback');      
      const { error } = await supabase.auth.resetPasswordForEmail(identifier.trim(), {
        redirectTo: resetRedirectUrl,
      });
      if (error) throw error;
      
      navigation.navigate('EmailVerification', { email: identifier.trim(), mode: 'recovery' });
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not send reset link.');
    } finally {
      setLoading(false);
    }
  };

  const Wrapper = (Platform.OS === 'web' ? View : TouchableWithoutFeedback) as React.ElementType;
  const wrapperProps = Platform.OS === 'web' ? { style: { flex: 1 } } : { onPress: Keyboard.dismiss };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <Wrapper {...wrapperProps}>
          <ScrollView
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.methodToggleContainer}>
              <TouchableOpacity 
                style={[styles.methodToggleBtn, loginMethod === 'phone' && styles.methodToggleBtnActive]}
                onPress={() => { setLoginMethod('phone'); setIdentifier(''); setErrorMessage(''); }}
              >
                <Text style={[styles.methodToggleText, loginMethod === 'phone' && styles.methodToggleTextActive]}>Phone</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.methodToggleBtn, loginMethod === 'email' && styles.methodToggleBtnActive]}
                onPress={() => { setLoginMethod('email'); setIdentifier(''); setErrorMessage(''); }}
              >
                <Text style={[styles.methodToggleText, loginMethod === 'email' && styles.methodToggleTextActive]}>Email</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formContainer}>
              {loginMethod === 'phone' ? (
                <View style={styles.phoneInputContainer}>
                  <View style={styles.phonePrefix}><Text style={styles.phonePrefixText}>+237</Text></View>
                  <TextInput
                    placeholder="Phone Number (e.g. 6xxxxxxxx)"
                    style={styles.phoneInput}
                    placeholderTextColor={colors.textSecondary}
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
              ) : (
                <View style={styles.phoneInputContainer}>
                  <TextInput
                    placeholder="Email Address"
                    style={styles.phoneInput}
                    placeholderTextColor={colors.textSecondary}
                    value={identifier}
                    onChangeText={handleIdentifierChange}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    editable={!loading}
                  />
                </View>
              )}

              <View style={styles.passwordContainer}>
                <TextInput
                  placeholder="Password"
                  style={styles.passwordInput}
                  placeholderTextColor={colors.textSecondary}
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
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ButtonPrimary
                title={loading ? 'Signing In...' : 'Sign In'}
                onPress={handleSignIn}
                disabled={loading}
              />

              {loginMethod === 'email' && (
                <TouchableOpacity 
                  onPress={handleMagicLink} 
                  disabled={loading}
                  style={styles.magicLinkBtn}
                >
                  <Text style={styles.magicLinkBtnText}>Or send me a Magic Link (No password)</Text>
                </TouchableOpacity>
              )}

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
                <Ionicons name="logo-google" size={20} color={colors.text} />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </TouchableOpacity>

              {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />}

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <View style={styles.linksContainer}>
                <TouchableOpacity onPress={handleForgotPassword} disabled={loading}>
                  <Text style={styles.linkText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </Wrapper>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <View style={styles.brandingWrapper}>
          <DiraBranding />
        </View>

        <TouchableOpacity style={styles.signUpLink} onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.switchText}>Don't have an account? <Text style={styles.link}>Sign Up</Text></Text>
        </TouchableOpacity>
        
        <View style={styles.languageWrapper}>
          <LanguageSelector />
        </View>
      </View>
    </View>
  );
};

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingBottom: 80 },
  formContainer: { width: '100%' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', color: colors.primary },
  subtitle: { fontSize: 16, textAlign: 'center', color: colors.textSecondary, marginTop: 8 },
  methodToggleContainer: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 4, marginVertical: 24, marginHorizontal: 0 },
  methodToggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  methodToggleBtnActive: { backgroundColor: colors.background, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  methodToggleText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  methodToggleTextActive: { color: colors.primary },
  phoneInputContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.inputBg },
  phonePrefix: { paddingHorizontal: 16, paddingVertical: 16, backgroundColor: colors.card, borderRightWidth: 1, borderRightColor: colors.border },
  phonePrefixText: { fontSize: 16, fontWeight: '600', color: colors.text },
  phoneInput: { flex: 1, padding: 16, fontSize: 16, color: colors.text },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginBottom: 24, backgroundColor: colors.inputBg },
  passwordInput: { flex: 1, padding: 16, fontSize: 16, color: colors.text },
  eyeButton: { padding: 16 },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: 16, color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  googleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.background },
  googleButtonText: { marginLeft: 12, fontSize: 16, fontWeight: '600', color: colors.text },
  loader: { marginTop: 16 },
  linksContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  linkText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  magicLinkBtn: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
  magicLinkBtnText: { color: colors.textSecondary, fontSize: 14, textDecorationLine: 'underline' },
  signUpLink: { marginBottom: 2, alignItems: 'center' },
  switchText: { textAlign: 'center', fontSize: 13, color: colors.textSecondary },
  link: { color: colors.primary, fontWeight: '600' },
  errorText: { 
    color: '#fff', 
    backgroundColor: colors.error,
    padding: 12,
    borderRadius: 8,
    textAlign: 'center', 
    marginTop: 16, 
    fontSize: 14, 
    fontWeight: '600',
    overflow: 'hidden'
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.footerBg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 8,
  },
  brandingWrapper: { marginTop: 0, marginBottom: 2 },
  languageWrapper: { paddingBottom: Platform.OS === 'ios' ? 10 : 5 },
});

export default SignInScreen;