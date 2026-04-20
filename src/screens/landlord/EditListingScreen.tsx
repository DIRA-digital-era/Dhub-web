// src/screens/landlord/EditListingScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { MEDIA_BASE_URL } from '../../config/media';
import { supabase } from '../../utils/supabaseClient';
import { uploadListingMedia } from '../../utils/upload';
import FullVideoPlayer from '../../components/FullVideoPlayer';
import {
  LandlordStackParamList,
  ListingDetails,
  ListingRow,
  MediaDBItem,
  MediaItem,
} from '../../types';

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
        const row = data as ListingRow;

        // Map media DB items → full URLs for UI
        const mediaItems: MediaItem[] = Array.isArray(row.media)
          ? row.media.map((m: MediaDBItem) => ({
              url: `${MEDIA_BASE_URL}/${m.key}`,
              type: m.type,
              processing_status: (m as any).processing_status || 'ready',
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
      const uploadPromises = newMedia.map(async (item) => {
        const ext = item.type === 'image' ? 'webp' : 'mp4';
        const fileName = `listings/${listingId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        return uploadListingMedia(
          item.url,
          fileName,
          item.type,
          listingId,
          item.type === 'video' ? item.thumbUrl : undefined
        );
      });

      const uploadedResults = await Promise.all(uploadPromises);

      // 3. Combine and transform back to MediaDBItem format for storage
      // Note: uploadListingMedia returns MediaItem with full URLs. 
      // We need to extract the keys or store them in a consistent way.
      // Based on existing code, media in DB stores keys.
      const finalMediaForDB = [
        ...existingMedia.map(m => ({
          key: m.url?.split('/').pop() || `existing-${Math.random()}`,
          type: m.type,
          processing_status: m.processing_status || 'ready'
        })),
        ...uploadedResults.map(m => ({
          key: m.url?.split('/').pop() || `uploaded-${Math.random()}`,
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
      Alert.alert('Error', err.message || 'Failed to update listing');
    } finally {
      setSaving(false);
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
              <Ionicons name="play-circle" size={32} color="#FFFFFF" />
            </View>
          )}

          {isVideo && isProcessing && (
            <View style={[styles.videoOverlay, styles.processingOverlay]}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.processingText}>Processing...</Text>
            </View>
          )}

          {isVideo && isFailed && (
            <View style={[styles.videoOverlay, styles.failedOverlay]}>
              <Ionicons name="alert-circle" size={24} color="#FF6B6B" />
              <Text style={[styles.processingText, { color: '#FF6B6B' }]}>Failed</Text>
            </View>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.removeButton}
          onPress={() => removeMedia(index)}
        >
          <Ionicons name="close" size={16} color="#FFFFFF" />
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
        <ActivityIndicator size="large" color="#D4AF37" />
        <Text style={styles.loadingText}>Loading property details...</Text>
      </View>
    );
  }

  return (
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
            <Ionicons name="images-outline" size={20} color="#D4AF37" />
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
              <Ionicons name="add-circle-outline" size={32} color="#D4AF37" />
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
            <Ionicons name="document-text-outline" size={20} color="#D4AF37" />
            <Text style={styles.sectionTitle}>Description</Text>
          </View>
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your property..."
            placeholderTextColor="#666666"
            textAlignVertical="top"
          />
        </View>

        {/* Price & Rooms Section */}
        <View style={styles.row}>
          <View style={[styles.section, styles.halfWidth]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cash-outline" size={20} color="#D4AF37" />
              <Text style={styles.sectionTitle}>Price (FCFA)</Text>
            </View>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={price}
              onChangeText={setPrice}
              placeholder="e.g., 150000"
              placeholderTextColor="#666666"
            />
          </View>

          <View style={[styles.section, styles.halfWidth]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="bed-outline" size={20} color="#D4AF37" />
              <Text style={styles.sectionTitle}>Rooms</Text>
            </View>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={rooms}
              onChangeText={setRooms}
              placeholder="e.g., 3"
              placeholderTextColor="#666666"
            />
          </View>
        </View>

        {/* Availability Switch */}
        <View style={[styles.section, styles.switchSection]}>
          <View style={styles.switchRow}>
            <View style={styles.switchLeft}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#D4AF37" />
              <Text style={styles.sectionTitle}>Available for Rent</Text>
            </View>
            <Switch
              value={available}
              onValueChange={setAvailable}
              trackColor={{ false: '#2A2A2A', true: '#D4AF37' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#2A2A2A"
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
              <ActivityIndicator size="small" color="#1A1A1A" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#1A1A1A" />
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
            <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
            <Text style={styles.deleteButtonText}>Delete Property</Text>
          </TouchableOpacity>
        </View>

        {/* Extra padding at bottom */}
        <View style={styles.bottomPadding} />
      </ScrollView>

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
  loader: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
  loadingText: {
    color: '#FFFFFF',
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
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  sectionSubtitle: {
    color: '#888888',
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
    backgroundColor: '#2A2A2A',
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
    color: '#FFFFFF',
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
    borderColor: '#FFFFFF',
    zIndex: 10,
  },
  addMediaButton: {
    width: 140,
    height: 140,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D4AF37',
    marginRight: 12,
  },
  addMediaText: {
    color: '#D4AF37',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '500',
  },
  mediaVideoContainer: {
    width: 140,
    height: 140,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  mediaBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#D4AF37',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaBadgeText: {
    color: '#1A1A1A',
    fontSize: 12,
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#2A2A2A',
    color: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#3A3A3A',
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
    color: '#888888',
    fontSize: 13,
    marginTop: 12,
    marginLeft: 28,
  },
  buttonContainer: {
    gap: 12,
  },
  updateButton: {
    backgroundColor: '#D4AF37',
    padding: 18,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  updateButtonText: { 
    color: '#1A1A1A', 
    fontSize: 16, 
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  deleteButton: {
    backgroundColor: '#1A1A1A',
    padding: 18,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  deleteButtonText: { 
    color: '#FF6B6B', 
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