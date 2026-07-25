import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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

export default function ReportUserScreen() {
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

  // Determine if the current user is reporting a Landlord or a Student
  const isStudentReporting = user?.role === 'student';
  const targetLabel = isStudentReporting ? 'Landlord' : 'Student';

  const [targetName, setTargetName] = useState("");
  const [targetPhone, setTargetPhone] = useState("");
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmitReport = async () => {
    if (!targetName.trim() || !explanation.trim()) {
      return Alert.alert("Required Fields", `Please specify the ${targetLabel}'s name and your explanation.`);
    }

    if (!user) {
      return Alert.alert("Error", "You must be logged in to submit a report.");
    }

    setLoading(true);

    try {
      // Create the report message body
      const reportBody = `[REPORT AGAINST ${targetLabel.toUpperCase()}]\nName: ${targetName}\nPhone: ${targetPhone || 'N/A'}\n\nExplanation:\n${explanation}`;

      // Insert into chats table. receiver_id is explicitly null for admin
      const { error } = await supabase.from("chats").insert({
        sender_id: user.id,
        receiver_id: null,
        message: reportBody,
        sender_type: "user",
        chat_type: "support",
        is_complaint: true,
        read: false,
      });

      if (error) {
        Alert.alert("Submission Failed", error.message);
      } else {
        Alert.alert("Report Submitted", "Your report has been received by our admin team.", [
          { text: "OK", onPress: () => navigation.goBack() }
        ]);
      }
    } catch (err: any) {
      Alert.alert("Error", "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
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
        <Text style={styles.headerTitle}>Report a {targetLabel}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.description}>
            If you have experienced inappropriate behavior, scams, or other issues, please provide the details below. Our admin team will review this report.
          </Text>

          <Text style={styles.label}>{targetLabel} Name *</Text>
          <TextInput
            value={targetName}
            onChangeText={setTargetName}
            style={styles.input}
            placeholder={`Enter the ${targetLabel.toLowerCase()}'s full name`}
          />

          <Text style={styles.label}>{targetLabel} Phone (Optional)</Text>
          <TextInput
            value={targetPhone}
            onChangeText={setTargetPhone}
            style={styles.input}
            keyboardType="phone-pad"
            placeholder="Enter their phone number if known"
          />

          <Text style={styles.label}>Explanation *</Text>
          <TextInput
            value={explanation}
            onChangeText={setExplanation}
            style={[styles.input, styles.textArea]}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            placeholder="Please explain the situation in detail..."
          />

          <TouchableOpacity 
            style={[styles.submitBtn, loading && { opacity: 0.6 }]} 
            onPress={handleSubmitReport} 
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.submitText}>Submit Report</Text>
            )}
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
