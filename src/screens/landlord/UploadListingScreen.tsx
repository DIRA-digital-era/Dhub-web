// src/screens/landlord/UploadListingScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
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
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import MapPickerModal from '../../components/MapPickerModal';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../utils/supabaseClient';
import { MediaItem } from '../../types';
import { requestLocationPermission } from '../../utils/location';
import { uploadListingMedia } from '../../utils/upload';

const { width } = Dimensions.get('window');

const UploadListingScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    price: '',
    address: '',
    city: '',
    rooms: '',
    latitude: null as number | null,
    longitude: null as number | null,
    terms: `Respectful conduct is expected. Tenants must follow good practices while staying at the property. Add any specific rules or policies below:`,
  });

  const [media, setMedia] = useState<MediaItem[]>([]);

  const handleInputFocus = (inputName: string) => {
    setFocusedInput(inputName);
    // Small delay to ensure keyboard is up before scrolling
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 200, animated: true });
    }, 100);
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
        })
        .select()
        .single();

      if (insertError || !listing) {
        throw new Error(insertError?.message || "Failed to create listing record");
      }

      const listingId = listing.id;

      // 2. Prepare atomic media uploads using the listingId
      const uploadPromises = media.map(async (item) => {
        const ext = item.type === 'image' ? 'webp' : 'mp4';
        const fileName = `listings/${listingId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        
        return uploadListingMedia(
          item.url,
          fileName,
          item.type,
          listingId,
          item.type === 'video' ? item.thumbUrl : undefined,
          item.mimeType,
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
    } finally {
      setLoading(false);
    }
  };

  const renderMediaItem = ({ item, index }: { item: MediaItem; index: number }) => (
    <View style={styles.mediaItemWrapper}>
      <View style={styles.imageContainer}>
        <Image source={{ uri: item.thumbUrl }} style={styles.mediaImage} />
        {item.type === 'video' && (
          <View style={styles.videoIconContainer}>
            <Ionicons name="play-circle" size={32} color="#FFFFFF" />
          </View>
        )}
        <TouchableOpacity
          style={styles.removeImageBtn}
          onPress={() => removeMedia(index)}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
      <View style={styles.mediaBadge}>
        <Text style={styles.mediaBadgeText}>{index + 1}</Text>
      </View>
    </View>
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
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
                <Ionicons name="images-outline" size={20} color="#D4AF37" />
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
                  <Ionicons name="camera-outline" size={32} color="#D4AF37" />
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
                <Ionicons name="home-outline" size={20} color="#D4AF37" />
                <Text style={styles.sectionTitle}>Basic Information</Text>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Property Title <Text style={styles.requiredStar}>*</Text></Text>
                <TextInput
                  style={[styles.input, focusedInput === 'title' && styles.inputFocused]}
                  value={form.title}
                  onChangeText={(t) => setForm((p) => ({ ...p, title: t }))}
                  placeholder="e.g., Modern Apartment in Bonapriso"
                  placeholderTextColor="#666666"
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
                  placeholderTextColor="#666666"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  onFocus={() => handleInputFocus('description')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, styles.halfWidthLeft]}>
                  <Text style={styles.label}>Monthly Price (FCFA) <Text style={styles.requiredStar}>*</Text></Text>
                  <TextInput
                    style={[styles.input, focusedInput === 'price' && styles.inputFocused]}
                    value={form.price}
                    onChangeText={(t) => setForm((p) => ({ ...p, price: t }))}
                    placeholder="150000"
                    placeholderTextColor="#666666"
                    keyboardType="numeric"
                    onFocus={() => handleInputFocus('price')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>

                <View style={[styles.inputGroup, styles.halfWidthRight]}>
                  <Text style={styles.label}>Number of Rooms</Text>
                  <TextInput
                    style={[styles.input, focusedInput === 'rooms' && styles.inputFocused]}
                    value={form.rooms}
                    onChangeText={(t) => setForm((p) => ({ ...p, rooms: t }))}
                    placeholder="3"
                    placeholderTextColor="#666666"
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
                <Ionicons name="location-outline" size={20} color="#D4AF37" />
                <Text style={styles.sectionTitle}>Location</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Street Address <Text style={styles.requiredStar}>*</Text></Text>
                <TextInput
                  style={[styles.input, focusedInput === 'address' && styles.inputFocused]}
                  value={form.address}
                  onChangeText={(t) => setForm((p) => ({ ...p, address: t }))}
                  placeholder="123 Rue de la Paix"
                  placeholderTextColor="#666666"
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
                  placeholderTextColor="#666666"
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
                <Ionicons name="map-outline" size={22} color="#D4AF37" />
                {mapLoading ? (
                  <ActivityIndicator style={{ marginLeft: 12 }} color="#D4AF37" />
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
                <Ionicons name="document-text-outline" size={20} color="#D4AF37" />
                <Text style={styles.sectionTitle}>Terms & Conditions <Text style={styles.requiredStar}>*</Text></Text>
              </View>
              
              <TextInput
                style={[styles.input, styles.termsArea, focusedInput === 'terms' && styles.inputFocused]}
                value={form.terms}
                onChangeText={(t) => setForm((p) => ({ ...p, terms: t }))}
                multiline
                numberOfLines={6}
                placeholder="Enter your terms and conditions..."
                placeholderTextColor="#666666"
                textAlignVertical="top"
                onFocus={() => handleInputFocus('terms')}
                onBlur={() => setFocusedInput(null)}
              />
              
              <View style={styles.termsHint}>
                <Ionicons name="information-circle-outline" size={16} color="#888888" />
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
                <ActivityIndicator size="small" color="#1A1A1A" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#1A1A1A" />
                  <Text style={styles.submitBtnText}>Create Property Listing</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.bottomPadding} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0A0A0A' 
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: { 
    color: '#FFFFFF', 
    fontSize: 18, 
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  sectionSubtitle: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 16,
    marginLeft: 28,
  },
  inputGroup: { 
    marginBottom: 16 
  },
  label: { 
    color: '#FFFFFF', 
    fontSize: 14, 
    fontWeight: '600', 
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  requiredStar: {
    color: '#D4AF37',
    fontSize: 14,
  },
  input: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputFocused: {
    borderColor: '#D4AF37',
    backgroundColor: '#333333',
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
    borderColor: '#D4AF37',
    borderStyle: 'dashed',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    marginRight: 12,
  },
  addPhotoText: { 
    color: '#D4AF37', 
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
    borderColor: '#D4AF37',
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
    backgroundColor: '#D4AF37',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaBadgeText: {
    color: '#1A1A1A',
    fontSize: 12,
    fontWeight: 'bold',
  },
  locationPicker: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3A3A3A',
    marginTop: 8,
  },
  locationPickerText: { 
    color: '#FFFFFF', 
    marginLeft: 12, 
    fontSize: 15,
    flex: 1,
  },
  termsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  hintText: {
    color: '#888888',
    fontSize: 13,
    flex: 1,
  },
  submitBtn: {
    backgroundColor: '#D4AF37',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  submitBtnDisabled: { 
    opacity: 0.6,
  },
  submitBtnText: { 
    color: '#1A1A1A', 
    fontSize: 18, 
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bottomPadding: {
    height: 40,
  },
});

export default UploadListingScreen;