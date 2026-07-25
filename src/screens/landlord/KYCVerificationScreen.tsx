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
import { useTheme } from '../../context/ThemeContext';


type KYCProfile = {
  address: string | null;
  city: string | null;
  kyc_status: 'pending' | 'approved' | 'rejected' | null;
};

interface DocumentState {
  idFront: string | null;
  idBack: string | null;
  idSelfie: string | null;
  proofOfOwnership: string | null;
  proofOfAddress: string | null;
}

const KYCVerificationScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [landlordProfile, setLandlordProfile] = useState<KYCProfile | null>(null);
  const [form, setForm] = useState({ address: '', city: '' });
  const [documents, setDocuments] = useState<DocumentState>({ idFront: null, idBack: null, idSelfie: null, proofOfOwnership: null, proofOfAddress: null });
  const KYC_CACHE_KEY = `kyc_status_${user?.id}`;

  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);


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
        mediaTypes: ['images'],
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

  const uploadDocument = async (uri: string, type: string): Promise<string | null> => {
    try {
      const ext = uri.split('.').pop() || 'jpg';
      const fileName = `${type}_${Date.now()}.${ext}`;

      const formData = new FormData();
      formData.append('file', {
        uri: uri,
        name: fileName,
        type: `image/${ext}`,
      } as any);

      const { data, error } = await supabase.storage
        .from('kyc_documents')
        .upload(`${user?.id}/${fileName}`, formData);

      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('kyc_documents')
        .getPublicUrl(data.path);
        
      return publicUrl;
    } catch (err) {
      console.error(`Error uploading ${type}:`, err);
      return null;
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!user) return;
    
    // Basic validation
    if (!documents.idFront || !documents.idBack || !documents.proofOfOwnership || !documents.proofOfAddress) {
      Alert.alert('Incomplete', 'Please upload all required documents.');
      return;
    }

    setLoading(true);
    try {
      // Upload documents
      const idFrontUrl = documents.idFront ? await uploadDocument(documents.idFront, 'id_front') : null;
      const idBackUrl = documents.idBack ? await uploadDocument(documents.idBack, 'id_back') : null;
      const idSelfieUrl = documents.idSelfie ? await uploadDocument(documents.idSelfie, 'id_selfie') : null;
      const proofOfOwnershipUrl = documents.proofOfOwnership ? await uploadDocument(documents.proofOfOwnership, 'proof_of_ownership') : null;
      const proofOfAddressUrl = documents.proofOfAddress ? await uploadDocument(documents.proofOfAddress, 'proof_of_address') : null;

      const { error } = await supabase
        .from('landlord_profiles')
        .upsert(
          {
            user_id: user.id,
            address: form.address,
            city: form.city,
            kyc_status: 'pending',
            id_front_url: idFrontUrl,
            id_back_url: idBackUrl,
            id_selfie_url: idSelfieUrl,
            proof_of_ownership_url: proofOfOwnershipUrl,
            proof_of_address_url: proofOfAddressUrl,
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
        <Ionicons name="document-attach-outline" size={24} color={colors.primary} />
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
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
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

  // Define resubmit handler to clear pending status
  const handleResubmit = () => {
    if (landlordProfile) {
      setLandlordProfile({ ...landlordProfile, kyc_status: null });
    }
  };

  if (landlordProfile?.kyc_status === 'pending') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Verification Pending</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.approvedContainer}>
          <View style={[styles.statusIcon, { backgroundColor: '#F59E0B20' }]}>
            <Ionicons name="time" size={64} color="#F59E0B" />
          </View>
          <Text style={[styles.approvedTitle, { color: '#F59E0B' }]}>Processing</Text>
          <Text style={styles.approvedText}>
            Your docs have been submitted and are being processed by the verification system. It usually takes up to 48 hrs for a verification to run.
          </Text>
          
          <TouchableOpacity style={[styles.submitBtn, { marginTop: 30 }]} onPress={handleResubmit}>
            <Text style={styles.submitBtnText}>Want to resubmit?</Text>
          </TouchableOpacity>
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

        <Text style={styles.sectionTitle}>Personal Information</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full Address *</Text>
          <TextInput
            style={styles.input}
            value={form.address}
            onChangeText={(text) => setForm({ ...form, address: text })}
            placeholder="Enter your full address"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>City *</Text>
          <TextInput
            style={styles.input}
            value={form.city}
            onChangeText={(text) => setForm({ ...form, city: text })}
            placeholder="Enter your city"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <Text style={styles.sectionTitle}>Identity Verification</Text>
        <Text style={styles.sectionSubtitle}>
          Upload clear photos of your government-issued ID and a selfie holding the ID.
        </Text>

        <View style={styles.docSection}>
          <Text style={styles.docLabel}>ID Card Front *</Text>
          <DocumentUpload
            uri={documents.idFront}
            onPick={() => pickDocument('idFront')}
            onRemove={() => removeDocument('idFront')}
          />
        </View>

        <View style={styles.docSection}>
          <Text style={styles.docLabel}>ID Card Back *</Text>
          <DocumentUpload
            uri={documents.idBack}
            onPick={() => pickDocument('idBack')}
            onRemove={() => removeDocument('idBack')}
          />
        </View>

        <View style={styles.docSection}>
          <Text style={styles.docLabel}>Selfie Holding ID *</Text>
          <DocumentUpload
            uri={documents.idSelfie}
            onPick={() => pickDocument('idSelfie')}
            onRemove={() => removeDocument('idSelfie')}
          />
        </View>

        <Text style={styles.sectionTitle}>Property Credentials</Text>
        <Text style={styles.sectionSubtitle}>
          Provide documents proving you own or manage properties at your address.
        </Text>

        <View style={styles.docSection}>
          <Text style={styles.docLabel}>Upload Proof of Ownership *</Text>
          <Text style={styles.docHelperText}>(Land Title, Sales Deed, Traditional Attestation, or Management Mandate)</Text>
          <DocumentUpload
            uri={documents.proofOfOwnership}
            onPick={() => pickDocument('proofOfOwnership')}
            onRemove={() => removeDocument('proofOfOwnership')}
          />
        </View>

        <View style={styles.docSection}>
          <Text style={styles.docLabel}>Upload Proof of Address *</Text>
          <Text style={styles.docHelperText}>(ENEO/Camwater Bill, or Certificate of Residence)</Text>
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

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1, padding: 20 },
  statusBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 16, borderRadius: 8, marginBottom: 20, gap: 12, borderWidth: 1, borderColor: colors.border },
  statusText: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { color: colors.primary, fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  sectionSubtitle: { color: colors.textSecondary, fontSize: 14, marginBottom: 16 },
  inputGroup: { marginBottom: 16 },
  label: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: colors.card, borderRadius: 8, padding: 12, color: colors.text, fontSize: 16, borderWidth: 1, borderColor: colors.border },
  docSection: { marginBottom: 20 },
  docLabel: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  docHelperText: { color: colors.textSecondary, fontSize: 12, marginBottom: 8 },
  docUploadBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', gap: 12 },
  docUploadText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  docPreview: { position: 'relative', width: '100%', height: 200, borderRadius: 8, overflow: 'hidden' },
  docImage: { width: '100%', height: '100%' },
  removeDocBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  submitBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 20, marginBottom: 40 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: isDark ? '#1A1A1A' : '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  approvedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  statusIcon: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  approvedTitle: { color: '#10B981', fontSize: 24, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  approvedText: { color: colors.textSecondary, fontSize: 16, textAlign: 'center', lineHeight: 24 },
});

export default KYCVerificationScreen;
