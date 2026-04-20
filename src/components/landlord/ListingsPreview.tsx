import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../utils/supabaseClient';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  landlordId?: string; // Made optional
}

interface Listing {
  id: string;
  title: string;
  description?: string;
  price: number;
  address?: string;
  city: string;
  images?: string[];
  available: boolean;
  avg_rating: number;
}

const ListingsPreview: React.FC<Props> = ({ landlordId }) => {
  const navigation = useNavigation();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (landlordId) {
      fetchListings();
    } else {
      setLoading(false);
    }
  }, [landlordId]);

  const fetchListings = async () => {
    if (!landlordId) return;
    
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('landlord_id', landlordId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      setListings(data || []);
    } catch (error) {
      console.error('Error fetching listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleListingPress = (listingId: string) => {
    (navigation as any).navigate('EditListing', { listingId });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Recent Listings</Text>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!landlordId) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Recent Listings</Text>
        <Text style={styles.loadingText}>User not available</Text>
      </View>
    );
  }

  if (listings.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Recent Listings</Text>
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={48} color="#666" />
          <Text style={styles.emptyStateText}>No listings yet</Text>
          <Text style={styles.emptyStateSubtext}>
            Create your first listing to get started
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Listings</Text>
        <TouchableOpacity onPress={() => (navigation as any).navigate('ManageListings')}>
          <Text style={styles.seeAllText}>See All</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {listings.map((listing) => (
          <TouchableOpacity
            key={listing.id}
            style={styles.listingCard}
            onPress={() => handleListingPress(listing.id)}
          >
            {listing.images && listing.images.length > 0 ? (
              <Image
                source={{ uri: listing.images[0] }}
                style={styles.listingImage}
              />
            ) : (
              <View style={[styles.listingImage, styles.noImage]}>
                <Ionicons name="home-outline" size={32} color="#666" />
              </View>
            )}
            
            <View style={styles.listingInfo}>
              <Text style={styles.listingTitle} numberOfLines={1}>
                {listing.title}
              </Text>
              <Text style={styles.listingLocation} numberOfLines={1}>
                {listing.city}
              </Text>
              <View style={styles.listingMeta}>
                <Text style={styles.listingPrice}>
                  ${listing.price}/month
                </Text>
                <View style={styles.rating}>
                  <Ionicons name="star" size={12} color="#D4AF37" />
                  <Text style={styles.ratingText}>
                    {listing.avg_rating || 'N/A'}
                  </Text>
                </View>
              </View>
              <View style={[
                styles.statusBadge,
                listing.available ? styles.available : styles.unavailable
              ]}>
                <Text style={styles.statusText}>
                  {listing.available ? 'Available' : 'Unavailable'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  seeAllText: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingText: {
    color: '#999',
    textAlign: 'center',
    marginVertical: 20,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyStateText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyStateSubtext: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  listingCard: {
    width: 280,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    marginRight: 16,
    overflow: 'hidden',
  },
  listingImage: {
    width: '100%',
    height: 160,
  },
  noImage: {
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listingInfo: {
    padding: 12,
  },
  listingTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  listingLocation: {
    color: '#999',
    fontSize: 14,
    marginBottom: 8,
  },
  listingMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listingPrice: {
    color: '#D4AF37',
    fontSize: 16,
    fontWeight: 'bold',
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  available: {
    backgroundColor: '#10B98120',
  },
  unavailable: {
    backgroundColor: '#EF444420',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default ListingsPreview;