//src/components/RatingsList.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Review as RatingItem } from '../types';

interface RatingsListProps {
  ratings: RatingItem[];
}

const RatingsList: React.FC<RatingsListProps> = ({ ratings }) => {
  const INITIAL_COUNT = 3;
  const LOAD_MORE_STEP = 7;

  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);

  const displayedRatings = ratings.slice(0, visibleCount);

  const handleLoadMore = () => {
    setVisibleCount(prev => Math.min(prev + LOAD_MORE_STEP, ratings.length));
  };

  if (ratings.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          No ratings available yet, book and be the first to rate!
        </Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: RatingItem }) => {
    const safeScore = Math.max(0, Math.min(5, Math.round(item.score ?? 0)));

    return (
      <View style={styles.ratingCard}>
        <View style={styles.ratingRow}>
          <Text style={styles.ratingScore}>
            {'⭐'.repeat(safeScore)} {item.score?.toFixed(1)}
          </Text>
          <Text style={styles.ratingDate}>
            {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
          </Text>
        </View>

        {item.comment ? (
          <Text style={styles.commentText}>{item.comment}</Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={displayedRatings}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        scrollEnabled={false}
      />

      {visibleCount < ratings.length && (
        <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
          <Text style={styles.loadMoreText}>Load More Reviews</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginVertical: 12 },
  emptyContainer: { padding: 16, alignItems: 'center' },
  emptyText: { color: '#555', fontStyle: 'italic' },

  ratingCard: {
    padding: 12,
    backgroundColor: '#FAF9F6',
    borderRadius: 8,
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ratingScore: { fontWeight: 'bold', color: '#B8860B' },
  ratingDate: { fontSize: 12, color: '#888' },
  commentText: { color: '#333', fontSize: 14 },

  loadMoreBtn: {
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#B8860B',
    borderRadius: 8,
  },
  loadMoreText: { color: '#FFF', fontWeight: 'bold' },
});

export default RatingsList;
