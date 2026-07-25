// src/screens/auth/SignUpScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import ButtonPrimary from '../../components/ButtonPrimary';
import { DiraBranding } from '../../components/DiraBranding';
import { LanguageSelector } from '../../components/LanguageSelector';
import { AuthStackParamList } from '../../types';
import { loginWithGoogle, signUpWithEmail, signUpWithPhone } from '../../utils/login';
import { authLogger } from '../../utils/logger';

type SignUpScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;

interface FormData {
  fullName: string;
  email: string;
  whatsappNumber: string;
  mobileMoney: string;
  password: string;
  confirmPassword: string;
  age: string;
  address: string;
}

const SignUpScreen: React.FC = () => {
  const navigation = useNavigation<SignUpScreenNavigationProp>();
  const { error: globalError } = useSelector((state: any) => state.auth);

  useEffect(() => {
    if (globalError) {
      setErrorMessage(globalError);
      setIsSubmitting(false); // Clear the spinner if a global error (like deep link fail) occurs
    }
  }, [globalError]);

  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    email: '',
    whatsappNumber: '',
    mobileMoney: '',
    password: '',
    confirmPassword: '',
    age: '',
    address: '',
  });

  const [role, setRole] = useState<'student' | 'landlord'>('student');
  const [language, setLanguage] = useState<'en' | 'fr' | 'pcm'>('en');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [signUpMethod, setSignUpMethod] = useState<'phone' | 'email'>('phone');
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong' | ''>('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [acceptedTos, setAcceptedTos] = useState(false);

  // Clear local loading if global error occurs (e.g. from AuthListener)
  useEffect(() => {
    if (globalError && isSubmitting) {
      setIsSubmitting(false);
      setErrorMessage(globalError);
    }
  }, [globalError, isSubmitting]);

  const roles = [
    { label: 'I am a Student', value: 'student' },
    { label: 'I am a Landlord', value: 'landlord' },
  ];

  const validateForm = () => {
    if (!formData.fullName.trim() || !formData.password || !formData.confirmPassword) {
      setErrorMessage('Full name and passwords are required');
      return false;
    }

    if (signUpMethod === 'phone' && formData.whatsappNumber.length !== 9) {
      setErrorMessage('Enter a valid 9-digit WhatsApp number');
      return false;
    }

    if (signUpMethod === 'email' && (!formData.email || !/^\S+@\S+\.\S+/.test(formData.email))) {
      setErrorMessage('A valid email address is required for this signup method.');
      return false;
    }

    if (formData.mobileMoney.length !== 9) {
      setErrorMessage('Enter a valid 9-digit mobile money number');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage('Passwords do not match');
      return false;
    }

    if (formData.password.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return false;
    }

    if (role === 'landlord') {
      if (!formData.age.trim() || !formData.address.trim()) {
        setErrorMessage('Age and address are required for landlords');
        return false;
      }
    }

    if (!acceptedTos) {
      setErrorMessage('You must read and accept the Terms of Service');
      return false;
    }

    return true;
  };

  const isBaseValid =
    formData.fullName.trim().length > 0 &&
    formData.whatsappNumber.length === 9 &&
    formData.mobileMoney.length === 9 &&
    acceptedTos &&
    (role === 'student' || (formData.age.trim() !== '' && formData.address.trim() !== ''));

  const isEmailValid = signUpMethod === 'email'
    ? (formData.email.trim() !== '' && /^\S+@\S+\.\S+/.test(formData.email))
    : true;

  const isPasswordValid = formData.password.length >= 6 && formData.password === formData.confirmPassword;

  const canSubmitManual = isBaseValid && isEmailValid && isPasswordValid;
  const canSubmitGoogle = isBaseValid;

  const checkPasswordStrength = (pass: string) => {
    if (pass.length === 0) setPasswordStrength('');
    else if (pass.length < 6) setPasswordStrength('weak');
    else if (pass.length < 10) setPasswordStrength('medium');
    else setPasswordStrength('strong');
  };

  const handlePhoneSignUp = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await signUpWithPhone(formData.whatsappNumber.trim(), formData.password, {
        fullName: formData.fullName.trim(),
        email: formData.email.trim() || undefined,
        whatsappNumber: formData.whatsappNumber.trim(),
        mobileMoney: formData.mobileMoney.trim(),
        age: formData.age.trim() || undefined,
        address: formData.address.trim() || undefined,
        role: role,
        language: language,
      });
    } catch (err: any) {
      if (err.message?.includes('already registered')) {
        Alert.alert(
          "Account Exists",
          "An account is already registered with this phone number. Would you like to Sign In instead?",
          [
            { text: "No", style: "cancel" },
            { text: "Yes, Sign In", onPress: () => navigation.navigate('SignIn') }
          ]
        );
      } else {
        setErrorMessage(err.message || 'Signup failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSignUp = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const pendingProfile = {
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        whatsappNumber: formData.whatsappNumber.trim(),
        mobileMoney: formData.mobileMoney.trim(),
        age: formData.age.trim() || undefined,
        address: formData.address.trim() || undefined,
        role: role,
        language: language,
      };

      await AsyncStorage.setItem('pending_profile', JSON.stringify(pendingProfile));
      await signUpWithEmail(formData.email.trim(), formData.password, pendingProfile);
      navigation.navigate('EmailVerification', { email: formData.email.trim(), mode: 'signup' });
    } catch (err: any) {
      if (err.message?.includes('already registered')) {
        Alert.alert(
          "Account Exists",
          "An account is already registered with this email. Would you like to Sign In instead?",
          [
            { text: "No", style: "cancel" },
            { text: "Yes, Sign In", onPress: () => navigation.navigate('SignIn') }
          ]
        );
      } else {
        setErrorMessage(err.message || 'Signup failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUpWithGoogle = async () => {
    if (!formData.whatsappNumber.trim() || formData.whatsappNumber.trim().length !== 9) {
      setErrorMessage('Please enter your 9-digit WhatsApp number first.');
      return;
    }
    if (!formData.mobileMoney.trim() || formData.mobileMoney.trim().length !== 9) {
      setErrorMessage('Please enter your 9-digit Mobile Money number first.');
      return;
    }
    if (!acceptedTos) {
      setErrorMessage('You must accept the Terms of Service before continuing.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const pendingProfile = {
        fullName: formData.fullName.trim() || 'User',
        email: formData.email.trim() || undefined,
        whatsappNumber: formData.whatsappNumber.trim(),
        mobileMoney: formData.mobileMoney.trim(),
        age: formData.age.trim() || undefined,
        address: formData.address.trim() || undefined,
        role: role,
        language: language,
      };
      
      authLogger.log('SIGNUP_GOOGLE', 'Preparing pending profile for OAuth sync...', pendingProfile);
      await AsyncStorage.setItem('pending_profile', JSON.stringify(pendingProfile));
      
      await loginWithGoogle();
    } catch (err: any) {
      authLogger.error('SIGNUP_GOOGLE', 'Failed to trigger OAuth', err);
      setErrorMessage(err.message || 'Google signup failed.');
      setIsSubmitting(false);
    }
  };

  const openTos = () => Linking.openURL('https://dhubcmr.netlify.app/terms');
  const openPrivacyPolicy = () => Linking.openURL('https://dhubcmr.netlify.app/terms');

  const getRoleLabel = () => roles.find((r) => r.value === role)?.label;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join Dhub to manage your properties</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <View style={styles.methodToggleContainer}>
              <TouchableOpacity
                style={[styles.methodToggleBtn, signUpMethod === 'phone' && styles.methodToggleBtnActive]}
                onPress={() => { setSignUpMethod('phone'); setErrorMessage(''); }}
              >
                <Text style={[styles.methodToggleText, signUpMethod === 'phone' && styles.methodToggleTextActive]}>Phone</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.methodToggleBtn, signUpMethod === 'email' && styles.methodToggleBtnActive]}
                onPress={() => { setSignUpMethod('email'); setErrorMessage(''); }}
              >
                <Text style={[styles.methodToggleText, signUpMethod === 'email' && styles.methodToggleTextActive]}>Email</Text>
              </TouchableOpacity>
            </View>

            {/* Main Input Group */}
            <View style={styles.inputGroup}>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color="#B8860B" style={styles.inputIcon} />
                <TextInput
                  placeholder="Full Name"
                  style={styles.fieldInput}
                  placeholderTextColor="#999"
                  value={formData.fullName}
                  onChangeText={(text) => setFormData({ ...formData, fullName: text })}
                  editable={!isSubmitting}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color="#B8860B" style={styles.inputIcon} />
                <TextInput
                  placeholder={signUpMethod === 'email' ? "Email Address (Mandatory)" : "Email Address (Optional)"}
                  style={styles.fieldInput}
                  placeholderTextColor="#999"
                  value={formData.email}
                  onChangeText={(text) => setFormData({ ...formData, email: text })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!isSubmitting}
                />
              </View>

              <View style={styles.phoneInputRow}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.phonePrefixText}>+237</Text>
                </View>
                <Ionicons name="logo-whatsapp" size={20} color="#25D366" style={styles.whatsappIcon} />
                <TextInput
                  placeholder="WhatsApp Number"
                  style={styles.phoneInput}
                  placeholderTextColor="#999"
                  value={formData.whatsappNumber}
                  onChangeText={(text) => setFormData({ ...formData, whatsappNumber: text.replace(/\D/g, '').slice(0, 9) })}
                  keyboardType="phone-pad"
                  editable={!isSubmitting}
                />
              </View>

              <View style={styles.phoneInputRow}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.phonePrefixText}>+237</Text>
                </View>
                <Ionicons name="wallet-outline" size={20} color="#B8860B" style={styles.whatsappIcon} />
                <TextInput
                  placeholder="Mobile Money Number"
                  style={styles.phoneInput}
                  placeholderTextColor="#999"
                  value={formData.mobileMoney}
                  onChangeText={(text) => setFormData({ ...formData, mobileMoney: text.replace(/\D/g, '').slice(0, 9) })}
                  keyboardType="phone-pad"
                  editable={!isSubmitting}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.passwordInputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#B8860B" style={styles.inputIcon} />
                <TextInput
                  placeholder="Password"
                  style={styles.passwordInputField}
                  placeholderTextColor="#999"
                  value={formData.password}
                  onChangeText={(text) => {
                    setFormData({ ...formData, password: text });
                    checkPasswordStrength(text);
                  }}
                  secureTextEntry={!showPassword}
                  editable={!isSubmitting}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#666" />
                </TouchableOpacity>
              </View>

              {passwordStrength !== '' && (
                <View style={styles.strengthContainer}>
                  <Text style={styles.strengthLabel}>
                    Strength: <Text style={styles[passwordStrength]}>{passwordStrength}</Text>
                  </Text>
                </View>
              )}

              <View style={styles.passwordInputContainer}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#B8860B" style={styles.inputIcon} />
                <TextInput
                  placeholder="Confirm Password"
                  style={styles.passwordInputField}
                  placeholderTextColor="#999"
                  value={formData.confirmPassword}
                  onChangeText={(text) => setFormData({ ...formData, confirmPassword: text })}
                  secureTextEntry={!showConfirmPassword}
                  editable={!isSubmitting}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                  <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color="#666" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Role Picker */}
            <TouchableOpacity style={styles.picker} onPress={() => setShowRoleModal(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="briefcase-outline" size={20} color="#B8860B" style={{ marginRight: 12 }} />
                <Text style={styles.pickerText}>{getRoleLabel()}</Text>
              </View>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>

            {role === 'landlord' && (
              <View style={styles.inputGroup}>
                <View style={styles.inputWrapper}>
                  <Ionicons name="calendar-outline" size={20} color="#B8860B" style={styles.inputIcon} />
                  <TextInput
                    placeholder="Age"
                    style={styles.fieldInput}
                    placeholderTextColor="#999"
                    value={formData.age}
                    onChangeText={(text) => setFormData({ ...formData, age: text })}
                    keyboardType="numeric"
                    editable={!isSubmitting}
                  />
                </View>
                <View style={styles.inputWrapper}>
                  <Ionicons name="map-outline" size={20} color="#B8860B" style={styles.inputIcon} />
                  <TextInput
                    placeholder="Full Address"
                    style={styles.fieldInput}
                    placeholderTextColor="#999"
                    value={formData.address}
                    onChangeText={(text) => setFormData({ ...formData, address: text })}
                    editable={!isSubmitting}
                  />
                </View>
              </View>
            )}

            {/* Terms of Service */}
            <View style={styles.tosContainer}>
              <TouchableOpacity style={styles.checkbox} onPress={() => setAcceptedTos(!acceptedTos)}>
                <View style={[styles.checkboxBox, acceptedTos && styles.checkboxBoxChecked]}>
                  {acceptedTos && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                <Text style={styles.tosText}>
                  I agree to the{' '}
                  <Text style={styles.link} onPress={openTos}>
                    Terms of Service
                  </Text>{' '}
                  and{' '}
                  <Text style={styles.link} onPress={openPrivacyPolicy}>
                    Privacy Policy
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>

            {/* Error Message */}
            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={20} color="#fff" />
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={[styles.buttonSpacing, (!canSubmitManual) ? { opacity: 0.5 } : {}]}>
              <ButtonPrimary
                title={`Sign Up with ${signUpMethod === 'phone' ? 'Phone' : 'Email'}`}
                onPress={signUpMethod === 'phone' ? handlePhoneSignUp : handleEmailSignUp}
                disabled={isSubmitting || !canSubmitManual}
              />
            </View>

            <View style={styles.orContainer}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>OR</Text>
              <View style={styles.orLine} />
            </View>

            <View style={[styles.buttonSpacing, (!canSubmitGoogle) ? { opacity: 0.5 } : {}]}>
              <TouchableOpacity
                style={[styles.googleButton, (!canSubmitGoogle) && { opacity: 0.6 }]}
                onPress={handleSignUpWithGoogle}
                disabled={isSubmitting || !canSubmitGoogle}
              >
                <Ionicons name="logo-google" size={20} color="#fff" style={{ marginRight: 10 }} />
                <Text style={styles.googleButtonText}>Sign Up with Google</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.signInLink} onPress={() => navigation.navigate('SignIn')}>
          <Text style={styles.switchText}>Already have an account? <Text style={styles.link}>Sign In</Text></Text>
        </TouchableOpacity>

        <View style={styles.brandingWrapper}>
          <DiraBranding />
        </View>

        <View style={styles.languageWrapper}>
          <LanguageSelector />
        </View>
      </View>

      {/* CREATING ACCOUNT OVERLAY */}
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
            {roles.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.optionButton, role === r.value && styles.optionButtonSelected]}
                onPress={() => {
                  setRole(r.value as 'student' | 'landlord');
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
  
  inputGroup: {
    marginBottom: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: '#fafafa',
    paddingHorizontal: 12,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  fieldInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: '#333',
  },
  
  phoneInputRow: {
    flexDirection: 'row',
    marginBottom: 10,
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
    marginBottom: 10,
    backgroundColor: '#fafafa',
    paddingHorizontal: 12,
    height: 50,
  },
  passwordInputField: { 
    flex: 1, 
    height: '100%',
    fontSize: 15,
    color: '#333',
  },
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
  
  methodToggleContainer: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 10, padding: 3, marginBottom: 20 },
  methodToggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 7, alignItems: 'center' },
  methodToggleBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  methodToggleText: { fontSize: 13, fontWeight: '600', color: '#666' },
  methodToggleTextActive: { color: '#B8860B' },
  
  buttonSpacing: { marginBottom: 12 },
  orContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
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
