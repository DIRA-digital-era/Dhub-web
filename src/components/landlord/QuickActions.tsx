// src/components/landlord/QuickActions.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  onAddListing: () => void;
  onManageListings: () => void;
  onViewBookings: () => void;
  onViewPayments: () => void;
}

const QuickActions: React.FC<Props> = ({
  onAddListing,
  onManageListings,
  onViewBookings,
  onViewPayments,
}) => {
  const actions = [
    {
      label: 'Add Listing',
      icon: 'add-circle-outline',
      onPress: onAddListing,
      color: '#D4AF37',
    },
    {
      label: 'Manage Listings',
      icon: 'list-outline',
      onPress: onManageListings,
      color: '#3B82F6',
    },
    {
      label: 'Bookings',
      icon: 'calendar-outline',
      onPress: onViewBookings,
      color: '#10B981',
    },
    {
      label: 'Payments',
      icon: 'cash-outline',
      onPress: onViewPayments,
      color: '#F59E0B',
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.grid}>
        {actions.map((action, index) => (
          <TouchableOpacity
            key={index}
            style={styles.actionCard}
            onPress={action.onPress}
          >
            <View style={[styles.iconContainer, { backgroundColor: `${action.color}20` }]}>
              <Ionicons name={action.icon as any} size={24} color={action.color} />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#2A2A2A',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default QuickActions;