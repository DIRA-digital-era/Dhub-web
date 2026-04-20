import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Text } from "react-native";
import { WebView } from "react-native-webview";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LegalScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#D4AF37" />
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
  },

  header: {
    height: 56,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },

  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingRight: 12,
  },

  backText: {
    marginLeft: 6,
    fontSize: 16,
    color: "#D4AF37",
    fontWeight: "600",
  },

  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#333",
  },

  rightSpacer: {
    width: 60,
  },

  webContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
});
