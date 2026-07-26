// src/screens/auth/SignUpScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator, Alert,
  Linking, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { useSelector } from 'react-redux';
import * as yup from 'yup';
import ButtonPrimary from '../../components/ButtonPrimary';
import { DiraBranding } from '../../components/DiraBranding';
import { LanguageSelector } from '../../components/LanguageSelector';
import { AuthStackParamList } from '../../types';
import { authLogger } from '../../utils/logger';
import { loginWithGoogle, signUpWithEmail, signUpWithPhone } from '../../utils/login';

type SignUpScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;

// ─── Yup Schema ─────────────────────────────────────────────────────────────
const schema = yup.object({
  fullName: yup.string().required('Full name is required'),
  email: yup.string().email('Invalid email address').when('signUpMethod', {
    is: 'email',
    then: (s) => s.required('Email is required for this method'),
  }),
  whatsappNumber: yup.string().required('WhatsApp number is required').matches(/^\d{9}$/, 'Must be exactly 9 digits'),
  mobileMoney: yup.string().required('Mobile Money number is required').matches(/^\d{9}$/, 'Must be exactly 9 digits'),
  password: yup.string().required('Password is required').min(6, 'At least 6 characters'),
  confirmPassword: yup.string().required('Confirm password').oneOf([yup.ref('password')], 'Passwords do not match'),
  age: yup.string().when('role', { is: 'landlord', then: (s) => s.required('Age is required') }),
  address: yup.string().when('role', { is: 'landlord', then: (s) => s.required('Address is required') }),
  acceptedTos: yup.boolean().oneOf([true], 'You must accept the Terms'),
  signUpMethod: yup.string().oneOf(['phone', 'email']).required(),
  role: yup.string().oneOf(['student', 'landlord']).required(),
});

type FormData = yup.InferType<typeof schema>;

// ─── Component ──────────────────────────────────────────────────────────────
const SignUpScreen: React.FC = () => {
  const navigation = useNavigation<SignUpScreenNavigationProp>();
  const { error: globalError } = useSelector((state: any) => state.auth);

  // Local UI state
  const [signUpMethod, setSignUpMethod] = useState<'phone' | 'email'>('phone');
  const [role, setRole] = useState<'student' | 'landlord'>('student');
  const [language, setLanguage] = useState<'en' | 'fr' | 'pcm'>('en');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [acceptedTos, setAcceptedTos] = useState(false);

  // ─── React Hook Form ──────────────────────────────────────────────────────
  const {
    control, handleSubmit, formState: { errors, isValid }, watch, setValue,
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      fullName: '', email: '', whatsappNumber: '', mobileMoney: '',
      password: '', confirmPassword: '', age: '', address: '',
      signUpMethod: 'phone', role: 'student', acceptedTos: false,
    },
    mode: 'onChange',
  });

  // Sync local toggles with form
  useEffect(() => { setValue('signUpMethod', signUpMethod); }, [signUpMethod, setValue]);
  useEffect(() => { setValue('role', role); }, [role, setValue]);

  // Global error handler
  useEffect(() => {
    if (globalError) { setErrorMessage(globalError); setIsSubmitting(false); }
  }, [globalError]);
  useEffect(() => {
    if (globalError && isSubmitting) { setIsSubmitting(false); setErrorMessage(globalError); }
  }, [globalError, isSubmitting]);

  // ─── Submit ────────────────────────────────────────────────────────────────
  const onSubmit = async (data: FormData) => {
    if (isSubmitting) return;
    if (!acceptedTos) { setErrorMessage('You must accept the Terms'); return; }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      if (data.signUpMethod === 'phone') {
        await signUpWithPhone(data.whatsappNumber.trim(), data.password, {
          fullName: data.fullName.trim(),
          email: data.email?.trim() || undefined,
          whatsappNumber: data.whatsappNumber.trim(),
          mobileMoney: data.mobileMoney.trim(),
          age: data.age?.trim() || undefined,
          address: data.address?.trim() || undefined,
          role: data.role,
          language,
        });
      } else {
        const pendingProfile = {
          fullName: data.fullName.trim(),
          email: data.email!.trim(), // guaranteed by schema when method === 'email'
          whatsappNumber: data.whatsappNumber.trim(),
          mobileMoney: data.mobileMoney.trim(),
          age: data.age?.trim() || undefined,
          address: data.address?.trim() || undefined,
          role: data.role,
          language,
        };
        await AsyncStorage.setItem('pending_profile', JSON.stringify(pendingProfile));
        await signUpWithEmail(data.email!.trim(), data.password, pendingProfile);
        navigation.navigate('EmailVerification', { email: data.email!.trim(), mode: 'signup' });
      }
    } catch (err: any) {
      if (err.message?.includes('already registered')) {
        Alert.alert('Account Exists', 'Already registered? Sign In instead.', [
          { text: 'No', style: 'cancel' },
          { text: 'Yes, Sign In', onPress: () => navigation.navigate('SignIn') },
        ]);
      } else {
        setErrorMessage(err.message || 'Signup failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Google Sign-Up ──────────────────────────────────────────────────────
  const handleGoogleSignUp = async () => {
    const whatsapp = watch('whatsappNumber') || '';
    const momo = watch('mobileMoney') || '';
    if (whatsapp.length !== 9) { setErrorMessage('Enter valid 9‑digit WhatsApp'); return; }
    if (momo.length !== 9) { setErrorMessage('Enter valid 9‑digit Mobile Money'); return; }
    if (!acceptedTos) { setErrorMessage('Accept Terms first'); return; }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const pendingProfile = {
        fullName: (watch('fullName') || '').trim() || 'User',
        email: (watch('email') || '').trim() || undefined,
        whatsappNumber: whatsapp.trim(),
        mobileMoney: momo.trim(),
        age: (watch('age') || '').trim() || undefined,
        address: (watch('address') || '').trim() || undefined,
        role,
        language,
      };
      await AsyncStorage.setItem('pending_profile', JSON.stringify(pendingProfile));
      await loginWithGoogle();
    } catch (err: any) {
      authLogger.error('SIGNUP_GOOGLE', 'Failed', err);
      setErrorMessage(err.message || 'Google signup failed');
      setIsSubmitting(false);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const openTos = () => Linking.openURL('https://dhubcmr.netlify.app/terms');
  const openPrivacyPolicy = () => Linking.openURL('https://dhubcmr.netlify.app/terms');
  const roleOptions = [
    { label: 'Student / Tenant', value: 'student' },
    { label: 'Landlord', value: 'landlord' },
  ];
  const getRoleLabel = () => roleOptions.find((r) => r.value === role)?.label;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join Dhub to manage your properties</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Toggle: Phone / Email */}
        <View style={styles.methodToggleContainer}>
          {['phone', 'email'].map((method) => (
            <TouchableOpacity
              key={method}
              style={[styles.methodToggleBtn, signUpMethod === method && styles.methodToggleBtnActive]}
              onPress={() => { setSignUpMethod(method as 'phone' | 'email'); setValue('signUpMethod', method as 'phone' | 'email'); setErrorMessage(''); }}
            >
              <Text style={[styles.methodToggleText, signUpMethod === method && styles.methodToggleTextActive]}>
                {method.charAt(0).toUpperCase() + method.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Fields ─── */}
        {[
          { name: 'fullName', icon: 'person-outline', placeholder: 'Full Name' },
          { name: 'email', icon: 'mail-outline', placeholder: signUpMethod === 'email' ? 'Email Address (Mandatory)' : 'Email Address (Optional)', keyboard: 'email-address', autoCapitalize: 'none' },
        ].map((field) => (
          <View key={field.name} style={styles.inputGroup}>
            <View style={styles.inputWrapper}>
              <Ionicons name={field.icon as any} size={20} color="#B8860B" style={styles.inputIcon} />
              <Controller
                control={control}
                name={field.name as keyof FormData}
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    placeholder={field.placeholder}
                    style={styles.fieldInput}
                    placeholderTextColor="#999"
                    value={value as string}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType={field.keyboard as any}
                    autoCapitalize={field.autoCapitalize as any}
                    editable={!isSubmitting}
                  />
                )}
              />
            </View>
            {errors[field.name as keyof FormData] && (
              <Text style={styles.errorText}>{errors[field.name as keyof FormData]?.message}</Text>
            )}
          </View>
        ))}

        {/* WhatsApp */}
        <View style={styles.inputGroup}>
          <View style={styles.phoneInputRow}>
            <View style={styles.phonePrefix}><Text style={styles.phonePrefixText}>+237</Text></View>
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" style={styles.whatsappIcon} />
            <Controller
              control={control}
              name="whatsappNumber"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  placeholder="WhatsApp Number"
                  style={styles.phoneInput}
                  placeholderTextColor="#999"
                  value={value}
                  onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 9))}
                  onBlur={onBlur}
                  keyboardType="phone-pad"
                  editable={!isSubmitting}
                />
              )}
            />
          </View>
          {errors.whatsappNumber && <Text style={styles.errorText}>{errors.whatsappNumber.message}</Text>}
        </View>

        {/* Mobile Money */}
        <View style={styles.inputGroup}>
          <View style={styles.phoneInputRow}>
            <View style={styles.phonePrefix}><Text style={styles.phonePrefixText}>+237</Text></View>
            <Ionicons name="wallet-outline" size={20} color="#B8860B" style={styles.whatsappIcon} />
            <Controller
              control={control}
              name="mobileMoney"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  placeholder="Mobile Money Number"
                  style={styles.phoneInput}
                  placeholderTextColor="#999"
                  value={value}
                  onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 9))}
                  onBlur={onBlur}
                  keyboardType="phone-pad"
                  editable={!isSubmitting}
                />
              )}
            />
          </View>
          {errors.mobileMoney && <Text style={styles.errorText}>{errors.mobileMoney.message}</Text>}
        </View>

        {/* Password & Confirm */}
        {[
          { name: 'password', placeholder: 'Password', secure: !showPassword, toggle: () => setShowPassword(!showPassword), show: showPassword },
          { name: 'confirmPassword', placeholder: 'Confirm Password', secure: !showConfirmPassword, toggle: () => setShowConfirmPassword(!showConfirmPassword), show: showConfirmPassword },
        ].map((field) => (
          <View key={field.name} style={styles.inputGroup}>
            <View style={styles.passwordInputContainer}>
              <Ionicons name={field.name === 'password' ? 'lock-closed-outline' : 'shield-checkmark-outline'} size={20} color="#B8860B" style={styles.inputIcon} />
              <Controller
                control={control}
                name={field.name as keyof FormData}
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    placeholder={field.placeholder}
                    style={styles.passwordInputField}
                    placeholderTextColor="#999"
                    value={value as string}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry={field.secure}
                    editable={!isSubmitting}
                  />
                )}
              />
              <TouchableOpacity onPress={field.toggle} style={styles.eyeIcon}>
                <Ionicons name={field.show ? 'eye-off' : 'eye'} size={20} color="#666" />
              </TouchableOpacity>
            </View>
            {errors[field.name as keyof FormData] && (
              <Text style={styles.errorText}>{errors[field.name as keyof FormData]?.message}</Text>
            )}
          </View>
        ))}

        {/* Role Picker */}
        <TouchableOpacity style={styles.picker} onPress={() => setShowRoleModal(true)}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="briefcase-outline" size={20} color="#B8860B" style={{ marginRight: 12 }} />
            <Text style={styles.pickerText}>{getRoleLabel()}</Text>
          </View>
          <Ionicons name="chevron-down" size={20} color="#666" />
        </TouchableOpacity>

        {/* Landlord extra fields */}
        {role === 'landlord' && (
          <View style={styles.inputGroup}>
            {['age', 'address'].map((field) => (
              <View key={field}>
                <View style={styles.inputWrapper}>
                  <Ionicons name={field === 'age' ? 'calendar-outline' : 'map-outline'} size={20} color="#B8860B" style={styles.inputIcon} />
                  <Controller
                    control={control}
                    name={field as keyof FormData}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        placeholder={field === 'age' ? 'Age' : 'Full Address'}
                        style={styles.fieldInput}
                        placeholderTextColor="#999"
                        value={value as string}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        keyboardType={field === 'age' ? 'numeric' : 'default'}
                        editable={!isSubmitting}
                      />
                    )}
                  />
                </View>
                {errors[field as keyof FormData] && (
                  <Text style={styles.errorText}>{errors[field as keyof FormData]?.message}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Terms */}
        <View style={styles.tosContainer}>
          <TouchableOpacity style={styles.checkbox} onPress={() => setAcceptedTos(!acceptedTos)}>
            <View style={[styles.checkboxBox, acceptedTos && styles.checkboxBoxChecked]}>
              {acceptedTos && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <Text style={styles.tosText}>
              I agree to the <Text style={styles.link} onPress={openTos}>Terms of Service</Text> and{' '}
              <Text style={styles.link} onPress={openPrivacyPolicy}>Privacy Policy</Text>
            </Text>
          </TouchableOpacity>
          {!acceptedTos && errors.acceptedTos && (
            <Text style={styles.errorText}>You must accept the Terms</Text>
          )}
        </View>

        {/* Error Banner */}
        {errorMessage && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color="#fff" />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        )}

        {/* Submit */}
        <View style={styles.buttonSpacing}>
          <ButtonPrimary
            title={isSubmitting ? 'Creating Account...' : `Sign Up with ${signUpMethod === 'phone' ? 'Phone' : 'Email'}`}
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting || !isValid || !acceptedTos}
          />
        </View>

        <View style={styles.orContainer}>
          <View style={styles.orLine} /><Text style={styles.orText}>OR</Text><View style={styles.orLine} />
        </View>

        <View style={styles.buttonSpacing}>
          <TouchableOpacity
            style={[styles.googleButton, (isSubmitting || !acceptedTos) && { opacity: 0.6 }]}
            onPress={handleGoogleSignUp}
            disabled={isSubmitting || !acceptedTos}
          >
            <Ionicons name="logo-google" size={20} color="#fff" style={{ marginRight: 10 }} />
            <Text style={styles.googleButtonText}>Sign Up with Google</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.signInLink} onPress={() => navigation.navigate('SignIn')}>
          <Text style={styles.switchText}>Already have an account? <Text style={styles.link}>Sign In</Text></Text>
        </TouchableOpacity>
        <View style={styles.brandingWrapper}><DiraBranding /></View>
        <View style={styles.languageWrapper}><LanguageSelector /></View>
      </View>

      {/* Loading Overlay */}
      {isSubmitting && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#B8860B" />
            <Text style={styles.loadingTitle}>Creating Your Account</Text>
            <Text style={styles.loadingSubtitle}>Setting up your secure profile...</Text>
          </View>
        </View>
      )}

      {/* Role Modal */}
      <Modal visible={showRoleModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowRoleModal(false)}>
          <View style={styles.modalContent}>
            {roleOptions.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.optionButton, role === r.value && styles.optionButtonSelected]}
                onPress={() => {
                  setRole(r.value as 'student' | 'landlord');
                  setValue('role', r.value as 'student' | 'landlord');
                  setShowRoleModal(false);
                }}
              >
                <Text style={[styles.optionText, role === r.value && styles.optionTextSelected]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowRoleModal(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 100 },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#B8860B' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 4 },

  inputGroup: { marginBottom: 12 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: '#fafafa',
    paddingHorizontal: 12,
    height: 50,
  },
  inputIcon: { marginRight: 10 },
  fieldInput: { flex: 1, height: '100%', fontSize: 15, color: '#333' },

  phoneInputRow: {
    flexDirection: 'row',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fafafa',
    alignItems: 'center',
    height: 50,
  },
  phonePrefix: {
    backgroundColor: '#eee',
    paddingHorizontal: 10,
    height: '100%',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#ddd',
  },
  phonePrefixText: { color: '#666', fontWeight: 'bold', fontSize: 14 },
  phoneInput: { flex: 1, paddingHorizontal: 12, fontSize: 15, height: '100%' },
  whatsappIcon: { marginHorizontal: 8 },

  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: '#fafafa',
    paddingHorizontal: 12,
    height: 50,
  },
  passwordInputField: { flex: 1, height: '100%', fontSize: 15, color: '#333' },
  eyeIcon: { padding: 5 },

  strengthContainer: { marginBottom: 10, paddingHorizontal: 5 },
  strengthLabel: { fontSize: 11, color: '#666' },
  weak: { color: 'red', fontWeight: 'bold' },
  medium: { color: 'orange', fontWeight: 'bold' },
  strong: { color: 'green', fontWeight: 'bold' },

  picker: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    height: 50,
  },
  pickerText: { color: '#333', fontSize: 15 },

  tosContainer: { marginBottom: 20 },
  checkbox: { flexDirection: 'row', alignItems: 'center' },
  checkboxBox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: '#B8860B',
    marginRight: 10,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxChecked: { backgroundColor: '#B8860B' },
  tosText: { color: '#666', flex: 1, fontSize: 12 },
  link: { color: '#B8860B', fontWeight: 'bold' },

  methodToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 20,
  },
  methodToggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 7, alignItems: 'center' },
  methodToggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  methodToggleText: { fontSize: 13, fontWeight: '600', color: '#666' },
  methodToggleTextActive: { color: '#B8860B' },

  buttonSpacing: { marginBottom: 12 },
  orContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  orText: { marginHorizontal: 12, color: '#999', fontWeight: '600', fontSize: 13 },

  googleButton: {
    backgroundColor: '#4285F4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
  },
  googleButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  errorBanner: {
    flexDirection: 'row',
    backgroundColor: '#dc3545',
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  errorBannerText: { color: '#fff', marginLeft: 8, flex: 1, fontSize: 13, fontWeight: '500' },
  errorText: { color: '#dc3545', fontSize: 12, marginLeft: 10, marginBottom: 4 },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fcfaf2',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingVertical: 10,
  },
  brandingWrapper: { marginTop: 0, marginBottom: 2 },
  languageWrapper: { paddingBottom: Platform.OS === 'ios' ? 8 : 4 },
  signInLink: { alignItems: 'center', marginBottom: 2 },
  switchText: { textAlign: 'center', fontSize: 12, color: '#666' },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  loadingCard: {
    backgroundColor: '#fff',
    padding: 25,
    borderRadius: 15,
    alignItems: 'center',
    width: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  loadingTitle: { fontSize: 18, fontWeight: 'bold', color: '#B8860B', marginTop: 12 },
  loadingSubtitle: { fontSize: 13, color: '#666', marginTop: 4, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 15, borderTopRightRadius: 15, maxHeight: '50%' },
  optionButton: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  optionButtonSelected: { backgroundColor: '#f8f9fa' },
  optionText: { fontSize: 15, textAlign: 'center', color: '#333' },
  optionTextSelected: { color: '#B8860B', fontWeight: '600' },
  modalCloseButton: { padding: 15, borderTopWidth: 1, borderTopColor: '#eee' },
  modalCloseText: { fontSize: 15, color: '#666', textAlign: 'center', fontWeight: '600' },
});

export default SignUpScreen;