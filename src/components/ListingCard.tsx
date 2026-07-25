import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  is_verified?: boolean | null;
}

interface ListingCardProps {
  listing: Listing;
  onPress: (listingId: string) => void;
  role: 'student' | 'landlord';
  onBoostPress?: (listingId: string) => void; // optional
}

import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

const ListingCard: React.FC<ListingCardProps> = ({ listing, onPress, role, onBoostPress }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const handleViewDetails = () => {
    if (!listing.id) return;
    onPress(listing.id);
  };

  const formatPrice = (price: number | null | undefined) => {
    if (!price) return '0';
    return price.toLocaleString(t('common.date_locale'));
  };

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.card }]} onPress={handleViewDetails}>
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
          <Text style={styles.priceText}>
            {t('listing.fcfa')} {formatPrice(listing.price)}{t('listing.per_month')}
          </Text>
        </View>

        {/* Boost badges */}
        <View style={styles.boostBadgeContainer}>
          {role === 'landlord' && !listing.boosted && (
            <TouchableOpacity
              style={styles.boostNowBadge}
              onPress={() => onBoostPress?.(listing.id)}
            >
              <Text style={styles.boostNowText}>{t('listing.boost_now')}</Text>
            </TouchableOpacity>
          )}
          {listing.boosted && (
            <View style={styles.boostedBadge}>
              <Text style={styles.boostedText}>{t('listing.boosted')}</Text>
            </View>
          )}
          {listing.processing_status === 'processing' && (
            <View style={styles.processingBadge}>
              <Text style={styles.processingBadgeText}>{t('listing.processing_video')}</Text>
            </View>
          )}
        </View>

        {/* Gold Verified Rosette - Top Right Overlay */}
        {listing.is_verified && (
          <TouchableOpacity
            style={styles.verifiedBadge}
            onPress={() => Alert.alert(
              '✅ DHUB Verified Property',
              'This listing was physically inspected and confirmed by a DHUB agent.\n\n• Photos match the real property\n• Promised amenities are present\n• Price is fair and accurate\n\nYou can rent with confidence!'
            )}
            activeOpacity={0.85}
          >
            {/* Outer ring */}
            <View style={styles.verifiedOuter}>
              {/* Inner circle */}
              <View style={styles.verifiedInner}>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </View>
            </View>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.cardContent}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Text style={[styles.title, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
              {listing.title || t('listing.untitled')}
            </Text>
          </View>

          <View style={[styles.ratingContainer, { backgroundColor: colors.background }]}>
            <Text style={styles.ratingIcon}>⭐</Text>
            {listing.rating_count && listing.rating_count > 0 ? (
              <Text style={styles.ratingText}>
                {listing.avg_rating?.toFixed(1)} ({listing.rating_count})
              </Text>
            ) : (
              <Text style={[styles.ratingText, { opacity: 0.7 }]}>{t('common.new')}</Text>
            )}
          </View>
        </View>

        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={[styles.city, { color: colors.textSecondary }]} numberOfLines={1}>
            {listing.city || t('common.unknown')}
          </Text>
        </View>

        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
          {listing.description || t('listing.no_description_card')}
        </Text>

        <View style={styles.featuresRow}>
          <View style={[styles.feature, { backgroundColor: colors.background }]}>
            <Text style={styles.featureIcon}>🛏️</Text>
            <Text style={[styles.featureText, { color: colors.textSecondary }]}>
              {listing.rooms || 0} {t('listing.rooms', { count: listing.rooms || 0 }).toLowerCase()}
            </Text>
          </View>
          <View style={[styles.feature, { backgroundColor: colors.background }]}>
            <Text style={styles.featureIcon}>📐</Text>
            <Text style={[styles.featureText, { color: colors.textSecondary }]}>{t('listing.spacious')}</Text>
          </View>
        </View>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.postedDate, { color: colors.textSecondary }]}>{t('listing.available_now')}</Text>
          <TouchableOpacity style={[styles.viewButton, { backgroundColor: colors.secondary }]} onPress={handleViewDetails}>
            <Text style={styles.viewButtonText}>{t('listing.view_details')}</Text>
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

  verifiedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 20,
    shadowColor: '#B8860B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 5,
    elevation: 10,
  },
  verifiedOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#D4AF37',
    borderWidth: 3,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#B8860B',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ListingCard;
