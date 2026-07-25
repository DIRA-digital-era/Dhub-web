import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../utils/supabaseClient";
import { useTheme } from "../../context/ThemeContext";

export default function ReportBugScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const { colors: themeColors, isDark } = useTheme();
  const colors = React.useMemo(() => ({
    background: themeColors.background,
    card: themeColors.card,
    border: themeColors.border,
    primary: themeColors.primary,
    text: themeColors.text,
    textSecondary: themeColors.textSecondary,
    inputBg: isDark ? '#1A1A1A' : '#fff',
    sectionBg: isDark ? '#1A1A1A' : '#f7f7f7',
    labelColor: isDark ? '#CCCCCC' : '#444',
  }), [themeColors, isDark]);
  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmitBug = async () => {
    if (!description.trim()) {
      return Alert.alert("Required Fields", "Please describe the bug before submitting.");
    }

    if (!user) {
      return Alert.alert("Error", "You must be logged in to submit a bug report.");
    }

    const email = "dhubcmr@gmail.com";
    const mailSubject = `[Bug Report] ${subject || 'Issue in App'}`;
    const userContext = `User Role: ${user?.role || 'Unknown'}\nUser Email: ${user?.email || 'Unknown'}\nUser ID: ${user?.id || 'Unknown'}\n\n`;

    const mailBody = `${userContext}Bug Description:\n${description}`;

    try {
      // 1. Insert into database for dashboard tracking
      const { error: dbError } = await supabase.from("chats").insert({
        sender_id: user.id,
        receiver_id: null,
        message: mailBody,
        sender_type: "user",
        chat_type: "support", // Use support for general admin ticketing
        is_complaint: false, // Bugs aren't complaints against users
        read: false,
      });

      if (dbError) {
        console.error("Database insert failed:", dbError);
        // Continue to email fallback even if DB fails, so they can still report
      }

      // 2. Construct the mailto URL
      const url = `mailto:${email}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;

      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        // We do not go back automatically because navigating to the email app puts this app in the background.
        // We can just trust they sent it or let them go back manually.
      } else {
        Alert.alert("Error", "No email client is installed on your device. Only the database copy was submitted.");
      }
    } catch (error) {
      Alert.alert("Error", "An unexpected error occurred while processing your bug report.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report a Bug</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.description}>
            Found a technical issue, crash, or visual bug? Let our developers know so we can fix it!
          </Text>

          <Text style={styles.label}>Subject (Optional)</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            style={styles.input}
            placeholder="E.g., App crashes when I view bookings"
          />

          <Text style={styles.label}>Description *</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textArea]}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            placeholder="Describe exactly what happened and how to replicate it..."
          />

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitBug}>
            <Text style={styles.submitText}>Send Email to Support</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 50 : 30,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backBtn: {
    padding: 5,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
  },
  section: {
    backgroundColor: colors.sectionBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  label: {
    color: colors.labelColor,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 6
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
  },
  textArea: {
    minHeight: 120,
  },
  submitBtn: {
    marginTop: 24,
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 10,
    alignItems: "center"
  },
  submitText: {
    color: isDark ? '#1A1A1A' : '#000',
    fontWeight: "700",
    fontSize: 16
  },
});
