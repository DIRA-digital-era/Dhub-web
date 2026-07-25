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
  StatusBar,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../utils/supabaseClient';
import { AuthStackParamList } from '../../types';
import { normalizePhone } from '../../utils/authHelpers';
import { sendOtp } from '../../utils/otp';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';


type NavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'ForgotPassword'
>;
type RouteProps = RouteProp<AuthStackParamList, 'ForgotPassword'>;

const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { t } = useTranslation();

  const { colors: themeColors, isDark } = useTheme();
  const COLORS = React.useMemo(() => ({
    primary: themeColors.primary,
    primaryLight: isDark ? 'rgba(212,175,55,0.15)' : 'rgba(184,134,11,0.1)',
    white: themeColors.text,
    text: themeColors.text,
    textSecondary: themeColors.textSecondary,
    border: themeColors.border,
    bg: themeColors.card,
    background: themeColors.background,
  }), [themeColors, isDark]);
  const styles = React.useMemo(() => getStyles(COLORS, isDark), [COLORS, isDark]);

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
      throw new Error(t('auth.invalid_phone_cameroon') || 'Please enter a valid Cameroon phone number.');
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
      Alert.alert(t('common.error'), t('auth.enter_email_or_phone') || 'Please enter your email or phone number.');
      return;
    }

    setLoading(true);

    try {
      const isEmail = /\S+@\S+\.\S+/.test(identifier);

      if (isEmail) {
        await handleEmailReset(identifier);
        navigation.navigate('EmailVerification', { email: identifier.trim(), mode: 'recovery' });
      } else {
        await handlePhoneReset(identifier);
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('auth.reset_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.background} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Ionicons name="refresh-circle-outline" size={48} color={COLORS.primary} />
              </View>
              <Text style={styles.title}>{t('auth.forgot_password_title') || 'Reset Password'}</Text>
              <Text style={styles.subtitle}>
                {t('auth.forgot_password_subtitle') || 'Enter your email or phone number to reset your password.'}
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.email_or_phone_placeholder') || "Email or Phone Number"}
                  value={identifier}
                  onChangeText={handleIdentifierChange}
                  autoCapitalize="none"
                  editable={!loading}
                  placeholderTextColor="#999"
                />
              </View>

              <TouchableOpacity 
                style={[styles.button, loading && styles.buttonDisabled]} 
                onPress={handleResetPassword}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.buttonText}>{t('auth.send_reset_link') || 'Send Reset Instructions'}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.backButton}
                disabled={loading}
              >
                <Text style={styles.backText}>{t('auth.back_to_signin') || 'Back to Sign In'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const getStyles = (COLORS: any, isDark: boolean) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flexGrow: 1, padding: 32, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginBottom: 8,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  form: { width: '100%' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 16,
    marginBottom: 24,
    backgroundColor: COLORS.bg,
    minHeight: 56,
  },
  inputIcon: { marginLeft: 16 },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  backButton: { marginTop: 24, alignItems: 'center' },
  backText: { color: COLORS.primary, fontWeight: '600', fontSize: 16 },
});

export default ForgotPasswordScreen;
