// src/components/ListingCard.tsx
import { showAlert } from '../utils/alert';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

export interface Listing {
  id: string;
  title?: string | null;
  price?: number | null;
  image_url?: string | null;
  media?: Array<{ url: string; thumbUrl?: string; type?: string }> | null;
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
  onBoostPress?: (listingId: string) => void;
}

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
          source={{ uri: listing.image_url || listing.media?.[0]?.thumbUrl || listing.media?.[0]?.url || 'https://via.placeholder.com/400x250?text=No+Image' }}
          style={styles.image}
          resizeMode="cover"
        />

        {/* Price badge */}
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>
            {t('listing.fcfa')} {formatPrice(listing.price)}{t('listing.per_month')}
          </Text>
        </View>

        {/* Boost / Processing badges - top left */}
        <View style={styles.boostBadgeContainer}>
          {role === 'landlord' && !listing.boosted && (
            <TouchableOpacity style={styles.boostNowBadge} onPress={() => onBoostPress?.(listing.id)}>
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

        {/* Gold Gear Verified badge - top right */}
        {listing.is_verified && (
          <TouchableOpacity
            style={styles.verifiedBadge}
            onPress={() =>
              showAlert(
                '✅ DHUB Verified Property',
                'This listing was physically inspected and confirmed by a DHUB agent.\n\n• Photos match the real property\n• Promised amenities are present\n• Price is fair and accurate\n\nYou can rent with confidence!'
              )
            }
            activeOpacity={0.85}
          >
            <View style={styles.verifiedOuter}>
              <Ionicons name="settings" size={38} color="#D4AF37" />
              <View style={styles.verifiedInner}>
                <Ionicons name="checkmark" size={16} color="#fff" />
              </View>
            </View>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.cardContent}>
        {/* Title + Rating */}
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {listing.title || t('listing.untitled')}
          </Text>
          <View style={[styles.ratingContainer, { backgroundColor: colors.background }]}>
            <Ionicons name="star" size={12} color="#f59e0b" />
            <Text style={styles.ratingText}>
              {listing.rating_count && listing.rating_count > 0
                ? `${listing.avg_rating?.toFixed(1)} (${listing.rating_count})`
                : t('common.new')}
            </Text>
          </View>
        </View>

        {/* Location */}
        <View style={styles.locationRow}>
          <Ionicons name="location" size={13} color={colors.textSecondary} />
          <Text style={[styles.city, { color: colors.textSecondary }]} numberOfLines={1}>
            {' '}{listing.city || t('common.unknown')}
          </Text>
        </View>

        {/* Description */}
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
          {listing.description || t('listing.no_description_card')}
        </Text>

        {/* Rooms badge */}
        <View style={styles.featuresRow}>
          <View style={[styles.feature, { backgroundColor: colors.background }]}>
            <Ionicons name="bed-outline" size={13} color={colors.textSecondary} />
            <Text style={[styles.featureText, { color: colors.textSecondary }]}>
              {' '}{listing.rooms || 0} {t('listing.rooms', { count: listing.rooms || 0 }).toLowerCase()}
            </Text>
          </View>
        </View>

        {/* Footer CTA */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.postedDate, { color: colors.textSecondary }]}>{t('listing.available_now')}</Text>
          <TouchableOpacity
            style={[styles.viewButton, { backgroundColor: colors.secondary }]}
            onPress={handleViewDetails}
          >
            <Text style={styles.viewButtonText}>{t('listing.view_details')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    marginBottom: 20,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  imageContainer: { position: 'relative', height: 260 },
  image: { width: '100%', height: '100%' },

  priceBadge: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    backgroundColor: 'rgba(0,102,204,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  priceText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  boostBadgeContainer: { position: 'absolute', top: 12, left: 12, zIndex: 10, gap: 6 },
  boostNowBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    elevation: 4,
  },
  boostNowText: { color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },
  boostedBadge: {
    backgroundColor: '#32CD32',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  boostedText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  processingBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  processingBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

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
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedInner: {
    position: 'absolute',
    zIndex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },

  cardContent: { padding: 12 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700' },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingText: { fontSize: 12, fontWeight: '600', color: '#f59e0b' },

  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  city: { fontSize: 13, fontWeight: '500' },

  description: { fontSize: 13, lineHeight: 19, marginBottom: 10 },

  featuresRow: { flexDirection: 'row', marginBottom: 10, gap: 8 },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  featureText: { fontSize: 12, fontWeight: '500' },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  postedDate: { fontSize: 12 },
  viewButton: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  viewButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});

export default ListingCard;
