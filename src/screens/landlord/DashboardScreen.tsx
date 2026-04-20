// src/screens/landlord/DashboardScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../utils/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

import DashboardStats from '../../components/landlord/DashboardStats';
import QuickActions from '../../components/landlord/QuickActions';
import RecentActivity from '../../components/landlord/RecentActivity';
import ListingsPreview from '../../components/landlord/ListingsPreview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [landlordProfile, setLandlordProfile] = useState<any>(null);

  const KYC_CACHE_KEY = `kyc_status_${user?.id}`;

  useEffect(() => {
    if (user) {
      fetchLandlordData();
    }
  }, [user]);

  const fetchLandlordData = async () => {
    if (!user) return;

    try {
      // 1️⃣ Load approved KYC from AsyncStorage first
      const cached = await AsyncStorage.getItem(KYC_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        setLandlordProfile(parsed);
      }

      // 2️⃣ Fetch fresh profile from Supabase
      const { data: profile, error: profileError } = await supabase
        .from('landlord_profiles')
        .select('address, city, kyc_status')
        .eq('user_id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') throw profileError;

      if (profile) {
        setLandlordProfile(profile);

        // Persist only if approved
        if (profile.kyc_status === 'approved') {
          await AsyncStorage.setItem(KYC_CACHE_KEY, JSON.stringify(profile));
        }
      }
    } catch (error) {
      console.error('Error fetching landlord data:', error);
    }
  };

  const handleCreateListing = () => {
    if (landlordProfile?.kyc_status !== 'approved') {
      Alert.alert(
        'KYC Required',
        'Please complete your KYC verification before creating listings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Verify Now',
            onPress: () => navigation.navigate('KYCVerification' as never),
          },
        ]
      );
      return;
    }
    navigation.navigate('UploadListing' as never);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Welcome back</Text>
          <Text style={styles.name}>{user?.fullName || 'Landlord'}</Text>
        </View>
        <TouchableOpacity
          style={styles.notificationBtn}
          onPress={() => navigation.navigate('Notifications' as never)}
        >
          <Ionicons name="notifications-outline" size={24} color="#D4AF37" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* KYC Status Banner */}
        {landlordProfile?.kyc_status !== 'approved' && (
          <TouchableOpacity
            style={styles.kycBanner}
            onPress={() => navigation.navigate('KYCVerification' as never)}
          >
            <Ionicons
              name={
                landlordProfile?.kyc_status === 'pending'
                  ? 'time-outline'
                  : 'alert-circle-outline'
              }
              size={20}
              color="#FFF"
            />
            <Text style={styles.kycText}>
              {landlordProfile?.kyc_status === 'pending'
                ? 'KYC Verification Pending'
                : 'Complete KYC Verification to start listing properties'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#FFF" />
          </TouchableOpacity>
        )}

        {/* Dashboard Stats */}
        {user && <DashboardStats landlordId={user.id} />}

        {/* Quick Actions */}
        <QuickActions
          onAddListing={handleCreateListing}
          onManageListings={() => navigation.navigate('ManageListings' as never)}
          onViewBookings={() => navigation.navigate('Bookings' as never)}
          onViewPayments={() => navigation.navigate('Payments' as never)}
        />

        {/* Recent Listings Preview */}
        {user && <ListingsPreview landlordId={user.id} />}

        {/* Recent Activity */}
        {user && <RecentActivity landlordId={user.id} />}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#2A2A2A',
  },
  welcome: {
    color: '#D4AF37',
    fontSize: 16,
    fontWeight: '500',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  notificationBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#333333',
  },
  kycBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D4AF37',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  kycText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
});

export default DashboardScreen;
