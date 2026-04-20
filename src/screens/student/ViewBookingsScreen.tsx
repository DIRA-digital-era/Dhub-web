import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { differenceInDays, format } from "date-fns";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from "../../hooks/useAuth";
import { supabase } from '../../utils/supabaseClient';
import { StudentStackParamList } from "../../types";

const { width } = Dimensions.get("window");

// Type your navigation properly
type ViewBookingsNavProp = NativeStackNavigationProp<
  StudentStackParamList,
  "ViewBookingsScreen"
>;

type BookingWithListing = {
  id: string;
  listing_id: string;
  listing_title: string;
  listing_address: string | null;
  amount: string;
  start_date: string;
  end_date: string;
  status: "pending" | "confirmed" | "cancelled";
  payment_status: "pending" | "completed" | "failed";
  created_at?: string;
};

const STORAGE_KEY = "student_bookings";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const COLORS = {
  gold: "#D4AF37",
  goldLight: "#F5E7C8",
  goldDark: "#B8860B",
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
  orange: "#FF4500",
  purple: "#9B59B6",
};

export default function ViewBookingsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<ViewBookingsNavProp>();
  
  const [bookings, setBookings] = useState<BookingWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  /** Proper navigation back without stacking */
  const handleGoBack = () => {
    // This ensures we don't stack screens
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback to profile tab if can't go back
      navigation.navigate("StudentTabs", { screen: "Profile" });
    }
  };

  /** Fetch from Supabase */
  const fetchBookingsFromServer = useCallback(async (showLoader = true) => {
    if (!user?.id) {
      setBookings([]);
      setLoading(false);
      return;
    }

    if (showLoader) setLoading(true);

    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          listing_id,
          amount,
          start_date,
          end_date,
          status,
          payment_status,
          created_at,
          listings (
            title,
            address
          )
        `)
        .eq("student_id", user.id)
        .order("start_date", { ascending: false });

      if (error) throw error;

      const formatted = data.map((b: any) => ({
        id: b.id,
        listing_id: b.listing_id,
        listing_title: b.listings?.title || "Unknown Property",
        listing_address: b.listings?.address || null,
        amount: b.amount,
        start_date: b.start_date,
        end_date: b.end_date,
        status: b.status,
        payment_status: b.payment_status,
        created_at: b.created_at,
      }));

      // Cache with timestamp
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
        data: formatted,
        timestamp: Date.now()
      }));
      
      setBookings(formatted);
      setError(null);
      setLastFetchTime(Date.now());
    } catch (err: any) {
      console.warn("Server fetch failed:", err.message);
      setError("Unable to connect. Showing cached bookings.");
      await fetchBookingsFromCache();
    } finally {
      if (showLoader) setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  const fetchBookingsFromCache = async () => {
    try {
     const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        setBookings(data || []);
        
        // Check if cache is stale
        const isStale = Date.now() - timestamp > CACHE_DURATION;
        if (isStale) {
          // Silently refresh in background
          fetchBookingsFromServer(false);
        }
      } else {
        setBookings([]);
      }
    } catch (err) {
      console.error("Failed to load cached bookings", err);
      setBookings([]);
    }
  };

  // Load data when screen focuses
  useFocusEffect(
    useCallback(() => {
      fetchBookingsFromServer();
    }, [fetchBookingsFromServer])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookingsFromServer(false);
  };

  const getDaysLeftColor = (daysLeft: number) => {
    if (daysLeft <= 0) return COLORS.danger;
    if (daysLeft <= 3) return COLORS.orange;
    if (daysLeft <= 7) return COLORS.warning;
    return COLORS.success;
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case "confirmed": return "checkmark-circle";
      case "pending": return "time";
      case "cancelled": return "close-circle";
      default: return "information-circle";
    }
  };

  const renderBooking = ({ item, index }: { item: BookingWithListing; index: number }) => {
    const today = new Date();
    const endDate = new Date(item.end_date);
    const startDate = new Date(item.start_date);
    const daysLeft = differenceInDays(endDate, today);
    const isActive = daysLeft >= 0 && item.status === "confirmed";
    const isUpcoming = startDate > today && item.status === "confirmed";

    const statusColors: Record<string, string> = {
      pending: COLORS.warning,
      confirmed: COLORS.success,
      cancelled: COLORS.danger,
    };
    
    const paymentColors: Record<string, string> = {
      pending: COLORS.orange,
      completed: COLORS.success,
      failed: COLORS.danger,
    };

    return (
      <TouchableOpacity
        style={[styles.bookingCard, index === 0 && styles.firstCard]}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate("BookingDetails", { bookingId: item.id })
        }
      >
        {/* Status Indicator Line */}
        <View style={[styles.statusLine, { backgroundColor: statusColors[item.status] || COLORS.greyMedium }]} />
        
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.titleContainer}>
              <Text style={styles.listingTitle} numberOfLines={1}>
                {item.listing_title}
              </Text>
              {isActive && (
                <View style={styles.activeBadge}>
                  <Ionicons name="flash" size={12} color={COLORS.white} />
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              )}
              {isUpcoming && (
                <View style={styles.upcomingBadge}>
                  <Ionicons name="calendar" size={12} color={COLORS.white} />
                  <Text style={styles.upcomingBadgeText}>Upcoming</Text>
                </View>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.greyMedium} />
          </View>

          {item.listing_address && (
            <View style={styles.addressContainer}>
              <Ionicons name="location-outline" size={14} color={COLORS.greyMedium} />
              <Text style={styles.listingAddress} numberOfLines={1}>
                {item.listing_address}
              </Text>
            </View>
          )}

          <View style={styles.dateContainer}>
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>From</Text>
              <Text style={styles.dateValue}>
                {format(startDate, "MMM dd, yyyy")}
              </Text>
            </View>
            <View style={styles.dateDivider}>
              <Ionicons name="arrow-forward" size={14} color={COLORS.greyMedium} />
            </View>
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>To</Text>
              <Text style={styles.dateValue}>
                {format(endDate, "MMM dd, yyyy")}
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.badgeContainer}>
              <View style={[styles.badge, { backgroundColor: statusColors[item.status] }]}>
                <Ionicons name={getStatusIcon(item.status)} size={12} color={COLORS.white} />
                <Text style={styles.badgeText}>{item.status}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: paymentColors[item.payment_status] }]}>
                <Ionicons 
                  name={item.payment_status === "completed" ? "card" : "time"} 
                  size={12} 
                  color={COLORS.white} 
                />
                <Text style={styles.badgeText}>{item.payment_status}</Text>
              </View>
            </View>

            <View style={styles.priceContainer}>
              <Text style={styles.amount}>
                XAF {Number(item.amount).toLocaleString()}
              </Text>
              <Text style={[styles.daysLeft, { color: getDaysLeftColor(daysLeft) }]}>
                {daysLeft >= 0 ? `${daysLeft}d left` : "Ended"}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.greyDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Bookings</Text>
        <View style={styles.headerRight} />
      </View>
      
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{bookings.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {bookings.filter(b => b.status === "confirmed").length}
          </Text>
          <Text style={styles.statLabel}>Confirmed</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {bookings.filter(b => b.payment_status === "completed").length}
          </Text>
          <Text style={styles.statLabel}>Paid</Text>
        </View>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="calendar-outline" size={64} color={COLORS.gold} />
      </View>
      <Text style={styles.emptyTitle}>No Bookings Yet</Text>
      <Text style={styles.emptyText}>
        When you book a property, your bookings will appear here
      </Text>
      <TouchableOpacity
        style={styles.exploreButton}
        onPress={() => navigation.navigate("StudentTabs", { screen: "Home" })}
        activeOpacity={0.8}
      >
        <Text style={styles.exploreButtonText}>Explore Properties</Text>
        <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
      </TouchableOpacity>
    </View>
  );

  if (loading && bookings.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingText}>Loading your bookings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      
      {error && bookings.length > 0 && (
        <View style={styles.errorBanner}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.orange} />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={renderBooking}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={[COLORS.gold]}
            tintColor={COLORS.gold}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          bookings.length === 0 && styles.emptyListContent
        ]}
        ListHeaderComponent={bookings.length > 0 ? renderHeader : null}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
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
  header: {
    backgroundColor: COLORS.white,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 8,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.offWhite,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.greyDark,
    letterSpacing: 0.5,
  },
  headerRight: {
    width: 40,
  },
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.gold,
  },
  statLabel: {
    fontSize: 13,
    color: COLORS.greyMedium,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },
  listContent: {
    paddingBottom: 20,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  bookingCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    flexDirection: "row",
  },
  firstCard: {
    marginTop: 8,
  },
  statusLine: {
    width: 4,
    height: "100%",
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  titleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  listingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.greyDark,
    flex: 1,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  activeBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "700",
  },
  upcomingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.purple,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  upcomingBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "700",
  },
  addressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  listingAddress: {
    fontSize: 13,
    color: COLORS.greyMedium,
    flex: 1,
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.offWhite,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  dateItem: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 11,
    color: COLORS.greyMedium,
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.greyDark,
  },
  dateDivider: {
    paddingHorizontal: 8,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badgeContainer: {
    flexDirection: "row",
    gap: 6,
    flex: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  priceContainer: {
    alignItems: "flex-end",
  },
  amount: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.gold,
  },
  daysLeft: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.goldLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.greyDark,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.goldLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.greyDark,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.greyMedium,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  exploreButton: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  exploreButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});