// src/screens/landlord/EditListingScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import FullVideoPlayer from '../../components/FullVideoPlayer';
import { MEDIA_BASE_URL } from '../../config/media';
import { useTheme } from '../../context/ThemeContext';
import {
  LandlordStackParamList,
  Listing,
  ListingDetails,
  MediaItem
} from '../../types';
import { supabase } from '../../utils/supabaseClient';
import { uploadListingMedia } from '../../utils/upload';

type EditListingNavigationProp = NativeStackNavigationProp<LandlordStackParamList>;
const { width } = Dimensions.get('window');

const EditListingScreen: React.FC = () => {
  const navigation = useNavigation<EditListingNavigationProp>();
  const route = useRoute();
  const { listingId } = route.params as { listingId: string };

  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [description, setDescription] = useState('');
  const [available, setAvailable] = useState(false);
  const [price, setPrice] = useState('');
  const [rooms, setRooms] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<{ url: string; status?: string } | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    error: themeColors.error,
  }), [themeColors, isDark]);

  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // Fetch listing once on mount
  useEffect(() => {
    const fetchListing = async () => {
      setLoading(true);

      try {
        const { data, error } = await supabase
          .from('listings')
          .select('*')
          .eq('id', listingId)
          .single();

        if (error || !data) {
          Alert.alert('Error', 'Unable to fetch listing details.');
          return;
        }

        // Cast raw Supabase response to your DB row shape
        const row = data as Listing;

        // Map media DB items → full URLs for UI
        const mediaItems: MediaItem[] = Array.isArray(row.media)
          ? (row.media as any[]).map((m: any) => ({
            url: m.url || `${MEDIA_BASE_URL}/${m.key}`,
            type: m.type,
            processing_status: m.processing_status || 'ready',
          }))
          : [];

        const listingDetails: ListingDetails = {
          ...row,
          media: mediaItems,
          ratings: [], // We don't fetch ratings here
        };

        setListing(listingDetails);
        setMedia(mediaItems);
        setDescription(listingDetails.description ?? '');
        setAvailable(listingDetails.available ?? false);
        setPrice(String(listingDetails.price));
        setRooms(listingDetails.rooms ? String(listingDetails.rooms) : '');
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
  }, [listingId]);

  const pickMedia = async () => {
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
          mimeType: asset.mimeType || (asset.type === 'image' ? 'image/jpeg' : 'video/mp4'),
        });
      }
      setMedia((prev) => [...prev, ...newMedia]);
    }
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  // Save metadata update
  const handleUpdate = async () => {
    if (!listing) return;

    const updatedPrice = Number(price);
    const updatedRooms = rooms ? Number(rooms) : null;

    if (isNaN(updatedPrice) || updatedPrice <= 0) {
      Alert.alert('Validation', 'Price must be a number greater than 0.');
      return;
    }

    setSaving(true);

    try {
      // 1. Filter out existing vs new media
      const existingMedia = media.filter(it => it.url.startsWith('http'));
      const newMedia = media.filter(it => !it.url.startsWith('http'));

      // 2. Upload new media atomically
      setUploadProgress(new Array(newMedia.length).fill(0));
      abortControllerRef.current = new AbortController();

      const uploadPromises = newMedia.map(async (item, index) => {
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
          abortControllerRef.current?.signal
        );
      });

      const uploadedResults = await Promise.all(uploadPromises);

      const finalMediaForDB = [
        ...existingMedia.map(m => ({
          url: m.url,
          thumbUrl: m.thumbUrl,
          type: m.type,
          processing_status: m.processing_status || 'ready'
        })),
        ...uploadedResults.map(m => ({
          url: m.url,
          thumbUrl: m.thumbUrl,
          type: m.type,
          processing_status: m.type === 'video' ? 'processing' : 'ready'
        }))
      ];

      const { error } = await supabase
        .from('listings')
        .update({
          description,
          available,
          price: updatedPrice,
          rooms: updatedRooms,
          media: finalMediaForDB,
          updated_at: new Date().toISOString(),
        })
        .eq('id', listingId)
        .eq('landlord_id', listing.landlord_id);

      if (error) {
        Alert.alert('Update Failed', error.message);
        return;
      }

      Alert.alert('Success', 'Your property has been updated.');
      navigation.goBack();
    } catch (err: any) {
      console.error('Update error:', err);
      if (err?.name === 'AbortError') {
        console.log('[EditListing] Upload cancelled by user');
      } else {
        Alert.alert('Error', 'Failed to update property details.');
      }
    } finally {
      setSaving(false);
      setUploadProgress([]);
      abortControllerRef.current = null;
    }
  };

  // Delete the listing row
  const handleDelete = async () => {
    Alert.alert(
      'Delete Property',
      'This will permanently remove your property listing. This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const { error } = await supabase
                .from('listings')
                .delete()
                .eq('id', listingId)
                .eq('landlord_id', listing?.landlord_id);

              if (error) {
                Alert.alert('Delete Failed', error.message);
                return;
              }

              Alert.alert('Deleted', 'Your property has been removed.');
              navigation.goBack();
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const renderMediaItem = ({ item, index }: { item: MediaItem; index: number }) => {
    const isVideo = item.type === 'video';
    const isProcessing = item.processing_status === 'processing';
    const isFailed = item.processing_status === 'failed';
    const previewUrl = item.thumbUrl || item.url;

    return (
      <View style={styles.mediaItemContainer}>
        <TouchableOpacity
          activeOpacity={isProcessing ? 1 : 0.9}
          onPress={() => {
            if (isVideo) setSelectedVideo({ url: item.url, status: item.processing_status });
            else setSelectedImage(item.url);
          }}
        >
          <Image
            source={{ uri: previewUrl }}
            style={styles.mediaImage}
            resizeMode="cover"
          />

          {isVideo && !isProcessing && !isFailed && (
            <View style={styles.videoOverlay}>
              <Ionicons name="play-circle" size={32} color={colors.text} />
            </View>
          )}

          {isVideo && isProcessing && (
            <View style={[styles.videoOverlay, styles.processingOverlay]}>
              <ActivityIndicator size="small" color={colors.text} />
              <Text style={styles.processingText}>Processing...</Text>
            </View>
          )}

          {isVideo && isFailed && (
            <View style={[styles.videoOverlay, styles.failedOverlay]}>
              <Ionicons name="alert-circle" size={24} color={colors.error} />
              <Text style={[styles.processingText, { color: colors.error }]}>Failed</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => removeMedia(index)}
        >
          <Ionicons name="close" size={16} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.mediaBadge}>
          <Text style={styles.mediaBadgeText}>{index + 1}</Text>
        </View>
      </View>
    );
  };

  if (loading || !listing) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading property details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Property</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Media Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="images-outline" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Property Photos</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Tap to preview, drag to reorder (coming soon)
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mediaList}
          >
            <TouchableOpacity
              style={styles.addMediaButton}
              onPress={pickMedia}
            >
              <Ionicons name="add-circle-outline" size={32} color={colors.primary} />
              <Text style={styles.addMediaText}>Add Media</Text>
            </TouchableOpacity>

            {media.map((item, index) => {
              const key = `${item.url}-${index}`;
              return (
                <View key={key}>
                  {renderMediaItem({ item, index })}
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Description Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text-outline" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Description</Text>
          </View>
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your property..."
            placeholderTextColor={colors.textSecondary}
            textAlignVertical="top"
          />
        </View>

        {/* Price & Rooms Section */}
        <View style={styles.row}>
          <View style={[styles.section, styles.halfWidth]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cash-outline" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Price (FCFA)</Text>
            </View>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={price}
              onChangeText={setPrice}
              placeholder="e.g., 150000"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={[styles.section, styles.halfWidth]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="bed-outline" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Rooms</Text>
            </View>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={rooms}
              onChangeText={setRooms}
              placeholder="e.g., 3"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        {/* Availability Switch */}
        <View style={[styles.section, styles.switchSection]}>
          <View style={styles.switchRow}>
            <View style={styles.switchLeft}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Available for Rent</Text>
            </View>
            <Switch
              value={available}
              onValueChange={setAvailable}
              trackColor={{ false: colors.inputBg, true: colors.primary }}
              thumbColor={colors.text}
              ios_backgroundColor={colors.inputBg}
            />
          </View>
          <Text style={styles.switchHint}>
            {available ? 'Property is currently available' : 'Property is marked as unavailable'}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.updateButton, saving && styles.buttonDisabled]}
            onPress={handleUpdate}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color={colors.background} />
                <Text style={styles.updateButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deleteButton, saving && styles.buttonDisabled]}
            onPress={handleDelete}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={20} color={colors.error} />
            <Text style={styles.deleteButtonText}>Delete Property</Text>
          </TouchableOpacity>
        </View>

        {/* Extra padding at bottom */}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Upload Progress Overlay */}
      {saving && uploadProgress.length > 0 && (
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
                  Uploading {uploadProgress.length} file{uploadProgress.length !== 1 ? 's' : ''}...
                  ({((uploadProgress.reduce((a, b) => a + b, 0) / Math.max(1, uploadProgress.length)) * 100).toFixed(0)}%)
                </Text>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${(uploadProgress.reduce((a, b) => a + b, 0) / Math.max(1, uploadProgress.length)) * 100}%` }]} />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.deleteButton, { marginTop: 16, borderColor: colors.error, backgroundColor: 'transparent' }]}
                onPress={() => {
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                  }
                  setSaving(false);
                  setUploadProgress([]);
                }}
              >
                <Ionicons name="close-circle-outline" size={20} color={colors.error} />
                <Text style={[styles.deleteButtonText, { color: colors.error }]}>Cancel Upload</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Video Preview Modal */}
      {selectedVideo && (
        <FullVideoPlayer
          url={selectedVideo.url}
          processingStatus={selectedVideo.status as any}
          onClose={() => setSelectedVideo(null)}
        />
      )}

      {/* Image Preview Modal */}
      <Modal
        visible={!!selectedImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <TouchableOpacity
          style={styles.modalBg}
          activeOpacity={1}
          onPress={() => setSelectedImage(null)}
        >
          <View style={styles.modalContent}>
            {selectedImage && (
              <Image
                source={{ uri: selectedImage }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
            )}
            <TouchableOpacity
              style={styles.closeModalBtn}
              onPress={() => setSelectedImage(null)}
            >
              <Ionicons name="close" size={32} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
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
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.text,
    fontSize: 14,
    marginTop: 12,
    opacity: 0.6,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 12,
    marginLeft: 28,
  },
  mediaList: {
    paddingRight: 16,
    gap: 8,
  },
  mediaItemContainer: {
    position: 'relative',
    marginRight: 8,
  },
  mediaImage: {
    width: 140,
    height: 140,
    borderRadius: 12,
    backgroundColor: colors.border,
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  processingOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 4,
  },
  failedOverlay: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    gap: 4,
  },
  processingText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '600',
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,107,107,0.9)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.text,
    zIndex: 10,
  },
  addMediaButton: {
    width: 140,
    height: 140,
    backgroundColor: colors.card,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    marginRight: 12,
  },
  addMediaText: {
    color: colors.primary,
    fontSize: 12,
    marginTop: 8,
    fontWeight: '500',
  },
  mediaVideoContainer: {
    width: 140,
    height: 140,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  mediaBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: colors.primary,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaBadgeText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: colors.inputBg,
    color: colors.text,
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  halfWidth: {
    flex: 1,
    marginBottom: 0,
  },
  switchSection: {
    marginBottom: 24,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchHint: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 12,
    marginLeft: 28,
  },
  buttonContainer: {
    gap: 12,
  },
  updateButton: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  updateButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  deleteButton: {
    backgroundColor: colors.card,
    padding: 18,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.error,
  },
  deleteButtonText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  bottomPadding: {
    height: 30,
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
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: width,
    height: width * 1.5,
  },
  closeModalBtn: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default EditListingScreen;