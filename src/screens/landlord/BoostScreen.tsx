// src/screens/landlord/BoostScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useDispatch } from 'react-redux';
import { setBoost } from '../../store/boostSlice';
import { LandlordStackParamList, LandlordTabParamList, LandlordStackRouteProp } from '../../types';

interface BoostPlan {
  id: string;
  label: string;
  durationDays: number;
  price: number;
}

const BOOST_PLANS: BoostPlan[] = [
  { id: 'plan1', label: '1 Day Boost', durationDays: 1, price: 500 },
  { id: 'plan3', label: '3 Days Boost', durationDays: 3, price: 1200 },
  { id: 'plan7', label: '7 Days Boost', durationDays: 7, price: 2500 },
];

type BoostScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<LandlordStackParamList, 'BoostScreen'>,
  BottomTabNavigationProp<LandlordTabParamList>
>;

const BoostScreen: React.FC = () => {
  const navigation = useNavigation<BoostScreenNavigationProp>();
  const route = useRoute<LandlordStackRouteProp<'BoostScreen'>>();
  const dispatch = useDispatch();

  const listingId = route.params.listingId;

  const [selectedPlan, setSelectedPlan] = useState<BoostPlan | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePay = () => {
    if (!selectedPlan) {
      Alert.alert('Select Plan', 'Please select a boost plan to continue.');
      return;
    }

    setLoading(true);

    // Save boost data in Redux
    dispatch(setBoost({
      listingId,
      planId: selectedPlan.id,
      durationDays: selectedPlan.durationDays,
      price: selectedPlan.price,
      purpose: 'boost',
    }));

        // Navigate directly to Payments tab and pass prefill params
    navigation.navigate('Tabs', {
        screen: 'Payments',
        params: {
        listingId,
        planId: selectedPlan.id,
        durationDays: selectedPlan.durationDays,
        price: selectedPlan.price,
        purpose: 'boost',
        },
    });
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#D4AF37" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Boost Listing</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Boost Plans */}
        <Text style={styles.sectionTitle}>Choose a Boost Plan</Text>
        {BOOST_PLANS.map(plan => (
          <TouchableOpacity
            key={plan.id}
            style={[
              styles.planCard,
              selectedPlan?.id === plan.id && styles.planCardSelected,
            ]}
            onPress={() => setSelectedPlan(plan)}
          >
            <Text style={styles.planLabel}>{plan.label}</Text>
            <Text style={styles.planPrice}>{plan.price.toLocaleString()} FCFA</Text>
          </TouchableOpacity>
        ))}

        {/* Summary */}
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            Selected Plan:{' '}
            {selectedPlan
              ? `${selectedPlan.label} - ${selectedPlan.price.toLocaleString()} FCFA`
              : 'None'}
          </Text>
        </View>

        {/* Pay Button */}
        <TouchableOpacity
          style={[styles.payButton, loading && styles.payButtonDisabled]}
          onPress={handlePay}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#1A1A1A" />
          ) : (
            <Text style={styles.payButtonText}>Pay & Boost</Text>
          )}
        </TouchableOpacity>

        {/* Why Boost Section */}
        <View style={styles.whyBoostContainer}>
          <Text style={styles.whyBoostTitle}>Why Boost?</Text>
          <Text style={styles.whyBoostText}>
            Boosting your listing makes it appear first in search results and highlights it for maximum visibility.
            More exposure means faster tenant acquisition and better chances of filling your property. In short, the more you boost the more money you make!
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#2A2A2A',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20 },
  sectionTitle: { color: '#D4AF37', fontSize: 16, fontWeight: 'bold', marginBottom: 20 },
  planCard: {
    backgroundColor: '#2A2A2A',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planCardSelected: {
    borderColor: '#D4AF37',
    backgroundColor: '#3A3A3A',
  },
  planLabel: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  planPrice: { color: '#D4AF37', fontSize: 16, fontWeight: '700' },
  summary: { marginTop: 24 },
  summaryText: { color: '#FFF', fontSize: 14 },
  payButton: {
    backgroundColor: '#D4AF37',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 30,
  },
  payButtonDisabled: { opacity: 0.6 },
  payButtonText: { color: '#1A1A1A', fontSize: 16, fontWeight: 'bold' },
  whyBoostContainer: { marginTop: 40, backgroundColor: '#2A2A2A', padding: 16, borderRadius: 12 },
  whyBoostTitle: { color: '#D4AF37', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  whyBoostText: { color: '#FFF', fontSize: 14, lineHeight: 20 },
});

export default BoostScreen;
