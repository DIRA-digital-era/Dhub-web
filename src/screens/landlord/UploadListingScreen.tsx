// src/screens/landlord/UploadListingScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapPickerModal from '../../components/MapPickerModal';
import { useAuth } from '../../hooks/useAuth';
import { MediaItem } from '../../types';
import { requestLocationPermission } from '../../utils/location';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../utils/supabaseClient';
import { uploadListingMedia } from '../../utils/upload';

const { width } = Dimensions.get('window');

const UploadListingScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);

  const { colors: themeColors, isDark } = useTheme();

  const colors = React.useMemo(() => ({
    background: themeColors.background,
    card: themeColors.card,
    border: themeColors.border,
    primary: themeColors.primary,
    text: themeColors.text,
    textSecondary: themeColors.textSecondary,
    inputBg: isDark ? '#2A2A2A' : '#f0f0f0',
    inputFocusedBg: isDark ? '#333333' : '#ffffff',
  }), [themeColors, isDark]);

  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    price: '',
    address: '',
    city: '',
    rooms: '',
    latitude: null as number | null,
    longitude: null as number | null,
    terms: '',
    listing_type: 'apartment',
    stay_type: 'long_term',
    price_unit: 'per_month' as 'per_month' | 'per_night',
  });

  // Auto-switch price unit when listing type changes
  const handleListingTypeChange = (value: string) => {
    const isDailyType = value === 'guest_house' || value === 'hotel';
    setForm(p => ({
      ...p,
      listing_type: value,
      price_unit: isDailyType ? 'per_night' : p.price_unit,
      stay_type: isDailyType ? 'short_term' : p.stay_type,
    }));
  };

  const LISTING_TYPES = [
    { label: 'Room', value: 'room' },
    { label: 'Studio', value: 'studio' },
    { label: 'Apartment', value: 'apartment' },
    { label: 'Guest House', value: 'guest_house' },
    { label: 'Hotel', value: 'hotel' },
  ];

  const STAY_TYPES = [
    { label: 'Short Term', value: 'short_term' },
    { label: 'Long Term', value: 'long_term' },
    { label: 'Both', value: 'both' },
  ];

  useEffect(() => {
    if (!form.terms || form.terms.trim().length === 0) {
      setForm((p) => ({ ...p, terms: t('booking.default_terms_template') }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [media, setMedia] = useState<MediaItem[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleInputFocus = (inputName: string) => {
    setFocusedInput(inputName);
    // Let the ScrollView handle natural scrolling, just ensure enough padding at bottom
  };

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission Needed',
        'Enable media permissions to upload images and videos.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newMedia: MediaItem[] = [];

      for (const asset of result.assets) {
        let thumbUrl = asset.uri;

        if (asset.type === 'video') {
          try {
            const { uri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
            thumbUrl = uri;
          } catch (err) {
            console.warn('Failed to generate video thumbnail:', err);
          }
        }

        newMedia.push({
          type: asset.type as 'image' | 'video',
          url: asset.uri,
          thumbUrl,
          mimeType: asset.mimeType,
        });
      }

      setMedia((prev) => [...prev, ...newMedia]);
    }
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const openLocationPicker = async () => {
    setMapLoading(true);
    const loc = await requestLocationPermission();
    if (!loc) {
      setMapLoading(false);
      return;
    }
    setShowMap(true);
  };

  const generateMarker = (text: string) => {
    const ts = Date.now().toString().slice(-6);
    const userIdPart = user?.id?.slice(0, 6) || 'xxxxxx';
    return `${ts}-${userIdPart}`;
  };

  const handleSubmit = async () => {
    if (!user) return;

    if (!form.title || !form.price || !form.city || !form.address) {
      Alert.alert('Missing Information', 'Please fill in all required fields marked with *');
      return;
    }

    if (!form.terms || form.terms.trim().length < 10) {
      Alert.alert('Terms Required', 'Please provide the Terms & Conditions for this listing.');
      return;
    }

    if (form.latitude === null || form.longitude === null) {
      Alert.alert('Location Required', 'Please select the listing location on the map.');
      return;
    }

    setLoading(true);
    try {
      const marker = generateMarker(form.terms);

      // 1. Create the listing record first to get a valid ID
      const { data: listing, error: insertError } = await supabase
        .from('listings')
        .insert({
          landlord_id: user.id,
          title: form.title,
          description: form.description,
          price: Number(form.price),
          address: form.address,
          city: form.city,
          latitude: form.latitude,
          longitude: form.longitude,
          rooms: form.rooms ? Number(form.rooms) : null,
          media: [], // Start with empty media
          available: true,
          terms_text: form.terms,
          terms_marker: marker,
          listing_type: form.listing_type,
          stay_type: form.stay_type,
          price_unit: form.price_unit,
        })
        .select()
        .single();

      if (insertError || !listing) {
        throw new Error(insertError?.message || "Failed to create listing record");
      }

      const listingId = listing.id;

      // 2. Prepare atomic media uploads using the listingId
      setUploadProgress(new Array(media.length).fill(0));
      abortControllerRef.current = new AbortController();

      const uploadPromises = media.map(async (item, index) => {
        const ext = item.type === 'image' ? 'webp' : 'mp4';
        const fileName = `listings/${listingId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        
        return uploadListingMedia(
          item.url,
          fileName,
          item.type,
          listingId,
          item.type === 'video' ? item.thumbUrl : undefined,
          item.mimeType,
          (progress) => {
            setUploadProgress(prev => {
              const newProgress = [...prev];
              newProgress[index] = progress;
              return newProgress;
            });
          },
          abortControllerRef.current!.signal
        );
      });

      // Execute all uploads in parallel
      const uploadedMedia = await Promise.all(uploadPromises);

      // 3. Final commit: update the listing with the uploaded media array
      const { error: updateError } = await supabase
        .from('listings')
        .update({ media: uploadedMedia })
        .eq('id', listingId);

      if (updateError) {
        throw new Error("Media upload succeeded, but failed to link to property: " + updateError.message);
      }

      Alert.alert('Success!', 'Your property listing has been created successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      console.error('Error creating listing:', err);
      Alert.alert('Error', err.message || 'Failed to create listing. Please try again.');
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const renderMediaItem = ({ item, index }: { item: MediaItem; index: number }) => (
    <View style={styles.mediaItemWrapper}>
      <View style={styles.imageContainer}>
        <Image source={{ uri: item.thumbUrl }} style={styles.mediaImage} />
        {item.type === 'video' && (
          <View style={styles.videoIconContainer}>
            <Ionicons name="play-circle" size={32} color={colors.text} />
          </View>
        )}
        <TouchableOpacity
          style={styles.removeImageBtn}
          onPress={() => removeMedia(index)}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.mediaBadge}>
        <Text style={styles.mediaBadgeText}>{index + 1}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
      
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add New Property</Text>
        <View style={styles.headerRight} />
      </View>

      <MapPickerModal
        visible={showMap}
        onClose={() => {
          setShowMap(false);
          setMapLoading(false);
        }}
        onLocationSelected={(coords) => {
          setForm((prev) => ({
            ...prev,
            latitude: coords.latitude,
            longitude: coords.longitude,
          }));
          setShowMap(false);
          setMapLoading(false);
        }}
      />

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
            {/* Media Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="images-outline" size={20} color={colors.primary} />
                <Text style={styles.sectionTitle}>Property Photos & Videos</Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                Add up to 10 photos or videos of your property
              </Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={styles.mediaList}
              >
                <TouchableOpacity 
                  style={styles.addPhotoBtn} 
                  onPress={pickMedia}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera-outline" size={32} color={colors.primary} />
                  <Text style={styles.addPhotoText}>Add Media</Text>
                </TouchableOpacity>

                {media.map((item, index) => (
                  <View key={`${item.url}-${index}`}>
                    {renderMediaItem({ item, index })}
                  </View>
                ))}
              </ScrollView>
            </View>

            {/* Basic Info */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="home-outline" size={20} color={colors.primary} />
                <Text style={styles.sectionTitle}>Basic Information</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Listing Type <Text style={styles.requiredStar}>*</Text></Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                  {LISTING_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={[styles.chip, form.listing_type === type.value && styles.chipSelected]}
                      onPress={() => handleListingTypeChange(type.value)}
                    >
                      <Text style={[styles.chipText, form.listing_type === type.value && styles.chipTextSelected]}>
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Stay Type <Text style={styles.requiredStar}>*</Text></Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                  {STAY_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={[styles.chip, form.stay_type === type.value && styles.chipSelected]}
                      onPress={() => setForm(p => ({ ...p, stay_type: type.value }))}
                    >
                      <Text style={[styles.chipText, form.stay_type === type.value && styles.chipTextSelected]}>
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Property Title <Text style={styles.requiredStar}>*</Text></Text>
                <TextInput
                  style={[styles.input, focusedInput === 'title' && styles.inputFocused]}
                  value={form.title}
                  onChangeText={(t) => setForm((p) => ({ ...p, title: t }))}
                  placeholder="e.g., Modern Apartment in Bonapriso"
                  placeholderTextColor={colors.textSecondary}
                  onFocus={() => handleInputFocus('title')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea, focusedInput === 'description' && styles.inputFocused]}
                  value={form.description}
                  onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
                  placeholder="Describe your property's features, location, and amenities..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  onFocus={() => handleInputFocus('description')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, styles.halfWidthLeft]}>
                  <Text style={styles.label}>
                    {form.price_unit === 'per_night' ? 'Daily Price (FCFA)' : 'Monthly Price (FCFA)'}{' '}
                    <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, focusedInput === 'price' && styles.inputFocused]}
                    value={form.price}
                    onChangeText={(t) => setForm((p) => ({ ...p, price: t }))}
                    placeholder={form.price_unit === 'per_night' ? '15000' : '150000'}
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    onFocus={() => handleInputFocus('price')}
                    onBlur={() => setFocusedInput(null)}
                  />
                  {/* Price Unit Toggle */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    {(['per_month', 'per_night'] as const).map((unit) => (
                      <TouchableOpacity
                        key={unit}
                        style={[
                          styles.chip,
                          { paddingHorizontal: 10, paddingVertical: 6 },
                          form.price_unit === unit && styles.chipSelected,
                        ]}
                        onPress={() => setForm(p => ({ ...p, price_unit: unit }))}
                      >
                        <Text style={[styles.chipText, { fontSize: 11 }, form.price_unit === unit && styles.chipTextSelected]}>
                          {unit === 'per_month' ? '/ Month' : '/ Night'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={[styles.inputGroup, styles.halfWidthRight]}>
                  <Text style={styles.label}>Number of Rooms</Text>
                  <TextInput
                    style={[styles.input, focusedInput === 'rooms' && styles.inputFocused]}
                    value={form.rooms}
                    onChangeText={(t) => setForm((p) => ({ ...p, rooms: t }))}
                    placeholder="3"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    onFocus={() => handleInputFocus('rooms')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              </View>
            </View>

            {/* Location */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="location-outline" size={20} color={colors.primary} />
                <Text style={styles.sectionTitle}>Location</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Street Address <Text style={styles.requiredStar}>*</Text></Text>
                <TextInput
                  style={[styles.input, focusedInput === 'address' && styles.inputFocused]}
                  value={form.address}
                  onChangeText={(t) => setForm((p) => ({ ...p, address: t }))}
                  placeholder="123 Rue de la Paix"
                  placeholderTextColor={colors.textSecondary}
                  onFocus={() => handleInputFocus('address')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>City <Text style={styles.requiredStar}>*</Text></Text>
                <TextInput
                  style={[styles.input, focusedInput === 'city' && styles.inputFocused]}
                  value={form.city}
                  onChangeText={(t) => setForm((p) => ({ ...p, city: t }))}
                  placeholder="Douala"
                  placeholderTextColor={colors.textSecondary}
                  onFocus={() => handleInputFocus('city')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>

              <TouchableOpacity
                style={[styles.locationPicker, mapLoading && styles.submitBtnDisabled]}
                onPress={openLocationPicker}
                disabled={mapLoading}
                activeOpacity={0.7}
              >
                <Ionicons name="map-outline" size={22} color={colors.primary} />
                {mapLoading ? (
                  <ActivityIndicator style={{ marginLeft: 12 }} color={colors.primary} />
                ) : form.latitude && form.longitude ? (
                  <Text style={styles.locationPickerText}>
                    Selected: {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
                  </Text>
                ) : (
                  <Text style={styles.locationPickerText}>Tap to select location on map</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Terms */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                <Text style={styles.sectionTitle}>Terms & Conditions <Text style={styles.requiredStar}>*</Text></Text>
              </View>
              
              <TextInput
                style={[styles.input, styles.termsArea, focusedInput === 'terms' && styles.inputFocused]}
                value={form.terms}
                onChangeText={(t) => setForm((p) => ({ ...p, terms: t }))}
                multiline
                numberOfLines={6}
                placeholder="Enter your terms and conditions..."
                placeholderTextColor={colors.textSecondary}
                textAlignVertical="top"
                onFocus={() => handleInputFocus('terms')}
                onBlur={() => setFocusedInput(null)}
              />
              
              <View style={styles.termsHint}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.hintText}>
                  Students will review and agree to these terms before booking
                </Text>
              </View>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.background} />
                  <Text style={styles.submitBtnText}>Create Property Listing</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.bottomPadding} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Upload Progress Overlay */}
      {loading && (
        <View style={styles.overlay}>
          <View style={styles.progressCard}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
            <Text style={styles.progressTitle}>Uploading Media...</Text>
            <Text style={styles.progressSubtitle}>
              Please do not close the app or turn off your screen.
            </Text>

            <View style={{ width: '100%' }}>
              <View style={styles.progressBarContainer}>
                <Text style={styles.progressLabel}>
                  Uploading {media.length} file{media.length !== 1 ? 's' : ''}... 
                  ({( (uploadProgress.reduce((a,b)=>a+b,0) / Math.max(1, media.length)) * 100 ).toFixed(0)}%)
                </Text>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${(uploadProgress.reduce((a,b)=>a+b,0) / Math.max(1, media.length)) * 100}%` }]} />
                </View>
              </View>
              
              <TouchableOpacity 
                style={[styles.submitBtn, { backgroundColor: '#E74C3C', marginTop: 24, width: '100%' }]} 
                onPress={handleCancelUpload}
              >
                <Text style={styles.submitBtnText}>Cancel Upload</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.background 
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { 
    color: colors.text, 
    fontSize: 20, 
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  headerRight: {
    width: 40,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 200, // Extra padding to prevent keyboard overlap
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: { 
    color: colors.text, 
    fontSize: 18, 
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 16,
    marginLeft: 28,
  },
  inputGroup: { 
    marginBottom: 16 
  },
  label: { 
    color: colors.text, 
    fontSize: 14, 
    fontWeight: '600', 
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  requiredStar: {
    color: colors.primary,
    fontSize: 14,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.inputFocusedBg,
  },
  chipScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: colors.background,
  },
  textArea: { 
    minHeight: 100,
    textAlignVertical: 'top',
  },
  termsArea: {
    minHeight: 150,
    textAlignVertical: 'top',
  },
  row: { 
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  halfWidthLeft: {
    flex: 1,
    marginRight: 4,
  },
  halfWidthRight: {
    flex: 1,
    marginLeft: 4,
  },
  mediaList: {
    paddingRight: 16,
    gap: 8,
  },
  mediaItemWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  addPhotoBtn: {
    width: 120,
    height: 120,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginRight: 12,
  },
  addPhotoText: { 
    color: colors.primary, 
    fontSize: 12, 
    marginTop: 8,
    fontWeight: '500',
  },
  imageContainer: { 
    position: 'relative', 
    width: 120, 
    height: 120, 
    borderRadius: 16,
    overflow: 'hidden',
  },
  mediaImage: { 
    width: 120, 
    height: 120, 
    borderRadius: 16,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 16,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  videoIconContainer: {
    position: 'absolute',
    top: 44,
    left: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  mediaBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mediaBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 60,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 8,
    marginTop: 8,
  },
  submitBtnText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
  locationPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationPickerText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    marginLeft: 12,
  },
  termsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  hintText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  progressCard: {
    width: '85%',
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  progressTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  progressSubtitle: {
    color: colors.primary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
  },
  progressBarContainer: {
    width: '100%',
    marginBottom: 16,
  },
  progressLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 8,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: colors.inputBg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
});
export default UploadListingScreen;