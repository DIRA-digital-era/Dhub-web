// src/screens/student/ListingReviewScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from '../../utils/supabaseClient';
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StudentStackParamList } from "../../types";

type ListingReviewParams = {
  listing_id: string;
};

export default function ListingReviewScreen() {
  const { user } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<StudentStackParamList>>();
  const route = useRoute();
  const params = route.params as ListingReviewParams;
  const listing_id = params.listing_id;

  const [stars, setStars] = useState<number>(0);
  const [comment, setComment] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const submitRating = async () => {
    if (!user?.id) return Alert.alert("Error", "User not logged in.");
    if (stars < 1 || stars > 5) return Alert.alert("Error", "Please select a rating (1–5 stars).");

    setLoading(true);

    try {
      // Try to insert first
      const { error: insertErr } = await supabase
        .from("ratings")
        .insert({
          listing_id,
          reviewer_id: user.id,
          score: stars,
          comment: comment.trim() === "" ? null : comment.trim(),
        });

      if (insertErr) {
        // If conflict (duplicate rating) or other error, attempt update
        const { error: updateErr } = await supabase
          .from("ratings")
          .update({
            score: stars,
            comment: comment.trim() === "" ? null : comment.trim(),
          })
          .eq("listing_id", listing_id)
          .eq("reviewer_id", user.id);

        if (updateErr) throw updateErr;
      }

      Alert.alert(
        "Thank You!",
        "Your rating helps improve DHUB.",
        [
          {
            text: "Back to Booking",
            onPress: () => navigation.goBack(),
          },
        ]
      );

      setStars(0);
      setComment("");
    } catch (err: any) {
      console.error("Rating submission error:", err);
      Alert.alert("Error", err.message || "Failed to submit rating.");
    } finally {
      setLoading(false);
    }
  };

  const renderStars = () => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <TouchableOpacity
          key={i}
          onPress={() => setStars(i)}
          disabled={loading}
        >
          <Ionicons
            name={i <= stars ? "star" : "star-outline"}
            size={40}
            color="#D4AF37"
            style={{ marginHorizontal: 4 }}
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.heading}>Rate this Listing</Text>
        <Text style={styles.subheading}>Tap stars to select your rating</Text>

        {renderStars()}

        <Text style={styles.label}>Optional Comment</Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Write your review..."
          multiline
          style={styles.textInput}
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          onPress={submitRating}
          disabled={loading}
        >
          <Text style={styles.submitBtnText}>
            {loading ? "Submitting..." : "Submit Rating"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
          <Text style={styles.backBtnText}>Back to Booking</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7f7" },
  heading: { fontSize: 24, fontWeight: "700", color: "#333", marginBottom: 6 },
  subheading: { fontSize: 16, color: "#777", marginBottom: 16 },
  starsRow: { flexDirection: "row", marginVertical: 12 },
  label: { fontSize: 14, color: "#777", marginTop: 12, marginBottom: 6 },
  textInput: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    fontSize: 16,
    color: "#333",
  },
  submitBtn: {
    backgroundColor: "#D4AF37",
    padding: 14,
    borderRadius: 10,
    marginTop: 20,
    alignItems: "center",
  },
  submitBtnText: { color: "#000", fontWeight: "700", fontSize: 16 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#777",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 16,
    alignSelf: "flex-start",
  },
  backBtnText: { color: "#fff", fontWeight: "700", marginLeft: 6 },
});
