import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../utils/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import ListingCard, { Listing } from '../ListingCard';

interface Props {
  landlordId?: string;
}

const ListingsPreview: React.FC<Props> = ({ landlordId }) => {
  const navigation = useNavigation();
  const { colors } = useTheme();
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
        .select('id, title, price, media, city, avg_rating, rating_count, description, rooms, landlord_id, boosted, processing_status, is_verified')
        .eq('landlord_id', landlordId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      
      const mappedData = (data || []).map(item => {
        const imageArray = Array.isArray(item.media)
          ? item.media
              .filter((m: any) => m.type === 'image')
              .map((m: any) => m.thumbUrl || m.url)
          : [];
          
        return {
          ...item,
          image_url: imageArray.length > 0 ? imageArray[0] : null
        };
      });
      
      setListings(mappedData);
    } catch (error) {
      console.error('Error fetching listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleListingPress = (listingId: string) => {
    (navigation as any).navigate('EditListing', { listingId });
  };

  const handleBoostPress = (listingId: string) => {
    (navigation as any).navigate('BoostScreen', { listingId });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Listings</Text>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
      </View>
    );
  }

  if (!landlordId) {
    return (
      <View style={styles.container}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Listings</Text>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>User not available</Text>
      </View>
    );
  }

  if (listings.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Listings</Text>
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyStateText, { color: colors.text }]}>No listings yet</Text>
          <Text style={[styles.emptyStateSubtext, { color: colors.textSecondary }]}>
            Create your first listing to get started
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Listings</Text>
        <TouchableOpacity onPress={() => (navigation as any).navigate('ManageListings')}>
          <Text style={styles.seeAllText}>See All</Text>
        </TouchableOpacity>
      </View>

      {listings.map((listing) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          onPress={handleListingPress}
          role="landlord"
          onBoostPress={handleBoostPress}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: 'bold' },
  seeAllText: { color: '#D4AF37', fontSize: 14, fontWeight: '600' },
  loadingText: { textAlign: 'center', marginVertical: 20 },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyStateText: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptyStateSubtext: { fontSize: 14, textAlign: 'center', marginTop: 4 },
});

export default ListingsPreview;