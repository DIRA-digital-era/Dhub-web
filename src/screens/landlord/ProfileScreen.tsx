//src/screens/landlord/ProfileScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../context/ThemeContext";
import { supabase } from '../../utils/supabaseClient';

export default function LandlordProfileScreen() {
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const { mode, setThemeMode, colors } = useTheme();
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [momo, setMomo] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<"eng" | "fren" | "pidgin">("eng");

  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const fetchLandlordData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      setFullName(data.full_name ?? "");
      setEmail(data.email ?? "");
      setPhone(data.phone ?? "");
      setMomo(data.momo ?? "");
      const savedLang = (data.preferred_language as "eng" | "fren" | "pidgin") ?? "eng";
      setPreferredLanguage(savedLang);
      if (i18n.language !== savedLang) {
        i18n.changeLanguage(savedLang);
      }
    } catch (err: any) {
      console.error("Fetch landlord profile error:", err);
      Alert.alert(t('common.error'), err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLandlordData();
  }, [user]);

  const validateEmail = (e: string) =>
    /^(([^<>()[\]\\.,;:\s@"]+(.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(([^<>()[\]\\.,;:\s@"]+\.)+[^<>()[\]\\.,;:\s@"]{2,})$/i.test(e);
  const validateMomo = (m: string) => /^\d{9}$/.test(m);

  const handleLanguageToggle = async (next: "eng" | "fren" | "pidgin") => {
    setPreferredLanguage(next);
    i18n.changeLanguage(next);
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) return Alert.alert(t('common.error'), t('profile.full_name') + " is required");
    if (email && !validateEmail(email)) return Alert.alert(t('common.error'), "Invalid email format");
    if (!validateMomo(momo)) return Alert.alert(t('common.error'), "Momo must be 9 digits");
    if (!user) return Alert.alert(t('common.error'), "User session missing");

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        setLoading(false);
        return Alert.alert(t('profile.session_missing'), t('profile.session_missing_msg'));
      }

      if (email !== user.email) {
        const { error: authError } = await supabase.auth.updateUser({ email });
        if (authError) throw new Error(authError.message);
        Alert.alert(
          t('profile.verification_required'),
          t('profile.verification_msg'),
          [
            { text: t('common.cancel'), style: "cancel" },
            { text: t('profile.open_gmail'), onPress: () => Linking.openURL('googlegmail://').catch(() => Linking.openURL('mailto:')) }
          ]
        );
      }

      const { error } = await supabase
        .from("users")
        .update({
          full_name: fullName,
          email: email || null,
          momo,
          preferred_language: preferredLanguage,
        })
        .eq("id", user.id);

      if (error) throw new Error(error.message);

      await AsyncStorage.setItem("appLanguage", preferredLanguage);
      Alert.alert(t('common.success'), t('profile.saved'));
      await fetchLandlordData();
    } catch (err: any) {
      console.error("Save profile error:", err);
      Alert.alert(t('common.error'), err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      await signOut();
      navigation.reset({ index: 0, routes: [{ name: "SignIn" as never }] });
    } catch {
      Alert.alert(t('common.error'), "Logout failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) return Alert.alert(t('common.error'), "Please fill in all fields");
    if (newPassword !== confirmPassword) return Alert.alert(t('common.error'), "Passwords do not match");
    if (newPassword.length < 6) return Alert.alert(t('common.error'), "Password must be at least 6 characters");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      Alert.alert(t('common.error'), error.message);
    } else {
      Alert.alert(t('common.success'), "Password updated successfully");
      setChangePasswordVisible(false);
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile.delete_confirm_title'),
      t('profile.delete_confirm_msg'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('profile.delete'),
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            setLoading(true);
            const { error } = await supabase.from('users').update({ is_active: false }).eq('id', user.id);
            if (error) {
              setLoading(false);
              return Alert.alert(t('common.error'), error.message);
            }
            await signOut();
          }
        }
      ]
    );
  };

  const langOptions: { code: "eng" | "fren" | "pidgin"; label: string }[] = [
    { code: "eng", label: "EN" },
    { code: "fren", label: "FR" },
    { code: "pidgin", label: "PCM" },
  ];

  const themeOptions: { code: "light" | "dark" | "system"; label: string }[] = [
    { code: "light", label: "Light" },
    { code: "dark", label: "Dark" },
    { code: "system", label: "System" },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={[styles.title, { color: colors.text }]}>{t('profile.title')}</Text>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">

        {/* Editable Info */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.full_name')}</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.email')}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            keyboardType="email-address"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.phone')}</Text>
          <TextInput
            value={phone}
            style={[styles.input, { backgroundColor: colors.border, borderColor: colors.border, color: colors.textSecondary }]}
            editable={false}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.momo')}</Text>
          <TextInput
            value={momo}
            onChangeText={setMomo}
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            keyboardType="number-pad"
            maxLength={9}
            placeholderTextColor={colors.textSecondary}
          />

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]}
            onPress={handleSaveProfile}
            disabled={loading}
          >
            <Text style={styles.saveText}>{loading ? t('common.loading') : t('common.save')}</Text>
          </TouchableOpacity>
        </View>

        {/* Language Selector */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.language_label')}</Text>
          <View style={styles.langRow}>
            {langOptions.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langBtn,
                  { backgroundColor: colors.background, borderColor: colors.border },
                  preferredLanguage === lang.code && { backgroundColor: colors.primary, borderColor: colors.primary }
                ]}
                onPress={() => handleLanguageToggle(lang.code)}
              >
                <Text style={[styles.langText, { color: colors.textSecondary }, preferredLanguage === lang.code && styles.langTextActive]}>
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Theme Selector */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.theme_label', 'Theme')}</Text>
          <View style={styles.langRow}>
            {themeOptions.map((tOpt) => (
              <TouchableOpacity
                key={tOpt.code}
                style={[
                  styles.langBtn,
                  { backgroundColor: colors.background, borderColor: colors.border },
                  mode === tOpt.code && { backgroundColor: colors.primary, borderColor: colors.primary }
                ]}
                onPress={() => setThemeMode(tOpt.code as "light" | "dark" | "system")}
              >
                <Text style={[styles.langText, { color: colors.textSecondary }, mode === tOpt.code && styles.langTextActive]}>
                  {tOpt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <ProfileButton icon="calendar" label={t('profile.view_bookings')} onPress={() => navigation.navigate("Bookings" as never)} colors={colors} />
          <ProfileButton icon="add-circle" label={t('profile.upload_listing')} onPress={() => navigation.navigate("UploadListing" as never)} colors={colors} />
          <ProfileButton icon="list" label={t('profile.manage_listings')} onPress={() => navigation.navigate("ManageListings" as never)} colors={colors} />
          <ProfileButton icon="notifications" label={t('common.notifications')} onPress={() => navigation.navigate("Notifications" as never)} colors={colors} />
          <ProfileButton icon="document-text" label={t('profile.terms')} onPress={() => navigation.navigate("Legal" as never)} colors={colors} />
          <ProfileButton icon="lock-closed" label={t('profile.change_password')} onPress={() => setChangePasswordVisible(true)} colors={colors} />
          <ProfileButton icon="warning" label={t('profile.report_tenant')} onPress={() => navigation.navigate("ReportUser" as never)} colors={colors} />
          <ProfileButton icon="bug" label={t('profile.report_bug')} onPress={() => navigation.navigate("ReportBug" as never)} colors={colors} />
          <ProfileButton icon="trash" label={t('profile.delete_account')} danger onPress={handleDeleteAccount} disabled={loading} colors={colors} />
          <ProfileButton icon="log-out" label={t('common.logout')} onPress={handleLogout} disabled={loading} colors={colors} />
        </View>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal visible={changePasswordVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profile.change_password')}</Text>
              <TouchableOpacity onPress={() => setChangePasswordVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.new_password')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t('profile.enter_new_password')}
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.confirm_password')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('profile.reenter_password')}
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]}
              onPress={handleUpdatePassword}
              disabled={loading}
            >
              <Text style={styles.saveText}>
                {loading ? t('common.updating') : t('profile.update_password')}
              </Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function ProfileButton({
  icon, label, onPress, danger, disabled, colors
}: {
  icon: any; label: string; onPress: () => void; danger?: boolean; disabled?: boolean; colors: any;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { backgroundColor: colors.card, borderColor: colors.border },
        danger && { backgroundColor: colors.error ?? '#EF4444' },
        disabled && { opacity: 0.6 },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={22} color={danger ? "#fff" : colors.primary} />
      <Text style={[styles.actionText, { color: colors.text }, danger && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { paddingHorizontal: 20, paddingBottom: 40, padding: 12 },
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginVertical: 20,
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 10,
  },
  section: { borderRadius: 12, padding: 16, marginBottom: 20 },
  label: { marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  saveBtn: { marginTop: 16, padding: 14, borderRadius: 10, alignItems: "center" },
  saveText: { color: "#000", fontWeight: "700", fontSize: 16 },
  langRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  langBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  langTextActive: { color: "#fff" },
  langText: { fontSize: 13, fontWeight: "bold" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  actionText: { marginLeft: 12, fontSize: 16 },
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center" },
  modalContent: { width: "90%", borderRadius: 16, padding: 20, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: "700" },
});
