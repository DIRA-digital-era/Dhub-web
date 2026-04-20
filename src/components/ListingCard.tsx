import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';

export interface Listing {
  id: string;
  title?: string | null;
  price?: number | null;
  image_url?: string | null; // Thumbnail from Worker
  city?: string | null;

  avg_rating?: number | null;
  rating_count?: number | null;

  description?: string | null;
  rooms?: number | null;
  landlord_id?: string | null;
  boosted?: boolean;
  processing_status?: 'processing' | 'ready' | 'failed';
}

interface ListingCardProps {
  listing: Listing;
  onPress: (listingId: string) => void;
  role: 'student' | 'landlord';
  onBoostPress?: (listingId: string) => void; // optional
}

const ListingCard: React.FC<ListingCardProps> = ({ listing, onPress, role, onBoostPress }) => {
  const handleViewDetails = () => {
    if (!listing.id) return;
    onPress(listing.id);
  };

  const formatPrice = (price: number | null | undefined) => {
    if (!price) return '0';
    return price.toLocaleString('en-US');
  };

  return (
    <TouchableOpacity style={styles.card} onPress={handleViewDetails}>
      <View style={styles.imageContainer}>
        <Image
          source={{
            uri: listing.image_url || 'https://via.placeholder.com/400x250?text=No+Image',
          }}
          style={styles.image}
          resizeMode="cover"
        />

        {/* Price badge */}
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>FCFA {formatPrice(listing.price)}/mo</Text>
        </View>

        {/* Boost badges */}
        <View style={styles.boostBadgeContainer}>
          {role === 'landlord' && !listing.boosted && (
            <TouchableOpacity
              style={styles.boostNowBadge}
              onPress={() => onBoostPress?.(listing.id)}
            >
              <Text style={styles.boostNowText}>BOOST NOW!</Text>
            </TouchableOpacity>
          )}
          {listing.boosted && (
            <View style={styles.boostedBadge}>
              <Text style={styles.boostedText}>Boosted</Text>
            </View>
          )}
          {listing.processing_status === 'processing' && (
            <View style={styles.processingBadge}>
              <Text style={styles.processingBadgeText}>Processing Video...</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>
            {listing.title || 'Untitled'}
          </Text>

          <View style={styles.ratingContainer}>
            <Text style={styles.ratingIcon}>⭐</Text>
            {listing.rating_count && listing.rating_count > 0 ? (
              <Text style={styles.ratingText}>
                {listing.avg_rating?.toFixed(1)} ({listing.rating_count})
              </Text>
            ) : (
              <Text style={[styles.ratingText, { opacity: 0.7 }]}>New</Text>
            )}
          </View>
        </View>

        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={styles.city} numberOfLines={1}>
            {listing.city || 'Unknown'}
          </Text>
        </View>

        <Text style={styles.description} numberOfLines={2}>
          {listing.description || 'No description available.'}
        </Text>

        <View style={styles.featuresRow}>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>🛏️</Text>
            <Text style={styles.featureText}>
              {listing.rooms || 0} {listing.rooms === 1 ? 'room' : 'rooms'}
            </Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>📐</Text>
            <Text style={styles.featureText}>Spacious</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.postedDate}>Available now</Text>
          <TouchableOpacity style={styles.viewButton} onPress={handleViewDetails}>
            <Text style={styles.viewButtonText}>View Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    marginBottom: 20,
    overflow: 'hidden',
    elevation: 6,
  },
  imageContainer: { position: 'relative', height: 220 },
  image: { width: '100%', height: '100%' },

  priceBadge: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    backgroundColor: 'rgba(0,102,204,0.95)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  priceText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  boostBadgeContainer: { position: 'absolute', top: 14, right: 14, zIndex: 10 },
  boostNowBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
  },
  boostNowText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },

  boostedBadge: {
    backgroundColor: '#32CD32',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  boostedText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  cardContent: { padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', marginRight: 8 },
  ratingContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff9e6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ratingIcon: { fontSize: 12, marginRight: 4 },
  ratingText: { fontSize: 12, fontWeight: '600', color: '#f59e0b' },

  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  locationIcon: { fontSize: 12, marginRight: 6 },
  city: { fontSize: 14, color: '#666', fontWeight: '500' },

  description: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 12 },
  featuresRow: { flexDirection: 'row', marginBottom: 12, gap: 12 },
  feature: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  featureIcon: { fontSize: 12, marginRight: 4 },
  featureText: { fontSize: 12, color: '#666', fontWeight: '500' },

  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  postedDate: { fontSize: 12, color: '#999' },
  viewButton: { backgroundColor: '#0066cc', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  viewButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  processingBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  processingBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});

export default ListingCard;
