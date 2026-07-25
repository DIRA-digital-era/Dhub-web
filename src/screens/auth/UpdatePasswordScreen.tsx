import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  KeyboardAvoidingView, 
  Platform, 
  TouchableWithoutFeedback, 
  Keyboard,
  StatusBar,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../utils/supabaseClient';
import { useDispatch } from 'react-redux';
import { setRequiresPasswordUpdate } from '../../store/authSlice';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';


export const UpdatePasswordScreen: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const dispatch = useDispatch();
  const { t } = useTranslation();

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

  const handleUpdatePassword = async () => {
    if (password.length < 6) {
      Alert.alert(t('common.error'), t('auth.password_min_length') || 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('common.error'), t('auth.passwords_no_match') || 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      
      Alert.alert(t('common.success'), t('profile.saved') || 'Your password has been updated.');
      dispatch(setRequiresPasswordUpdate(false));
    } catch (error: any) {
      console.error('Password update failed:', error);
      Alert.alert(t('common.error'), error.message || t('auth.update_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.background} />
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.inner}>
              <View style={styles.header}>
                <View style={styles.iconCircle}>
                  <Ionicons name="lock-closed" size={40} color={COLORS.primary} />
                </View>
                <Text style={styles.title}>{t('profile.update_password')}</Text>
                <Text style={styles.subtitle}>
                  {t('auth.secure_account_msg') || 'Please secure your account by entering a new password.'}
                </Text>
              </View>

              <View style={styles.form}>
                <Text style={styles.label}>{t('profile.new_password')}</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="key-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('profile.new_password')}
                    placeholderTextColor="#999"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    editable={!loading}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>{t('profile.confirm_password')}</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('profile.confirm_password')}
                    placeholderTextColor="#999"
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    editable={!loading}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
                    <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={22} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={[styles.button, loading && styles.buttonDisabled]} 
                  onPress={handleUpdatePassword}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.buttonText}>{t('profile.update_password')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const getStyles = (COLORS: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  inner: { padding: 32 },
  header: { alignItems: 'center', marginBottom: 48 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 10 },
  form: { width: '100%' },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8, marginLeft: 4 },
  inputContainer: { 
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, 
    borderColor: COLORS.border, borderRadius: 16, marginBottom: 24, 
    backgroundColor: COLORS.bg, minHeight: 56,
  },
  inputIcon: { marginLeft: 16 },
  input: { flex: 1, paddingVertical: 12, paddingHorizontal: 12, fontSize: 16, color: COLORS.text },
  eyeBtn: { padding: 16 },
  button: { 
    backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: 16, 
    alignItems: 'center', marginTop: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' }
});

export default UpdatePasswordScreen;
