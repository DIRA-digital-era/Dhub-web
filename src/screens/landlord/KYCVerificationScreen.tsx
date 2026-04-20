import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  TextInput,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../utils/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';


type KYCProfile = {
  address: string | null;
  city: string | null;
  kyc_status: 'pending' | 'approved' | 'rejected' | null;
};

interface DocumentState {
  idFront: string | null;
  idBack: string | null;
  proofOfAddress: string | null;
}

const KYCVerificationScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [landlordProfile, setLandlordProfile] = useState<KYCProfile | null>(null);
  const [form, setForm] = useState({
    address: '',
    city: '',
  });
  const [documents, setDocuments] = useState<DocumentState>({
    idFront: null,
    idBack: null,
    proofOfAddress: null,
  });
  const KYC_CACHE_KEY = `kyc_status_${user?.id}`;


  useEffect(() => {
    if (user) {
      fetchLandlordProfile();
    }
  }, [user]);

const fetchLandlordProfile = async (): Promise<void> => {
  if (!user) return;

  try {
    // 1️⃣ Try reading from AsyncStorage first
    const cached = await AsyncStorage.getItem(KYC_CACHE_KEY);
    if (cached) {
      const parsed: KYCProfile = JSON.parse(cached);
      setLandlordProfile(parsed);
      setForm({ address: parsed.address || '', city: parsed.city || '' });
      return; // skip network if cached
    }

    // 2️⃣ Fetch from Supabase if no cache
    const { data, error } = await supabase
      .from('landlord_profiles')
      .select('address, city, kyc_status')
      .eq('user_id', user.id)
      .single<KYCProfile>();

    if (error && error.code !== 'PGRST116') throw error;

    if (data) {
      setLandlordProfile(data);
      setForm({ address: data.address || '', city: data.city || '' });

      // 3️⃣ Persist ONLY if approved
      if (data.kyc_status === 'approved') {
        await AsyncStorage.setItem(KYC_CACHE_KEY, JSON.stringify(data));
      }
    }
  } catch (error) {
    console.error('Error fetching profile:', error);
  }
};

  const requestMediaPermission = async (): Promise<boolean> => {
    const { status, canAskAgain } = await ImagePicker.getMediaLibraryPermissionsAsync();

    if (status === 'granted') return true;

    if (status === 'denied' && canAskAgain) {
      return new Promise((resolve) => {
        Alert.alert(
          'Permission Required',
          'We need access to your media library to upload documents. Please allow access.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Allow',
              onPress: async () => {
                const { status: newStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                resolve(newStatus === 'granted');
              },
            },
          ],
          { cancelable: true }
        );
      });
    }

    Alert.alert(
      'Permission Required',
      'Access to your photos has been blocked. Please enable permission from Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
      { cancelable: true }
    );

    return false;
  };

  const pickDocument = async (type: keyof DocumentState): Promise<void> => {
    try {
      const hasPermission = await requestMediaPermission();
      if (!hasPermission) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setDocuments(prev => ({ ...prev, [type]: result.assets[0].uri }));
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const removeDocument = (type: keyof DocumentState): void => {
    setDocuments(prev => ({ ...prev, [type]: null }));
  };

const handleSubmit = async (): Promise<void> => {
  if (!user) return;

  setLoading(true);
  try {
    const { error } = await supabase
      .from('landlord_profiles')
      .upsert(
        {
          user_id: user.id,
          address: form.address,
          city: form.city,
          kyc_status: 'pending',
          kyc_docs: documents,
        },
        { onConflict: 'user_id' }
      );

    if (error) throw error;

    // Remove cache so next fetch gets fresh status
    await AsyncStorage.removeItem(KYC_CACHE_KEY);

    Alert.alert(
      'Success',
      'KYC verification submitted! We will review your documents and update your status soon.',
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  } catch (error) {
    console.error('Error submitting KYC:', error);
    Alert.alert('Error', 'Failed to submit KYC verification');
  } finally {
    setLoading(false);
  }
};


  const DocumentUpload: React.FC<{
    uri: string | null;
    onPick: () => void;
    onRemove: () => void;
  }> = ({ uri, onPick, onRemove }) => {
    if (uri) {
      return (
        <View style={styles.docPreview}>
          <Image source={{ uri }} style={styles.docImage} />
          <TouchableOpacity style={styles.removeDocBtn} onPress={onRemove}>
            <Ionicons name="close" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <TouchableOpacity style={styles.docUploadBtn} onPress={onPick}>
        <Ionicons name="document-attach-outline" size={24} color="#D4AF37" />
        <Text style={styles.docUploadText}>Upload Document</Text>
      </TouchableOpacity>
    );
  };

  const getStatusColor = (status?: KYCProfile['kyc_status']): string => {
    switch (status) {
      case 'approved': return '#10B981';
      case 'rejected': return '#EF4444';
      case 'pending': return '#F59E0B';
      default: return '#6B7280';
    }
  };

  const getStatusIcon = (
    status?: KYCProfile['kyc_status']
  ): "checkmark-circle" | "close-circle" | "time" | "help-circle" => {
    switch (status) {
      case 'approved': return 'checkmark-circle';
      case 'rejected': return 'close-circle';
      case 'pending': return 'time';
      default: return 'help-circle';
    }
  };

  if (landlordProfile?.kyc_status === 'approved') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#D4AF37" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>KYC Verification</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.approvedContainer}>
          <View style={[styles.statusIcon, { backgroundColor: '#10B98120' }]}>
            <Ionicons name="checkmark-circle" size={64} color="#10B981" />
          </View>
          <Text style={styles.approvedTitle}>Verified Successfully</Text>
          <Text style={styles.approvedText}>
            Your KYC verification has been approved. You can now create and manage property listings.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#D4AF37" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>KYC Verification</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {landlordProfile?.kyc_status && (
          <View style={styles.statusBanner}>
            <Ionicons
              name={getStatusIcon(landlordProfile.kyc_status)}
              size={20}
              color={getStatusColor(landlordProfile.kyc_status)}
            />
            <Text style={[styles.statusText, { color: getStatusColor(landlordProfile.kyc_status) }]}>
              Status: {landlordProfile.kyc_status.toUpperCase()}
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Personal Information</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full Address *</Text>
          <TextInput
            style={styles.input}
            value={form.address}
            onChangeText={(text) => setForm({ ...form, address: text })}
            placeholder="Enter your full address"
            placeholderTextColor="#666"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>City *</Text>
          <TextInput
            style={styles.input}
            value={form.city}
            onChangeText={(text) => setForm({ ...form, city: text })}
            placeholder="Enter your city"
            placeholderTextColor="#666"
          />
        </View>

        <Text style={styles.sectionTitle}>Identity Verification</Text>
        <Text style={styles.sectionSubtitle}>
          Upload clear photos of your government-issued ID
        </Text>

        <View style={styles.docSection}>
          <Text style={styles.docLabel}>ID Card Front</Text>
          <DocumentUpload
            uri={documents.idFront}
            onPick={() => pickDocument('idFront')}
            onRemove={() => removeDocument('idFront')}
          />
        </View>

        <View style={styles.docSection}>
          <Text style={styles.docLabel}>ID Card Back</Text>
          <DocumentUpload
            uri={documents.idBack}
            onPick={() => pickDocument('idBack')}
            onRemove={() => removeDocument('idBack')}
          />
        </View>

        <View style={styles.docSection}>
          <Text style={styles.docLabel}>Proof of Address (Mandatory)</Text>
          <DocumentUpload
            uri={documents.proofOfAddress}
            onPick={() => pickDocument('proofOfAddress')}
            onRemove={() => removeDocument('proofOfAddress')}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitBtnText}>
            {loading ? 'Submitting...' : 'Submit for Verification'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#2A2A2A' },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1, padding: 20 },
  statusBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2A2A', padding: 16, borderRadius: 8, marginBottom: 20, gap: 12 },
  statusText: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { color: '#D4AF37', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  sectionSubtitle: { color: '#999999', fontSize: 14, marginBottom: 16 },
  inputGroup: { marginBottom: 16 },
  label: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: '#2A2A2A', borderRadius: 8, padding: 12, color: '#FFFFFF', fontSize: 16, borderWidth: 1, borderColor: '#333333' },
  docSection: { marginBottom: 20 },
  docLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  docUploadBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2A2A', padding: 16, borderRadius: 8, borderWidth: 2, borderColor: '#D4AF37', borderStyle: 'dashed', gap: 12 },
  docUploadText: { color: '#D4AF37', fontSize: 14, fontWeight: '600' },
  docPreview: { position: 'relative', width: '100%', height: 200, borderRadius: 8, overflow: 'hidden' },
  docImage: { width: '100%', height: '100%' },
  removeDocBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  submitBtn: { backgroundColor: '#D4AF37', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 20, marginBottom: 40 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#1A1A1A', fontSize: 16, fontWeight: 'bold' },
  approvedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  statusIcon: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  approvedTitle: { color: '#10B981', fontSize: 24, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  approvedText: { color: '#999999', fontSize: 16, textAlign: 'center', lineHeight: 24 },
});

export default KYCVerificationScreen;
