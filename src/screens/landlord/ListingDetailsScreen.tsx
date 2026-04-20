import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, RouteProp, useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapPickerModal from '../../components/MapPickerModal';
import { useAuth } from '../../hooks/useAuth';
import { ListingDetails, MediaItem } from '../../types';
import { fetchListingDetails } from '../../utils/listings';

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

  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    loadListing();
  }, [listingId]);

  const loadListing = async () => {
    setLoading(true);
    try {
      const data = await fetchListingDetails(listingId);
      if (!data) throw new Error('Listing not found');
      setListing(data);
    } catch (err) {
      console.error('Error fetching listing:', err);
      Alert.alert('Error', 'Failed to fetch listing details');
    } finally {
      setLoading(false);
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
              // Add actual delete logic here
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

  const handleContactLandlord = () => {
    if (!listing?.landlord) return;
    
    const { phone, email } = listing.landlord;
    Alert.alert(
      'Contact Landlord',
      'Choose contact method',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(phone ? [{ 
          text: 'Call', 
          onPress: () => Linking.openURL(`tel:${phone}`) 
        }] : []),
        ...(email ? [{ 
          text: 'Email', 
          onPress: () => Linking.openURL(`mailto:${email}`) 
        }] : []),
      ]
    );
  };

  const onViewableItemsChanged = ({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveImageIndex(viewableItems[0].index);
    }
  };

  if (loading || !listing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#D4AF37" />
        <Text style={styles.loadingText}>Loading property details...</Text>
      </View>
    );
  }

  // Separate media
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
        <Text style={styles.mediaCounterText}>
          {index + 1} / {allMedia.length}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#D4AF37" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Property Details</Text>
        <TouchableOpacity 
          onPress={handleEdit} 
          style={styles.editButton}
          activeOpacity={0.7}
        >
          <Ionicons name="pencil-outline" size={22} color="#D4AF37" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Media Gallery */}
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
                    style={[
                      styles.paginationDot,
                      index === activeImageIndex && styles.paginationDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Content */}
        <View style={styles.content}>
          {/* Title & Price */}
          <View style={styles.titleSection}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{listing.title}</Text>
              <View style={[styles.statusBadge, listing.available ? styles.statusActive : styles.statusInactive]}>
                <Text style={styles.statusText}>
                  {listing.available ? 'Available' : 'Rented'}
                </Text>
              </View>
            </View>
            <Text style={styles.price}>
              <Text style={styles.currency}>FCFA </Text>
              {listing.price.toLocaleString()}
              <Text style={styles.perMonth}>/month</Text>
            </Text>
          </View>

          {/* Key Details */}
          <View style={styles.keyDetails}>
            <View style={styles.detailItem}>
              <Ionicons name="bed-outline" size={20} color="#D4AF37" />
              <Text style={styles.detailText}>{listing.rooms || 'N/A'} Rooms</Text>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailItem}>
              <Ionicons name="location-outline" size={20} color="#D4AF37" />
              <Text style={styles.detailText}>{listing.city || 'City'}</Text>
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color="#D4AF37" />
              <Text style={styles.sectionTitle}>Description</Text>
            </View>
            <Text style={styles.description}>
              {listing.description || 'No description provided for this property.'}
            </Text>
          </View>

          {/* Location */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="map-outline" size={20} color="#D4AF37" />
              <Text style={styles.sectionTitle}>Location</Text>
            </View>
            <View style={styles.locationCard}>
              <View style={styles.locationInfo}>
                <Ionicons name="location-sharp" size={16} color="#D4AF37" />
                <Text style={styles.locationText}>{listing.address || 'Address not specified'}</Text>
              </View>
              {listing.latitude && listing.longitude && (
                <TouchableOpacity 
                  style={styles.mapButton} 
                  onPress={() => setMapModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="map" size={18} color="#1A1A1A" />
                  <Text style={styles.mapButtonText}>View Map</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Videos Section */}
          {videos.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="videocam-outline" size={20} color="#D4AF37" />
                <Text style={styles.sectionTitle}>Property Videos</Text>
              </View>
              <Text style={styles.videoCount}>{videos.length} video{videos.length > 1 ? 's' : ''} available</Text>
            </View>
          )}

          {/* Landlord Info */}
          {listing.landlord && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="person-outline" size={20} color="#D4AF37" />
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
                      <Ionicons name="mail-outline" size={14} color="#888888" />
                      <Text style={styles.landlordContact}>{listing.landlord.email}</Text>
                    </View>
                  )}
                  {listing.landlord.phone && (
                    <View style={styles.contactRow}>
                      <Ionicons name="call-outline" size={14} color="#888888" />
                      <Text style={styles.landlordContact}>{listing.landlord.phone}</Text>
                    </View>
                  )}
                </View>
                {(listing.landlord.phone || listing.landlord.email) && (
                  <TouchableOpacity 
                    style={styles.contactButton}
                    onPress={handleContactLandlord}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chatbubble-outline" size={20} color="#D4AF37" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={styles.boostButton} 
              onPress={handleBoost}
              activeOpacity={0.8}
            >
              <Ionicons name="rocket-outline" size={20} color="#D4AF37" />
              <Text style={styles.boostButtonText}>Boost Listing</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.deleteButton} 
              onPress={handleDelete}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <MapPickerModal
        visible={mapModalVisible}
        onClose={() => setMapModalVisible(false)}
        onLocationSelected={(coords) => {
          setListing((prev) => prev && { ...prev, latitude: coords.latitude, longitude: coords.longitude });
          setMapModalVisible(false);
        }}
        initialLocation={
          listing?.latitude && listing?.longitude
            ? { latitude: listing.latitude, longitude: listing.longitude }
            : undefined
        }
        readOnly
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0A0A0A' 
  },
  centered: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 12,
    opacity: 0.6,
  },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { 
    color: '#FFFFFF', 
    fontSize: 20, 
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  gallerySection: {
    position: 'relative',
  },
  mediaItemContainer: {
    position: 'relative',
    width: SCREEN_WIDTH,
    height: 280,
  },
  mediaItem: { 
    width: SCREEN_WIDTH, 
    height: 280, 
    resizeMode: 'cover',
  },
  videoBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -16 }, { translateY: -16 }],
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 32,
    padding: 4,
  },
  mediaCounter: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  mediaCounterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  paginationDots: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    opacity: 0.5,
  },
  paginationDotActive: {
    width: 20,
    backgroundColor: '#D4AF37',
    opacity: 1,
  },
  content: {
    padding: 20,
  },
  titleSection: {
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { 
    color: '#FFFFFF', 
    fontSize: 24, 
    fontWeight: '700',
    letterSpacing: 0.5,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginLeft: 12,
  },
  statusActive: {
    backgroundColor: '#1A3A1A',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  statusInactive: {
    backgroundColor: '#3A1A1A',
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  price: { 
    color: '#D4AF37', 
    fontSize: 28, 
    fontWeight: '700',
  },
  currency: {
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.8,
  },
  perMonth: {
    fontSize: 14,
    fontWeight: '400',
    opacity: 0.6,
    color: '#888888',
  },
  keyDetails: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  detailItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  detailDivider: {
    width: 1,
    backgroundColor: '#2A2A2A',
    marginHorizontal: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: { 
    color: '#FFFFFF', 
    fontSize: 18, 
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  description: { 
    color: '#CCCCCC', 
    fontSize: 16,
    lineHeight: 24,
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  locationCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  locationText: {
    color: '#FFFFFF',
    fontSize: 15,
    flex: 1,
  },
  mapButton: {
    backgroundColor: '#D4AF37',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  mapButtonText: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '600',
  },
  videoCount: {
    color: '#888888',
    fontSize: 14,
    marginLeft: 28,
  },
  landlordCard: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D4AF37',
    alignItems: 'center',
  },
  landlordAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#D4AF37',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  landlordInitials: {
    color: '#1A1A1A',
    fontSize: 18,
    fontWeight: '700',
  },
  landlordInfo: {
    flex: 1,
  },
  landlordName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  landlordContact: {
    color: '#888888',
    fontSize: 13,
  },
  contactButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 30,
  },
  boostButton: {
    flex: 2,
    backgroundColor: '#1A1A1A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  boostButtonText: {
    color: '#D4AF37',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  deleteButtonText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ListingDetailsScreen;