import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Text } from "react-native";
import { WebView } from "react-native-webview";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import React from "react";
import { useTheme } from "../../context/ThemeContext";

export default function LegalScreen() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Terms of Service & Privacy Policy</Text>

        {/* Real spacer for symmetry */}
        <View style={styles.rightSpacer} />
      </View>

      {/* Web Content */}
      <View style={styles.webContainer}>
        <WebView
          source={{ uri: "https://dhubcmr.netlify.app/terms" }}
          startInLoadingState
          renderLoading={() => (
            <ActivityIndicator size="large" style={{ marginTop: 40 }} />
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 56,
    backgroundColor: colors.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingRight: 12 },
  backText: { marginLeft: 6, fontSize: 16, color: colors.primary, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  rightSpacer: { width: 60 },
  webContainer: { flex: 1, backgroundColor: colors.background },
});
