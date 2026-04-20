// src/screens/landlord/ManageListings.tsx
import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ListingCard from '../../components/ListingCard';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../utils/supabaseClient';

type LandlordStackParamList = {
  ManageListings: undefined;
  UploadListing: undefined;
  EditListing: { listingId: string };
  ListingDetails: { listingId: string };
  BoostScreen: { listingId: string };
  KYCVerification: undefined;
};

const DEFAULT_IMAGE = 'https://via.placeholder.com/400x240.png?text=No+Image';
const SCREEN_WIDTH = Dimensions.get('window').width;

const ManageListings: React.FC = () => {
  const navigation = useNavigation<NavigationProp<LandlordStackParamList>>();
  const { user } = useAuth();

  const [listings, setListings] = useState<any[]>([]);
  const [landlordProfile, setLandlordProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Please log in to manage listings.</Text>
      </View>
    );
  }

  useEffect(() => {
    fetchProfileAndListings();
  }, [user?.id]);

  const fetchProfileAndListings = async () => {
    setLoading(true);
    try {
      const { data: profile, error: profileErr } = await supabase
        .from('landlord_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileErr) console.error('Profile fetch error:', profileErr.message);
      else setLandlordProfile(profile);

      const { data: listingData, error: listErr } = await supabase
        .from('listings')
        .select('*')
        .eq('landlord_id', user.id)
        .order('created_at', { ascending: false });

      if (listErr) console.error('Listing fetch error:', listErr.message);

      // Map images from bucket or fallback
const listingsWithImages = (listingData || []).map((l: any) => {
  const imageArray = Array.isArray(l.media)
    ? l.media
        .filter((m: any) => m.type === 'image') // only images
        .map((m: any) => m.thumbUrl || m.url)  // prefer thumbnail
    : [];

  return {
    ...l,
    images: imageArray.length > 0 ? imageArray : [DEFAULT_IMAGE], // gallery
    image_url: imageArray[0] || DEFAULT_IMAGE,                   // ListingCard
  };
});


      setListings(listingsWithImages);
    } catch (err) {
      console.error('Unexpected error fetching listings:', err);
    }
    setLoading(false);
  };

  const handleAddListing = () => {
    if (landlordProfile?.kyc_status !== 'approved') {
      Alert.alert(
        'KYC Required',
        'Please complete your KYC verification before creating listings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Verify Now', onPress: () => navigation.navigate('KYCVerification') },
        ]
      );
      return;
    }
    navigation.navigate('UploadListing');
  };

  const handleViewDetails = (listingId: string) => {
    navigation.navigate('ListingDetails', { listingId });
  };

  const handleEditListing = (listingId: string) => {
    navigation.navigate('EditListing', { listingId });
  };

  const handleDeleteListing = (listingId: string) => {
    Alert.alert(
      'Delete Listing',
      'Are you sure you want to delete this listing?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('listings').delete().eq('id', listingId);
              if (error) throw error;
              setListings((prev) => prev.filter((l) => l.id !== listingId));
              Alert.alert('Deleted', 'Listing has been deleted.');
            } catch (err) {
              console.error('Error deleting listing:', err);
              Alert.alert('Error', 'Failed to delete listing.');
            }
          },
        },
      ]
    );
  };

  const handleBoostPress = (listingId: string) => {
    navigation.navigate('BoostScreen', { listingId });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#D4AF37" />
        <Text style={styles.loadingText}>Loading your listings...</Text>
      </View>
    );
  }

  const isEmpty = listings.length === 0;

  const renderImageGallery = (images: string[]) => (
    <FlatList
      data={images}
      horizontal
      keyExtractor={(item, index) => item + index}
      renderItem={({ item }) => (
        <View style={styles.galleryImageContainer}>
          <Image
            source={{ uri: item }}
            style={styles.galleryImage}
            resizeMode="cover"
          />
          <View style={styles.imageOverlay} />
        </View>
      )}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.galleryContent}
    />
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
      
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#D4AF37" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Properties</Text>
        <View style={styles.headerRight} />
      </View>

      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="home-outline" size={64} color="#D4AF37" />
          </View>
          <Text style={styles.emptyTitle}>No listings yet</Text>
          <Text style={styles.emptySubtitle}>
            Start by adding your first property
          </Text>
          <TouchableOpacity 
            style={styles.addButtonLarge} 
            onPress={handleAddListing}
            activeOpacity={0.9}
          >
            <Ionicons name="add" size={36} color="#1A1A1A" />
            <Text style={styles.addButtonText}>Add Property</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{listings.length}</Text>
                <Text style={styles.statLabel}>Total Properties</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>
                  {listings.filter(l => l.status === 'active').length}
                </Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
            </View>

            {listings.map((item, index) => (
              <View key={item.id} style={styles.listingWrapper}>
                <View style={styles.listingCard}>
                  <ListingCard
                    listing={item}
                    onPress={() => handleViewDetails(item.id)}
                    role="landlord"
                    onBoostPress={handleBoostPress}
                  />

                  {/* Image gallery */}
                  <View style={styles.gallerySection}>
                    <Text style={styles.galleryLabel}>Property Photos</Text>
                    {renderImageGallery(item.images)}
                  </View>

                  {/* Edit/Delete Buttons */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity 
                      onPress={() => handleEditListing(item.id)}
                      style={styles.actionButton}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pencil-outline" size={18} color="#D4AF37" />
                      <Text style={styles.actionText}>Edit</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      onPress={() => handleDeleteListing(item.id)}
                      style={[styles.actionButton, styles.deleteButton]}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                      <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
            
            <View style={styles.bottomPadding} />
          </ScrollView>

          <TouchableOpacity 
            style={styles.floatingAddBtn} 
            onPress={handleAddListing}
            activeOpacity={0.9}
          >
            <Ionicons name="add" size={32} color="#1A1A1A" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0A0A0A' 
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  headerRight: {
    width: 40,
  },
  centered: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 16,
    opacity: 0.8,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 12,
    opacity: 0.6,
  },
  emptyContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 40,
    backgroundColor: '#0A0A0A',
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#D4AF37',
    borderStyle: 'dashed',
  },
  emptyTitle: { 
    color: '#FFFFFF', 
    fontSize: 24, 
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  emptySubtitle: {
    color: '#888888',
    fontSize: 16,
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 24,
  },
  addButtonLarge: { 
    backgroundColor: '#D4AF37', 
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 8,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  addButtonText: {
    color: '#1A1A1A',
    fontSize: 18,
    fontWeight: '600',
  },
  floatingAddBtn: { 
    position: 'absolute', 
    bottom: 30, 
    right: 30, 
    backgroundColor: '#D4AF37', 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    justifyContent: 'center', 
    alignItems: 'center', 
    elevation: 12,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  statNumber: {
    color: '#D4AF37',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '500',
  },
  listingWrapper: {
    marginBottom: 20,
  },
  listingCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  gallerySection: {
    marginTop: 16,
  },
  galleryLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  galleryContent: {
    paddingRight: 16,
  },
  galleryImageContainer: {
    position: 'relative',
    marginRight: 12,
  },
  galleryImage: {
    width: SCREEN_WIDTH - 80,
    height: 180,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  actionRow: { 
    flexDirection: 'row', 
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    paddingTop: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  actionText: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#2A1A1A',
  },
  deleteText: {
    color: '#FF6B6B',
  },
  bottomPadding: {
    height: 20,
  },
});

export default ManageListings;