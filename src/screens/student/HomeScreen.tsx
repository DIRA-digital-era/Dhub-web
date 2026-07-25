// src/screens/student/HomeScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DiraBranding } from '../../components/DiraBranding';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../utils/supabaseClient';

import ListingCard from '../../components/ListingCard';
import { NetworkDisconnectedScreen } from '../../components/NetworkDisconnectedScreen';
import { fetchListings, ListingFilters, ListingSummary } from '../../utils/listings';

export type UserLocation = { lat: number; lng: number };

import { useTranslation } from 'react-i18next';

const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  /* ---------------- STATE ---------------- */
  const [search, setSearch] = useState('');
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [requestLocation, setRequestLocation] = useState('');
  const [requestBudget, setRequestBudget] = useState('');
  const [requestDetails, setRequestDetails] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

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
    if (!user) return;

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false);
      setUnreadCount(count || 0);
    };

    fetchUnread();

    const channel = supabase
      .channel(`student_notifs_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` }, fetchUnread)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

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

      if (reset) {
        logSearchAnalytics(filters);
      }

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

  const logSearchAnalytics = async (filtersToLog: any) => {
    try {
      await supabase.from('search_analytics').insert({
        user_id: user?.id,
        search_text: filtersToLog.search || null,
        city: filtersToLog.city || null,
        rooms: filtersToLog.rooms ? String(filtersToLog.rooms) : null,
        price_range: selectedPrice !== 'All' ? selectedPrice : null,
        listing_type: filtersToLog.listing_type || null,
        stay_type: filtersToLog.stay_type || null,
      });
    } catch (err) {
      console.warn('Failed to log search analytics:', err);
    }
  };

  const submitHousingRequest = async () => {
    if (!requestLocation.trim() || !requestDetails.trim()) {
      Alert.alert('Missing Details', 'Please provide a location and requirements.');
      return;
    }
    setSubmittingRequest(true);
    try {
      const { error } = await supabase.from('housing_requests').insert({
        user_id: user?.id,
        location: requestLocation,
        budget: requestBudget,
        details: requestDetails,
      });
      if (error) throw error;
      Alert.alert('Request Sent', 'We have received your request and will notify you when a matching property becomes available!');
      setRequestModalVisible(false);
      setRequestLocation('');
      setRequestBudget('');
      setRequestDetails('');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to submit request. Please try again.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  function handleListingPress(id: string) {
    navigation.navigate('ListingDetails', { listingId: id });
  }

  function resultsText() {
    if (loading) return t('common.loading');
    if (!listings.length) return t('home.no_listings');
    return `${listings.length} ${t('home.listings_available')}`;
  }

  /* ---------------- RENDER ---------------- */
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('home.title')}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>{t('home.subtitle')}</Text>
        </View>
        <TouchableOpacity
          style={styles.notificationBtn}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Ionicons name="notifications-outline" size={28} color={colors.primary} />
          {unreadCount > 0 && <View style={[styles.badge, { backgroundColor: colors.error, borderColor: colors.background }]} />}
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchInputContainer, { backgroundColor: colors.card }]}>
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t('home.search_placeholder')}
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={colors.textSecondary}
          />
        </View>
        <TouchableOpacity style={[styles.filterButton, { backgroundColor: colors.primary }]} onPress={() => setFilterModalVisible(true)}>
          <Text style={styles.filterButtonText}>{t('home.filter_title')}</Text>
        </TouchableOpacity>
      </View>


      {/* Results */}
      <View style={styles.resultsContainer}>
        <Text style={[styles.resultsText, { color: colors.textSecondary }]}>{resultsText()}</Text>
      </View>

      {/* Listings */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : errorMsg ? (
        <View style={styles.emptyState}>
          {errorMsg.includes('connection') || errorMsg.includes('network') || errorMsg.includes('fetch') ? (
            <NetworkDisconnectedScreen onRefresh={() => loadListings(true)} refreshing={loading} fullScreen={false} />
          ) : (
            <Text style={[styles.emptyStateText, { color: colors.textSecondary, marginBottom: 20 }]}>{errorMsg}</Text>
          )}
          <TouchableOpacity style={[styles.requestButton, { backgroundColor: colors.card, borderColor: colors.primary, paddingHorizontal: 20 }]} onPress={() => setRequestModalVisible(true)}>
            <Ionicons name="home-outline" size={18} color={colors.primary} />
            <Text style={[styles.requestButtonText, { color: colors.primary }]}>Can't find what you're looking for?</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={listings}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ListingCard listing={item} role="student" onPress={() => handleListingPress(item.id)} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={loading && listings.length > 0}
              onRefresh={() => loadListings(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listingsContainer}
          showsVerticalScrollIndicator={false}
          onEndReached={() => hasMore && loadListings(false)}
          onEndReachedThreshold={0.6}
          ListFooterComponent={
            <View style={{ paddingBottom: 20 }}>
              <View style={[styles.requestContainer, { marginBottom: 24, marginTop: 12 }]}>
                <TouchableOpacity style={[styles.requestButton, { backgroundColor: colors.card, borderColor: colors.primary }]} onPress={() => setRequestModalVisible(true)}>
                  <Ionicons name="home-outline" size={18} color={colors.primary} />
                  <Text style={[styles.requestButtonText, { color: colors.primary }]}>Can't find what you're looking for?</Text>
                </TouchableOpacity>
              </View>
              {loadingMore && <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} />}
              <DiraBranding />
            </View>
          }
        />
      )}

      {/* Filter Modal */}
      <Modal visible={filterModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('home.filter_title')}</Text>

            <FilterRow label={t('listing.city')} options={cities} value={selectedCity} onSelect={setSelectedCity} t={t} colors={colors} />
            <FilterRow label={t('listing.rooms')} options={roomOptions} value={selectedRooms} onSelect={setSelectedRooms} t={t} colors={colors} />
            <FilterRow label={t('home.price_range')} options={priceRanges} value={selectedPrice} onSelect={setSelectedPrice} t={t} colors={colors} />
            <FilterRow label={t('home.listing_type')} options={listingTypes} value={selectedListingType} onSelect={setSelectedListingType} t={t} colors={colors} />
            <FilterRow label={t('home.stay_type')} options={stayTypes} value={selectedStayType} onSelect={setSelectedStayType} t={t} colors={colors} />
            <FilterRow label={t('home.distance')} options={distanceOptions} value={distanceOption} onSelect={setDistanceOption} t={t} colors={colors} />

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.resetButton, { backgroundColor: colors.card }]} onPress={resetFilters}>
                <Text style={[styles.resetButtonText, { color: colors.text }]}>{t('home.reset')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.applyButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setFilterModalVisible(false);
                  flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                  resetListings();
                }}
              >
                <Text style={styles.applyButtonText}>{t('home.apply_filters')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Housing Request Modal */}
      <Modal visible={requestModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'position'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: 40 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>Notify Me</Text>
                  <TouchableOpacity onPress={() => setRequestModalVisible(false)}>
                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={{ color: colors.textSecondary, marginBottom: 20, fontSize: 15, lineHeight: 22 }}>
                  Fill out the details of the property you need. We'll search for it and notify you as soon as it's available!
                </Text>

                <Text style={[styles.filterLabel, { color: colors.text }]}>Preferred Location</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5', color: colors.text, borderColor: colors.border }]}
                  placeholder="e.g., Molyko, Buea"
                  placeholderTextColor={colors.textSecondary}
                  value={requestLocation}
                  onChangeText={setRequestLocation}
                />

                <Text style={[styles.filterLabel, { color: colors.text }]}>Budget (FCFA)</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5', color: colors.text, borderColor: colors.border }]}
                  placeholder="e.g., 20,000 - 40,000 per month"
                  placeholderTextColor={colors.textSecondary}
                  value={requestBudget}
                  onChangeText={setRequestBudget}
                  keyboardType="numeric"
                />

                <Text style={[styles.filterLabel, { color: colors.text }]}>Specific Requirements</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5', color: colors.text, borderColor: colors.border, height: 100 }]}
                  placeholder="e.g., 2 bedrooms, close to campus, water included..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  textAlignVertical="top"
                  value={requestDetails}
                  onChangeText={setRequestDetails}
                />

                <TouchableOpacity
                  style={[styles.applyButton, { backgroundColor: colors.primary, marginTop: 12 }]}
                  onPress={submitHousingRequest}
                  disabled={submittingRequest}
                >
                  {submittingRequest ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.applyButtonText}>Submit Request</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

/* ---------------- FILTER ROW ---------------- */
const FilterRow = ({ label, options, value, onSelect, t, colors }: any) => (
  <View style={{ marginBottom: 24 }}>
    <Text style={[styles.filterLabel, { color: colors.text }]}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {options.map((o: string) => {
        // Localize option labels if they match known keys
        let displayValue = o;
        if (o === 'All') displayValue = t('common.all');
        else if (o === 'Near me') displayValue = t('home.near_me');
        else if (['room', 'studio', 'apartment', 'house', 'guest_house', 'hotel'].includes(o)) displayValue = t(`home.types.${o}`);
        else if (['short_term', 'long_term', 'both'].includes(o)) displayValue = t(`home.stays.${o}`);

        return (
          <TouchableOpacity
            key={o}
            style={[styles.filterOption, { backgroundColor: colors.card }, value === o && { backgroundColor: colors.primary }]}
            onPress={() => onSelect(o)}
          >
            <Text style={[styles.filterOptionText, { color: colors.textSecondary }, value === o && styles.filterOptionTextSelected]}>
              {displayValue}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

/* ---------------- STYLES ---------------- */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 24, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#1a1a1a' },
  headerSubtitle: { fontSize: 16, color: '#666', marginTop: 6 },
  notificationBtn: { padding: 4, position: 'relative' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF4444',
    borderWidth: 2,
    borderColor: '#FFF',
  },
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
  applyButtonText: { color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 16 },
  requestContainer: { paddingHorizontal: 24, marginTop: 16 },
  requestButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
  requestButtonText: { fontWeight: '600', fontSize: 14 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 16 },
});

export default HomeScreen;
