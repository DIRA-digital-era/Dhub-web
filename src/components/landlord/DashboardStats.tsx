// src/components/landlord/DashboardStats.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../utils/supabaseClient';
import { useTheme } from '../../context/ThemeContext';

interface Stats {
  totalListings: number;
  activeBookings: number;
  totalRevenue: number;
  avgRating: number;
}

interface Props {
  landlordId: string;
}

const DashboardStats: React.FC<Props> = ({ landlordId }) => {
  const { colors } = useTheme();
  const [stats, setStats] = useState<Stats>({
    totalListings: 0,
    activeBookings: 0,
    totalRevenue: 0,
    avgRating: 0,
  });

  const computeStats = async () => {
    try {
      // 1. Total listings
      const { count: totalListingsCount } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('landlord_id', landlordId);
      const totalListings = totalListingsCount ?? 0;

      // 2. Active bookings
      const { count: activeBookingsCount } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('landlord_id', landlordId)
        .eq('status', 'active');
      const activeBookings = activeBookingsCount ?? 0;

      // 3. Total revenue from completed bookings
      const { data: completedBookings, error: completedError } = await supabase
        .from('bookings')
        .select('amount')
        .eq('landlord_id', landlordId)
        .eq('status', 'completed');
      if (completedError) throw completedError;
      const totalRevenue =
        (completedBookings ?? []).reduce((sum, b: any) => sum + (b.amount ?? 0), 0) ?? 0;

      // 4. Average rating across landlord's listings
      const { data: listingIdsData, error: listingIdsError } = await supabase
        .from('listings')
        .select('id')
        .eq('landlord_id', landlordId);
      if (listingIdsError) throw listingIdsError;
      const listingIds = (listingIdsData ?? []).map((r: any) => r.id);

      let avgRating = 0;
      if (listingIds.length > 0) {
        const { data: ratingsData, error: ratingsError } = await supabase
          .from('ratings')
          .select('score')
          .in('listing_id', listingIds);
        if (ratingsError) throw ratingsError;
        const valid = ratingsData ?? [];
        if (valid.length > 0) {
          const sum = valid.reduce((s, r: any) => s + (r.score ?? 0), 0);
          avgRating = sum / valid.length;
        }
      }

      setStats({
        totalListings,
        activeBookings,
        totalRevenue,
        avgRating: parseFloat(avgRating.toFixed(1)),
      });
    } catch (err) {
      console.error('DashboardStats fetch error:', err);
    }
  };

  useEffect(() => {
    if (!landlordId) return;

    computeStats();

    // subscribe to relevant tables
    const channel = supabase
      .channel(`landlord‑stats:${landlordId}`)
      .on(
        'postgres_changes',
        { schema: 'public', table: 'listings', filter: `landlord_id=eq.${landlordId}`, event: '*' },
        () => computeStats()
      )
      .on(
        'postgres_changes',
        { schema: 'public', table: 'bookings', filter: `landlord_id=eq.${landlordId}`, event: '*' },
        () => computeStats()
      )
      .on(
        'postgres_changes',
        { schema: 'public', table: 'ratings', event: '*' },
        () => computeStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [landlordId]);

  const statCards = [
    { label: 'Total Listings', value: stats.totalListings, icon: 'business-outline', color: '#D4AF37' },
    { label: 'Active Bookings', value: stats.activeBookings, icon: 'calendar-outline', color: '#10B981' },
    { label: 'Total Revenue', value: `$${stats.totalRevenue.toLocaleString()}`, icon: 'cash-outline', color: '#3B82F6' },
    { label: 'Avg Rating', value: stats.avgRating, icon: 'star-outline', color: '#F59E0B' },
  ];

  return (
    <View style={styles.container}>
      {statCards.map((card, i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.iconContainer, { backgroundColor: `${card.color}20` }]}>
            <Ionicons name={card.icon as any} size={20} color={card.color} />
          </View>
          <Text style={[styles.value, { color: colors.text }]}>{card.value}</Text>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{card.label}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 12 },
  card: { flex: 1, minWidth: '45%', padding: 16, borderRadius: 12, alignItems: 'center' },
  iconContainer: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  value: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
});

export default DashboardStats;
