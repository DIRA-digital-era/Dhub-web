// src/screens/student/ListingDetailsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import FullVideoPlayer from '../../components/FullVideoPlayer';
import ListingReviews from '../../components/ListingReviews';
import MapPickerModal from '../../components/MapPickerModal';
import RatingsList from '../../components/RatingsList';
import NetworkStatusBanner from '../../screens/common/NetworkStatusBanner';

import { useAuth } from '../../hooks/useAuth';
import { getOrCreateThread } from '../../services/chatService';
import FavoritesManager from '../../storage/favouritesManager';
import { fetchListingDetails } from '../../utils/listings';
import { supabase } from '../../utils/supabaseClient';

import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ListingDetails,
  MediaItem,
  StudentStackParamList,
} from '../../types';
import { LatLng } from '../../utils/location';

type RouteProps = RouteProp<StudentStackParamList, 'ListingDetails'>;
type NavProps = NativeStackNavigationProp<StudentStackParamList, 'ListingDetails'>;

const { width: screenWidth } = Dimensions.get('window');

const COLORS = {
  gold: '#c49c19',
  goldLight: '#F5E7C8',
  goldDark: '#ab7d09',
  white: '#FFFFFF',
  offWhite: '#F8F9FA',
  greyDark: '#2C3E50',
  greyMedium: '#7F8C8D',
  greyLight: '#ECF0F1',
  border: '#E9ECEF',
  shadow: '#000000',
};

const ListingDetailsScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const listingId = route.params.listingId;

  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const [isFavorite, setIsFavorite] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [fullscreenMedia, setFullscreenMedia] = useState<MediaItem | null>(null);
  const [hasPaidBooking, setHasPaidBooking] = useState(false);

  // Close fullscreen media when screen loses focus
  useFocusEffect(
    useCallback(() => {
      return () => setFullscreenMedia(null);
    }, [])
  );

  /* ─── Fetch ─── */
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const data = await fetchListingDetails(listingId);
      if (mounted) {
        setListing(data);
        setLoading(false);
      }

      // Check for paid booking map unlock
      if (userId && listingId) {
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('id')
          .eq('listing_id', listingId)
          .eq('student_id', userId)
          .eq('status', 'confirmed')
          .eq('payment_status', 'completed')
          .limit(1);

        if (mounted && bookingData && bookingData.length > 0) {
          setHasPaidBooking(true);
        }
      }
    };
    load();
    return () => { mounted = false; };
  }, [listingId, userId]);

  /* ─── Favorites ─── */
  useEffect(() => {
    if (!userId || !listingId) return;
    FavoritesManager.isFavorite(listingId, userId)
      .then(setIsFavorite)
      .catch(() => setIsFavorite(false));
  }, [userId, listingId]);

  // console.log("listing detailed data loaded");

  const toggleFavorite = async () => {
    if (!userId || !listing) {
      Alert.alert('Sign in required', 'Please sign in to save favorites.');
      return;
    }
    try {
      if (isFavorite) {
        await FavoritesManager.removeFavorite(listing.id, userId);
        setIsFavorite(false);
      } else {
        const favListing: any = {
          ...listing,
          image_url: listing.media?.[0]?.url || '',
          images: listing.media || []
        };
        await FavoritesManager.addFavorite(listing.id, userId, favListing);
        setIsFavorite(true);
      }
    } catch {
      Alert.alert('Error', 'Failed to update favorites. Please try again.');
    }
  };

  /* ─── Actions ─── */
  const handleBooking = () => {
    navigation.navigate('BookingScreen', {
      listingId,
      onPaymentSuccess: () => setPaymentDone(true),
    });
  };

  const handleChat = async () => {
    const otherUserId = listing?.landlord?.id ?? listing?.landlord_id;
    if (!otherUserId || !userId) return;
    try {
      const threadId = await getOrCreateThread(userId, otherUserId);
      navigation.navigate('StudentTabs', {
        screen: 'Chat',
        params: { threadId },
      });
    } catch (err) {
      Alert.alert('Error', 'Could not initiate chat. Please try again later.');
    }
  };

  const handleCall = () => {
    const phone = listing?.landlord?.phone;
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };


  const onViewableItemsChanged = ({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveImageIndex(viewableItems[0].index);
    }
  };

  /* ─── Media helpers ─── */
  const images = listing?.media.filter(m => m.type === 'image') ?? [];
  const videos = listing?.media.filter(m => m.type === 'video') ?? [];
  const allMedia = [...images, ...videos];

  const renderMediaItem = ({ item, index }: { item: MediaItem; index: number }) => {
    if (!listing) return null;
    // thumbUrl is a real image only when it differs from the video URL.
    // Old DB records have thumbUrl === url (both .mp4) — show a styled placeholder.
    const hasRealThumb =
      item.type === 'video' &&
      item.thumbUrl &&
      item.thumbUrl !== item.url &&
      !item.thumbUrl.endsWith('.mp4');

    return (
      <TouchableOpacity
        onPress={() => setFullscreenMedia(item)}
        activeOpacity={0.9}
        style={styles.mediaItemContainer}
      >
        {item.type === 'image' ? (
          <Image source={{ uri: item.url }} style={styles.mediaItem} />
        ) : (
          <View style={styles.videoContainer}>
            {hasRealThumb ? (
              <Image source={{ uri: item.thumbUrl }} style={styles.mediaItem} />
            ) : (
              <View style={[styles.mediaItem, styles.videoFallback]}>
                <Ionicons name="film-outline" size={36} color={COLORS.greyMedium} />
                <Text style={styles.videoFallbackText}>Video</Text>
              </View>
            )}
            
            {item.processing_status === 'processing' ? (
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="small" color={COLORS.white} />
                <Text style={styles.processingText}>Processing...</Text>
              </View>
            ) : item.processing_status === 'failed' ? (
              <View style={styles.processingOverlay}>
                <Ionicons name="close-circle-outline" size={32} color={COLORS.white} />
                <Text style={styles.processingText}>Failed</Text>
              </View>
            ) : (
              <View style={styles.playButton}>
                <Ionicons name="play-circle" size={48} color={COLORS.white} />
              </View>
            )}
          </View>
        )}
        <View style={styles.mediaCounter}>
          <Text style={styles.mediaCounterText}>{index + 1} / {allMedia.length}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  /* ─── Loading / error states ─── */
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <NetworkStatusBanner />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingText}>Loading property details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <NetworkStatusBanner />
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.greyMedium} />
          <Text style={styles.errorText}>Listing not found. Please check internet conenction and retry.</Text>
          <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const hasCoords = listing.latitude != null && listing.longitude != null;
  const coords: LatLng | null = hasCoords
    ? { latitude: listing.latitude!, longitude: listing.longitude! }
    : null;
  const canViewMap = hasCoords && hasPaidBooking;

  const landlordPhone = listing.landlord?.phone ?? null;

  /* ─── Render ─── */
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* Network status banner — slides in automatically on poor/no connection */}
      <NetworkStatusBanner />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.greyDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{listing.title}</Text>
        <TouchableOpacity onPress={toggleFavorite} style={styles.headerBtn}>
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={24}
            color={isFavorite ? COLORS.gold : COLORS.greyDark}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* MEDIA GALLERY */}
        {allMedia.length > 0 ? (
          <View style={styles.gallerySection}>
            <FlatList
              data={allMedia}
              renderItem={renderMediaItem}
              keyExtractor={(item, idx) => `${item.url}-${idx}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
            />
            {allMedia.length > 1 && (
              <View style={styles.paginationDots}>
                {allMedia.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.paginationDot,
                      index === activeImageIndex && styles.paginationDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noMediaContainer}>
            <Ionicons name="images-outline" size={48} color={COLORS.greyLight} />
            <Text style={styles.noMediaText}>No media available</Text>
          </View>
        )}

        {/* CONTENT */}
        <View style={styles.content}>

          {/* Title & Price */}
          <View style={styles.titleSection}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{listing.title}</Text>
              <View style={[
                styles.availabilityBadge,
                listing.available ? styles.availableBadge : styles.unavailableBadge,
              ]}>
                <Text style={styles.availabilityText}>
                  {listing.available ? 'Available' : 'Rented'}
                </Text>
              </View>
            </View>
            <Text style={styles.price}>
              FCFA {listing.price.toLocaleString()}
              <Text style={styles.perMonth}> /month</Text>
            </Text>
          </View>

          {/* QUICK ACTIONS */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickActionBtn} onPress={handleChat}>
              <Ionicons name="chatbubble-outline" size={20} color={COLORS.gold} />
              <Text style={styles.quickActionText}>Message</Text>
            </TouchableOpacity>

            {landlordPhone ? (
              <TouchableOpacity style={styles.quickActionBtn} onPress={handleCall}>
                <Ionicons name="call-outline" size={20} color={COLORS.gold} />
                <Text style={styles.quickActionText}>Call</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.quickActionBtn} onPress={toggleFavorite}>
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={20}
                color={COLORS.gold}
              />
              <Text style={styles.quickActionText}>
                {isFavorite ? 'Saved' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.gold} />
              <Text style={styles.sectionTitle}>Description</Text>
            </View>
            <Text style={styles.description}>
              {listing.description || 'No description provided for this property.'}
            </Text>
          </View>

          {/* Key Details */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle-outline" size={20} color={COLORS.gold} />
              <Text style={styles.sectionTitle}>Key Details</Text>
            </View>
            <View style={styles.detailsGrid}>
              <View style={styles.detailCard}>
                <Ionicons name="location-outline" size={24} color={COLORS.gold} />
                <Text style={styles.detailCardLabel}>City</Text>
                <Text style={styles.detailCardValue}>{listing.city || 'N/A'}</Text>
              </View>
              <View style={styles.detailCard}>
                <Ionicons name="bed-outline" size={24} color={COLORS.gold} />
                <Text style={styles.detailCardLabel}>Rooms</Text>
                <Text style={styles.detailCardValue}>{listing.rooms || '—'}</Text>
              </View>
              <View style={styles.detailCard}>
                <Ionicons
                  name={listing.available ? 'checkmark-circle' : 'close-circle'}
                  size={24}
                  color={listing.available ? COLORS.gold : COLORS.greyMedium}
                />
                <Text style={styles.detailCardLabel}>Status</Text>
                <Text style={styles.detailCardValue}>
                  {listing.available ? 'Available' : 'Rented'}
                </Text>
              </View>
            </View>
          </View>

          {/* Location Map */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="map-outline" size={20} color={COLORS.gold} />
              <Text style={styles.sectionTitle}>Location</Text>
            </View>
            <TouchableOpacity
              style={styles.mapContainer}
              onPress={() => {
                if (canViewMap) {
                  setMapVisible(true);
                } else {
                  Alert.alert(
                    'Location Locked',
                    'The map is only available after you have booked and paid for this property.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Book Now', onPress: handleBooking }
                    ]
                  );
                }
              }}
              activeOpacity={0.9}
            >
              {canViewMap ? (
                <>
                  <View style={styles.mapPlaceholder}>
                    <Ionicons name="map" size={48} color={COLORS.goldLight} />
                    <Text style={styles.mapPlaceholderText}>Tap to view on map</Text>
                  </View>
                  <View style={styles.mapOverlay}>
                    <Ionicons name="lock-open-outline" size={16} color={COLORS.white} />
                    <Text style={styles.mapOverlayText}>Location available</Text>
                  </View>
                </>
              ) : (
                <View style={[styles.mapPlaceholder, styles.lockedMap]}>
                  <Ionicons name="lock-closed-outline" size={32} color={COLORS.greyMedium} />
                  <Text style={styles.lockedMapText}>Location locked</Text>
                  <Text style={styles.lockedMapSubtext}>Book and complete payment to view</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Landlord Info */}
          {listing.landlord && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="person-outline" size={20} color={COLORS.gold} />
                <Text style={styles.sectionTitle}>Landlord</Text>
              </View>
              <View style={styles.landlordCard}>
                <View style={styles.landlordAvatar}>
                  {listing.landlord.profile_pic ? (
                    <Image
                      source={{ uri: listing.landlord.profile_pic }}
                      style={styles.landlordAvatarImage}
                    />
                  ) : (
                    <Text style={styles.landlordInitials}>
                      {listing.landlord.full_name
                        ?.split(' ')
                        .map(n => n[0])
                        .join('')
                        .toUpperCase() || 'L'}
                    </Text>
                  )}
                </View>
                <View style={styles.landlordInfo}>
                  <Text style={styles.landlordName}>{listing.landlord.full_name}</Text>
                  <Text style={styles.landlordResponse}>Usually responds within 1 hour</Text>
                </View>
              </View>
            </View>
          )}

          {/* Reviews */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="star-outline" size={20} color={COLORS.gold} />
              <Text style={styles.sectionTitle}>Reviews</Text>
            </View>
            <RatingsList ratings={listing.ratings} />
            <ListingReviews listingId={listing.id} />
          </View>

          <View style={styles.bottomPadding} />
        </View>
      </ScrollView>

      {/* Book Button */}
      <View style={styles.bookContainer}>
        <TouchableOpacity style={styles.bookButton} onPress={handleBooking}>
          <Ionicons name="calendar-outline" size={20} color={COLORS.white} />
          <Text style={styles.bookButtonText}>Book This Property</Text>
        </TouchableOpacity>
      </View>

      {/* Map Modal */}
      {canViewMap && (
        <MapPickerModal
          visible={mapVisible}
          readOnly
          disableInteraction
          initialLocation={coords || undefined}
          onClose={() => setMapVisible(false)}
          onLocationSelected={() => { }}
        />
      )}

      {/* Fullscreen Media Modal */}
      <Modal visible={!!fullscreenMedia} transparent animationType="fade">
        {fullscreenMedia?.type === 'video' ? (
          <FullVideoPlayer
            url={fullscreenMedia.url}
            processingStatus={fullscreenMedia.processing_status}
            onClose={() => setFullscreenMedia(null)}
          />
        ) : fullscreenMedia?.type === 'image' ? (
          <View style={styles.fullscreenContainer}>
            <TouchableOpacity
              style={styles.fullscreenClose}
              onPress={() => setFullscreenMedia(null)}
            >
              <Ionicons name="close" size={32} color={COLORS.white} />
            </TouchableOpacity>
            <Image
              source={{ uri: fullscreenMedia.url }}
              style={styles.fullscreenMedia}
              resizeMode="contain"
            />
          </View>
        ) : (
          <View />
        )}
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.white },
  centered: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.white, padding: 20,
  },
  loadingText: { marginTop: 12, fontSize: 16, color: COLORS.greyMedium },
  errorText: {
    fontSize: 18, fontWeight: '600', color: COLORS.greyDark,
    marginTop: 16, marginBottom: 24,
  },
  errorButton: {
    paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: COLORS.gold, borderRadius: 12,
  },
  errorButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  scrollContent: { paddingBottom: 100 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: {
    flex: 1, fontSize: 18, fontWeight: '600', color: COLORS.greyDark,
    textAlign: 'center', marginHorizontal: 12,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.offWhite, justifyContent: 'center', alignItems: 'center',
  },
  gallerySection: { position: 'relative' },
  mediaItemContainer: { position: 'relative', width: screenWidth, height: 300 },
  mediaItem: { width: screenWidth, height: 300, resizeMode: 'cover' },
  videoContainer: { position: 'relative' },
  videoFallback: { backgroundColor: COLORS.greyLight, justifyContent: 'center', alignItems: 'center', gap: 6 },
  videoFallbackText: { fontSize: 13, color: COLORS.greyMedium, fontWeight: '500' },
  playButton: {
    position: 'absolute', top: '50%', left: '50%',
    transform: [{ translateX: -24 }, { translateY: -24 }],
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 40,
  },
  mediaCounter: {
    position: 'absolute', bottom: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.gold,
  },
  mediaCounterText: { color: COLORS.white, fontSize: 12, fontWeight: '600' },
  paginationDots: {
    flexDirection: 'row', position: 'absolute', bottom: 16,
    left: 0, right: 0, justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  paginationDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.white, opacity: 0.5,
  },
  paginationDotActive: { width: 20, backgroundColor: COLORS.gold, opacity: 1 },
  noMediaContainer: {
    height: 200, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.greyLight,
  },
  noMediaText: { marginTop: 12, color: COLORS.greyMedium, fontSize: 16 },
  content: { padding: 20 },
  titleSection: { marginBottom: 16 },
  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  title: {
    fontSize: 26, fontWeight: '700', color: COLORS.greyDark,
    letterSpacing: 0.5, flex: 1, marginRight: 12,
  },
  availabilityBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  availableBadge: {
    backgroundColor: COLORS.goldLight, borderWidth: 1, borderColor: COLORS.gold,
  },
  unavailableBadge: {
    backgroundColor: COLORS.greyLight, borderWidth: 1, borderColor: COLORS.greyMedium,
  },
  availabilityText: { fontSize: 12, fontWeight: '600', color: COLORS.greyDark },
  price: { fontSize: 28, fontWeight: '700', color: COLORS.gold },
  perMonth: { fontSize: 16, fontWeight: '400', color: COLORS.greyMedium },
  quickActions: {
    flexDirection: 'row', gap: 12, marginBottom: 24,
    paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border,
  },
  quickActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.offWhite,
  },
  quickActionText: { fontSize: 13, fontWeight: '500', color: COLORS.greyDark },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: {
    fontSize: 18, fontWeight: '600', color: COLORS.greyDark, letterSpacing: 0.3,
  },
  description: {
    fontSize: 15, lineHeight: 22, color: COLORS.greyMedium,
    backgroundColor: COLORS.offWhite, padding: 16, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  detailsGrid: { flexDirection: 'row', gap: 12 },
  detailCard: {
    flex: 1, backgroundColor: COLORS.offWhite, borderRadius: 16, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  detailCardLabel: { fontSize: 13, color: COLORS.greyMedium, marginTop: 8, marginBottom: 4 },
  detailCardValue: { fontSize: 15, fontWeight: '600', color: COLORS.greyDark },
  mapContainer: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  mapPlaceholder: {
    height: 160, backgroundColor: COLORS.offWhite,
    justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  mapPlaceholderText: { fontSize: 14, color: COLORS.greyMedium, fontWeight: '500' },
  lockedMap: { backgroundColor: COLORS.greyLight },
  lockedMapText: { fontSize: 16, fontWeight: '600', color: COLORS.greyMedium, marginTop: 8 },
  lockedMapSubtext: { fontSize: 13, color: COLORS.greyMedium },
  mapOverlay: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(212, 175, 55, 0.9)',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  mapOverlayText: { fontSize: 12, fontWeight: '600', color: COLORS.white },
  landlordCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.offWhite,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  landlordAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.goldLight,
    justifyContent: 'center', alignItems: 'center', marginRight: 16,
  },
  landlordAvatarImage: { width: 56, height: 56, borderRadius: 28 },
  landlordInitials: { fontSize: 20, fontWeight: '700', color: COLORS.gold },
  landlordInfo: { flex: 1 },
  landlordName: { fontSize: 16, fontWeight: '600', color: COLORS.greyDark, marginBottom: 4 },
  landlordResponse: { fontSize: 13, color: COLORS.greyMedium },
  bookContainer: {
    backgroundColor: COLORS.white, paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 10,
  },
  bookButton: {
    backgroundColor: COLORS.gold, borderRadius: 16, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: COLORS.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  bookButtonText: { color: COLORS.white, fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
  fullscreenContainer: {
    flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center',
  },
  fullscreenClose: {
    position: 'absolute', top: 50, right: 20, zIndex: 10,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  fullscreenMedia: { width: screenWidth, height: '100%' },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  processingText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '600',
  },
  bottomPadding: { height: 20 },
});

export default ListingDetailsScreen;
