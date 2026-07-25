import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, ActivityIndicator } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';
import { AuthStackParamList } from '../../types';
import { RootState } from '../../store/store';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import ButtonPrimary from '../../components/ButtonPrimary';
import { useTheme } from '../../context/ThemeContext';

type EmailVerificationRouteProp = RouteProp<AuthStackParamList, 'EmailVerification'>;
type EmailVerificationNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'EmailVerification'>;

export const EmailVerificationScreen: React.FC = () => {
  const route = useRoute<EmailVerificationRouteProp>();
  const navigation = useNavigation<EmailVerificationNavigationProp>();
  const { email, mode } = route.params;

  const isSyncing = useSelector((state: RootState) => state.auth.isSyncing);
  const authError = useSelector((state: RootState) => state.auth.error);

  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const handleOpenEmail = async () => {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('message://');
      } else {
        await Linking.openURL('googlegmail://').catch(() => Linking.openURL('mailto:'));
      }
    } catch (e) {
      console.log('Could not open email client', e);
    }
  };

  if (isSyncing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.title, { marginTop: 24 }]}>Finalizing Account</Text>
          <Text style={styles.subtitle}>
            We've acknowledged your click! We're now setting up your secure profile.
            {"\n\n"}
            <Text style={{ color: colors.primary, fontSize: 12 }}>
              SYNCING: Fetching database records...
            </Text>
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.iconContainer}>
          <Ionicons name="mail-unread-outline" size={80} color={colors.primary} />
        </View>
        
        <Text style={styles.title}>{mode === 'recovery' ? 'Reset Password' : 'Check your email'}</Text>
        
        <Text style={styles.subtitle}>
          {mode === 'recovery' 
            ? "We've sent a password recovery link to:" 
            : "We've sent a login link to:"}
          {'\n'}
          <Text style={styles.email}>{email}</Text>
        </Text>

        <Text style={styles.instructions}>
          {mode === 'recovery'
            ? "Click the link in the email to set a new password."
            : "Clicking the link will sign you in automatically. If you don't have an account yet, one will be created for you!"}
        </Text>

        {authError && (
          <Text style={{ color: colors.error, marginBottom: 20, textAlign: 'center' }}>{authError}</Text>
        )}

        <ButtonPrimary 
          title="Open Email App" 
          onPress={handleOpenEmail} 
          style={styles.button}
        />

        <TouchableOpacity onPress={() => navigation.navigate('SignUp')} style={styles.backButton}>
          <Text style={styles.backText}>Back to Sign Up</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  iconContainer: { marginBottom: 32, padding: 24, backgroundColor: isDark ? 'rgba(212,175,55,0.15)' : 'rgba(184,134,11,0.1)', borderRadius: 100 },
  title: { fontSize: 28, fontWeight: 'bold', color: colors.text, marginBottom: 16 },
  subtitle: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  email: { fontWeight: 'bold', color: colors.primary },
  instructions: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 40 },
  button: { width: '100%', marginBottom: 16 },
  backButton: { paddingVertical: 12 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' }
});

export default EmailVerificationScreen;
