// src/screens/student/HomeScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Modal,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import ListingCard from '../../components/ListingCard';
import { fetchListings, ListingFilters, ListingSummary } from '../../utils/listings';

export type UserLocation = { lat: number; lng: number };

const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  /* ---------------- STATE ---------------- */
  const [search, setSearch] = useState('');
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const [selectedCity, setSelectedCity] = useState('All');
  const [selectedRooms, setSelectedRooms] = useState<'All' | '5+' | string>('All');
  const [selectedPrice, setSelectedPrice] = useState('All');
  const [selectedListingType, setSelectedListingType] = useState<'All' | 'room' | 'studio' | 'apartment' | 'house' | 'guest_house' | 'hotel'>('All');
  const [selectedStayType, setSelectedStayType] = useState<'All' | 'short_term' | 'long_term' | 'both'>('All');

  // Distance/Radius filter
  const [distanceOption, setDistanceOption] = useState<'All' | 'Near me' | '500m' | '1km' | '5km' | '10km' | '20km' | '100km'>('All');
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [radiusMeters, setRadiusMeters] = useState<number | undefined>(undefined);

  const flatListRef = useRef<FlatList<ListingSummary>>(null);

  /* ---------------- FILTER OPTIONS ---------------- */
  const cities = ['All', 'Buea', 'Douala', 'Yaoundé', 'Limbe', 'Bamenda'];
  const roomOptions = ['All', '1', '2', '3', '4', '5+'];
  const priceRanges = ['All', '0-50,000', '50,000-100,000', '100,000-200,000', '200,000-500,000', '500,000+'];
  const listingTypes = ['All', 'room', 'studio', 'apartment', 'house', 'guest_house', 'hotel'];
  const stayTypes = ['All', 'short_term', 'long_term', 'both'];
  const distanceOptions = ['All', 'Near me', '500m', '1km', '5km', '10km', '20km', '100km'];

  /* ---------------- LOCATION ---------------- */
  async function requestUserLocation(): Promise<UserLocation | null> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      let finalStatus = status;
      if (status !== 'granted') {
        const req = await Location.requestForegroundPermissionsAsync();
        finalStatus = req.status;
      }
      if (finalStatus !== 'granted') {
        if (Platform.OS === 'ios') Linking.openURL('app-settings:');
        else Linking.openSettings();
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (err) {
      console.warn('Location error:', err);
      return null;
    }
  }

  /* ---------------- FETCH LOGIC ---------------- */
  useEffect(() => {
    const debounce = setTimeout(() => resetListings(), 300);
    return () => clearTimeout(debounce);
  }, [search, selectedCity, selectedRooms, selectedPrice, selectedListingType, selectedStayType, radiusMeters]);

  async function resetListings() {
    setOffset(0);
    setHasMore(true);
    setListings([]);
    await loadListings(true);
  }

  async function loadListings(reset: boolean = false) {
    if ((loading && reset) || (!hasMore && !reset) || loadingMore) return;

    try {
      reset ? setLoading(true) : setLoadingMore(true);

      // Convert distanceOption to meters
      let radius: number | undefined;
      if (distanceOption !== 'All') {
        if (!userLocation && distanceOption === 'Near me') {
          const loc = await requestUserLocation();
          if (!loc) {
            setRadiusMeters(undefined);
            setUserLocation(null);
          } else setUserLocation(loc);
        }

        switch (distanceOption) {
          case 'Near me': radius = 500; break;
          case '500m': radius = 500; break;
          case '1km': radius = 1000; break;
          case '5km': radius = 5000; break;
          case '10km': radius = 10000; break;
          case '20km': radius = 20000; break;
          case '100km': radius = 100000; break;
          default: radius = undefined;
        }
      }

      const priceFilter = parsePriceRange(selectedPrice);

      const filters: ListingFilters = {
        search,
        city: selectedCity !== 'All' ? selectedCity : undefined,
        rooms: selectedRooms === 'All' ? undefined : selectedRooms === '5+' ? '5+' : Number(selectedRooms),
        minPrice: priceFilter?.min,
        maxPrice: priceFilter?.max,
        availableOnly: true,
        boostedFirst: true,
        limit: 50,
        offset,
        listing_type: selectedListingType !== 'All' ? selectedListingType : undefined,
        stay_type: selectedStayType !== 'All' ? selectedStayType : undefined,
        lat: userLocation?.lat,
        lng: userLocation?.lng,
        radius_m: radius,
      };

      const data = await fetchListings(filters);

      if (reset) setListings(data);
      else setListings(prev => {
        const ids = new Set(prev.map(l => l.id));
        return [...prev, ...data.filter(l => !ids.has(l.id))];
      });

      if (data.length < 50) setHasMore(false);
      else setOffset(prev => prev + data.length);

    } catch (err) {
      console.error('Error loading listings:', err);
      if (reset) setListings([]);
      setErrorMsg('Unable to load listings. Check your connection.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  /* ---------------- HELPERS ---------------- */
  function parsePriceRange(range: string) {
    if (range === 'All') return null;
    if (range === '500,000+') return { min: 500000 };
    const [min, max] = range.split('-').map(v => Number(v.replace(/,/g, '')));
    return { min, max };
  }

  function resetFilters() {
    setSelectedCity('All');
    setSelectedRooms('All');
    setSelectedPrice('All');
    setSelectedListingType('All');
    setSelectedStayType('All');
    setDistanceOption('All');
    setRadiusMeters(undefined);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    resetListings();
  }

  function handleListingPress(id: string) {
    navigation.navigate('ListingDetails', { listingId: id });
  }

  function resultsText() {
    if (loading) return 'Finding your perfect home...';
    if (!listings.length) return 'No listings found';
    return `${listings.length} listing${listings.length > 1 ? 's' : ''} available`;
  }

  /* ---------------- RENDER ---------------- */
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Find Your Perfect Home</Text>
        <Text style={styles.headerSubtitle}>Student accommodation across Cameroon</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search city or listing..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#999"
          />
        </View>
        <TouchableOpacity style={styles.filterButton} onPress={() => setFilterModalVisible(true)}>
          <Text style={styles.filterButtonText}>Filters</Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      <View style={styles.resultsContainer}>
        <Text style={styles.resultsText}>{resultsText()}</Text>
      </View>

      {/* Listings */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#B8860B" />
        </View>
      ) : errorMsg ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{errorMsg}</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={listings}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ListingCard listing={item} role="student" onPress={() => handleListingPress(item.id)} />
          )}
          contentContainerStyle={styles.listingsContainer}
          showsVerticalScrollIndicator={false}
          onEndReached={() => hasMore && loadListings(false)}
          onEndReachedThreshold={0.6}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 20 }} /> : null}
        />
      )}

      {/* Filter Modal */}
      <Modal visible={filterModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filter Listings</Text>

            <FilterRow label="City" options={cities} value={selectedCity} onSelect={setSelectedCity} />
            <FilterRow label="Rooms" options={roomOptions} value={selectedRooms} onSelect={setSelectedRooms} />
            <FilterRow label="Price" options={priceRanges} value={selectedPrice} onSelect={setSelectedPrice} />
            <FilterRow label="Type" options={listingTypes} value={selectedListingType} onSelect={setSelectedListingType} />
            <FilterRow label="Stay" options={stayTypes} value={selectedStayType} onSelect={setSelectedStayType} />
            <FilterRow label="Distance from me" options={distanceOptions} value={distanceOption} onSelect={setDistanceOption} />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
                <Text style={styles.resetButtonText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyButton}
                onPress={() => {
                  setFilterModalVisible(false);
                  flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                  resetListings();
                }}
              >
                <Text style={styles.applyButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

/* ---------------- FILTER ROW ---------------- */
const FilterRow = ({ label, options, value, onSelect }: any) => (
  <View style={{ marginBottom: 24 }}>
    <Text style={styles.filterLabel}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {options.map((o: string) => (
        <TouchableOpacity
          key={o}
          style={[styles.filterOption, value === o && styles.filterOptionSelected]}
          onPress={() => onSelect(o)}
        >
          <Text style={[styles.filterOptionText, value === o && styles.filterOptionTextSelected]}>{o}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  </View>
);

/* ---------------- STYLES ---------------- */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 24 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#1a1a1a' },
  headerSubtitle: { fontSize: 16, color: '#666', marginTop: 6 },
  searchContainer: { flexDirection: 'row', paddingHorizontal: 24, gap: 12 },
  searchInputContainer: { flex: 1, backgroundColor: '#f8f9fa', borderRadius: 12 },
  searchInput: { padding: 14, fontSize: 16 },
  filterButton: { backgroundColor: '#B8860B', padding: 14, borderRadius: 12 },
  filterButtonText: { color: '#fff', fontWeight: '600' },
  resultsContainer: { paddingHorizontal: 24, paddingVertical: 12 },
  resultsText: { color: '#666' },
  listingsContainer: { paddingHorizontal: 24, paddingBottom: 24 },
  loadingContainer: { flex: 1, justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyStateText: { color: '#666' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 22, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  filterLabel: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  filterOption: { padding: 10, borderRadius: 20, backgroundColor: '#f8f9fa', marginRight: 8 },
  filterOptionSelected: { backgroundColor: '#B8860B' },
  filterOptionText: { color: '#666' },
  filterOptionTextSelected: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 12 },
  resetButton: { flex: 1, padding: 14, backgroundColor: '#eee', borderRadius: 12 },
  resetButtonText: { textAlign: 'center' },
  applyButton: { flex: 1, padding: 14, backgroundColor: '#B8860B', borderRadius: 12 },
  applyButtonText: { color: '#fff', textAlign: 'center' },
});

export default HomeScreen;
