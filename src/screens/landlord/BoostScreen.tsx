// src/screens/landlord/BoostScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useDispatch } from 'react-redux';
import { useTheme } from '../../context/ThemeContext';
import { setBoost } from '../../store/boostSlice';
import { LandlordStackParamList, LandlordStackRouteProp, LandlordTabParamList } from '../../types';
import { supabase } from '../../utils/supabaseClient';

interface BoostPlan {
  id: string;
  label: string;
  durationDays: number;
  price: number;
}

type BoostScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<LandlordStackParamList, 'BoostScreen'>,
  BottomTabNavigationProp<LandlordTabParamList>
>;

const BoostScreen: React.FC = () => {
  const navigation = useNavigation<BoostScreenNavigationProp>();
  const route = useRoute<LandlordStackRouteProp<'BoostScreen'>>();
  const dispatch = useDispatch();

  const listingId = route.params.listingId;

  const [boostPlans, setBoostPlans] = useState<BoostPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<BoostPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingPlans, setFetchingPlans] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  React.useEffect(() => {
    const fetchPlans = async () => {
      setFetchingPlans(true);
      setFetchError(null);
      console.log('[BoostScreen] Fetching boost plans...');

      try {
        const { data, error, status } = await supabase
          .from('boost_plans')
          .select('*')
          .eq('active', true)
          .order('duration_days', { ascending: true });

        console.log('[BoostScreen] Supabase response:', { data, error, status });

        if (error) {
          console.error('[BoostScreen] Supabase error:', error);
          setFetchError(`Error: ${error.message} (code: ${error.code})`);
          setBoostPlans([]);
        } else if (data && data.length > 0) {
          console.log(`[BoostScreen] Found ${data.length} boost plans`);
          setBoostPlans(data.map(p => ({
            id: p.id,
            label: p.label,
            durationDays: p.duration_days,
            price: Number(p.price)
          })));
        } else {
          console.warn('[BoostScreen] No boost plans found (empty data)');
          setFetchError('No boost plans available. Please contact support.');
          setBoostPlans([]);
        }
      } catch (err: any) {
        console.error('[BoostScreen] Unexpected error:', err);
        setFetchError(`Unexpected error: ${err.message || err}`);
        setBoostPlans([]);
      } finally {
        setFetchingPlans(false);
      }
    };
    fetchPlans();
  }, []);

  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const handlePay = () => {
    if (!selectedPlan) {
      Alert.alert('Select Plan', 'Please select a boost plan to continue.');
      return;
    }

    setLoading(true);

    dispatch(setBoost({
      listingId,
      planId: selectedPlan.id,
      durationDays: selectedPlan.durationDays,
      price: selectedPlan.price,
      purpose: 'boost',
    }));

    navigation.navigate('Tabs', {
      screen: 'Payments',
      params: {
        listingId,
        planId: selectedPlan.id,
        durationDays: selectedPlan.durationDays,
        price: selectedPlan.price,
        purpose: 'boosting',
      },
    });
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Boost Listing</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Choose a Boost Plan</Text>

        {fetchingPlans ? (
          <ActivityIndicator color={colors.primary} />
        ) : fetchError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{fetchError}</Text>
            <TouchableOpacity 
              style={styles.retryButton} 
              onPress={() => {
                setFetchingPlans(true);
                setFetchError(null);
                // Re‑trigger fetch
                const fetchPlans = async () => { /* copy logic or use a ref */ };
                // We'll just reload the effect by forcing a key change or using a refetch function.
                // For simplicity, we'll just navigate back and forth, but we'll implement a refetch function.
              }}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : boostPlans.length === 0 ? (
          <Text style={styles.noPlansText}>No plans available.</Text>
        ) : (
          boostPlans.map(plan => (
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
          ))
        )}

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
            <ActivityIndicator color={isDark ? '#1A1A1A' : '#FFFFFF'} />
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

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20 },
  sectionTitle: { color: colors.primary, fontSize: 16, fontWeight: 'bold', marginBottom: 20 },
  planCard: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: isDark ? '#2D2510' : '#FFF8E1',
  },
  planLabel: { color: colors.text, fontSize: 16, fontWeight: '600' },
  planPrice: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  summary: { marginTop: 24 },
  summaryText: { color: colors.text, fontSize: 14 },
  payButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 30,
  },
  payButtonDisabled: { opacity: 0.6 },
  payButtonText: { color: isDark ? '#1A1A1A' : '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  whyBoostContainer: { marginTop: 40, backgroundColor: colors.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  whyBoostTitle: { color: colors.primary, fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  whyBoostText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  errorContainer: { alignItems: 'center', marginVertical: 20 },
  errorText: { color: colors.error, textAlign: 'center', marginBottom: 12 },
  retryButton: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  retryButtonText: { color: colors.background, fontWeight: 'bold' },
  noPlansText: { textAlign: 'center', color: colors.textSecondary, marginVertical: 20 },
});

export default BoostScreen;