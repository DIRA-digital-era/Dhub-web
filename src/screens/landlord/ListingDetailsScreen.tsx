// src/screens/landlord/ListingDetailsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, RouteProp, useNavigation } from '@react-navigation/native';
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
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapPickerModal from '../../components/MapPickerModal';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { ListingDetails, MediaItem } from '../../types';
import { fetchListingDetails } from '../../utils/listings';
import { supabase } from '../../utils/supabaseClient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type LandlordStackParamList = {
  ListingDetails: { listingId: string };
  EditListing: { listingId: string };
  ManageListings: undefined;
  BoostScreen: { listingId: string };
};

type Props = {
  route: RouteProp<LandlordStackParamList, 'ListingDetails'>;
};

const ListingDetailsScreen: React.FC<Props> = ({ route }) => {
  const navigation = useNavigation<NavigationProp<LandlordStackParamList>>();
  const { listingId } = route.params;
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();

  const colors = React.useMemo(() => ({
    ...themeColors,
    errorBg: isDark ? '#2A1A1A' : '#ffebeb',
  }), [themeColors, isDark]);

  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [requestingVerif, setRequestingVerif] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);

  // ─── Verification Modal State ──────────────────────────────────────────────
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationFee, setVerificationFee] = useState<number>(5000);

  useEffect(() => {
    loadListing();
  }, [listingId]);

  const loadListing = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchListingDetails(listingId);
      if (!data) throw new Error('Listing not found');
      setListing(data);
    } catch (err: any) {
      console.error('Error fetching listing:', err);
      setError(err.message || 'Failed to fetch listing details');
    } finally {
      setLoading(false);
    }
  };

  const toggleAvailability = async (newValue: boolean) => {
    if (!listing) return;
    setListing({ ...listing, available: newValue });
    try {
      const { error } = await supabase
        .from('listings')
        .update({ available: newValue })
        .eq('id', listingId);
      if (error) throw error;
    } catch (err) {
      console.error('Error updating availability:', err);
      Alert.alert('Error', 'Failed to update availability.');
      setListing({ ...listing, available: !newValue });
    }
  };

const handleShare = async () => {
  try {
    const url = Platform.OS === 'web'
      ? `https://dhubweb.diracmr.com/listing/${listingId}`  // Branded web URL
      : `dhub://listing/${listingId}`;                      // Deep link for native

    await Share.share({
      message: `Check out this listing on DHUB! ${listing?.title} - ${listing?.city}\n${url}`,
      url: url,
      title: listing?.title,
    });
  } catch (error: any) {
    console.log('Error sharing:', error.message);
  }
};

  const handleEdit = () => navigation.navigate('EditListing', { listingId });

  const handleDelete = () => {
    Alert.alert(
      'Delete Property',
      'Are you sure you want to permanently delete this property? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              Alert.alert('Success', 'Property deleted successfully');
              navigation.navigate('ManageListings');
            } catch (err) {
              console.error('Error deleting listing:', err);
              Alert.alert('Error', 'Failed to delete listing');
            }
          },
        },
      ]
    );
  };

  const handleBoost = () => {
    navigation.navigate('BoostScreen', { listingId });
  };

  // ─── Verification Handler with Modal ──────────────────────────────────────
  const handleRequestVerificationPress = async () => {
    if (requestingVerif || listing?.is_verified) return;

    setRequestingVerif(true);
    try {
      const { data: configData, error: configError } = await supabase
        .from('pricing_configs')
        .select('config_value')
        .eq('config_key', 'verification_fee')
        .maybeSingle();

      if (configError) throw configError;
      const fee = configData?.config_value ? Number(configData.config_value) : 5000;
      setVerificationFee(fee);
      setShowVerificationModal(true);
    } catch (err) {
      console.error('Error fetching verification fee:', err);
      Alert.alert('Error', 'Could not fetch verification fee. Please try again.');
    } finally {
      setRequestingVerif(false);
    }
  };

  const handleProceedToVerificationPayment = () => {
    setShowVerificationModal(false);
    // ✅ Navigation with cast to avoid TypeScript error
    navigation.navigate('Tabs' as any, {
      screen: 'Payments',
      params: {
        listingId: listingId,
        amount: verificationFee,
        description: `Verification fee for listing ${listingId}`,
        reason: 'verification',
      },
    });
  };

  const handleCancelVerification = () => {
    setShowVerificationModal(false);
  };

  const handleContactLandlord = () => {
    if (!listing?.landlord) return;
    const { phone, email } = listing.landlord;
    Alert.alert(
      'Contact Landlord',
      'Choose contact method',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(phone ? [{ text: 'Call', onPress: () => Linking.openURL(`tel:${phone}`) }] : []),
        ...(email ? [{ text: 'Email', onPress: () => Linking.openURL(`mailto:${email}`) }] : []),
      ]
    );
  };

  // ✅ Memoized to prevent FlatList crash
  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveImageIndex(viewableItems[0].index);
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading property details...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
        <Text style={styles.errorTitle}>Unable to load property</Text>
        <Text style={styles.errorSubtitle}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadListing}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!listing) return null;

  const images: MediaItem[] = listing.media.filter((m) => m.type === 'image');
  const videos: MediaItem[] = listing.media.filter((m) => m.type === 'video');
  const allMedia = [...images, ...videos];

  const renderMediaItem = ({ item, index }: { item: MediaItem; index: number }) => (
    <View style={styles.mediaItemContainer}>
      <Image source={{ uri: item.url }} style={styles.mediaItem} />
      {item.type === 'video' && (
        <View style={styles.videoBadge}>
          <Ionicons name="play-circle" size={32} color="#FFFFFF" />
        </View>
      )}
      <View style={styles.mediaCounter}>
        <Text style={styles.mediaCounterText}>{index + 1} / {allMedia.length}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Property Details</Text>
        <TouchableOpacity onPress={handleEdit} style={styles.editButton}>
          <Ionicons name="pencil-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {allMedia.length > 0 && (
          <View style={styles.gallerySection}>
            <FlatList
              data={allMedia}
              keyExtractor={(item, idx) => `${item.url}-${idx}`}
              renderItem={renderMediaItem}
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
                    style={[styles.paginationDot, index === activeImageIndex && styles.paginationDotActive]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.titleSection}>
            <View style={styles.titleRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={styles.title}>{listing.title}</Text>
                {listing.is_verified && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.background} />
                  </View>
                )}
              </View>
              <View style={[styles.statusBadge, listing.available ? styles.statusActive : styles.statusInactive]}>
                <Text style={styles.statusText}>{listing.available ? 'Available' : 'Rented'}</Text>
              </View>
            </View>
            <Text style={styles.price}>
              <Text style={styles.currency}>FCFA </Text>
              {listing.price.toLocaleString()}
              <Text style={styles.perMonth}>/month</Text>
            </Text>
          </View>

          <View style={styles.keyDetails}>
            <View style={styles.detailItem}>
              <Ionicons name="bed-outline" size={20} color={colors.primary} />
              <Text style={styles.detailText}>{listing.rooms || 'N/A'} Rooms</Text>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailItem}>
              <Ionicons name="location-outline" size={20} color={colors.primary} />
              <Text style={styles.detailText}>{listing.city || 'City'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.quickActionBtn, { width: '100%', marginTop: 12, marginBottom: 24, backgroundColor: colors.primary, borderColor: colors.primary, paddingVertical: 14, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }]}
            onPress={handleShare}
          >
            <Ionicons name="arrow-redo" size={24} color={colors.background} />
            <Text style={[styles.quickActionText, { color: colors.background, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 }]}>Share this listing</Text>
          </TouchableOpacity>

          <View style={[styles.section, styles.switchSection]}>
            <View style={styles.switchRow}>
              <View style={styles.switchLeft}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
                <Text style={styles.sectionTitle}>Available for Rent</Text>
              </View>
              <Switch
                value={!!listing.available}
                onValueChange={toggleAvailability}
                trackColor={{ false: isDark ? '#333' : '#e0e0e0', true: colors.primary }}
                thumbColor={isDark ? '#fff' : '#fff'}
                ios_backgroundColor={isDark ? '#333' : '#e0e0e0'}
              />
            </View>
            <Text style={styles.switchHint}>
              {listing.available ? 'Property is currently available' : 'Property is marked as unavailable'}
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Description</Text>
            </View>
            <Text style={styles.description}>{listing.description || 'No description provided for this property.'}</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="map-outline" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Location</Text>
            </View>
            <View style={styles.locationCard}>
              <View style={styles.locationInfo}>
                <Ionicons name="location-sharp" size={16} color={colors.primary} />
                <Text style={styles.locationText}>{listing.address || 'Address not specified'}</Text>
              </View>
              {listing.latitude && listing.longitude && (
                <TouchableOpacity style={styles.mapButton} onPress={() => setMapModalVisible(true)}>
                  <Ionicons name="map" size={18} color={colors.background} />
                  <Text style={styles.mapButtonText}>View Map</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {videos.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="videocam-outline" size={20} color={colors.primary} />
                <Text style={styles.sectionTitle}>Property Videos</Text>
              </View>
              <Text style={styles.videoCount}>{videos.length} video{videos.length > 1 ? 's' : ''} available</Text>
            </View>
          )}

          {listing.landlord && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="person-outline" size={20} color={colors.primary} />
                <Text style={styles.sectionTitle}>Landlord Information</Text>
              </View>
              <View style={styles.landlordCard}>
                <View style={styles.landlordAvatar}>
                  <Text style={styles.landlordInitials}>
                    {listing.landlord.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'L'}
                  </Text>
                </View>
                <View style={styles.landlordInfo}>
                  <Text style={styles.landlordName}>{listing.landlord.full_name || 'Property Owner'}</Text>
                  {listing.landlord.email && (
                    <View style={styles.contactRow}>
                      <Ionicons name="mail-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.landlordContact}>{listing.landlord.email}</Text>
                    </View>
                  )}
                  {listing.landlord.phone && (
                    <View style={styles.contactRow}>
                      <Ionicons name="call-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.landlordContact}>{listing.landlord.phone}</Text>
                    </View>
                  )}
                </View>
                {(listing.landlord.phone || listing.landlord.email) && (
                  <TouchableOpacity style={styles.contactButton} onPress={handleContactLandlord}>
                    <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          <View style={styles.actionButtonsContainer}>
            {!listing.is_verified && (
              <View style={styles.verifyContainer}>
                <TouchableOpacity
                  style={styles.verifyButton}
                  onPress={handleRequestVerificationPress}
                  disabled={requestingVerif}
                >
                  {requestingVerif ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <>
                      <Ionicons name="shield-checkmark-outline" size={20} color={colors.background} />
                      <Text style={styles.verifyButtonText}>Verify</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setInfoModalVisible(true)}>
                  <Text style={styles.infoLinkText}>Why should I verify my listing?</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.boostButton} onPress={handleBoost}>
                <Ionicons name="rocket-outline" size={20} color={colors.primary} />
                <Text style={styles.boostButtonText}>Boost</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ─── Info Modal ──────────────────────────────────────────────────────── */}
      <Modal animationType="slide" transparent={true} visible={infoModalVisible} onRequestClose={() => setInfoModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Why verify your listing?</Text>
              <TouchableOpacity onPress={() => setInfoModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalBody}>
              Verifying your listing increases your chances of getting tenants faster by building trust. Verified properties appear higher in search results and have a special badge.
              {'\n\n'}
              The 5,000 FCFA fee covers the logistics and displacement of our DHUB agents to physically inspect the property, take professional photos if needed, and guarantee its authenticity to prospective tenants.
            </Text>
            <TouchableOpacity style={styles.modalButton} onPress={() => setInfoModalVisible(false)}>
              <Text style={styles.modalButtonText}>I understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Verification Confirmation Modal ───────────────────────────────── */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showVerificationModal}
        onRequestClose={handleCancelVerification}
      >
        <View style={styles.verificationModalOverlay}>
          <View style={styles.verificationModalContent}>
            <View style={styles.verificationModalHeader}>
              <Ionicons name="shield-checkmark-outline" size={28} color={colors.primary} />
              <Text style={styles.verificationModalTitle}>Request Verification</Text>
            </View>
            <Text style={styles.verificationModalDescription}>
              This requires a non-refundable displacement fee of{' '}
              <Text style={styles.verificationFeeText}>
                {verificationFee.toLocaleString()} FCFA
              </Text>
              {' '}for a DHUB agent to physically verify this listing.
            </Text>
            <View style={styles.verificationModalActions}>
              <TouchableOpacity
                style={[styles.verificationModalButton, styles.verificationCancelButton]}
                onPress={handleCancelVerification}
              >
                <Text style={styles.verificationCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.verificationModalButton, styles.verificationProceedButton]}
                onPress={handleProceedToVerificationPayment}
              >
                <Text style={styles.verificationProceedButtonText}>
                  Proceed to Pay {verificationFee.toLocaleString()} FCFA
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <MapPickerModal
        visible={mapModalVisible}
        onClose={() => setMapModalVisible(false)}
        onLocationSelected={(coords) => {
          setListing((prev) => prev && { ...prev, latitude: coords.latitude, longitude: coords.longitude });
          setMapModalVisible(false);
        }}
        initialLocation={listing?.latitude && listing?.longitude ? { latitude: listing.latitude, longitude: listing.longitude } : undefined}
        readOnly
      />
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  loadingText: { color: colors.text, fontSize: 14, marginTop: 12, opacity: 0.6 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 },
  errorSubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginHorizontal: 20, marginBottom: 24 },
  retryButton: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, marginBottom: 12 },
  retryButtonText: { color: colors.background, fontSize: 16, fontWeight: '600' },
  backButton: { paddingVertical: 12, paddingHorizontal: 32 },
  backButtonText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButtonHeader: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '600', letterSpacing: 0.5 },
  editButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' },
  gallerySection: { position: 'relative' },
  mediaItemContainer: { position: 'relative', width: SCREEN_WIDTH, height: 280 },
  mediaItem: { width: SCREEN_WIDTH, height: 280, resizeMode: 'cover' },
  videoBadge: { position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -16 }, { translateY: -16 }], backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 32, padding: 4 },
  mediaCounter: { position: 'absolute', bottom: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.primary },
  mediaCounterText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  paginationDots: { flexDirection: 'row', position: 'absolute', bottom: 16, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', gap: 8 },
  paginationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF', opacity: 0.5 },
  paginationDotActive: { width: 20, backgroundColor: colors.primary, opacity: 1 },
  content: { padding: 20 },
  titleSection: { marginBottom: 20 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: 0.5, flex: 1 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginLeft: 12 },
  statusActive: { backgroundColor: isDark ? '#1A3A1A' : '#e6f4ea', borderWidth: 1, borderColor: colors.primary },
  statusInactive: { backgroundColor: isDark ? '#3A1A1A' : '#fce8e6', borderWidth: 1, borderColor: colors.error },
  statusText: { color: isDark ? '#FFFFFF' : colors.text, fontSize: 12, fontWeight: '600' },
  price: { color: colors.primary, fontSize: 28, fontWeight: '700' },
  currency: { fontSize: 16, fontWeight: '500', opacity: 0.8 },
  perMonth: { fontSize: 14, fontWeight: '400', opacity: 0.6, color: colors.textSecondary },
  keyDetails: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  detailItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  detailText: { color: colors.text, fontSize: 14, fontWeight: '500' },
  detailDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: 8 },
  quickActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 8, borderWidth: 1 },
  quickActionText: { fontSize: 13, fontWeight: '500' },
  switchSection: { paddingVertical: 20, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchHint: { color: colors.textSecondary, fontSize: 13, marginTop: 8, marginLeft: 28 },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '600', letterSpacing: 0.3 },
  description: { color: colors.textSecondary, fontSize: 16, lineHeight: 24, backgroundColor: colors.card, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  locationCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  locationInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  locationText: { color: colors.text, fontSize: 15, flex: 1 },
  mapButton: { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12 },
  mapButtonText: { color: colors.background, fontSize: 14, fontWeight: '600' },
  videoCount: { color: colors.textSecondary, fontSize: 14, marginLeft: 28 },
  landlordCard: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' },
  landlordAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  landlordInitials: { color: colors.background, fontSize: 18, fontWeight: '700' },
  landlordInfo: { flex: 1 },
  landlordName: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  landlordContact: { color: colors.textSecondary, fontSize: 13 },
  contactButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.primary },
  actionButtonsContainer: { gap: 16, marginTop: 8, marginBottom: 30 },
  verifyContainer: { gap: 8 },
  actionButtons: { flexDirection: 'row', gap: 12 },
  verifyButton: { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 16 },
  verifyButtonText: { color: colors.background, fontSize: 16, fontWeight: '700' },
  infoLinkText: { color: colors.primary, fontSize: 14, textAlign: 'center', textDecorationLine: 'underline' },
  boostButton: { flex: 1, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: colors.primary },
  boostButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  deleteButton: { flex: 1, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: colors.error },
  deleteButtonText: { color: colors.error, fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  modalContainer: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.25, shadowRadius: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  modalBody: { fontSize: 16, color: colors.textSecondary, lineHeight: 24, marginBottom: 24 },
  modalButton: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  modalButtonText: { color: colors.background, fontSize: 16, fontWeight: '600' },
  verifiedBadge: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 3, marginLeft: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },

  // ─── Verification Modal Styles ────────────────────────────────────────────
  verificationModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20,
  },
  verificationModalContent: {
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  verificationModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  verificationModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  verificationModalDescription: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  verificationFeeText: {
    color: colors.primary,
    fontWeight: '700',
  },
  verificationModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  verificationModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verificationCancelButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  verificationCancelButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  verificationProceedButton: {
    backgroundColor: colors.primary,
  },
  verificationProceedButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ListingDetailsScreen;