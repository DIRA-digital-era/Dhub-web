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
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MapView from 'react-native-maps';
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

import { useTranslation } from 'react-i18next';

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

import { useTheme } from '../../context/ThemeContext';

const ListingDetailsScreen: React.FC = () => {
  const { t } = useTranslation();
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const listingId = route.params.listingId;

  const { colors, isDark } = useTheme();
  const COLORS = React.useMemo(() => ({
    gold: colors.primary,
    goldLight: isDark ? '#3d300e' : '#F5E7C8',
    goldDark: colors.primary,
    white: colors.background,
    offWhite: colors.card,
    greyDark: colors.text,
    greyMedium: colors.textSecondary,
    greyLight: isDark ? '#333' : '#ECF0F1',
    border: colors.border,
    shadow: '#000000',
  }), [colors, isDark]);

  const styles = React.useMemo(() => getStyles(COLORS), [COLORS]);

  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const [isFavorite, setIsFavorite] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [fullscreenMedia, setFullscreenMedia] = useState<MediaItem | null>(null);
  const [hasPaidBooking, setHasPaidBooking] = useState(false);
  const [existingBookingId, setExistingBookingId] = useState<string | null>(null);

  const flatListRef = React.useRef<FlatList>(null);

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

      // Check for paid booking map unlock & existing booking
      if (userId && listingId) {
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('id, status, payment_status')
          .eq('listing_id', listingId)
          .eq('student_id', userId)
          .not('status', 'eq', 'cancelled')
          .not('status', 'eq', 'completed')
          .order('created_at', { ascending: false })
          .limit(1);

        if (mounted && bookingData && bookingData.length > 0) {
          if (bookingData[0].payment_status === 'completed') {
            setHasPaidBooking(true);
          }
          setExistingBookingId(bookingData[0].id);
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
      Alert.alert(t('common.error'), 'Please sign in to save favorites.');
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
      Alert.alert(t('common.error'), 'Failed to update favorites. Please try again.');
    }
  };

  /* ─── Actions ─── */
  const handleBooking = async () => {
    if (!userId) {
      Alert.alert(t('common.error'), 'Please sign in to book.');
      return;
    }

    // Check Profile Gate
    const { data: studentData } = await supabase
      .from('student_profiles')
      .select('age, profession, contact_number')
      .eq('user_id', userId)
      .single();

    if (!studentData || !studentData.age || !studentData.profession || !studentData.contact_number) {
      if (Platform.OS === 'web') {
        const wantsToUpdate = window.confirm("Profile Verification Required\n\nLandlords require your age, profession/level, and Momo number before accepting bookings.\n\nClick OK to Update Profile.");
        if (wantsToUpdate) {
          navigation.navigate('StudentTabs', { screen: 'Profile' });
        }
      } else {
        Alert.alert(
          "Profile Verification Required",
          "Landlords require your age, profession/level, and Momo number before accepting bookings.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Update Profile", onPress: () => navigation.navigate('StudentTabs', { screen: 'Profile' }) }
          ]
        );
      }
      return;
    }

    navigation.navigate('BookingScreen', {
      listingId,
    });
  };











  const handleShare = async () => {
    // Web: share the edge function URL so WhatsApp/Telegram bots crawl
    //      proper OG meta tags and show a rich preview card.
    // Mobile (native): share the dhub:// deep link so the app opens
    //      directly if installed; bots don't matter here as users tap
    //      from their phone where the app is already present.
    const shareUrl = Platform.OS === 'web'
      ? `https://lpdszzdmhzrowtppngjb.supabase.co/functions/v1/listing-og?id=${listingId}`
      : `dhub://listing/${listingId}`;
    const location = listing?.city || listing?.city || '';
    const messageText = location
      ? `Check out this listing for ${listing?.title} at ${location} on DHUB\n${shareUrl}`
      : `Check out this listing for ${listing?.title} on DHUB\n${shareUrl}`;
    try {
      await Share.share({
        message: messageText,
        url: shareUrl,
        title: listing?.title,
      });
    } catch (error: any) {
      console.log('Error sharing:', error.message);
    }
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
      Alert.alert(t('common.error'), 'Could not initiate chat. Please try again later.');
    }
  };

  const handleCall = () => {
    // Lock communications to DHUB to avoid bypassing
    Linking.openURL(`tel:+237682366472`);
  };

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveImageIndex(viewableItems[0].index);
    }
  }, []);








  /* ─── Media helpers ─── */
  const images = listing?.media.filter(m => m.type === 'image') ?? [];
  const videos = listing?.media.filter(m => m.type === 'video') ?? [];
  const allMedia = [...images, ...videos];

  const handleNextImage = () => {
    if (activeImageIndex < allMedia.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeImageIndex + 1, animated: true });
    }
  };

  const handlePrevImage = () => {
    if (activeImageIndex > 0) {
      flatListRef.current?.scrollToIndex({ index: activeImageIndex - 1, animated: true });
    }
  };

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
                <Text style={styles.processingText}>{t('common.loading')}</Text>
              </View>
            ) : item.processing_status === 'failed' ? (
              <View style={styles.processingOverlay}>
                <Ionicons name="close-circle-outline" size={32} color={COLORS.white} />
                <Text style={styles.processingText}>{t('common.error')}</Text>
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
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
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
          <Text style={styles.errorText}>{t('common.error')}</Text>
          <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
            <Text style={styles.errorButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const hasCoords = listing.latitude != null && listing.longitude != null;
  const coords: LatLng | null = hasCoords
    ? { latitude: listing.latitude!, longitude: listing.longitude! }
    : null;

  const isBoosted = listing.boost_until && new Date(listing.boost_until) > new Date();
  const canViewFullMap = hasCoords && (hasPaidBooking || isBoosted);

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

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>{listing.title}</Text>
          {listing.is_verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.white} />
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={handleShare} style={styles.headerBtn}>
            <Ionicons name="share-outline" size={24} color={COLORS.greyDark} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleFavorite} style={styles.headerBtn}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={24}
              color={isFavorite ? COLORS.gold : COLORS.greyDark}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* MEDIA GALLERY */}
        {allMedia.length > 0 ? (
          <View style={styles.gallerySection}>
            <FlatList
              ref={flatListRef}
              data={allMedia}
              renderItem={renderMediaItem}
              keyExtractor={(item, idx) => `${item.url}-${idx}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
            />
            {/* Gallery Navigation Arrows */}
            {allMedia.length > 1 && (
              <>
                <TouchableOpacity style={styles.navArrowLeft} onPress={handlePrevImage} disabled={activeImageIndex === 0}>
                  <Ionicons name="chevron-back" size={30} color={activeImageIndex === 0 ? 'rgba(255,255,255,0.3)' : COLORS.white} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.navArrowRight} onPress={handleNextImage} disabled={activeImageIndex === allMedia.length - 1}>
                  <Ionicons name="chevron-forward" size={30} color={activeImageIndex === allMedia.length - 1 ? 'rgba(255,255,255,0.3)' : COLORS.white} />
                </TouchableOpacity>
              </>
            )}
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
            <Text style={styles.noMediaText}>{t('listing.no_media')}</Text>
          </View>
        )}

        {/* CONTENT */}
        <View style={styles.content}>

          {/* Title & Price */}
          <View style={styles.titleSection}>
            <View style={styles.titleRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                <Text style={[styles.title, { flexShrink: 1 }]} numberOfLines={2}>{listing.title}</Text>
                {listing.is_verified && (
                  <View style={[styles.verifiedBadge, { marginLeft: 8, width: 24, height: 24, borderRadius: 12 }]}>
                    <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
                  </View>
                )}
              </View>
              <View style={[
                styles.availabilityBadge,
                listing.available ? styles.availableBadge : styles.unavailableBadge,
              ]}>
                <Text style={styles.availabilityText}>
                  {listing.available ? t('listing.available') : t('listing.rented')}
                </Text>
              </View>
            </View>
            <Text style={styles.price}>
              {t('listing.fcfa')} {listing.price.toLocaleString()}
              <Text style={styles.perMonth}> {t('listing.per_month')}</Text>
            </Text>
          </View>

          {/* QUICK ACTIONS */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickActionBtn} onPress={handleChat}>
              <Ionicons name="chatbubble-outline" size={20} color={COLORS.gold} />
              <Text style={styles.quickActionText}>{t('listing.message')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionBtn} onPress={handleCall}>
              <Ionicons name="call-outline" size={20} color={COLORS.gold} />
              <Text style={styles.quickActionText}>{t('listing.call')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionBtn} onPress={toggleFavorite}>
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={20}
                color={COLORS.gold}
              />
              <Text style={styles.quickActionText}>
                {isFavorite ? t('listing.saved') : t('listing.save')}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Premium Fat Share Button */}
          <TouchableOpacity
            style={[styles.quickActionBtn, {
              width: '100%',
              marginTop: -12,
              marginBottom: 24,
              backgroundColor: COLORS.gold,
              borderColor: COLORS.gold,
              paddingVertical: 14,
              shadowColor: COLORS.gold,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 6
            }]}
            onPress={handleShare}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-redo" size={24} color={COLORS.white} />
            <Text style={[styles.quickActionText, { color: COLORS.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 }]}>Share this listing</Text>
          </TouchableOpacity>

          {/* Description */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.gold} />
              <Text style={styles.sectionTitle}>{t('listing.description')}</Text>
            </View>
            <Text style={styles.description}>
              {listing.description || t('listing.no_description')}
            </Text>
          </View>

          {/* Key Details */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle-outline" size={20} color={COLORS.gold} />
              <Text style={styles.sectionTitle}>{t('listing.key_details')}</Text>
            </View>
            <View style={styles.detailsGrid}>
              <View style={styles.detailCard}>
                <Ionicons name="location-outline" size={24} color={COLORS.gold} />
                <Text style={styles.detailCardLabel}>{t('listing.city')}</Text>
                <Text style={styles.detailCardValue}>{listing.city || 'N/A'}</Text>
              </View>
              <View style={styles.detailCard}>
                <Ionicons name="bed-outline" size={24} color={COLORS.gold} />
                <Text style={styles.detailCardLabel}>{t('listing.rooms')}</Text>
                <Text style={styles.detailCardValue}>{listing.rooms || '—'}</Text>
              </View>
              <View style={styles.detailCard}>
                <Ionicons
                  name={listing.available ? 'checkmark-circle' : 'close-circle'}
                  size={24}
                  color={listing.available ? COLORS.gold : COLORS.greyMedium}
                />
                <Text style={styles.detailCardLabel}>{t('listing.status')}</Text>
                <Text style={styles.detailCardValue}>
                  {listing.available ? t('listing.available') : t('listing.rented')}
                </Text>
              </View>
            </View>
          </View>

          {/* Location Map */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="map-outline" size={20} color={COLORS.gold} />
              <Text style={styles.sectionTitle}>{t('listing.location')}</Text>
            </View>
            <TouchableOpacity
              style={styles.mapContainer}
              onPress={() => {
                if (canViewFullMap) {
                  setMapVisible(true);
                } else {
                  Alert.alert(
                    t('listing.location_locked'),
                    t('listing.location_locked_msg'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('listing.book_now'), onPress: handleBooking }
                    ]
                  );
                }
              }}
              activeOpacity={0.9}
            >
              {hasCoords ? (
                <View style={styles.mapPlaceholder}>
                  <MapView
                    style={StyleSheet.absoluteFillObject}
                    region={{ latitude: coords!.latitude, longitude: coords!.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    pitchEnabled={false}
                    rotateEnabled={false}
                    showsUserLocation={false}
                    showsMyLocationButton={false}
                    showsCompass={false}
                  />
                  <View style={styles.processingOverlay}>
                    <Ionicons name="expand-outline" size={32} color={COLORS.white} />
                    <Text style={styles.processingText}>{t('listing.click_fullscreen')}</Text>
                  </View>
                </View>
              ) : (
                <View style={[styles.mapPlaceholder, styles.lockedMap]}>
                  <Ionicons name="map-outline" size={32} color={COLORS.greyMedium} />
                  <Text style={styles.lockedMapText}>{t('listing.no_location')}</Text>
                  <Text style={styles.lockedMapSubtext}>{t('listing.no_coords_msg')}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Landlord Info */}
          {listing.landlord && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="person-outline" size={20} color={COLORS.gold} />
                <Text style={styles.sectionTitle}>{t('listing.landlord')}</Text>
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
                  <Text style={styles.landlordResponse}>{t('listing.responds_within')}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Reviews */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="star-outline" size={20} color={COLORS.gold} />
              <Text style={styles.sectionTitle}>{t('listing.reviews')}</Text>
            </View>
            <RatingsList ratings={listing.ratings} />
            <ListingReviews listingId={listing.id} />
          </View>

          <View style={styles.bottomPadding} />
        </View>
      </ScrollView>

      {/* Book Button */}
      <View style={styles.bookContainer}>
        {existingBookingId ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={[styles.bookButton, { flex: 1, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border }]}
              onPress={() => navigation.navigate('BookingDetails', { bookingId: existingBookingId })}
            >
              <Ionicons name="eye-outline" size={20} color={COLORS.greyDark} />
              <Text style={[styles.bookButtonText, { color: COLORS.greyDark, fontSize: 15 }]}>View Booking</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.bookButton} onPress={handleBooking}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.white} />
            <Text style={styles.bookButtonText}>{t('listing.book_now')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Map Modal */}
      {canViewFullMap && (
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

const getStyles = (COLORS: any) => StyleSheet.create({
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
  headerTitleContainer: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 12, gap: 4
  },
  headerTitle: {
    fontSize: 18, fontWeight: '600', color: COLORS.greyDark, textAlign: 'center', flexShrink: 1
  },
  verifiedBadge: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.white,
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
  navArrowLeft: {
    position: 'absolute',
    left: 10,
    top: '45%',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navArrowRight: {
    position: 'absolute',
    right: 10,
    top: '45%',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomPadding: { height: 20 },
  shareCtaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.goldLight,
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  shareCtaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  shareCtaTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.greyDark,
  },
  shareCtaSubtitle: {
    fontSize: 12,
    color: COLORS.greyMedium,
    marginTop: 2,
  },
});

export default ListingDetailsScreen;
