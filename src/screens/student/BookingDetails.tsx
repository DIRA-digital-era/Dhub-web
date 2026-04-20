// src/screens/student/BookingDetails.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { differenceInDays, format } from "date-fns";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from '../../utils/supabaseClient';
import { StudentStackParamList } from "../../types";

const { width } = Dimensions.get("window");

type BookingDetailsNavProp = NativeStackNavigationProp<StudentStackParamList, "BookingDetails">;
type BookingDetailsRouteProp = RouteProp<StudentStackParamList, "BookingDetails">;

type ListingType = {
  id: string;
  title: string;
  address: string | null;
  city: string;
  price: string;
  description: string | null;
  rooms: number | null;
  images: string[] | null;
  terms_text: string | null;
  landlord?: {
    id: string;
    full_name: string;
    phone: string;
  };
};

type BookingFull = {
  id: string;
  listing_id: string;
  landlord_id: string;
  student_id: string;
  amount: string;
  start_date: string;
  end_date: string;
  status: "pending" | "confirmed" | "cancelled";
  approval_status: "pending" | "approved" | "rejected";
  payment_status: "pending" | "completed" | "failed";
  agreed_to_terms: boolean;
  duration_type?: string;
  total_amount?: number;
  created_at: string;
  updated_at: string;
  listing: ListingType;
};

const STORAGE_KEY_PREFIX = "@booking_";
const CACHE_DURATION = 5 * 60 * 1000; // Reduced to 5 minutes

const COLORS = {
  gold: "#D4AF37",
  goldLight: "#F5E7C8",
  white: "#FFFFFF",
  offWhite: "#F8F9FA",
  greyDark: "#2C3E50",
  greyMedium: "#7F8C8D",
  greyLight: "#ECF0F1",
  border: "#E9ECEF",
  shadow: "#000000",
  success: "#4CAF50",
  warning: "#FFD700",
  danger: "#B22222",
  orange: "#FFA500",
  purple: "#9B59B6",
};

export default function BookingDetails() {
  const navigation = useNavigation<BookingDetailsNavProp>();
  const route = useRoute<BookingDetailsRouteProp>();
  const { bookingId } = route.params;
  const { user } = useAuth();
  
  const [booking, setBooking] = useState<BookingFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const handleGoBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("ViewBookingsScreen");
    }
  };

  const fetchBookingDetails = useCallback(async (forceRefresh = false) => {
    if (!user?.id || !bookingId) {
      setError(!user?.id ? "User not authenticated" : "No booking ID provided");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!forceRefresh) {
        const cached = await AsyncStorage.getItem(STORAGE_KEY_PREFIX + bookingId);
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached);
            if (data?.id) {
              setBooking(data);
              setLoading(false);
              
              if (Date.now() - timestamp > CACHE_DURATION || data.approval_status === 'pending') {
                fetchBookingDetails(true);
              }
              return;
            } else {
              await AsyncStorage.removeItem(STORAGE_KEY_PREFIX + bookingId);
            }
          } catch {
            await AsyncStorage.removeItem(STORAGE_KEY_PREFIX + bookingId);
          }
        }
      }

      const { data, error } = await supabase
        .from("bookings")
        .select("*, listings(*, landlord:users!listings_landlord_id_fkey(id, full_name, phone))")
        .eq("id", bookingId)
        .eq("student_id", user.id)
        .single();

      if (error) throw error;
      if (!data) throw new Error("Booking not found");

      const bookingData: BookingFull = { 
        ...data, 
        listing: data.listings || {
          id: data.listing_id,
          title: "Unknown Property",
          address: null,
          city: "",
          price: data.amount,
          description: null,
          rooms: null,
          images: null,
          terms_text: null
        }
      };

      if (bookingData?.id) {
        await AsyncStorage.setItem(
          STORAGE_KEY_PREFIX + bookingId, 
          JSON.stringify({
            data: bookingData,
            timestamp: Date.now()
          })
        );
      }
      
      setBooking(bookingData);
    } catch (err: any) {
      setError(err.message || "Failed to fetch booking");
      
      const cached = await AsyncStorage.getItem(STORAGE_KEY_PREFIX + bookingId);
      if (cached) {
        try {
          const { data } = JSON.parse(cached);
          if (data?.id) {
            setBooking(data);
            Alert.alert("Offline Mode", "You're viewing cached data. Some information may be outdated.");
          }
        } catch {
          // Silent fail
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId, user?.id]);

  useEffect(() => {
    fetchBookingDetails(false);
  }, [fetchBookingDetails]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBookingDetails(true);
  };

  // ── Realtime listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!bookingId) return;

    const channel = supabase
      .channel('booking_details_realtime_' + bookingId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bookingId}`,
        },
        (payload: any) => {
          const updated = payload.new;
          setBooking((prev: any) => {
            if (!prev) return prev;
            // Update booking state with new data from payload
            const newBooking = { ...prev, ...updated };
            
            // Sync with AsyncStorage to avoid stale cache on next load
            AsyncStorage.setItem(
              STORAGE_KEY_PREFIX + bookingId, 
              JSON.stringify({
                data: newBooking,
                timestamp: Date.now()
              })
            );
            
            return newBooking;
          });

          if (updated.approval_status === 'rejected' || updated.status === 'cancelled') {
            Alert.alert('Booking Update', 'Your booking status has changed.');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookingId]);

  const handlePayNow = () => {
    if (!booking) return;
    
    navigation.navigate("StudentTabs", {
      screen: "Payments",
      params: {
        listingId: booking.listing_id,
        bookingId: booking.id,
        amount: Number(booking.total_amount ?? booking.amount),
        description: `Booking payment for ${booking.listing?.title || "Property"}`,
        receiverPhone: booking.listing?.landlord?.phone || "",
        receiverName: booking.listing?.landlord?.full_name || "",
        landlordId: booking.landlord_id,
      },
    });
  };

  const handleContactSupport = (type: 'call' | 'email') => {
    if (type === 'call') {
      Linking.openURL("tel:+237682366472");
    } else {
      Linking.openURL("mailto:diradigitalera@gmail.com");
    }
  };

  const handleCancelBooking = () => {
    Alert.alert(
      "Cancel Booking",
      "Are you sure you want to cancel this booking? This action cannot be undone.",
      [
        { text: "No, Keep It", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive",
          onPress: () => Alert.alert("Success", "Booking cancelled successfully")
        }
      ]
    );
  };

  if (loading && !booking) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingText}>Loading booking details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !booking) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <View style={styles.center}>
          <View style={styles.errorIconContainer}>
            <Ionicons name="alert-circle-outline" size={64} color={COLORS.danger} />
          </View>
          <Text style={styles.errorTitle}>Unable to Load Booking</Text>
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorActions}>
            <TouchableOpacity onPress={handleRefresh} style={styles.retryButton}>
              <Ionicons name="refresh" size={20} color={COLORS.white} />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color={COLORS.gold} />
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!booking) return null;

  const { listing } = booking;
  const startDate = new Date(booking.start_date);
  const endDate = new Date(booking.end_date);
  const daysLeft = differenceInDays(endDate, new Date());
  const isActive = daysLeft >= 0 && booking.status === "confirmed";

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return COLORS.warning;
      case "confirmed": return COLORS.success;
      case "cancelled": return COLORS.danger;
      default: return COLORS.greyMedium;
    }
  };

  const getPaymentColor = (status: string) => {
    switch (status) {
      case "pending": return COLORS.orange;
      case "completed": return COLORS.success;
      case "failed": return COLORS.danger;
      default: return COLORS.greyMedium;
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case "confirmed": return "checkmark-circle";
      case "pending": return "time";
      case "cancelled": return "close-circle";
      default: return "information-circle";
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.greyDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Booking Details</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.headerButton}>
          <Ionicons name="refresh" size={22} color={COLORS.greyDark} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {listing?.images?.length ? (
          <View style={styles.gallerySection}>
            <ScrollView 
              horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
                setActiveImageIndex(newIndex);
              }}
            >
              {listing.images.map((img, idx) => (
                <Image key={idx} source={{ uri: img }} style={styles.listingImage} />
              ))}
            </ScrollView>
            
            {listing.images.length > 1 && (
              <View style={styles.paginationDots}>
                {listing.images.map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.paginationDot,
                      idx === activeImageIndex && styles.paginationDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
            
            <View style={styles.imageCount}>
              <Ionicons name="images" size={14} color={COLORS.white} />
              <Text style={styles.imageCountText}>{listing.images.length}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.noImageContainer}>
            <Ionicons name="image-outline" size={48} color={COLORS.greyLight} />
            <Text style={styles.noImageText}>No images available</Text>
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.titleSection}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{listing?.title ?? "Unknown Property"}</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
                <Ionicons name={getStatusIcon(booking.status)} size={12} color={COLORS.white} />
                <Text style={styles.statusBadgeText}>{booking.status}</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>
              {listing?.address ? `${listing.address}, ` : ""}{listing?.city}
            </Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="calendar-outline" size={20} color={COLORS.gold} />
              <Text style={styles.statValue}>{daysLeft >= 0 ? daysLeft : 0}</Text>
              <Text style={styles.statLabel}>Days Left</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="cash-outline" size={20} color={COLORS.gold} />
              <Text style={styles.statValue}>{Number(booking.amount).toLocaleString()}</Text>
              <Text style={styles.statLabel}>Amount (XAF)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="bed-outline" size={20} color={COLORS.gold} />
              <Text style={styles.statValue}>{listing.rooms ?? "—"}</Text>
              <Text style={styles.statLabel}>Rooms</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.gold} />
              <Text style={styles.cardTitle}>Booking Information</Text>
            </View>
            
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="calendar" size={16} color={COLORS.gold} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Check-in</Text>
                <Text style={styles.infoValue}>{format(startDate, "EEEE, MMMM dd, yyyy")}</Text>
                <Text style={styles.infoSubvalue}>{format(startDate, "h:mm a")}</Text>
              </View>
            </View>

            <View style={styles.infoDivider}>
              <Ionicons name="arrow-down" size={16} color={COLORS.greyMedium} />
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="calendar" size={16} color={COLORS.gold} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Check-out</Text>
                <Text style={styles.infoValue}>{format(endDate, "EEEE, MMMM dd, yyyy")}</Text>
                <Text style={styles.infoSubvalue}>{format(endDate, "h:mm a")}</Text>
              </View>
            </View>

            {booking.status === "confirmed" && (
              <>
                <View style={styles.divider} />
                <View style={styles.paymentRow}>
                  <View style={styles.paymentItem}>
                    <Text style={styles.paymentLabel}>Payment Status</Text>
                    <View style={[styles.paymentBadge, { backgroundColor: getPaymentColor(booking.payment_status) }]}>
                      <Text style={styles.paymentBadgeText}>{booking.payment_status}</Text>
                    </View>
                  </View>
                  <View style={styles.paymentItem}>
                    <Text style={styles.paymentLabel}>Agreed to Terms</Text>
                    <Ionicons 
                      name={booking.agreed_to_terms ? "checkmark-circle" : "close-circle"} 
                      size={24} 
                      color={booking.agreed_to_terms ? COLORS.success : COLORS.danger} 
                    />
                  </View>
                </View>
              </>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="home-outline" size={20} color={COLORS.gold} />
              <Text style={styles.cardTitle}>Property Details</Text>
            </View>
            
            {listing.description && (
              <Text style={styles.description}>{listing.description}</Text>
            )}

            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Ionicons name="resize-outline" size={16} color={COLORS.gold} />
                <Text style={styles.detailLabel}>Size</Text>
                <Text style={styles.detailValue}>Not specified</Text>
              </View>
              <View style={styles.detailItem}>
                <Ionicons name="water-outline" size={16} color={COLORS.gold} />
                <Text style={styles.detailLabel}>Utilities</Text>
                <Text style={styles.detailValue}>Included</Text>
              </View>
              <View style={styles.detailItem}>
                <Ionicons name="car-outline" size={16} color={COLORS.gold} />
                <Text style={styles.detailLabel}>Parking</Text>
                <Text style={styles.detailValue}>Available</Text>
              </View>
            </View>
          </View>

          {listing.terms_text && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="document-text-outline" size={20} color={COLORS.gold} />
                <Text style={styles.cardTitle}>Terms & Conditions</Text>
              </View>
              <View style={styles.termsBox}>
                <Text style={styles.termsText}>{listing.terms_text}</Text>
              </View>
            </View>
          )}

          {booking.status === "confirmed" && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="options-outline" size={20} color={COLORS.gold} />
                <Text style={styles.cardTitle}>Actions</Text>
              </View>

              {isActive && (
                <TouchableOpacity 
                  style={styles.cancelButton}
                  onPress={handleCancelBooking}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle-outline" size={20} color={COLORS.white} />
                  <Text style={styles.cancelButtonText}>Cancel Booking</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => navigation.navigate("ListingReview", { listing_id: listing.id })}
                activeOpacity={0.7}
              >
                <Ionicons name="star-outline" size={20} color={COLORS.gold} />
                <Text style={styles.actionButtonText}>Rate this property</Text>
                <Ionicons name="chevron-forward" size={18} color={COLORS.greyMedium} style={styles.actionArrow} />
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => Alert.alert("Report", "This feature will be available soon")}
                activeOpacity={0.7}
              >
                <Ionicons name="flag-outline" size={20} color={COLORS.gold} />
                <Text style={styles.actionButtonText}>Report an issue</Text>
                <Ionicons name="chevron-forward" size={18} color={COLORS.greyMedium} style={styles.actionArrow} />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.helpSection}>
            <Text style={styles.helpTitle}>Need help with this booking?</Text>
            <View style={styles.helpButtons}>
              <TouchableOpacity onPress={() => handleContactSupport('call')} style={styles.helpButton}>
                <Ionicons name="call-outline" size={18} color={COLORS.gold} />
                <Text style={styles.helpButtonText}>Call Support</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleContactSupport('email')} style={styles.helpButton}>
                <Ionicons name="mail-outline" size={18} color={COLORS.gold} />
                <Text style={styles.helpButtonText}>Email Support</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Sticky Pay Button ── */}
      {booking.approval_status === 'approved' && booking.payment_status === 'pending' && (
        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            <Text style={styles.footerLabel}>Total Amount</Text>
            <Text style={styles.footerAmount}>
              FCFA {Number(booking.total_amount ?? booking.amount).toLocaleString()}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.payButton} 
            onPress={handlePayNow}
            activeOpacity={0.8}
          >
            <Ionicons name="card-outline" size={20} color={COLORS.white} />
            <Text style={styles.payButtonText}>Proceed to Payment</Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.greyMedium,
  },
  errorIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.goldLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.greyDark,
    marginBottom: 8,
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: COLORS.greyMedium,
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  errorActions: {
    flexDirection: "row",
    gap: 12,
  },
  scrollContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.gold,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "600",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  backButtonText: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.offWhite,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.greyDark,
  },
  gallerySection: {
    position: "relative",
    height: 220,
  },
  listingImage: {
    width,
    height: 220,
    resizeMode: "cover",
  },
  paginationDots: {
    flexDirection: "row",
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.white,
    opacity: 0.5,
  },
  paginationDotActive: {
    width: 20,
    backgroundColor: COLORS.gold,
    opacity: 1,
  },
  imageCount: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  imageCountText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "600",
  },
  noImageContainer: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.greyLight,
  },
  noImageText: {
    marginTop: 12,
    color: COLORS.greyMedium,
    fontSize: 16,
  },
  footer: {
    padding: 20,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 20,
  },
  footerInfo: {
    flex: 1,
  },
  footerLabel: {
    fontSize: 12,
    color: COLORS.greyMedium,
  },
  footerAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.gold,
  },
  payButton: {
    backgroundColor: COLORS.gold,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  payButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
  },
  content: {
    padding: 20,
  },
  titleSection: {
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.greyDark,
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  statusBadgeText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.greyMedium,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.offWhite,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.greyDark,
    marginTop: 8,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.greyMedium,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.greyDark,
  },
  infoRow: {
    flexDirection: "row",
    gap: 12,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.goldLight,
    justifyContent: "center",
    alignItems: "center",
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    color: COLORS.greyMedium,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.greyDark,
    marginBottom: 2,
  },
  infoSubvalue: {
    fontSize: 13,
    color: COLORS.greyMedium,
  },
  infoDivider: {
    alignItems: "center",
    paddingVertical: 8,
    marginLeft: 16,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentItem: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  paymentLabel: {
    fontSize: 13,
    color: COLORS.greyMedium,
  },
  paymentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  paymentBadgeText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.greyMedium,
    marginBottom: 16,
  },
  detailsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: COLORS.offWhite,
    borderRadius: 16,
    padding: 16,
  },
  detailItem: {
    alignItems: "center",
    gap: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.greyMedium,
    marginTop: 4,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.greyDark,
  },
  termsBox: {
    backgroundColor: COLORS.offWhite,
    borderRadius: 12,
    padding: 16,
  },
  termsText: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.greyMedium,
  },
  cancelButton: {
    backgroundColor: COLORS.danger,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  cancelButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "600",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.offWhite,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: COLORS.greyDark,
    marginLeft: 12,
  },
  actionArrow: {
    opacity: 0.5,
  },
  helpSection: {
    marginTop: 8,
    marginBottom: 20,
    padding: 20,
    backgroundColor: COLORS.offWhite,
    borderRadius: 20,
    alignItems: "center",
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.greyDark,
    marginBottom: 16,
  },
  helpButtons: {
    flexDirection: "row",
    gap: 12,
  },
  helpButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.white,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  helpButtonText: {
    fontSize: 14,
    color: COLORS.greyDark,
  },
});