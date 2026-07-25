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
  StatusBar,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '../../types';
import { sendOtp, verifyOtp } from '../../utils/otp';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';


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
  const { t } = useTranslation();
  const { phone } = route.params as Params;

  const { colors: themeColors, isDark } = useTheme();
  const COLORS = React.useMemo(() => ({
    primary: themeColors.primary,
    primaryLight: isDark ? 'rgba(212,175,55,0.15)' : 'rgba(184,134,11,0.1)',
    white: '#FFFFFF',
    text: themeColors.text,
    textSecondary: themeColors.textSecondary,
    border: themeColors.border,
    bg: themeColors.card,
    background: themeColors.background,
  }), [themeColors, isDark]);
  const styles = React.useMemo(() => getStyles(COLORS, isDark), [COLORS, isDark]);

  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resendDisabled, setResendDisabled] = useState(true);
  const [timer, setTimer] = useState(60);
  const [resetting, setResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      Alert.alert(t('common.error'), t('auth.enter_otp_error') || 'Enter the 6-digit OTP.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(t('common.error'), t('auth.password_min_length') || 'Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(t('common.error'), t('auth.passwords_no_match') || 'Passwords do not match.');
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

      Alert.alert(t('common.success'), t('auth.password_reset_success') || 'Password reset successfully.', [
        { text: 'OK', onPress: () => navigation.navigate('SignIn') },
      ]);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('auth.reset_failed'));
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
      Alert.alert(t('common.error'), result.message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.background} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Ionicons name="shield-checkmark-outline" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.title}>{t('auth.reset_password_title') || 'Reset Password'}</Text>
              <Text style={styles.subtitle}>
                {t('auth.enter_otp_sent_to') || 'Enter the OTP sent to'} {phone}
              </Text>
            </View>

            <View style={styles.otpWrapper}>
              {Array.from({ length: 6 }).map((_, i) => (
                <TextInput
                  key={i}
                  ref={el => void (inputsRef.current[i] = el)}
                  style={[styles.otpInput, otp[i] ? styles.otpInputFilled : null]}
                  value={otp[i] || ''}
                  keyboardType="number-pad"
                  maxLength={1}
                  onChangeText={v => {
                    const arr = otp.split('');
                    arr[i] = v;
                    setOtp(arr.join(''));
                    if (v && i < 5) inputsRef.current[i + 1]?.focus();
                    if (!v && i > 0) inputsRef.current[i - 1]?.focus();
                  }}
                />
              ))}
            </View>

            <TouchableOpacity 
              onPress={handleResend} 
              disabled={resendDisabled}
              style={styles.resendBtn}
            >
              <Text style={[styles.resendText, resendDisabled && styles.resendDisabled]}>
                {resendDisabled ? `${t('auth.resend_in')} ${timer}s` : t('auth.resend_otp')}
              </Text>
            </TouchableOpacity>

            <View style={styles.form}>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('profile.new_password')}
                  secureTextEntry={!showPassword}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholderTextColor={COLORS.textSecondary}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('profile.confirm_password')}
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>

              <TouchableOpacity 
                style={[styles.button, resetting && styles.buttonDisabled]} 
                onPress={handleResetPassword}
                disabled={resetting}
                activeOpacity={0.8}
              >
                {resetting ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.buttonText}>{t('auth.reset_password_btn') || 'Reset Password'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const getStyles = (COLORS: any, isDark: boolean) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, padding: 32, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: 20 },
  otpWrapper: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  otpInput: {
    width: 44, height: 56, borderWidth: 1.5,
    borderColor: COLORS.border, borderRadius: 12,
    textAlign: 'center', fontSize: 22, fontWeight: '700',
    backgroundColor: COLORS.bg, color: COLORS.text,
  },
  otpInputFilled: { borderColor: COLORS.primary, backgroundColor: COLORS.background },
  resendBtn: { alignSelf: 'center', marginBottom: 32 },
  resendText: { color: COLORS.primary, fontWeight: '600', fontSize: 15 },
  resendDisabled: { color: COLORS.textSecondary },
  form: { width: '100%' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
    borderColor: COLORS.border, borderRadius: 16,
    marginBottom: 16, backgroundColor: COLORS.bg, minHeight: 56,
  },
  inputIcon: { marginLeft: 16 },
  input: { flex: 1, paddingVertical: 12, paddingHorizontal: 12, fontSize: 16, color: COLORS.text },
  eyeBtn: { padding: 16 },
  button: {
    backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: 16,
    alignItems: 'center', marginTop: 12,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});

export default ResetPasswordScreen;
