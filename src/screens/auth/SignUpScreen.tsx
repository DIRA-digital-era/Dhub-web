 // src/screens/auth/SignUpScreen.tsx

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import ButtonPrimary from '../../components/ButtonPrimary';
import { AuthStackParamList } from '../../types';
import { loginWithGoogle } from '../../utils/login';

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
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong' | ''>('');
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [acceptedTos, setAcceptedTos] = useState(false);


  const languages = [
    { label: 'English', value: 'en' },
    { label: 'Français', value: 'fr' },
    { label: 'Pidgin', value: 'pcm' },
  ];

  const roles = [
    { label: 'Student', value: 'student' },
    { label: 'Landlord', value: 'landlord' },
  ];

  useEffect(() => {
    loadStoredLanguage();
  }, []);

  const loadStoredLanguage = async () => {
    try {
      const storedLang = await AsyncStorage.getItem('appLanguage');
      if (storedLang === 'en' || storedLang === 'fr' || storedLang === 'pcm') {
        setLanguage(storedLang);
      }
    } catch (error) {
      console.log('Error loading language:', error);
    }
  };

  const updateFormData = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatPhoneInput = (text: string): string => text.replace(/\D/g, '').slice(0, 9);

  const checkPasswordStrength = (pwd: string) => {
    if (pwd.length === 0) {
      setPasswordStrength('');
      return;
    }

    if (pwd.length < 6) {
      setPasswordStrength('weak');
      return;
    }

    const hasLower = /[a-z]/.test(pwd);
    const hasUpper = /[A-Z]/.test(pwd);
    const hasNumber = /\d/.test(pwd);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    const isLong = pwd.length >= 8;

    const score = [hasLower, hasUpper, hasNumber, hasSpecial, isLong].filter(Boolean).length;

    if (score >= 4) setPasswordStrength('strong');
    else if (score >= 3) setPasswordStrength('medium');
    else setPasswordStrength('weak');
  };

  const getPasswordStrengthColor = () => {
    switch (passwordStrength) {
      case 'weak': return '#ff4444';
      case 'medium': return '#ffaa00';
      case 'strong': return '#00c851';
      default: return 'transparent';
    }
  };

  const getPasswordStrengthText = () => {
    switch (passwordStrength) {
      case 'weak': return 'Weak password';
      case 'medium': return 'Medium strength';
      case 'strong': return 'Strong password';
      default: return '';
    }
  };

  const validateForm = (): boolean => {
    setErrorMessage('');

    if (!formData.fullName.trim()) {
      setErrorMessage('Full name is required');
      return false;
    }

    if (formData.whatsappNumber.length !== 9) {
      setErrorMessage('Enter a valid 9-digit WhatsApp number');
      return false;
    }

    if (formData.mobileMoney.length !== 9) {
      setErrorMessage('Enter a valid 9-digit mobile money number');
      return false;
    }

    if (!formData.password) {
      setErrorMessage('Password is required');
      return false;
    }

    if (formData.password.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage('Passwords do not match');
      return false;
    }

    if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) {
      setErrorMessage('Invalid email address');
      return false;
    }

    if (role === 'landlord') {
      if (!formData.age.trim() || !formData.address.trim()) {
        setErrorMessage('Age and address are required for landlords');
        return false;
      }
    }

    if (!acceptedTos) {
      setErrorMessage('Please accept the Terms of Service and Privacy Policy');
      return false;
    }

    return true;
  };

  const handlePasswordChange = (text: string) => {
    updateFormData('password', text);
    checkPasswordStrength(text);
  };

  const handleSignUpWithGoogle = async () => {
    if (!validateForm() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // 1. Temporarily store profile data for syncing after social login
      await AsyncStorage.setItem('pending_profile', JSON.stringify({
        ...formData,
        role,
        language
      }));

      // 2. Launch Google OAuth flow
      await loginWithGoogle();
      
      // Note: AuthListener handles the redirection and session sync
    } catch (error: any) {
      console.error('Google signup error:', error.message || error);
      setErrorMessage(error.message || 'Failed to initiate Google signup.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openTos = () => Linking.openURL('https://dhubcmr.netlify.app/terms');
  const openPrivacyPolicy = () => Linking.openURL('https://dhubcmr.netlify.app/terms');

  const getLanguageLabel = () => languages.find(l => l.value === language)?.label || 'Select Language';
  const getRoleLabel = () => roles.find(r => r.value === role)?.label || 'Select Role';

  interface CustomPickerModalProps {
    visible: boolean;
    onClose: () => void;
    options: { label: string; value: string }[];
    selectedValue: string;
    onSelect: (value: string) => void;
    title: string;
  }

  const CustomPickerModal: React.FC<CustomPickerModalProps> = ({ 
    visible, onClose, options, selectedValue, onSelect, title 
  }) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView style={styles.modalOptions}>
            {options.map(option => (
              <TouchableHighlight
                key={option.value}
                style={[styles.optionButton, selectedValue === option.value && styles.optionButtonSelected]}
                underlayColor="#f0f0f0"
                onPress={() => { onSelect(option.value); onClose(); }}
              >
                <Text style={[styles.optionText, selectedValue === option.value && styles.optionTextSelected]}>
                  {option.label}
                </Text>
              </TouchableHighlight>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Create Account</Text>

          <TouchableOpacity style={styles.picker} onPress={() => setShowLanguageModal(true)}>
            <Text style={styles.pickerText}>{getLanguageLabel()}</Text>
            <Ionicons name="chevron-down" size={20} color="#666" />
          </TouchableOpacity>

          <TextInput
            placeholder="Full Name"
            style={styles.input}
            placeholderTextColor="#999"
            value={formData.fullName}
            onChangeText={text => updateFormData('fullName', text)}
            autoComplete="name"
            textContentType="name"
          />

          <TextInput
            placeholder="Email (Optional)"
            style={styles.input}
            placeholderTextColor="#999"
            value={formData.email}
            onChangeText={text => updateFormData('email', text)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          {/* WhatsApp Number */}
          <View style={styles.phoneInputContainer}>
            <View style={styles.phonePrefix}><Text style={styles.phonePrefixText}>+237</Text></View>
            <TextInput
              placeholder="WhatsApp Number"
              style={styles.phoneInput}
              placeholderTextColor="#999"
              value={formData.whatsappNumber}
              onChangeText={text => updateFormData('whatsappNumber', formatPhoneInput(text))}
              keyboardType="phone-pad"
              maxLength={9}
            />
          </View>

          {/* Mobile Money Number */}
          <View style={styles.phoneInputContainer}>
            <View style={styles.phonePrefix}><Text style={styles.phonePrefixText}>+237</Text></View>
            <TextInput
              placeholder="Mobile Money Number"
              style={styles.phoneInput}
              placeholderTextColor="#999"
              value={formData.mobileMoney}
              onChangeText={text => updateFormData('mobileMoney', formatPhoneInput(text))}
              keyboardType="phone-pad"
              maxLength={9}
            />
          </View>

          {role === 'landlord' && (
            <>
              <TextInput
                placeholder="Age"
                style={styles.input}
                placeholderTextColor="#999"
                value={formData.age}
                onChangeText={text => updateFormData('age', text.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
              />
              <TextInput
                placeholder="Address (Quarter, City, Region)"
                style={styles.input}
                placeholderTextColor="#999"
                value={formData.address}
                onChangeText={text => updateFormData('address', text)}
              />
            </>
          )}

          {/* Password */}
          <View style={styles.passwordContainer}>
            <TextInput
              placeholder="Password"
              style={styles.passwordInput}
              placeholderTextColor="#999"
              value={formData.password}
              onChangeText={handlePasswordChange}
              secureTextEntry={!showPassword}
              autoComplete="password-new"
              textContentType="newPassword"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {passwordStrength && (
            <View style={styles.passwordStrengthContainer}>
              <View style={[styles.passwordStrengthBar, { backgroundColor: getPasswordStrengthColor() }]} />
              <Text style={[styles.passwordStrengthText, { color: getPasswordStrengthColor() }]}>{getPasswordStrengthText()}</Text>
            </View>
          )}

          {/* Confirm Password */}
          <View style={styles.passwordContainer}>
            <TextInput
              placeholder="Confirm Password"
              style={styles.passwordInput}
              placeholderTextColor="#999"
              value={formData.confirmPassword}
              onChangeText={text => updateFormData('confirmPassword', text)}
              secureTextEntry={!showConfirmPassword}
              autoComplete="password-new"
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeButton}>
              <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Role Picker */}
          <TouchableOpacity style={styles.picker} onPress={() => setShowRoleModal(true)}>
            <Text style={styles.pickerText}>{getRoleLabel()}</Text>
            <Ionicons name="chevron-down" size={20} color="#666" />
          </TouchableOpacity>

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

          <View style={isSubmitting ? { opacity: 0.7 } : {}}>
            <ButtonPrimary 
              title={isSubmitting ? 'Initializing...' : 'Sign Up with Google'} 
              onPress={handleSignUpWithGoogle} 
              disabled={isSubmitting} 
            />
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <TouchableOpacity style={styles.signInLink} onPress={() => navigation.navigate('SignIn')}>
            <Text style={styles.switchText}>Already have an account? <Text style={styles.link}>Sign In</Text></Text>
          </TouchableOpacity>

          <CustomPickerModal visible={showLanguageModal} onClose={() => setShowLanguageModal(false)} options={languages} selectedValue={language} onSelect={value => setLanguage(value as 'en' | 'fr' | 'pcm')} title="Choose Language" />
          <CustomPickerModal visible={showRoleModal} onClose={() => setShowRoleModal(false)} options={roles} selectedValue={role} onSelect={value => setRole(value as 'student' | 'landlord')} title="I am a" />
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, paddingTop: 40, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 30, textAlign: 'center', color: '#B8860B' },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, marginBottom: 16, backgroundColor: '#fafafa' },
  pickerText: { fontSize: 16, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 16, backgroundColor: '#fafafa', color: '#333' },
  phoneInputContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fafafa' },
  phonePrefix: { paddingHorizontal: 16, paddingVertical: 16, backgroundColor: '#e9ecef', borderRightWidth: 1, borderRightColor: '#ddd' },
  phonePrefixText: { fontSize: 16, fontWeight: '600', color: '#333' },
  phoneInput: { flex: 1, padding: 16, fontSize: 16, color: '#333' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, marginBottom: 16, backgroundColor: '#fafafa' },
  passwordInput: { flex: 1, padding: 16, fontSize: 16, color: '#333' },
  eyeButton: { padding: 16 },
  passwordStrengthContainer: { marginBottom: 16 },
  passwordStrengthBar: { height: 4, borderRadius: 2, marginBottom: 8 },
  passwordStrengthText: { fontSize: 12, fontWeight: '500' },
  tosContainer: { marginBottom: 24 },
  checkbox: { flexDirection: 'row', alignItems: 'flex-start' },
  checkboxBox: { width: 20, height: 20, borderWidth: 2, borderColor: '#ddd', borderRadius: 4, marginRight: 12, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  checkboxBoxChecked: { backgroundColor: '#B8860B', borderColor: '#B8860B' },
  tosText: { flex: 1, fontSize: 14, color: '#666', lineHeight: 20 },
  link: { color: '#B8860B', fontWeight: '600' },
  loadingOverlay: { marginTop: 16, alignItems: 'center' },
  errorText: { color: '#dc3545', textAlign: 'center', marginTop: 12, fontSize: 14, fontWeight: '500' },
  signInLink: { marginTop: 24, alignItems: 'center' },
  switchText: { textAlign: 'center', fontSize: 15, color: '#666' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '50%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', padding: 20, textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalOptions: { maxHeight: 300 },
  optionButton: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  optionButtonSelected: { backgroundColor: '#f8f9fa' },
  optionText: { fontSize: 16, textAlign: 'center', color: '#333' },
  optionTextSelected: { color: '#B8860B', fontWeight: '600' },
  modalCloseButton: { padding: 18, borderTopWidth: 1, borderTopColor: '#eee' },
  modalCloseText: { fontSize: 16, color: '#666', textAlign: 'center', fontWeight: '600' },
  
});

export default SignUpScreen;
