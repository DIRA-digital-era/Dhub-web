import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput, TouchableOpacity,
  View
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from '../../utils/supabaseClient';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(""); // view only
  const [momo, setMomo] = useState("");
  const [language, setLanguage] = useState<"eng" | "fren" | "pidgin">("eng");

  // fetch user info from users table
  const fetchUserData = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    setLoading(false);
    if (error) return Alert.alert("Error fetching user data", error.message);

    setFullName(data.full_name ?? "");
    setEmail(data.email ?? "");
    setPhone(data.phone ?? "");
    setMomo(data.momo ?? "");
    setLanguage((data.preferred_language as any) ?? "eng");
  };

  useEffect(() => {
    fetchUserData();
  }, [user]);

  const validateEmail = (e: string) =>
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(([^<>()[\]\\.,;:\s@"]+\.)+[^<>()[\]\\.,;:\s@"]{2,})$/i.test(e);
  const validateMomo = (m: string) => /^\d{9}$/.test(m);

  const handleSaveProfile = async () => {
    if (!fullName.trim()) return Alert.alert("Full Name is required");
    if (email && !validateEmail(email)) return Alert.alert("Invalid email format");
    if (!validateMomo(momo)) return Alert.alert("Momo must be 9 digits");

    if (!user) return Alert.alert("User session missing");

    setLoading(true);

    // ensure session hydrated
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      setLoading(false);
      return Alert.alert(
        "Session missing",
        "Cannot update email. Please log out and log back in."
      );
    }

    // update auth email if changed
    if (email !== user.email) {
      const { error: authError } = await supabase.auth.updateUser({ email });
      if (authError) {
        setLoading(false);
        return Alert.alert("Error updating email", authError.message);
      }
    }

    // update users table
    const { error } = await supabase
      .from("users")
      .update({
        full_name: fullName,
        email: email || null,
        momo: momo,
      })
      .eq("id", user.id);

    setLoading(false);
    if (error) return Alert.alert("Error saving profile", error.message);

    Alert.alert("Saved", "Profile updated successfully");
    fetchUserData();
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      await signOut(); // This updates Redux, which unmounts the StudentStack and auto-redirects to AuthStack.
    } catch (err) {
      Alert.alert("Logout failed", "Please try again");
      setLoading(false);
    }
    // We do NOT call setLoading(false) in a finally block because the screen is immediately unmounted 
    // when user state becomes null, which causes a "state update on unmounted component" warning.
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>My Profile</Text>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
      
        <View style={styles.section}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput value={fullName} onChangeText={setFullName} style={styles.input} />

          <Text style={styles.label}>Email</Text>
          <TextInput value={email} onChangeText={setEmail} style={styles.input} keyboardType="email-address" />

          <Text style={styles.label}>Phone</Text>
          <TextInput value={phone} style={[styles.input, { backgroundColor: "#eee" }]} editable={false} />

          <Text style={styles.label}>Momo Number</Text>
          <TextInput value={momo} onChangeText={setMomo} style={styles.input} keyboardType="number-pad" maxLength={9} />

          <TouchableOpacity style={[styles.saveBtn, loading && { opacity: 0.6 }]} onPress={handleSaveProfile} disabled={loading}>
            <Text style={styles.saveText}>Save Changes</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <ProfileButton icon="calendar" label="View My Bookings" onPress={() => navigation.navigate("ViewBookingsScreen" as never)} />
          <ProfileButton icon="language" label={`Language: ${language.toUpperCase()}`} onPress={() => setLanguage(language === "eng" ? "fren" : language === "fren" ? "pidgin" : "eng")} />
          <ProfileButton icon="document-text" label="Terms & Privacy Policy" onPress={() => navigation.navigate("Legal" as never)} />
          <ProfileButton icon="warning" label="Report a Landlord" onPress={() => navigation.navigate("ReportUser" as never)} />
          <ProfileButton icon="bug" label="Report a Bug" onPress={() => navigation.navigate("ReportBug" as never)} />
          <ProfileButton icon="log-out" label="Logout" danger onPress={handleLogout} disabled={loading} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ProfileButton({
  icon,  label,  onPress,  danger,  disabled,}: { icon: any; label: string; onPress: () => void; danger?: boolean; disabled?: boolean; }) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        danger && { backgroundColor: "#f34e4eff" },
        disabled && { opacity: 0.6 }, // dim button if disabled
      ]}
      onPress={onPress}
      disabled={disabled} // prevents tapping while disabled
    >
      <Ionicons name={icon} size={22} color={danger ? "#fff" : "#D4AF37"} />
      <Text style={[styles.actionText, danger && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { paddingHorizontal: 20, paddingBottom: 40 , padding: 12},
  title: { fontSize: 26, fontWeight: "700", color: "#333", marginVertical: 20, paddingHorizontal: 20, paddingTop: 50, paddingBottom: 10, },
  section: { backgroundColor: "#f7f7f7", borderRadius: 12, padding: 16, marginBottom: 20 },
  label: { color: "#777", marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, fontSize: 16 },
  saveBtn: { marginTop: 16, backgroundColor: "#D4AF37", padding: 14, borderRadius: 10, alignItems: "center" },
  saveText: { color: "#000", fontWeight: "700", fontSize: 16 },
  actionBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: "#e5e5e5" },
  actionText: { marginLeft: 12, fontSize: 16, color: "#333" },
});
