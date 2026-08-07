// src/screens/student/BookingDetails.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { differenceInDays, format } from "date-fns";
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView from 'react-native-maps';
import MapPickerModal from '../../components/MapPickerModal';
import { SafeAreaView } from "react-native-safe-area-context";
import FullVideoPlayer from "../../components/FullVideoPlayer";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../hooks/useAuth";
import { triggerPushNotifications } from '../../hooks/usePushNotifications';
import { LocationService } from '../../services/LocationService';
import { StudentStackParamList } from "../../types";
import { supabase } from '../../utils/supabaseClient';
import { uploadListingMedia } from '../../utils/upload';

const { width } = Dimensions.get("window");

type BookingDetailsNavProp = NativeStackNavigationProp<StudentStackParamList, "BookingDetails">;
type BookingDetailsRouteProp = RouteProp<StudentStackParamList, "BookingDetails">;

type MediaItem = {
  url: string;
  type: 'image' | 'video';
  thumbUrl?: string;
  processing_status?: string;
};

type ListingType = {
  id: string;
  title: string;
  address: string | null;
  city: string;
  price: string;
  description: string | null;
  rooms: number | null;
  media: MediaItem[] | null;
  terms_text: string | null;
  latitude?: number | null;
  longitude?: number | null;
  landlord?: {
    id: string;
    full_name: string;
    phone: string;
  };
  listing_type?: string | null;
};

type BookingFull = {
  id: string;
  listing_id: string;
  landlord_id: string;
  student_id: string;
  amount: string;
  start_date: string;
  end_date: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  approval_status: "pending" | "approved" | "rejected";
  payment_status: "pending" | "completed" | "failed";
  agreed_to_terms: boolean;
  tenant_confirmation: boolean;
  landlord_confirmation: boolean;
  duration_type?: string;
  total_amount?: number;
  created_at: string;
  updated_at: string;
  caution_fee?: number;
  caution_status?: 'held' | 'refunded' | 'disputed' | 'claimed' | 'refund_pending' | 'forfeited_bypass' | 'refund_queued' | 'refund_paused';
  rent_payment_status?: string;
  contract_status?: 'active' | 'grace' | 'expired' | 'renewed' | 'terminated';
  is_renewal_active?: boolean;
  listing: ListingType;
  entry_media?: MediaItem[] | null;
  exit_media?: MediaItem[] | null;
};

const STORAGE_KEY_PREFIX = "@booking_";
const CACHE_DURATION = 5 * 60 * 1000; // Reduced to 5 minutes

export default function BookingDetails() {
  const { t } = useTranslation();
  const navigation = useNavigation<BookingDetailsNavProp>();
  const route = useRoute<BookingDetailsRouteProp>();
  const { bookingId } = route.params;
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const COLORS = useMemo(() => ({
    gold: themeColors.primary,
    goldLight: isDark ? '#2D2510' : '#F5E7C8',
    goldDark: themeColors.primary,
    white: themeColors.card,
    offWhite: isDark ? '#1A1A1A' : '#F8F9FA',
    greyDark: themeColors.text,
    greyMedium: themeColors.textSecondary,
    greyLight: isDark ? '#2A2A2A' : '#ECF0F1',
    border: themeColors.border,
    shadow: '#000000',
    success: themeColors.success,
    warning: '#FFD700',
    danger: themeColors.error,
    orange: '#FFA500',
    purple: '#9B59B6',
    background: themeColors.background,
  }), [themeColors, isDark]);
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [booking, setBooking] = useState<BookingFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [fullscreenMedia, setFullscreenMedia] = useState<MediaItem | null>(null);

  // Caution Refund Flow States
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState<string | null>(null);
  const [cancellationDetails, setCancellationDetails] = useState('');
  const [updating, setUpdating] = useState(false);
  const [showWhyModal, setShowWhyModal] = useState(false);
  const [mapModalVisible, setMapModalVisible] = useState(false);

  // Dispute States
  const [disputeText, setDisputeText] = useState('');
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);

  const handleUploadMedia = async (type: 'entry' | 'exit' | 'dispute') => {
    try {
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!cameraPermission.granted || !libraryPermission.granted) {
        Alert.alert('Permission Needed', 'Enable camera and media permissions to take and save pictures.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingMedia(true);
        const asset = result.assets[0];

        const ext = 'webp';
        const fileName = `bookings/${bookingId}/${type}_${Date.now()}.${ext}`;

        const uploadedMedia = await uploadListingMedia(
          asset.uri,
          fileName,
          'image',
          bookingId,
          undefined,
          asset.mimeType || 'image/jpeg'
        );

        const currentMediaArray = ((booking as any)[type === 'dispute' ? 'dispute_tenant_photos' : `${type}_media`] as any[]) || [];

        // Ensure max 3 photos for disputes
        if (type === 'dispute' && currentMediaArray.length >= 3) {
          Alert.alert('Limit Reached', 'You can only upload up to 3 photos for evidence.');
          setUploadingMedia(false);
          return;
        }

        const newMediaObj = { url: uploadedMedia.url, timestamp: new Date().toISOString() };
        const updatedArray = [...currentMediaArray, newMediaObj];

        const { error: dbError } = await supabase
          .from('bookings')
          .update({ [type === 'dispute' ? 'dispute_tenant_photos' : `${type}_media`]: updatedArray } as any)
          .eq('id', bookingId);

        if (dbError) throw dbError;

        setBooking((prev: any) => ({ ...prev, [type === 'dispute' ? 'dispute_tenant_photos' : `${type}_media`]: updatedArray }));

        Alert.alert('Success', `${type === 'entry' ? 'Entry' : (type === 'exit' ? 'Exit' : 'Evidence')} picture captured successfully.`);
        fetchBookingDetails(true);
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', 'Failed to capture media: ' + (err.message || ''));
    } finally {
      setUploadingMedia(false);
    }
  };

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

      const MEDIA_BASE_URL = 'https://listings.frunjimbong.workers.dev';
      const rawMedia = data.listings?.media;
      const mediaItems: MediaItem[] = Array.isArray(rawMedia)
        ? rawMedia
          .filter((m: any) => m?.url && m?.type)
          .map((m: any) => ({
            url: m.url.startsWith('/media/') ? `${MEDIA_BASE_URL}${m.url}` : m.url,
            type: m.type,
            thumbUrl: m.thumbUrl && m.thumbUrl.startsWith('/media/')
              ? `${MEDIA_BASE_URL}${m.thumbUrl}`
              : m.thumbUrl,
            processing_status: m.processing_status || 'ready',
          }))
        : [];

      const bookingData: BookingFull = {
        ...data,
        listing: data.listings ? {
          id: data.listings.id,
          title: data.listings.title || "Unknown Property",
          address: data.listings.address || null,
          city: data.listings.city || "",
          price: data.listings.price || data.amount,
          description: data.listings.description || null,
          rooms: data.listings.rooms || null,
          media: mediaItems,
          terms_text: data.listings.terms_text || null,
          latitude: data.listings.latitude || null,
          longitude: data.listings.longitude || null,
          landlord: data.listings.landlord,
          listing_type: data.listings.listing_type || null,
        } : {
          id: data.listing_id,
          title: "Unknown Property",
          address: null,
          city: "",
          price: data.amount,
          description: null,
          rooms: null,
          media: null,
          terms_text: null,
          latitude: null,
          longitude: null,
          listing_type: null,
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
            Alert.alert(t('bookings.offline_mode'), t('bookings.offline_msg'));
          }
        } catch {
          // Silent fail
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId, user?.id, t]);

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

  // Time remaining calculation
  let rentTimeRemaining = '';
  if (booking?.status === 'confirmed' && (booking as any).student_confirmation && (booking as any).landlord_confirmation) {
    const msLeft = new Date(booking.end_date).getTime() - Date.now();
    if (msLeft > 0) {
      const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
      if (daysLeft >= 30) {
        rentTimeRemaining = `${Math.floor(daysLeft / 30)} Months left`;
      } else {
        rentTimeRemaining = `${daysLeft} Days left`;
      }
    } else {
      rentTimeRemaining = 'Expired';
    }
  }

  const handlePayNow = () => {
    if (!booking) return;

    if (Platform.OS === 'web') {
      navigation.navigate('DownloadAppScreen' as never);
      return;
    }

    navigation.navigate('Payments', {
      listingId: booking.listing_id,
      bookingId: booking.id,
      amount: Number(booking.total_amount ?? booking.amount),
      description: `Booking payment for ${booking.listing?.title || "Property"}`,
      receiverPhone: booking.listing?.landlord?.phone || "",
      receiverName: booking.listing?.landlord?.full_name || "",
      landlordId: booking.landlord_id,
                  paymentType: 'initial',
      listingType: booking.listing?.listing_type || 'Apartment',
    });
  };

  const handleCompleteRent = () => {
    if (!booking) return;

    if (Platform.OS === 'web') {
      navigation.navigate('DownloadAppScreen' as never);
      return;
    }
    const caution = booking.caution_fee ?? 0;
    const rentBalance = Number(booking.total_amount ?? booking.amount) - caution;

    navigation.navigate('Payments', {
      listingId: booking.listing_id,
      bookingId: booking.id,
      amount: rentBalance,
      description: `Rent Completion Payment for ${booking.listing?.title || "Property"}`,
      receiverPhone: booking.listing?.landlord?.phone || "",
      receiverName: booking.listing?.landlord?.full_name || "",
      landlordId: booking.landlord_id,
      paymentType: 'rent_completion',
      listingType: booking.listing?.listing_type || 'Apartment',
    } as any);
  };

  // ── Renewal (Extend Lease) handler ──────────────────────────────────────
  const RENEWAL_PROCESSING_FEE = 5000;
  const handleRenewLease = () => {
    if (!booking) return;
    Alert.alert(
      '🔄 Renew Your Lease',
      `Tap "Proceed" to pay the XAF ${RENEWAL_PROCESSING_FEE.toLocaleString()} Rent Processing Fee. Once confirmed, your lease end date will be extended.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Proceed to Payment',
          onPress: () => {
            if (Platform.OS === 'web') {
              navigation.navigate('DownloadAppScreen' as never);
              return;
            }
            navigation.navigate('Payments', {
              listingId: booking.listing_id,
              bookingId: booking.id,
              amount: RENEWAL_PROCESSING_FEE,
              description: `Rent Processing Fee — Renewal for ${booking.listing?.title || 'Property'}`,
              receiverPhone: booking.listing?.landlord?.phone || '',
              receiverName: booking.listing?.landlord?.full_name || '',
              landlordId: booking.landlord_id,
              paymentType: 'renewal',
              isRenewal: true,
              listingType: booking.listing?.listing_type || 'Apartment',
            } as any);
          },
        },
      ]
    );
  };

  // ── Confirm Checkout handler ─────────────────────────────────────────────
  const handleConfirmCheckout = () => {
    Alert.alert(
      '🚪 Confirm Move-Out',
      'Are you sure you have vacated the property? The landlord will be notified to complete the handshake and release your caution.',
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: 'Yes, I Have Moved Out',
          style: 'destructive',
          onPress: async () => {
            setUpdating(true);
            try {
              const { error } = await supabase.rpc('request_checkout', {
                p_booking_id: bookingId
              });
              if (error) throw error;
              Alert.alert('Move-Out Requested', 'The landlord has been notified. Your caution refund is pending their confirmation.');
              fetchBookingDetails(true);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to submit move-out.');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleContactSupport = (type: 'call' | 'email') => {
    if (type === 'call') {
      Linking.openURL("tel:+237682366472");
    } else {
      Linking.openURL("mailto:info@diracmr.com");
    }
  };

  const handleSubmitDisputeEvidence = async () => {
    if (!disputeText.trim()) {
      Alert.alert('Missing Info', 'Please provide a description of the issue.');
      return;
    }
    
    setIsSubmittingDispute(true);
    try {
      const { error } = await supabase.from('bookings').update({
        dispute_tenant_text: disputeText
      }).eq('id', bookingId);
      
      if (error) throw error;
      
      Alert.alert('Evidence Submitted', 'Your evidence has been submitted to DHUB for review.');
      fetchBookingDetails(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit evidence.');
    } finally {
      setIsSubmittingDispute(false);
    }
  };

  const confirmMoveIn = () => {
    Alert.alert(
      "Confirm Move-In",
      "Are you sure you have moved into the property? This confirms the start of your tenancy.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, I'm In",
          onPress: async () => {
            setUpdating(true);
            try {
              const { error } = await supabase.rpc('confirm_handshake_side', {
                p_booking_id: bookingId,
                p_role: 'student'
              });
              if (error) throw error;
              
              // Optimistically update UI so the button vanishes instantly
              setBooking((prev: any) => prev ? { ...prev, student_confirmation: true } : prev);
              
              fetchBookingDetails();
              Alert.alert('Confirmed', 'Enjoy your stay!');
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to confirm move in.');
            } finally {
              setUpdating(false);
            }
          }
        }
      ]
    );
  };

  const handleCancelBooking = () => {
    Alert.alert(
      t('bookings.cancel_booking'),
      "Are you sure you want to cancel this booking? This action cannot be undone.",
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('bookings.cancel_booking'),
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc('cancel_booking', {
              p_booking_id: bookingId,
              p_reason: 'User cancelled before payment'
            });
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              Alert.alert(t('common.success'), "Booking cancelled successfully");
              triggerPushNotifications();
              fetchBookingDetails(true);
            }
          }
        }
      ]
    );
  };

  const handleCancelAndRefund = async () => {
    if (!cancellationReason) {
      Alert.alert('Reason Required', 'Please select a reason for cancellation.');
      return;
    }

    setLoading(true);
    const refundScheduledAt = new Date();
    refundScheduledAt.setHours(refundScheduledAt.getHours() + 72);

    const { error } = await supabase.rpc('cancel_booking', {
      p_booking_id: bookingId,
      p_reason: cancellationReason + (cancellationDetails ? ` - ${cancellationDetails}` : '')
    });

    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setShowSurveyModal(false);
      Alert.alert('Cancellation Submitted', 'Your cancellation has been received. Geo-Auditing will begin immediately.');
      triggerPushNotifications();
      fetchBookingDetails(true);

      // Start Geo-Audit for 72 hours
      await LocationService.startGeoAudit();
    }
  };

  const handleConfirmMoveIn = () => {
    Alert.alert(
      "Confirm Move-In",
      "Are you sure you have moved into the property? This will trigger the release of your caution fee from Escrow to the Landlord.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setLoading(true);
            const { error } = await supabase.rpc('confirm_handshake_side', {
              p_booking_id: bookingId,
              p_role: 'student'
            });

            setLoading(false);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              Alert.alert('Success', 'You have confirmed your move-in.');
              triggerPushNotifications();
              fetchBookingDetails(true);
            }
          }
        }
      ]
    );
  };

  if (loading && !booking) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.white} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !booking) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.white} />
        <View style={styles.center}>
          <View style={styles.errorIconContainer}>
            <Ionicons name="alert-circle-outline" size={64} color={COLORS.danger} />
          </View>
          <Text style={styles.errorTitle}>{t('bookings.unable_to_load')}</Text>
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorActions}>
            <TouchableOpacity onPress={handleRefresh} style={styles.retryButton}>
              <Ionicons name="refresh" size={20} color={COLORS.white} />
              <Text style={styles.retryButtonText}>{t('bookings.try_again')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color={COLORS.gold} />
              <Text style={styles.backButtonText}>{t('common.back')}</Text>
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
    switch (status) {
      case "confirmed": return "checkmark-circle";
      case "pending": return "time";
      case "cancelled": return "close-circle";
      default: return "information-circle";
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.white} />

      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.greyDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('bookings.details_title')}</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.headerButton}>
          <Ionicons name="refresh" size={22} color={COLORS.greyDark} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {listing?.media?.length ? (
          <View style={styles.gallerySection}>
            <ScrollView
              horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
                setActiveImageIndex(newIndex);
              }}
            >
              {listing.media.map((item, idx) => {
                const hasRealThumb =
                  item.type === 'video' &&
                  item.thumbUrl &&
                  item.thumbUrl !== item.url &&
                  !item.thumbUrl.endsWith('.mp4');

                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setFullscreenMedia(item)}
                    activeOpacity={0.9}
                  >
                    {item.type === 'image' ? (
                      <Image source={{ uri: item.url }} style={styles.listingImage} />
                    ) : (
                      <View style={styles.videoContainer}>
                        {hasRealThumb ? (
                          <Image source={{ uri: item.thumbUrl }} style={styles.listingImage} />
                        ) : (
                          <View style={[styles.listingImage, styles.videoFallback]}>
                            <Ionicons name="film-outline" size={36} color={COLORS.greyMedium} />
                            <Text style={styles.videoFallbackText}>{t('listing.video')}</Text>
                          </View>
                        )}
                        <View style={styles.playButton}>
                          <Ionicons name="play-circle" size={48} color={COLORS.white} />
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {listing.media.length > 1 && (
              <View style={styles.paginationDots}>
                {listing.media.map((_, idx) => (
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
              <Text style={styles.imageCountText}>{listing.media.length}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.noImageContainer}>
            <Ionicons name="image-outline" size={48} color={COLORS.greyLight} />
            <Text style={styles.noImageText}>{t('listing.no_media')}</Text>
          </View>
        )}

        <View style={styles.content}>

          {/* ── Temporal Watchdog Action Banner ─────────────────────────── */}
          {booking.status === 'confirmed' && (() => {
            const endDate = new Date(booking.end_date);
            const daysToEnd = Math.ceil((endDate.getTime() - Date.now()) / 86400_000);
            const isGrace = booking.contract_status === 'grace' || (daysToEnd < 0 && daysToEnd >= -14);
            const showBanner = daysToEnd <= 30;

            if (!showBanner) return null;

            const bannerBg = isGrace ? '#C0392B' : COLORS.gold;
            const bannerText = isGrace ? '#FFFFFF' : '#1A1000';
            const daysOver = Math.abs(daysToEnd);

            const title = isGrace
              ? `🔴 Lease Expired ${daysOver} Day${daysOver !== 1 ? 's' : ''} Ago`
              : `📅 Lease Ends in ${daysToEnd} Day${daysToEnd !== 1 ? 's' : ''}`;

            const subtitle = isGrace
              ? t('bookings.renew_grace_subtitle', { days: 14 - daysOver })
              : t('bookings.renew_lease_subtitle');

            const canExtend = !booking.is_renewal_active && booking.contract_status !== 'terminated';

            return (
              <View style={[
                {
                  backgroundColor: bannerBg,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  shadowColor: '#000',
                  shadowOpacity: 0.15,
                  shadowRadius: 6,
                  elevation: 4,
                }
              ]}>
                <Text style={{ color: bannerText, fontWeight: '700', fontSize: 16, marginBottom: 4 }}>
                  {title}
                </Text>
                <Text style={{ color: bannerText, fontSize: 13, marginBottom: 14, opacity: 0.9 }}>
                  {subtitle}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {canExtend && (
                    <TouchableOpacity
                      onPress={handleRenewLease}
                      disabled={updating}
                      style={{
                        flex: 1, backgroundColor: isGrace ? '#FFFFFF' : '#1A1000',
                        borderRadius: 8, paddingVertical: 10, alignItems: 'center',
                        flexDirection: 'row', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <Ionicons name="refresh-circle" size={18} color={isGrace ? '#C0392B' : COLORS.gold} />
                      <Text style={{ color: isGrace ? '#C0392B' : COLORS.gold, fontWeight: '700', fontSize: 14 }}>{t('bookings.extend_stay')}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={handleConfirmCheckout}
                    disabled={updating}
                    style={{
                      flex: 1, backgroundColor: isGrace ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                      borderRadius: 8, paddingVertical: 10, alignItems: 'center',
                      flexDirection: 'row', justifyContent: 'center', gap: 6,
                      borderWidth: 1, borderColor: bannerText,
                    }}
                  >
                    <Ionicons name="exit-outline" size={18} color={bannerText} />
                    <Text style={{ color: bannerText, fontWeight: '600', fontSize: 14 }}>{t('bookings.confirm_checkout')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}

          <View style={styles.titleSection}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{listing?.title ?? t('bookings.unknown_property')}</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
                <Ionicons name={getStatusIcon(booking.status)} size={12} color={COLORS.white} />
                <Text style={styles.statusBadgeText}>{t(`bookings.${booking.status}`)}</Text>
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
              <Text style={styles.statLabel}>{t('bookings.days_left_label')}</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="cash-outline" size={20} color={COLORS.gold} />
              <Text style={styles.statValue}>{Number(booking.amount).toLocaleString()}</Text>
              <Text style={styles.statLabel}>{t('bookings.amount_label')}</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="bed-outline" size={20} color={COLORS.gold} />
              <Text style={styles.statValue}>{listing.rooms ?? "—"}</Text>
              <Text style={styles.statLabel}>{t('bookings.rooms_label')}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.gold} />
              <Text style={styles.cardTitle}>{t('bookings.info_title')}</Text>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="calendar" size={16} color={COLORS.gold} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>{t('bookings.check_in')}</Text>
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
                <Text style={styles.infoLabel}>{t('bookings.check_out')}</Text>
                <Text style={styles.infoValue}>{format(endDate, "EEEE, MMMM dd, yyyy")}</Text>
                <Text style={styles.infoSubvalue}>{format(endDate, "h:mm a")}</Text>
              </View>
            </View>

            {booking.status === "confirmed" && (
              <>
                <View style={styles.divider} />
                <View style={styles.paymentRow}>
                  <View style={styles.paymentItem}>
                    <Text style={styles.paymentLabel}>{t('bookings.payment_status_label')}</Text>
                    <View style={[styles.paymentBadge, { backgroundColor: getPaymentColor(booking.payment_status) }]}>
                      <Text style={styles.paymentBadgeText}>{t(`bookings.${booking.payment_status === 'completed' ? 'paid' : booking.payment_status}`)}</Text>
                    </View>
                  </View>
                  <View style={styles.paymentItem}>
                    <Text style={styles.paymentLabel}>{t('bookings.agreed_to_terms')}</Text>
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
              <Text style={styles.cardTitle}>{t('bookings.property_details')}</Text>
            </View>

            {listing.description && (
              <Text style={styles.description}>{listing.description}</Text>
            )}

            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Ionicons name="resize-outline" size={16} color={COLORS.gold} />
                <Text style={styles.detailLabel}>{t('bookings.size')}</Text>
                <Text style={styles.detailValue}>{t('bookings.not_specified')}</Text>
              </View>
              <View style={styles.detailItem}>
                <Ionicons name="water-outline" size={16} color={COLORS.gold} />
                <Text style={styles.detailLabel}>{t('bookings.utilities')}</Text>
                <Text style={styles.detailValue}>{t('bookings.included')}</Text>
              </View>
              <View style={styles.detailItem}>
                <Ionicons name="car-outline" size={16} color={COLORS.gold} />
                <Text style={styles.detailLabel}>{t('bookings.parking')}</Text>
                <Text style={styles.detailValue}>{t('bookings.available')}</Text>
              </View>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>{t('bookings.duration_label')}</Text>
              <Text style={styles.detailValue}>
                {booking.duration_type === 'daily'
                  ? t('bookings.days_count', { count: Math.ceil((new Date(booking.end_date).getTime() - new Date(booking.start_date).getTime()) / (1000 * 60 * 60 * 24)) })
                  : booking.duration_type === 'yearly'
                    ? t('bookings.one_year')
                    : booking.duration_type === 'monthly'
                      ? t('bookings.monthly')
                      : t('bookings.unknown')}
              </Text>
            </View>
            {rentTimeRemaining ? (
              <View style={[styles.detailItem, { backgroundColor: COLORS.gold + '15', padding: 8, borderRadius: 8, marginTop: 10 }]}>
                <Text style={[styles.detailLabel, { color: COLORS.gold }]}>{t('bookings.time_remaining_label')}</Text>
                <Text style={[styles.detailValue, { color: COLORS.gold, fontWeight: 'bold' }]}>{rentTimeRemaining}</Text>
              </View>
            ) : (
              booking.status === 'confirmed' && (
                <View style={[styles.detailItem, { backgroundColor: COLORS.gold + '15', padding: 8, borderRadius: 8, marginTop: 10 }]}>
                  <Text style={[styles.detailLabel, { color: COLORS.gold }]}>{t('bookings.status_label')}</Text>
                  <Text style={[styles.detailValue, { color: COLORS.gold, fontWeight: 'bold' }]}>{t('bookings.pending_move_in')}</Text>
                </View>
              )
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.gold} />
              <Text style={styles.cardTitle}>{t('bookings.property_details')}</Text>
            </View>
            <View style={styles.termsBox}>
              <Text style={styles.termsText}>
                {listing.terms_text && listing.terms_text.trim()
                  ? listing.terms_text
                  : t('booking.default_terms_template')}
              </Text>
            </View>
          </View>

          {/* Location & Landlord (Revealed only if paid) */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="map-outline" size={20} color={COLORS.gold} />
              <Text style={styles.cardTitle}>{t('bookings.location_and_landlord')}</Text>
            </View>

            {booking.payment_status === 'completed' ? (
              <>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    if (listing.latitude && listing.longitude) {
                      setMapModalVisible(true);
                    }
                  }}
                >
                  <View style={styles.mapContainer}>
                    {listing.latitude && listing.longitude ? (
                      <MapView
                        style={StyleSheet.absoluteFillObject}
                        region={{ latitude: listing.latitude, longitude: listing.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
                        scrollEnabled={false}
                        zoomEnabled={false}
                        pitchEnabled={false}
                        rotateEnabled={false}
                      />
                    ) : (
                      <View style={[styles.center, { backgroundColor: COLORS.greyLight }]}>
                        <Ionicons name="map-outline" size={32} color={COLORS.greyMedium} />
                        <Text style={{ color: COLORS.greyMedium, marginTop: 8 }}>{t('bookings.location_not_available')}</Text>
                      </View>
                    )}
                    {listing.latitude && listing.longitude && (
                      <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="open-outline" size={12} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 11 }}>{t('bookings.tap_to_open_maps')}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>

                {listing.landlord && (
                  <View style={styles.landlordCard}>
                    <View style={styles.landlordAvatar}>
                      <Text style={styles.landlordInitials}>
                        {listing.landlord.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'L'}
                      </Text>
                    </View>
                    <View style={styles.landlordInfo}>
                      <Text style={styles.landlordName}>{listing.landlord.full_name}</Text>
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${listing.landlord?.phone}`)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Ionicons name="call" size={14} color={COLORS.gold} />
                        <Text style={{ color: COLORS.gold, marginLeft: 6 }}>{listing.landlord.phone}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.lockedContainer}>
                <Ionicons name="lock-closed" size={32} color={COLORS.greyMedium} />
                <Text style={styles.lockedTitle}>Information Locked</Text>
                <Text style={styles.lockedText}>
                  Complete your booking to reveal the exact coordinates and landlord contact details.
                </Text>
              </View>
            )}
          </View>

          {/* Dispute Resolution Card */}
          {booking.caution_status === 'disputed' && (
            <View style={[styles.card, { borderColor: COLORS.danger, borderWidth: 1 }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="warning-outline" size={20} color={COLORS.danger} />
                <Text style={[styles.cardTitle, { color: COLORS.danger }]}>{t('bookings.dispute_resolution')}</Text>
              </View>
              <Text style={{ fontSize: 13, color: COLORS.greyDark, marginBottom: 12 }}>
                {t('bookings.dispute_resolution_desc')}
              </Text>
              
              {(booking as any).dispute_tenant_text ? (
                <View style={{ backgroundColor: COLORS.greyLight, padding: 12, borderRadius: 8 }}>
                  <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>{t('bookings.your_evidence_submitted')}</Text>
                  <Text style={{ color: COLORS.greyDark }}>{(booking as any).dispute_tenant_text}</Text>
                  
                  {((booking as any).dispute_tenant_photos?.length > 0) && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>{t('bookings.photos_count', { count: ((booking as any).dispute_tenant_photos).length })}</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {((booking as any).dispute_tenant_photos).map((p: any, i: number) => (
                          <Image key={i} source={{ uri: p.url }} style={{ width: 60, height: 60, borderRadius: 4 }} />
                        ))}
                      </View>
                    </View>
                  )}
                  
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                    <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                    <Text style={{ color: COLORS.success, marginLeft: 4, fontWeight: '600' }}>Under Review by DHUB</Text>
                  </View>
                </View>
              ) : (
                <View>
                  <TextInput
                    style={{
                      borderWidth: 1, borderColor: COLORS.greyMedium, borderRadius: 8, padding: 12,
                      height: 100, textAlignVertical: 'top', backgroundColor: COLORS.white, marginBottom: 12
                    }}
                    placeholder="Explain what happened..."
                    value={disputeText}
                    onChangeText={setDisputeText}
                    multiline
                  />
                  
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    {((booking as any).dispute_tenant_photos || []).map((p: any, i: number) => (
                      <Image key={i} source={{ uri: p.url }} style={{ width: 60, height: 60, borderRadius: 4 }} />
                    ))}
                    {((booking as any).dispute_tenant_photos || []).length < 3 && (
                      <TouchableOpacity
                        style={{
                          width: 60, height: 60, borderRadius: 4, borderWidth: 1, borderColor: COLORS.gold,
                          borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center'
                        }}
                        onPress={() => handleUploadMedia('dispute')}
                        disabled={uploadingMedia}
                      >
                        {uploadingMedia ? <ActivityIndicator size="small" color={COLORS.gold} /> : <Ionicons name="camera-outline" size={24} color={COLORS.gold} />}
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  <TouchableOpacity
                    style={[styles.payButton, { width: '100%' }]}
                    onPress={handleSubmitDisputeEvidence}
                    disabled={isSubmittingDispute}
                  >
                    {isSubmittingDispute ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.payButtonText}>Submit Evidence</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {(booking.status === "confirmed" || booking.status === "pending" || booking.status === "completed") && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="options-outline" size={20} color={COLORS.gold} />
                <Text style={styles.cardTitle}>{t('bookings.actions')}</Text>
              </View>

              {isActive && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancelBooking}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle-outline" size={20} color={COLORS.white} />
                  <Text style={styles.cancelButtonText}>{t('bookings.cancel_booking')}</Text>
                </TouchableOpacity>
              )}

              {booking.payment_status === 'completed' && booking.rent_payment_status === 'completed' && !booking.tenant_confirmation && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: COLORS.success, borderColor: COLORS.success }]}
                  onPress={handleConfirmMoveIn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="checkmark-done-circle-outline" size={20} color={COLORS.white} />
                  <Text style={[styles.actionButtonText, { color: COLORS.white }]}>Confirm I Have Moved In</Text>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.white} style={styles.actionArrow} />
                </TouchableOpacity>
              )}

              {booking.tenant_confirmation && (
                <View style={[styles.actionButton, { backgroundColor: COLORS.offWhite }]}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <Text style={[styles.actionButtonText, { color: COLORS.greyDark }]}>Move-In Confirmed by You</Text>
                </View>
              )}

              {/* Entry Picture: only visible for pending or confirmed bookings */}
              {(booking.status === 'pending' || booking.status === 'confirmed') && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleUploadMedia('entry')}
                  activeOpacity={0.7}
                  disabled={uploadingMedia}
                >
                  {uploadingMedia ? <ActivityIndicator size="small" color={COLORS.gold} /> : <Ionicons name="camera-outline" size={20} color={COLORS.gold} />}
                  <Text style={styles.actionButtonText}>Take Entry Picture</Text>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.greyMedium} style={styles.actionArrow} />
                </TouchableOpacity>
              )}
              {booking.entry_media && booking.entry_media.length > 0 && (
                <View style={[styles.actionButton, { backgroundColor: COLORS.offWhite }]}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <Text style={[styles.actionButtonText, { color: COLORS.greyDark }]}>✓ Entry Picture Captured</Text>
                </View>
              )}

              {/* Exit Picture: only visible for completed/expired bookings AND no exit photo yet */}
              {(booking.status === 'completed' || (booking.status === 'confirmed' && daysLeft < 0)) && !(booking.exit_media && booking.exit_media.length > 0) && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleUploadMedia('exit')}
                  activeOpacity={0.7}
                  disabled={uploadingMedia}
                >
                  {uploadingMedia ? <ActivityIndicator size="small" color={COLORS.gold} /> : <Ionicons name="camera-outline" size={20} color={COLORS.gold} />}
                  <Text style={styles.actionButtonText}>Take Exit Picture</Text>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.greyMedium} style={styles.actionArrow} />
                </TouchableOpacity>
              )}
              {booking.exit_media && booking.exit_media.length > 0 && (
                <View style={[styles.actionButton, { backgroundColor: COLORS.offWhite }]}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <Text style={[styles.actionButtonText, { color: COLORS.greyDark }]}>✓ Exit Picture Captured</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate("ListingReview", { listing_id: listing.id })}
                activeOpacity={0.7}
              >
                <Ionicons name="star-outline" size={20} color={COLORS.gold} />
                <Text style={styles.actionButtonText}>{t('bookings.rate_property')}</Text>
                <Ionicons name="chevron-forward" size={18} color={COLORS.greyMedium} style={styles.actionArrow} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => Alert.alert("Report", "This feature will be available soon")}
                activeOpacity={0.7}
              >
                <Ionicons name="flag-outline" size={20} color={COLORS.gold} />
                <Text style={styles.actionButtonText}>{t('bookings.report_issue')}</Text>
                <Ionicons name="chevron-forward" size={18} color={COLORS.greyMedium} style={styles.actionArrow} />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.helpSection}>
            <Text style={styles.helpTitle}>{t('bookings.help_title')}</Text>
            <View style={styles.helpButtons}>
              <TouchableOpacity onPress={() => handleContactSupport('call')} style={styles.helpButton}>
                <Ionicons name="call-outline" size={18} color={COLORS.gold} />
                <Text style={styles.helpButtonText}>{t('bookings.call_support')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleContactSupport('email')} style={styles.helpButton}>
                <Ionicons name="mail-outline" size={18} color={COLORS.gold} />
                <Text style={styles.helpButtonText}>{t('bookings.email_support')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Waiting for Landlord Approval Banner ── */}
      {(!booking.approval_status || booking.approval_status === 'pending') && (
        <View style={[styles.footer, { flexDirection: 'column', alignItems: 'center', backgroundColor: COLORS.goldLight }]}>
          <Ionicons name="hourglass-outline" size={24} color={COLORS.goldDark} style={{ marginBottom: 4 }} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.goldDark, textAlign: 'center' }}>Awaiting Landlord Approval</Text>
          <Text style={{ fontSize: 13, color: COLORS.goldDark, textAlign: 'center', marginTop: 4 }}>
            The landlord must review and accept your booking request before you can proceed to payment. Please check back later. We will notify you when the landlord approves your booking.
          </Text>
        </View>
      )}

      {/* ── Sticky Pay Button (Initial or Rent Completion) ── */}
      {booking.approval_status === 'approved' && booking.payment_status === 'pending' && (
        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            <Text style={styles.footerLabel}>{t('bookings.initial_deposit_label')}</Text>
            <Text style={styles.footerAmount}>
              FCFA {((booking.caution_fee ?? 0) + 5000).toLocaleString()}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.payButton}
            onPress={handlePayNow}
            activeOpacity={0.8}
          >
            <Ionicons name="card-outline" size={20} color={COLORS.white} />
            <Text style={styles.payButtonText}>{t('bookings.pay_now')}</Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.whyLink}
            onPress={() => setShowWhyModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="information-circle-outline" size={15} color={COLORS.gold} />
            <Text style={styles.whyLinkText}>{t('bookings.why_am_i_paying')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Post-Payment Choice: Complete Rent vs Cancel */}
      {booking.payment_status === 'completed' && booking.status === 'confirmed' && !(booking as any).student_confirmation && (
        <View style={[styles.footer, { flexDirection: 'column', gap: 12, borderTopWidth: 1, borderColor: '#eee' }]}>
          <TouchableOpacity
            style={[styles.payButton, { width: '100%', backgroundColor: '#27AE60' }]}
            onPress={confirmMoveIn}
          >
            <Text style={styles.payButtonText}>{t('bookings.i_have_moved_in')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {booking.payment_status === 'completed' && booking.status === 'confirmed' && (booking as any).rent_payment_status !== 'completed' && !['refund_pending', 'refund_queued', 'refund_paused', 'disputed'].includes(booking.caution_status as string) && (
        <View style={[styles.footer, { flexDirection: 'column', gap: 12 }]}>
          <TouchableOpacity
            style={[styles.payButton, { width: '100%' }]}
            onPress={handleCompleteRent}
            activeOpacity={0.8}
          >
            <Ionicons name="card-outline" size={20} color={COLORS.white} />
            <Text style={styles.payButtonText}>{t('bookings.complete_rent_payment')}</Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cancelButton, { width: '100%', marginBottom: 0, backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.danger }]}
            onPress={() => setShowSurveyModal(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.cancelButtonText, { color: COLORS.danger }]}>{t('bookings.cancel_booking_refund_caution')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Refund Processing Banner (72 hrs) */}
      {booking.caution_status === 'refund_queued' && (
        <View style={[styles.footer, { flexDirection: 'column', alignItems: 'center', backgroundColor: COLORS.goldLight }]}>
          <Ionicons name="time-outline" size={24} color={COLORS.goldDark} style={{ marginBottom: 4 }} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.goldDark, textAlign: 'center' }}>{t('bookings.refund_processing')}</Text>
          <Text style={{ fontSize: 13, color: COLORS.goldDark, textAlign: 'center', marginTop: 4 }}>
            {t('bookings.refund_processing_desc')}
          </Text>
        </View>
      )}

      {/* Refund Paused Banner */}
      {booking.caution_status === 'refund_paused' && (
        <View style={[styles.footer, { flexDirection: 'column', alignItems: 'center', backgroundColor: '#FADBD8' }]}>
          <Ionicons name="alert-circle-outline" size={24} color="#C0392B" style={{ marginBottom: 4 }} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: "#C0392B", textAlign: 'center' }}>{t('bookings.refund_paused')}</Text>
          <Text style={{ fontSize: 13, color: "#C0392B", textAlign: 'center', marginTop: 4 }}>
            {t('bookings.refund_paused_desc')}
          </Text>
        </View>
      )}

      {/* Why Am I Paying Modal */}
      <Modal visible={showWhyModal} transparent animationType="fade" onRequestClose={() => setShowWhyModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDismissArea} onPress={() => setShowWhyModal(false)} />
          <View style={[styles.modalContent, { padding: 24, borderRadius: 20 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 }}>
              <Ionicons name="information-circle-outline" size={28} color={COLORS.gold} />
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.greyDark }}>{t('bookings.why_payment_title')}</Text>
            </View>
            <Text style={{ fontSize: 15, color: COLORS.greyDark, marginBottom: 16, lineHeight: 22 }}>
              <Text style={{ fontWeight: 'bold', color: COLORS.greyDark }}>{t('bookings.why_payment_caution')}</Text>{t('bookings.why_payment_caution_desc')}
            </Text>
            <Text style={{ fontSize: 15, color: COLORS.greyDark, marginBottom: 16, lineHeight: 22 }}>
              <Text style={{ fontWeight: 'bold', color: COLORS.greyDark }}>{t('bookings.why_payment_fee')}</Text>{t('bookings.why_payment_fee_desc')}
            </Text>
            <Text style={{ fontSize: 15, color: COLORS.greyDark, marginBottom: 16, lineHeight: 22 }}>
              <Text style={{ fontWeight: 'bold', color: COLORS.greyDark }}>{t('bookings.why_payment_unlocks')}</Text>{t('bookings.why_payment_unlocks_desc')}
            </Text>
            <Text style={{ fontSize: 15, color: COLORS.greyDark, marginBottom: 24, lineHeight: 22 }}>
              <Text style={{ fontWeight: 'bold', color: COLORS.greyDark }}>{t('bookings.why_payment_refund')}</Text>{t('bookings.why_payment_refund_desc')}
            </Text>
            <TouchableOpacity
              style={[styles.payButton, { width: '100%', marginTop: 0 }]}
              onPress={() => setShowWhyModal(false)}
            >
              <Text style={styles.payButtonText}>{t('bookings.i_understand')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Media Modal */}
      <Modal
        visible={fullscreenMedia !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullscreenMedia(null)}
      >
        {fullscreenMedia?.type === 'video' ? (
          <FullVideoPlayer
            url={fullscreenMedia.url}
            onClose={() => setFullscreenMedia(null)}
            processingStatus={fullscreenMedia.processing_status as 'processing' | 'ready' | 'failed' | undefined}
          />
        ) : (
          <View style={styles.fullscreenModal}>
            <TouchableOpacity
              style={styles.fullscreenClose}
              onPress={() => setFullscreenMedia(null)}
            >
              <Ionicons name="close" size={30} color={COLORS.white} />
            </TouchableOpacity>
            <Image
              source={{ uri: fullscreenMedia?.url }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          </View>
        )}
      </Modal>

      {/* Survey Modal */}
      <Modal
        visible={showSurveyModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSurveyModal(false)}
      >
        <View style={styles.fullscreenModal}>
          <View style={{ width: '90%', backgroundColor: COLORS.white, borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.greyDark, marginBottom: 16 }}>Cancellation Reason</Text>

            {[
              "The house doesn't look like the pictures.",
              "Basic things are missing (e.g., no water, no electricity).",
              "The landlord is asking for more money.",
              "The area feels unsafe.",
              "Other"
            ].map(reason => (
              <TouchableOpacity
                key={reason}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
                onPress={() => setCancellationReason(reason)}
              >
                <Ionicons name={cancellationReason === reason ? "radio-button-on" : "radio-button-off"} size={24} color={cancellationReason === reason ? COLORS.gold : COLORS.greyMedium} />
                <Text style={{ marginLeft: 12, fontSize: 15, color: COLORS.greyDark, flex: 1 }}>{reason}</Text>
              </TouchableOpacity>
            ))}

            {cancellationReason === "Other" && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 13, color: COLORS.greyMedium, marginBottom: 4 }}>Please specify:</Text>
                <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12 }}>
                  <Text style={{ color: COLORS.greyDark }}>{cancellationDetails || "Tap here to type..."}</Text>
                </View>
              </View>
            )}

            <View style={{ flexDirection: 'row', marginTop: 24, gap: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}
                onPress={() => setShowSurveyModal(false)}
              >
                <Text style={{ color: COLORS.greyDark, fontWeight: '600' }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.danger }}
                onPress={handleCancelAndRefund}
              >
                <Text style={{ color: COLORS.white, fontWeight: '600' }}>Submit & Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <MapPickerModal
        visible={mapModalVisible}
        onClose={() => setMapModalVisible(false)}
        onLocationSelected={() => {}}
        initialLocation={
          listing?.latitude && listing?.longitude
            ? { latitude: listing.latitude, longitude: listing.longitude }
            : undefined
        }
        readOnly
      />
    </SafeAreaView>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'column',
    alignItems: 'stretch',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 20,
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  footerLabel: {
    fontSize: 12,
    color: COLORS.greyMedium,
    flex: 1,
    marginRight: 8,
  },
  footerAmount: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.gold,
    flexShrink: 0,
  },
  payButton: {
    backgroundColor: COLORS.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
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
    fontWeight: '600',
  },
  whyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 2,
  },
  whyLinkText: {
    fontSize: 11,
    color: COLORS.gold,
    textDecorationLine: 'underline',
    fontWeight: '500',
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
  videoContainer: {
    width,
    height: 220,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoFallback: {
    backgroundColor: COLORS.offWhite,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoFallbackText: {
    color: COLORS.greyMedium,
    fontSize: 14,
    fontWeight: '600',
  },
  playButton: {
    position: 'absolute',
    alignSelf: 'center',
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenMedia: {
    width,
    height: '100%',
  },
  fullscreenModal: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  mapContainer: {
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: COLORS.offWhite,
  },
  landlordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.offWhite,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  landlordAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.goldLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  landlordInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.gold,
  },
  landlordInfo: {
    flex: 1,
  },
  landlordName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.greyDark,
  },
  lockedContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.offWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lockedTitle: {
    color: COLORS.greyDark,
    fontWeight: '600',
    marginTop: 12,
    fontSize: 16,
  },
  lockedText: {
    color: COLORS.greyMedium,
    textAlign: 'center',
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: '90%',
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 16,
  },
});