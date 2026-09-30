// src/screens/auth/CompleteProfileScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useDispatch, useSelector } from 'react-redux';
import { supabase } from '../../utils/supabaseClient';
import { syncProfileData } from '../../utils/login';
import { setUser, setNeedsOnboarding } from '../../store/authSlice';
import { createLocalSession } from '../../utils/localSession';
import type { AppDispatch } from '../../store/store';
import type { RootState } from '../../store/store';

// â”€â”€â”€ Design Tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const GOLD   = '#D4AF37';
const GOLD_D = '#B8960C';
const GOLD_L = '#FDF9EE';
const WHITE  = '#FFFFFF';
const BG     = '#F8F9FA';
const GREY1  = '#1A1A1A';
const GREY2  = '#555555';
const GREY3  = '#999999';
const BORDER = '#E5E7EB';
const ERROR  = '#EF4444';

type Role = 'student' | 'landlord';

const CompleteProfileScreen: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const authUser = useSelector((state: RootState) => state.auth.user);

  const [fullName, setFullName] = useState(
    authUser?.fullName && authUser.fullName !== 'User' ? authUser.fullName : ''
  );
  const [whatsapp, setWhatsapp] = useState('');
  const [mobileMoney, setMobileMoney] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const userEmail = authUser?.email || '';
  const isValid = fullName.trim().length >= 2 && whatsapp.trim().length >= 9 && mobileMoney.trim().length >= 9 && role !== null;

  const handleSubmit = async () => {
    if (!isValid || !authUser) return;
    setLoading(true);
    setError('');
    try {
      await syncProfileData(authUser.id, {
        fullName: fullName.trim(),
        role: role!,
        whatsappNumber: whatsapp.trim(),
        mobileMoney: mobileMoney.trim(),
        language: 'en',
      });

      const { data: dbUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      const { data: { session } } = await supabase.auth.getSession();

      const finalUser = {
        id: authUser.id,
        fullName: dbUser?.full_name || fullName.trim(),
        email: dbUser?.email || userEmail,
        role: (dbUser?.role || role) as 'student' | 'landlord' | 'admin',
        phone: dbUser?.phone || whatsapp.trim(),
        token: session?.access_token || authUser.token,
        refreshToken: session?.refresh_token || authUser.refreshToken || '',
        supabaseTokens: session
          ? { access_token: session.access_token, refresh_token: session.refresh_token }
          : authUser.supabaseTokens,
      };

      await createLocalSession(finalUser, finalUser.supabaseTokens);
      dispatch(setUser(finalUser));
      dispatch(setNeedsOnboarding(false));
    } catch (err: any) {
      setError(err.message || 'Could not save your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: WHITE }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* â”€â”€ Card wrapper (web-centric centering) â”€â”€ */}
          <View style={styles.card}>

            {/* â”€â”€ Hero â”€â”€ */}
            <View style={styles.heroWrap}>
              <LinearGradient colors={[GOLD, GOLD_D]} style={styles.heroIcon}>
                <Ionicons name="person-add" size={32} color={WHITE} />
              </LinearGradient>
              <Text style={styles.heroTitle}>Welcome to DHUB ðŸŽ‰</Text>
              <Text style={styles.heroSub}>
                Complete your profile to get started.
                {userEmail ? "\nLogged in as " + userEmail : ''}
              </Text>
            </View>

            {/* â”€â”€ Role Picker â”€â”€ */}
            <Text style={styles.label}>I am a <Text style={styles.required}>*</Text></Text>
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[styles.roleCard, role === 'student' && styles.roleCardActive]}
                onPress={() => setRole('student')}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={role === 'student' ? [GOLD, GOLD_D] : ['#F3F4F6', '#E5E7EB']}
                  style={styles.roleIconWrap}
                >
                  <Ionicons name="school" size={22} color={role === 'student' ? WHITE : GREY3} />
                </LinearGradient>
                <Text style={[styles.roleLabel, role === 'student' && styles.roleLabelActive]}>Tenant</Text>
                <Text style={[styles.roleDesc, role === 'student' && styles.roleDescActive]}>
                  Looking for a place
                </Text>
                {role === 'student' && (
                  <View style={styles.roleCheck}>
                    <Ionicons name="checkmark-circle" size={18} color={GOLD} />
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleCard, role === 'landlord' && styles.roleCardActive]}
                onPress={() => setRole('landlord')}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={role === 'landlord' ? [GOLD, GOLD_D] : ['#F3F4F6', '#E5E7EB']}
                  style={styles.roleIconWrap}
                >
                  <Ionicons name="home" size={22} color={role === 'landlord' ? WHITE : GREY3} />
                </LinearGradient>
                <Text style={[styles.roleLabel, role === 'landlord' && styles.roleLabelActive]}>Landlord</Text>
                <Text style={[styles.roleDesc, role === 'landlord' && styles.roleDescActive]}>
                  Listing a property
                </Text>
                {role === 'landlord' && (
                  <View style={styles.roleCheck}>
                    <Ionicons name="checkmark-circle" size={18} color={GOLD} />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* â”€â”€ Full Name â”€â”€ */}
            <Text style={styles.label}>Full Name <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color={GREY3} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g. Jean-Paul Ekwala"
                placeholderTextColor={GREY3}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            {/* â”€â”€ WhatsApp â”€â”€ */}
            <Text style={styles.label}>WhatsApp Number <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrap}>
              <Text style={styles.dialCode}>+237</Text>
              <TextInput
                style={[styles.input, { paddingLeft: 4 }]}
                value={whatsapp}
                onChangeText={setWhatsapp}
                placeholder="6XXXXXXXX"
                placeholderTextColor={GREY3}
                keyboardType="phone-pad"
                maxLength={9}
                returnKeyType="next"
              />
            </View>
            <Text style={styles.fieldHint}>Used to receive booking notifications</Text>

            {/* â”€â”€ Mobile Money â”€â”€ */}
            <Text style={styles.label}>Mobile Money Number <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrap}>
              <Text style={styles.dialCode}>+237</Text>
              <TextInput
                style={[styles.input, { paddingLeft: 4 }]}
                value={mobileMoney}
                onChangeText={setMobileMoney}
                placeholder="6XXXXXXXX"
                placeholderTextColor={GREY3}
                keyboardType="phone-pad"
                maxLength={9}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>
            <Text style={styles.fieldHint}>MTN MoMo or Orange Money â€” for deposits & payouts</Text>

            {/* â”€â”€ Error â”€â”€ */}
            {!!error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={ERROR} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* â”€â”€ Submit â”€â”€ */}
            <TouchableOpacity
              style={[styles.submitBtn, !isValid && styles.submitBtnOff]}
              onPress={handleSubmit}
              disabled={!isValid || loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <>
                  <Text style={styles.submitText}>Continue to DHUB</Text>
                  <Ionicons name="arrow-forward" size={18} color={WHITE} />
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              Your information is secured and only used within the DHUB platform.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

// â”€â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
  },

  // Card â€” centered on web, full-width on small screens
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 36,
    // Web shadow
    ...Platform.select({
      web: {
        boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 6,
      },
    }),
  },

  // Hero
  heroWrap: { alignItems: 'center', marginBottom: 32 },
  heroIcon: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      web: { boxShadow: '0 6px 20px rgba(212,175,55,0.4)' } as any,
      default: {
        shadowColor: GOLD, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
      },
    }),
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: GREY1, textAlign: 'center', marginBottom: 8 },
  heroSub:   { fontSize: 14, color: GREY2, textAlign: 'center', lineHeight: 22 },

  // Role cards
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  roleCard: {
    flex: 1, alignItems: 'center', padding: 16, borderRadius: 16,
    borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: BG, position: 'relative',
    ...Platform.select({ web: { cursor: 'pointer' } as any }),
  },
  roleCardActive: { borderColor: GOLD, backgroundColor: GOLD_L },
  roleIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  roleLabel:       { fontSize: 15, fontWeight: '700', color: GREY1, marginBottom: 4 },
  roleLabelActive: { color: GOLD_D },
  roleDesc:        { fontSize: 12, color: GREY3, textAlign: 'center' },
  roleDescActive:  { color: GOLD_D },
  roleCheck: { position: 'absolute', top: 10, right: 10 },

  // Fields
  label:    { fontSize: 13, fontWeight: '600', color: GREY2, marginBottom: 8 },
  required: { color: ERROR },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    backgroundColor: BG, paddingHorizontal: 14, minHeight: 52,
    marginBottom: 4,
  },
  inputIcon:  { marginRight: 10 },
  dialCode:   { fontSize: 15, color: GREY1, fontWeight: '600', marginRight: 6 },
  input:      { flex: 1, fontSize: 15, color: GREY1, paddingVertical: 0 },
  fieldHint:  { fontSize: 12, color: GREY3, marginBottom: 20 },

  // Error
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 10,
    padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: '#FECACA',
  },
  errorText: { flex: 1, fontSize: 13, color: ERROR, fontWeight: '500' },

  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: GOLD, borderRadius: 14,
    paddingVertical: 16, marginTop: 8, marginBottom: 16,
    ...Platform.select({
      web: { cursor: 'pointer', boxShadow: '0 4px 14px rgba(212,175,55,0.4)' } as any,
      default: {
        shadowColor: GOLD, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
      },
    }),
  },
  submitBtnOff: {
    backgroundColor: BORDER,
    ...Platform.select({ web: { boxShadow: 'none' } as any, default: { shadowOpacity: 0, elevation: 0 } }),
  },
  submitText:  { fontSize: 16, fontWeight: '800', color: WHITE },
  disclaimer:  { fontSize: 12, color: GREY3, textAlign: 'center', lineHeight: 18 },
});

export default CompleteProfileScreen;
