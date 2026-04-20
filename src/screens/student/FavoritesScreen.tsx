// src/screens/student/FavoritesScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import FavoritesManager, { FavoriteRecord } from '../../storage/favouritesManager';
import { Listing } from '../../types';
interface ListingWithImages extends Listing {
  images: string[];
  image_url: string;
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40;

const FavoritesScreen: React.FC = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [favorites, setFavorites] = useState<ListingWithImages[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const colors = {
    gold: '#D4AF37',
    goldLight: '#F5E7C8',
    greyDark: '#2C3E50',
    greyMedium: '#7F8C8D',
    greyLight: '#ECF0F1',
    white: '#FFFFFF',
    offWhite: '#F8F9FA',
  };

  // ---------------- LOAD FAVORITES ----------------
  const loadFavorites = useCallback(async () => {
    if (!userId) {
      setFavorites([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(true);
    try {
      const offlineFavs: FavoriteRecord[] = await FavoritesManager.getFavorites(userId);
      
      if (!offlineFavs.length) {
        setFavorites([]);
      } else {
        const listingIds = offlineFavs.map(fav => fav.listing_id);
        const { data: listings, error } = await FavoritesManager.fetchListings(listingIds);
        if (error) throw error;
        setFavorites(listings ?? []);
      }

      FavoritesManager.syncWithSupabase(userId).catch(err =>
        console.warn('Failed to sync favorites:', err)
      );

    } catch (err) {
      console.error('Failed to load favorites:', err);
      setFavorites([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isFocused) loadFavorites();
  }, [isFocused, loadFavorites]);

  // ---------------- EVENT LISTENERS ----------------
  useEffect(() => {
    if (!userId) return;

    const handleAdded = (listing: ListingWithImages) => {
      setFavorites(prev => (prev.find(l => l.id === listing.id) ? prev : [...prev, listing]));
    };

    const handleRemoved = (listingId: string) => {
      setFavorites(prev => prev.filter(l => l.id !== listingId));
    };

    FavoritesManager.onFavoriteAdded(handleAdded);
    FavoritesManager.onFavoriteRemoved(handleRemoved);

    return () => {
      FavoritesManager.offFavoriteAdded(handleAdded);
      FavoritesManager.offFavoriteRemoved(handleRemoved);
    };
  }, [userId]);

  // ---------------- REMOVE FAVORITE ----------------
  const removeFromFavorites = async (listingId: string) => {
    if (!userId) return;

    Alert.alert(
      'Remove from Favorites',
      'Are you sure you want to remove this property from your favorites?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await FavoritesManager.removeFavorite(listingId, userId);
              setFavorites(prev => prev.filter(l => l.id !== listingId));
            } catch (err) {
              console.error('Failed to remove favorite:', err);
              Alert.alert('Error', 'Failed to remove from favorites');
            }
          },
        },
      ]
    );
  };

  const handleListingPress = (listingId: string) => {
    (navigation as any).navigate('ListingDetails', { listingId });
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadFavorites();
  };

  const getListingImage = (listing: ListingWithImages) => listing.images[0] || listing.image_url;

  const renderFavoriteItem = ({ item }: { item: ListingWithImages }) => (
    <TouchableOpacity
      style={styles.listingCard}
      onPress={() => handleListingPress(item.id)}
      activeOpacity={0.95}
    >
      <Image 
        source={{ uri: getListingImage(item) }} 
        style={styles.listingImage} 
        resizeMode="cover"
      />
      
      <View style={styles.listingOverlay}>
        <TouchableOpacity
          style={styles.heartButton}
          onPress={() => removeFromFavorites(item.id)}
          activeOpacity={0.7}
        >
          <Ionicons name="heart" size={24} color={colors.gold} />
        </TouchableOpacity>
      </View>

      <View style={styles.listingContent}>
        <View style={styles.listingHeader}>
          <Text style={styles.listingTitle} numberOfLines={2}>
            {item.title}
          </Text>
        </View>

        <View style={styles.listingDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={16} color={colors.greyMedium} />
            <Text style={styles.detailText} numberOfLines={1}>
              {item.city || 'Location not specified'}
            </Text>
          </View>
          
          {item.rooms && (
            <View style={styles.detailRow}>
              <Ionicons name="bed-outline" size={16} color={colors.greyMedium} />
              <Text style={styles.detailText}>{item.rooms} rooms</Text>
            </View>
          )}
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.listingPrice}>
            FCFA {item.price?.toLocaleString()}
          </Text>
          <Text style={styles.perMonth}>/month</Text>
        </View>

        <TouchableOpacity
          style={styles.viewButton}
          onPress={() => handleListingPress(item.id)}
          activeOpacity={0.8}
        >
          <Text style={styles.viewButtonText}>View Details</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.gold} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="heart-outline" size={64} color={colors.gold} />
      </View>
      <Text style={styles.emptyStateTitle}>No Favorites Yet</Text>
      <Text style={styles.emptyStateText}>
        Start exploring properties and tap the heart icon to save your favorites here
      </Text>
      <TouchableOpacity
        style={styles.exploreButton}
        onPress={() => (navigation as any).navigate('Home')}
        activeOpacity={0.8}
      >
        <Text style={styles.exploreButtonText}>Explore Properties</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.white} />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={styles.loadingText}>Loading your favorites...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Favorites</Text>
        <Text style={styles.headerSubtitle}>
          {favorites.length} {favorites.length === 1 ? 'property' : 'properties'} saved
        </Text>
      </View>

      <FlatList
        data={favorites}
        renderItem={renderFavoriteItem}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContainer,
          favorites.length === 0 && styles.emptyListContainer,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.gold]}
            tintColor={colors.gold}
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2C3E50',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#7F8C8D',
    marginTop: 4,
    fontWeight: '500',
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#F8F9FA',
  },
  loadingText: { 
    marginTop: 12, 
    fontSize: 16, 
    color: '#7F8C8D',
    fontWeight: '500',
  },
  listContainer: { 
    paddingHorizontal: 20, 
    paddingTop: 20, 
    paddingBottom: 20,
  },
  emptyListContainer: { 
    flexGrow: 1,
    justifyContent: 'center',
  },
  listingCard: { 
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
    width: CARD_WIDTH,
  },
  listingImage: { 
    width: '100%', 
    height: 180,
    backgroundColor: '#ECF0F1',
  },
  listingOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
  },
  heartButton: {
    backgroundColor: '#FFFFFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  listingContent: { 
    padding: 16,
  },
  listingHeader: { 
    marginBottom: 12,
  },
  listingTitle: { 
    fontSize: 18, 
    fontWeight: '600', 
    color: '#2C3E50',
    lineHeight: 24,
    letterSpacing: 0.3,
  },
  listingDetails: {
    marginBottom: 12,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#7F8C8D',
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  listingPrice: { 
    fontSize: 22, 
    fontWeight: '700', 
    color: '#be9719',
    letterSpacing: 0.5,
  },
  perMonth: {
    fontSize: 14,
    color: '#7F8C8D',
    marginLeft: 4,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c99f16',
    backgroundColor: '#FFFFFF',
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#c29d23',
  },
  emptyState: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F5E7C8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyStateTitle: { 
    fontSize: 24, 
    fontWeight: '700', 
    color: '#2C3E50',
    marginBottom: 8, 
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  emptyStateText: { 
    fontSize: 16, 
    color: '#7F8C8D',
    textAlign: 'center', 
    lineHeight: 24, 
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  exploreButton: {
    backgroundColor: '#be9613',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#a78516',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  exploreButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default FavoritesScreen;